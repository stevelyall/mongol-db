// #file dbtests.cpp : Runs db unit tests.
//

/**
 *    Copyright (C) 2008 10gen Inc.
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
 *    must comply with the GNU Affero General Public License in all respects
 *    for all of the code used other than as permitted herein. If you modify
 *    file(s) with this exception, you may extend this exception to your
 *    version of the file(s), but you are not obligated to do so. If you do not
 *    wish to do so, delete this exception statement from your version. If you
 *    delete this exception statement from all source files in the program,
 *    then also delete it in the license file.
 */

#include "mongol/platform/basic.h"

#include "mongol/dbtests/dbtests.h"

#include "mongol/base/initializer.h"
#include "mongol/db/auth/authorization_manager.h"
#include "mongol/db/auth/authorization_manager_global.h"
#include "mongol/db/catalog/index_create.h"
#include "mongol/db/commands.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/service_context_d.h"
#include "mongol/db/service_context.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/db/repl/replication_coordinator_mock.h"
#include "mongol/dbtests/framework.h"
#include "mongol/stdx/memory.h"
#include "mongol/util/quick_exit.h"
#include "mongol/util/signal_handlers_synchronous.h"
#include "mongol/util/startup_test.h"
#include "mongol/util/static_observer.h"
#include "mongol/util/text.h"

namespace mongol {
namespace dbtests {
// This specifies default dbpath for our testing framework
const std::string default_test_dbpath = "/tmp/unittest";

Status createIndex(OperationContext* txn, StringData ns, const BSONObj& keys, bool unique) {
    BSONObjBuilder specBuilder;
    specBuilder << "name" << DBClientBase::genIndexName(keys) << "ns" << ns << "key" << keys;
    if (unique) {
        specBuilder << "unique" << true;
    }
    return createIndexFromSpec(txn, ns, specBuilder.done());
}

Status createIndexFromSpec(OperationContext* txn, StringData ns, const BSONObj& spec) {
    AutoGetOrCreateDb autoDb(txn, nsToDatabaseSubstring(ns), MODE_X);
    Collection* coll;
    {
        WriteUnitOfWork wunit(txn);
        coll = autoDb.getDb()->getOrCreateCollection(txn, ns);
        invariant(coll);
        wunit.commit();
    }
    MultiIndexBlock indexer(txn, coll);
    Status status = indexer.init(spec);
    if (status == ErrorCodes::IndexAlreadyExists) {
        return Status::OK();
    }
    if (!status.isOK()) {
        return status;
    }
    status = indexer.insertAllDocumentsInCollection();
    if (!status.isOK()) {
        return status;
    }
    WriteUnitOfWork wunit(txn);
    indexer.commit();
    wunit.commit();
    return Status::OK();
}

}  // namespace dbtests
}  // namespace mongol


int dbtestsMain(int argc, char** argv, char** envp) {
    static StaticObserver StaticObserver;
    Command::testCommandsEnabled = true;
    ::mongol::setupSynchronousSignalHandlers();
    mongol::runGlobalInitializersOrDie(argc, argv, envp);
    repl::ReplSettings replSettings;
    replSettings.oplogSize = 10 * 1024 * 1024;
    repl::setGlobalReplicationCoordinator(new repl::ReplicationCoordinatorMock(replSettings));
    getGlobalAuthorizationManager()->setAuthEnabled(false);
    StartupTest::runTests();
    return mongol::dbtests::runDbTests(argc, argv);
}

#if defined(_WIN32)
// In Windows, wmain() is an alternate entry point for main(), and receives the same parameters
// as main() but encoded in Windows Unicode (UTF-16); "wide" 16-bit wchar_t characters.  The
// WindowsCommandLine object converts these wide character strings to a UTF-8 coded equivalent
// and makes them available through the argv() and envp() members.  This enables dbtestsMain()
// to process UTF-8 encoded arguments and environment variables without regard to platform.
int wmain(int argc, wchar_t* argvW[], wchar_t* envpW[]) {
    WindowsCommandLine wcl(argc, argvW, envpW);
    int exitCode = dbtestsMain(argc, wcl.argv(), wcl.envp());
    quickExit(exitCode);
}
#else
int main(int argc, char* argv[], char** envp) {
    int exitCode = dbtestsMain(argc, argv, envp);
    quickExit(exitCode);
}
#endif
