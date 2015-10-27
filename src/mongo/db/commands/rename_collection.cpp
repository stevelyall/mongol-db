// rename_collection.cpp

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

#include "mongol/client/dbclientcursor.h"
#include "mongol/db/catalog/collection.h"
#include "mongol/db/catalog/collection_catalog_entry.h"
#include "mongol/db/catalog/rename_collection.h"
#include "mongol/db/catalog/database_holder.h"
#include "mongol/db/catalog/index_catalog.h"
#include "mongol/db/catalog/index_create.h"
#include "mongol/db/client.h"
#include "mongol/db/commands.h"
#include "mongol/db/commands/rename_collection.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/dbhelpers.h"
#include "mongol/db/service_context.h"
#include "mongol/db/index/index_descriptor.h"
#include "mongol/db/index_builder.h"
#include "mongol/db/namespace_string.h"
#include "mongol/db/op_observer.h"
#include "mongol/db/operation_context_impl.h"
#include "mongol/db/ops/insert.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/util/scopeguard.h"

namespace mongol {

using std::min;
using std::string;
using std::stringstream;

class CmdRenameCollection : public Command {
public:
    CmdRenameCollection() : Command("renameCollection") {}
    virtual bool adminOnly() const {
        return true;
    }
    virtual bool slaveOk() const {
        return false;
    }
    virtual bool isWriteCommandForConfigServer() const {
        return true;
    }
    virtual Status checkAuthForCommand(ClientBasic* client,
                                       const std::string& dbname,
                                       const BSONObj& cmdObj) {
        return rename_collection::checkAuthForRenameCollectionCommand(client, dbname, cmdObj);
    }
    virtual void help(stringstream& help) const {
        help << " example: { renameCollection: foo.a, to: bar.b }";
    }

    static void dropCollection(OperationContext* txn, Database* db, StringData collName) {
        WriteUnitOfWork wunit(txn);
        if (db->dropCollection(txn, collName).isOK()) {
            // ignoring failure case
            wunit.commit();
        }
    }

    virtual bool run(OperationContext* txn,
                     const string& dbname,
                     BSONObj& cmdObj,
                     int,
                     string& errmsg,
                     BSONObjBuilder& result) {
        string source = cmdObj.getStringField(name.c_str());
        string target = cmdObj.getStringField("to");

        if (!NamespaceString::validCollectionComponent(target.c_str())) {
            errmsg = "invalid collection name: " + target;
            return false;
        }
        if (source.empty() || target.empty()) {
            errmsg = "invalid command syntax";
            return false;
        }

        if ((repl::getGlobalReplicationCoordinator()->getReplicationMode() !=
             repl::ReplicationCoordinator::modeNone)) {
            if (NamespaceString(source).isOplog()) {
                errmsg = "can't rename live oplog while replicating";
                return false;
            }
            if (NamespaceString(target).isOplog()) {
                errmsg = "can't rename to live oplog while replicating";
                return false;
            }
        }

        if (NamespaceString::oplog(source) != NamespaceString::oplog(target)) {
            errmsg = "If either the source or target of a rename is an oplog name, both must be";
            return false;
        }

        Status sourceStatus = userAllowedWriteNS(source);
        if (!sourceStatus.isOK()) {
            errmsg = "error with source namespace: " + sourceStatus.reason();
            return false;
        }

        Status targetStatus = userAllowedWriteNS(target);
        if (!targetStatus.isOK()) {
            errmsg = "error with target namespace: " + targetStatus.reason();
            return false;
        }

        if (NamespaceString(source).coll() == "system.indexes" ||
            NamespaceString(target).coll() == "system.indexes") {
            errmsg = "renaming system.indexes is not allowed";
            return false;
        }

        return appendCommandStatus(result,
                                   renameCollection(txn,
                                                    NamespaceString(source),
                                                    NamespaceString(target),
                                                    cmdObj["dropTarget"].trueValue(),
                                                    cmdObj["stayTemp"].trueValue()));
    }
} cmdrenamecollection;

}  // namespace mongol
