// test_commands.cpp

/**
*    Copyright (C) 2013-2014 MongoDB Inc.
*
*    This program is free software: you can redistribute it and/or  modify
*    it under the terms of the GNU Affero General Public License, version 3,
*    as published by the Free Software Foundation.
*
*    This program is distributed in the hope that it will be useful,
*    but WITHOUT ANY WARRANTY; without even the implied warranty of
*    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*    GNU Affero General Public License for more details.
*
*    You should have received a copy of the GNU Affero General Public License
*    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
*    As a special exception, the copyright holders give permission to link the
*    code of portions of this program with the OpenSSL library under certain
*    conditions as described in each individual source file and distribute
*    linked combinations including the program with the OpenSSL library. You
*    must comply with the GNU Affero General Public License in all respects for
*    all of the code used other than as permitted herein. If you modify file(s)
*    with this exception, you may extend this exception to your version of the
*    file(s), but you are not obligated to do so. If you do not wish to do so,
*    delete this exception statement from your version. If you delete this
*    exception statement from all source files in the program, then also delete
*    it in the license file.
*/

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kCommand

#include "mongol/platform/basic.h"

#include "mongol/base/init.h"
#include "mongol/base/initializer_context.h"
#include "mongol/db/catalog/capped_utils.h"
#include "mongol/db/catalog/collection.h"
#include "mongol/db/client.h"
#include "mongol/db/commands.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/service_context.h"
#include "mongol/db/index_builder.h"
#include "mongol/db/op_observer.h"
#include "mongol/db/operation_context_impl.h"
#include "mongol/db/query/internal_plans.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/util/log.h"

