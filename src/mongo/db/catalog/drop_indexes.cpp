/**
 *    Copyright (C) 2015 MongoDB Inc.
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

#include "mongol/db/catalog/drop_indexes.h"

#include "mongol/db/background.h"
#include "mongol/db/catalog/collection.h"
#include "mongol/db/catalog/database.h"
#include "mongol/db/catalog/index_catalog.h"
#include "mongol/db/client.h"
#include "mongol/db/concurrency/write_conflict_exception.h"
#include "mongol/db/curop.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/index/index_descriptor.h"
#include "mongol/db/index_builder.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/db/service_context.h"
#include "mongol/util/log.h"

namespace mongol {
namespace {
Status wrappedRun(OperationContext* txn,
                  const StringData& dbname,
                  const std::string& toDeleteNs,
                  Database* const db,
                  const BSONObj& jsobj,
                  BSONObjBuilder* anObjBuilder) {
    if (!serverGlobalParams.quiet) {
        LOG(0) << "CMD: dropIndexes " << toDeleteNs;
    }
    Collection* collection = db ? db->getCollection(toDeleteNs) : nullptr;

    // If db/collection does not exist, short circuit and return.
    if (!db || !collection) {
        return Status(ErrorCodes::NamespaceNotFound, "ns not found");
    }

    OldClientContext ctx(txn, toDeleteNs);
    BackgroundOperation::assertNoBgOpInProgForNs(toDeleteNs);

    IndexCatalog* indexCatalog = collection->getIndexCatalog();
    anObjBuilder->appendNumber("nIndexesWas", indexCatalog->numIndexesTotal(txn));


    BSONElement f = jsobj.getField("index");
    if (f.type() == String) {
        std::string indexToDelete = f.valuestr();

        if (indexToDelete == "*") {
            Status s = indexCatalog->dropAllIndexes(txn, false);
            if (!s.isOK()) {
                return s;
            }
            anObjBuilder->append("msg", "non-_id indexes dropped for collection");
            return Status::OK();
        }

        IndexDescriptor* desc = collection->getIndexCatalog()->findIndexByName(txn, indexToDelete);
        if (desc == NULL) {
            return Status(ErrorCodes::IndexNotFound,
                          str::stream() << "index not found with name [" << indexToDelete << "]");
        }

        if (desc->isIdIndex()) {
            return Status(ErrorCodes::InvalidOptions, "cannot drop _id index");
        }

        Status s = indexCatalog->dropIndex(txn, desc);
        if (!s.isOK()) {
            return s;
        }

        return Status::OK();
    }

    if (f.type() == Object) {
        IndexDescriptor* desc =
            collection->getIndexCatalog()->findIndexByKeyPattern(txn, f.embeddedObject());
        if (desc == NULL) {
            return Status(ErrorCodes::IndexNotFound,
                          str::stream()
                              << "can't find index with key: " << f.embeddedObject().toString());
        }

        if (desc->isIdIndex()) {
            return Status(ErrorCodes::InvalidOptions, "cannot drop _id index");
        }

        Status s = indexCatalog->dropIndex(txn, desc);
        if (!s.isOK()) {
            return s;
        }

        return Status::OK();
    }

    return Status(ErrorCodes::IndexNotFound, "invalid index name spec");
}
}  // namespace

Status dropIndexes(OperationContext* txn,
                   const NamespaceString& nss,
                   const BSONObj& idxDescriptor,
                   BSONObjBuilder* result) {
    StringData dbName = nss.db();
    MONGO_WRITE_CONFLICT_RETRY_LOOP_BEGIN {
        ScopedTransaction transaction(txn, MODE_IX);
        AutoGetDb autoDb(txn, dbName, MODE_X);

        bool userInitiatedWritesAndNotPrimary = txn->writesAreReplicated() &&
            !repl::getGlobalReplicationCoordinator()->canAcceptWritesFor(nss);

        if (userInitiatedWritesAndNotPrimary) {
            return Status(ErrorCodes::NotMaster,
                          str::stream() << "Not primary while dropping indexes in " << nss.ns());
        }

        WriteUnitOfWork wunit(txn);
        Status status = wrappedRun(txn, dbName, nss.ns(), autoDb.getDb(), idxDescriptor, result);
        if (!status.isOK()) {
            return status;
        }
        getGlobalServiceContext()->getOpObserver()->onDropIndex(
            txn, dbName.toString() + ".$cmd", idxDescriptor);
        wunit.commit();
    }
    MONGO_WRITE_CONFLICT_RETRY_LOOP_END(txn, "dropIndexes", dbName);
    return Status::OK();
}

}  // namespace mongol
