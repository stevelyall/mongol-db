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

#include "mongol/db/catalog/drop_database.h"

#include "mongol/db/background.h"
#include "mongol/db/catalog/database.h"
#include "mongol/db/catalog/database_catalog_entry.h"
#include "mongol/db/catalog/index_catalog.h"
#include "mongol/db/client.h"
#include "mongol/db/concurrency/write_conflict_exception.h"
#include "mongol/db/curop.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/index_builder.h"
#include "mongol/db/op_observer.h"
#include "mongol/db/operation_context_impl.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/db/service_context.h"
#include "mongol/util/log.h"

namespace mongol {
Status dropDatabase(OperationContext* txn, const std::string& dbName) {
    MONGO_WRITE_CONFLICT_RETRY_LOOP_BEGIN {
        ScopedTransaction transaction(txn, MODE_X);
        Lock::GlobalWrite lk(txn->lockState());
        AutoGetDb autoDB(txn, dbName, MODE_X);
        Database* const db = autoDB.getDb();
        if (!db) {
            return Status(ErrorCodes::NamespaceNotFound,
                          str::stream() << "Could not drop database " << dbName
                                        << " because it does not exist");
        }
        OldClientContext context(txn, dbName);

        bool userInitiatedWritesAndNotPrimary = txn->writesAreReplicated() &&
            !repl::getGlobalReplicationCoordinator()->canAcceptWritesForDatabase(dbName);

        if (userInitiatedWritesAndNotPrimary) {
            return Status(ErrorCodes::NotMaster,
                          str::stream() << "Not primary while dropping database " << dbName);
        }

        log() << "dropDatabase " << dbName << " starting";

        BackgroundOperation::assertNoBgOpInProgForDb(dbName);
        mongol::dropDatabase(txn, db);

        log() << "dropDatabase " << dbName << " finished";

        WriteUnitOfWork wunit(txn);

        getGlobalServiceContext()->getOpObserver()->onDropDatabase(txn, dbName + ".$cmd");

        wunit.commit();
    }
    MONGO_WRITE_CONFLICT_RETRY_LOOP_END(txn, "dropDatabase", dbName);

    return Status::OK();
}

}  // namespace mongol