namespace mongol {

using std::endl;
using std::string;
using std::stringstream;

/* For testing only, not for general use. Enabled via command-line */
class GodInsert : public Command {
public:
    GodInsert() : Command("godinsert") {}
    virtual bool adminOnly() const {
        return false;
    }
    virtual bool slaveOk() const {
        return true;
    }
    virtual bool isWriteCommandForConfigServer() const {
        return false;
    }
    // No auth needed because it only works when enabled via command line.
    virtual void addRequiredPrivileges(const std::string& dbname,
                                       const BSONObj& cmdObj,
                                       std::vector<Privilege>* out) {}
    virtual void help(stringstream& help) const {
        help << "internal. for testing only.";
    }
    virtual bool run(OperationContext* txn,
                     const string& dbname,
                     BSONObj& cmdObj,
                     int,
                     string& errmsg,
                     BSONObjBuilder& result) {
        string coll = cmdObj["godinsert"].valuestrsafe();
        log() << "test only command godinsert invoked coll:" << coll << endl;
        uassert(13049, "godinsert must specify a collection", !coll.empty());
        string ns = dbname + "." + coll;
        BSONObj obj = cmdObj["obj"].embeddedObjectUserCheck();

        ScopedTransaction transaction(txn, MODE_IX);
        Lock::DBLock lk(txn->lockState(), dbname, MODE_X);
        OldClientContext ctx(txn, ns);
        Database* db = ctx.db();

        WriteUnitOfWork wunit(txn);
        txn->setReplicatedWrites(false);
        Collection* collection = db->getCollection(ns);
        if (!collection) {
            collection = db->createCollection(txn, ns);
            if (!collection) {
                errmsg = "could not create collection";
                return false;
            }
        }
        Status status = collection->insertDocument(txn, obj, false);
        if (status.isOK()) {
            wunit.commit();
        }
        return appendCommandStatus(result, status);
    }
};

/* for diagnostic / testing purposes. Enabled via command line. */
class CmdSleep : public Command {
public:
    virtual bool isWriteCommandForConfigServer() const {
        return false;
    }
    virtual bool adminOnly() const {
        return true;
    }
    virtual bool slaveOk() const {
        return true;
    }
    virtual void help(stringstream& help) const {
        help << "internal testing command.  Makes db block (in a read lock) for 100 seconds\n";
        help << "w:true write lock. secs:<seconds>";
    }
    // No auth needed because it only works when enabled via command line.
    virtual void addRequiredPrivileges(const std::string& dbname,
                                       const BSONObj& cmdObj,
                                       std::vector<Privilege>* out) {}
    CmdSleep() : Command("sleep") {}
    bool run(OperationContext* txn,
             const string& ns,
             BSONObj& cmdObj,
             int,
             string& errmsg,
             BSONObjBuilder& result) {
        log() << "test only command sleep invoked" << endl;
        long long millis = 10 * 1000;

        if (cmdObj["secs"].isNumber() && cmdObj["millis"].isNumber()) {
            millis = cmdObj["secs"].numberLong() * 1000 + cmdObj["millis"].numberLong();
        } else if (cmdObj["secs"].isNumber()) {
            millis = cmdObj["secs"].numberLong() * 1000;
        } else if (cmdObj["millis"].isNumber()) {
            millis = cmdObj["millis"].numberLong();
        }

        if (cmdObj.getBoolField("w")) {
            ScopedTransaction transaction(txn, MODE_X);
            Lock::GlobalWrite lk(txn->lockState());
            sleepmillis(millis);
        } else {
            ScopedTransaction transaction(txn, MODE_S);
            Lock::GlobalRead lk(txn->lockState());
            sleepmillis(millis);
        }

        // Interrupt point for testing (e.g. maxTimeMS).
        txn->checkForInterrupt();

        return true;
    }
};

// Testing only, enabled via command-line.
class CapTrunc : public Command {
public:
    CapTrunc() : Command("captrunc") {}
    virtual bool slaveOk() const {
        return false;
    }
    virtual bool isWriteCommandForConfigServer() const {
        return false;
    }
    // No auth needed because it only works when enabled via command line.
    virtual void addRequiredPrivileges(const std::string& dbname,
                                       const BSONObj& cmdObj,
                                       std::vector<Privilege>* out) {}
    virtual bool run(OperationContext* txn,
                     const string& dbname,
                     BSONObj& cmdObj,
                     int,
                     string& errmsg,
                     BSONObjBuilder& result) {
        const std::string fullNs = parseNsCollectionRequired(dbname, cmdObj);
        int n = cmdObj.getIntField("n");
        bool inc = cmdObj.getBoolField("inc");  // inclusive range?

        OldClientWriteContext ctx(txn, fullNs);
        Collection* collection = ctx.getCollection();

        if (!collection) {
            return appendCommandStatus(
                result,
                {ErrorCodes::NamespaceNotFound,
                 str::stream() << "collection " << fullNs << " does not exist"});
        }

        if (!collection->isCapped()) {
            return appendCommandStatus(result,
                                       {ErrorCodes::IllegalOperation, "collection must be capped"});
        }

        RecordId end;
        {
            // Scan backwards through the collection to find the document to start truncating from.
            // We will remove 'n' documents, so start truncating from the (n + 1)th document to the
            // end.
            std::unique_ptr<PlanExecutor> exec(InternalPlanner::collectionScan(
                txn, fullNs, collection, PlanExecutor::YIELD_MANUAL, InternalPlanner::BACKWARD));

            for (int i = 0; i < n + 1; ++i) {
                PlanExecutor::ExecState state = exec->getNext(nullptr, &end);
                if (PlanExecutor::ADVANCED != state) {
                    return appendCommandStatus(result,
                                               {ErrorCodes::IllegalOperation,
                                                str::stream()
                                                    << "invalid n, collection contains fewer than "
                                                    << n << " documents"});
                }
            }
        }

        collection->temp_cappedTruncateAfter(txn, end, inc);

        return true;
    }
};

// Testing-only, enabled via command line.
class EmptyCapped : public Command {
public:
    EmptyCapped() : Command("emptycapped") {}
    virtual bool slaveOk() const {
        return false;
    }
    virtual bool isWriteCommandForConfigServer() const {
        return false;
    }
    // No auth needed because it only works when enabled via command line.
    virtual void addRequiredPrivileges(const std::string& dbname,
                                       const BSONObj& cmdObj,
                                       std::vector<Privilege>* out) {}

    virtual bool run(OperationContext* txn,
                     const string& dbname,
                     BSONObj& cmdObj,
                     int,
                     string& errmsg,
                     BSONObjBuilder& result) {
        const std::string ns = parseNsCollectionRequired(dbname, cmdObj);

        return appendCommandStatus(result, emptyCapped(txn, NamespaceString(ns)));
    }
};

// ----------------------------

MONGO_INITIALIZER(RegisterEmptyCappedCmd)(InitializerContext* context) {
    if (Command::testCommandsEnabled) {
        // Leaked intentionally: a Command registers itself when constructed.
        new CapTrunc();
        new CmdSleep();
        new EmptyCapped();
        new GodInsert();
    }
    return Status::OK();
}
}
