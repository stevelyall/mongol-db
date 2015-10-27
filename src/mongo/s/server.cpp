/**
 *    Copyright (C) 2008-2015 MongoDB Inc.
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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kSharding

#include "mongol/platform/basic.h"

#include "mongol/s/server.h"

#include "mongol/base/init.h"
#include "mongol/base/initializer.h"
#include "mongol/base/status.h"
#include "mongol/client/connpool.h"
#include "mongol/client/dbclient_rs.h"
#include "mongol/client/global_conn_pool.h"
#include "mongol/client/remote_command_targeter_factory_impl.h"
#include "mongol/client/replica_set_monitor.h"
#include "mongol/config.h"
#include "mongol/db/audit.h"
#include "mongol/db/auth/authorization_manager.h"
#include "mongol/db/auth/authorization_manager_global.h"
#include "mongol/db/auth/authz_manager_external_state_s.h"
#include "mongol/db/auth/user_cache_invalidator_job.h"
#include "mongol/db/client.h"
#include "mongol/db/dbwebserver.h"
#include "mongol/db/initialize_server_global_state.h"
#include "mongol/db/instance.h"
#include "mongol/db/lasterror.h"
#include "mongol/db/log_process_details.h"
#include "mongol/db/server_options.h"
#include "mongol/db/service_context.h"
#include "mongol/db/service_context_noop.h"
#include "mongol/db/startup_warnings_common.h"
#include "mongol/platform/process_id.h"
#include "mongol/s/balance.h"
#include "mongol/s/catalog/forwarding_catalog_manager.h"
#include "mongol/s/client/sharding_connection_hook.h"
#include "mongol/s/config.h"
#include "mongol/s/cursors.h"
#include "mongol/s/grid.h"
#include "mongol/s/mongols_options.h"
#include "mongol/s/query/cluster_cursor_cleanup_job.h"
#include "mongol/s/request.h"
#include "mongol/s/sharding_initialization.h"
#include "mongol/s/version_mongols.h"
#include "mongol/stdx/memory.h"
#include "mongol/stdx/thread.h"
#include "mongol/util/admin_access.h"
#include "mongol/util/cmdline_utils/censor_cmdline.h"
#include "mongol/util/concurrency/thread_name.h"
#include "mongol/util/exception_filter_win32.h"
#include "mongol/util/exit.h"
#include "mongol/util/log.h"
#include "mongol/util/net/hostname_canonicalization_worker.h"
#include "mongol/util/net/message.h"
#include "mongol/util/net/message_server.h"
#include "mongol/util/net/ssl_manager.h"
#include "mongol/util/ntservice.h"
#include "mongol/util/options_parser/startup_options.h"
#include "mongol/util/processinfo.h"
#include "mongol/util/quick_exit.h"
#include "mongol/util/signal_handlers.h"
#include "mongol/util/stacktrace.h"
#include "mongol/util/static_observer.h"
#include "mongol/util/stringutils.h"
#include "mongol/util/system_clock_source.h"
#include "mongol/util/system_tick_source.h"
#include "mongol/util/text.h"
#include "mongol/util/version.h"

namespace mongol {

using std::string;
using std::vector;

using logger::LogComponent;

#if defined(_WIN32)
ntservice::NtServiceDefaultStrings defaultServiceStrings = {
    L"MongoS", L"MongoDB Router", L"MongoDB Sharding Router"};
static ExitCode initService();
#endif

bool dbexitCalled = false;

bool inShutdown() {
    return dbexitCalled;
}

static BSONObj buildErrReply(const DBException& ex) {
    BSONObjBuilder errB;
    errB.append("$err", ex.what());
    errB.append("code", ex.getCode());
    if (!ex._shard.empty()) {
        errB.append("shard", ex._shard);
    }
    return errB.obj();
}

class ShardedMessageHandler : public MessageHandler {
public:
    virtual ~ShardedMessageHandler() {}

    virtual void connected(AbstractMessagingPort* p) {
        Client::initThread("conn", getGlobalServiceContext(), p);
    }

    virtual void process(Message& m, AbstractMessagingPort* p) {
        verify(p);
        Request r(m, p);
        auto txn = cc().makeOperationContext();

        try {
            r.init(txn.get());
            r.process(txn.get());
        } catch (const AssertionException& ex) {
            LOG(ex.isUserAssertion() ? 1 : 0) << "Assertion failed"
                                              << " while processing " << opToString(m.operation())
                                              << " op"
                                              << " for " << r.getnsIfPresent() << causedBy(ex);

            if (r.expectResponse()) {
                m.header().setId(r.id());
                replyToQuery(ResultFlag_ErrSet, p, m, buildErrReply(ex));
            }

            // We *always* populate the last error for now
            LastError::get(cc()).setLastError(ex.getCode(), ex.what());
        } catch (const DBException& ex) {
            log() << "Exception thrown"
                  << " while processing " << opToString(m.operation()) << " op"
                  << " for " << r.getnsIfPresent() << causedBy(ex);

            if (r.expectResponse()) {
                m.header().setId(r.id());
                replyToQuery(ResultFlag_ErrSet, p, m, buildErrReply(ex));
            }

            // We *always* populate the last error for now
            LastError::get(cc()).setLastError(ex.getCode(), ex.what());
        }

        // Release connections back to pool, if any still cached
        ShardConnection::releaseMyConnections();
    }
};

DBClientBase* createDirectClient(OperationContext* txn) {
    uassert(10197, "createDirectClient not implemented for sharding yet", 0);
    return 0;
}

}  // namespace mongol

using namespace mongol;

static Status initializeSharding(OperationContext* txn) {
    Status status = initializeGlobalShardingState(txn, mongolsGlobalParams.configdbs, true);
    if (!status.isOK()) {
        return status;
    }

    auto catalogManager = grid.catalogManager(txn);
    status = catalogManager->initConfigVersion(txn);
    if (!status.isOK()) {
        return status;
    }

    return Status::OK();
}

static ExitCode runMongosServer() {
    Client::initThread("mongolsMain");
    printShardingVersionInfo(false);

    // Add sharding hooks to both connection pools - ShardingConnectionHook includes auth hooks
    globalConnPool.addHook(new ShardingConnectionHook(false));
    shardConnectionPool.addHook(new ShardingConnectionHook(true));

    ReplicaSetMonitor::setAsynchronousConfigChangeHook(
        &ConfigServer::replicaSetChangeConfigServerUpdateHook);
    ReplicaSetMonitor::setSynchronousConfigChangeHook(
        &ConfigServer::replicaSetChangeShardRegistryUpdateHook);

    // Mongos connection pools already takes care of authenticating new connections so the
    // replica set connection shouldn't need to.
    DBClientReplicaSet::setAuthPooledSecondaryConn(false);

    if (getHostName().empty()) {
        dbexit(EXIT_BADOPTIONS);
    }

    {
        auto txn = cc().makeOperationContext();
        Status status = initializeSharding(txn.get());
        if (!status.isOK()) {
            error() << "Error initializing sharding system: " << status;
            return EXIT_SHARDING_ERROR;
        }

        ConfigServer::reloadSettings(txn.get());
    }

#if !defined(_WIN32)
    mongol::signalForkSuccess();
#endif

    if (serverGlobalParams.isHttpInterfaceEnabled) {
        std::shared_ptr<DbWebServer> dbWebServer(new DbWebServer(
            serverGlobalParams.bind_ip, serverGlobalParams.port + 1000, new NoAdminAccess()));
        dbWebServer->setupSockets();

        stdx::thread web(stdx::bind(&webServerListenThread, dbWebServer));
        web.detach();
    }

    HostnameCanonicalizationWorker::start(getGlobalServiceContext());

    Status status = getGlobalAuthorizationManager()->initialize(NULL);
    if (!status.isOK()) {
        error() << "Initializing authorization data failed: " << status;
        return EXIT_SHARDING_ERROR;
    }

    balancer.go();
    cursorCache.startTimeoutThread();
    clusterCursorCleanupJob.go();

    UserCacheInvalidator cacheInvalidatorThread(getGlobalAuthorizationManager());
    {
        auto txn = cc().makeOperationContext();
        cacheInvalidatorThread.initialize(txn.get());
        cacheInvalidatorThread.go();
    }

    PeriodicTask::startRunningPeriodicTasks();

    MessageServer::Options opts;
    opts.port = serverGlobalParams.port;
    opts.ipList = serverGlobalParams.bind_ip;

    ShardedMessageHandler handler;
    MessageServer* server = createServer(opts, &handler);
    server->setAsTimeTracker();
    if (!server->setupSockets()) {
        return EXIT_NET_ERROR;
    }
    server->run();

    // MessageServer::run will return when exit code closes its socket
    return inShutdown() ? EXIT_CLEAN : EXIT_NET_ERROR;
}

MONGO_INITIALIZER_GENERAL(ForkServer,
                          ("EndStartupOptionHandling"),
                          ("default"))(InitializerContext* context) {
    mongol::forkServerOrDie();
    return Status::OK();
}

/*
 * This function should contain the startup "actions" that we take based on the startup config.  It
 * is intended to separate the actions from "storage" and "validation" of our startup configuration.
 */
static void startupConfigActions(const std::vector<std::string>& argv) {
#if defined(_WIN32)
    vector<string> disallowedOptions;
    disallowedOptions.push_back("upgrade");
    ntservice::configureService(
        initService, moe::startupOptionsParsed, defaultServiceStrings, disallowedOptions, argv);
#endif
}

static int _main() {
    if (!initializeServerGlobalState())
        return EXIT_FAILURE;

    startSignalProcessingThread();

    // we either have a setting where all processes are in localhost or none are
    std::vector<HostAndPort> configServers = mongolsGlobalParams.configdbs.getServers();
    for (std::vector<HostAndPort>::const_iterator it = configServers.begin();
         it != configServers.end();
         ++it) {
        const HostAndPort& configAddr = *it;

        if (it == configServers.begin()) {
            grid.setAllowLocalHost(configAddr.isLocalHost());
        }

        if (configAddr.isLocalHost() != grid.allowLocalHost()) {
            mongol::log(LogComponent::kDefault)
                << "cannot mix localhost and ip addresses in configdbs";
            return 10;
        }
    }

#if defined(_WIN32)
    if (ntservice::shouldStartService()) {
        ntservice::startService();
        // if we reach here, then we are not running as a service.  service installation
        // exits directly and so never reaches here either.
    }
#endif

    return runMongosServer();
}

#if defined(_WIN32)
namespace mongol {
static ExitCode initService() {
    ntservice::reportStatus(SERVICE_RUNNING);
    log() << "Service running";

    return runMongosServer();
}
}  // namespace mongol
#endif

namespace {
std::unique_ptr<AuthzManagerExternalState> createAuthzManagerExternalStateMongos() {
    return stdx::make_unique<AuthzManagerExternalStateMongos>();
}

MONGO_INITIALIZER(CreateAuthorizationExternalStateFactory)(InitializerContext* context) {
    AuthzManagerExternalState::create = &createAuthzManagerExternalStateMongos;
    return Status::OK();
}

MONGO_INITIALIZER(SetGlobalEnvironment)(InitializerContext* context) {
    setGlobalServiceContext(stdx::make_unique<ServiceContextNoop>());
    getGlobalServiceContext()->setTickSource(stdx::make_unique<SystemTickSource>());
    getGlobalServiceContext()->setClockSource(stdx::make_unique<SystemClockSource>());
    return Status::OK();
}

#ifdef MONGO_CONFIG_SSL
MONGO_INITIALIZER_GENERAL(setSSLManagerType,
                          MONGO_NO_PREREQUISITES,
                          ("SSLManager"))(InitializerContext* context) {
    isSSLServer = true;
    return Status::OK();
}
#endif
}  // namespace

int mongolSMain(int argc, char* argv[], char** envp) {
    static StaticObserver staticObserver;
    if (argc < 1)
        return EXIT_FAILURE;

    setupSignalHandlers(false);

    Status status = mongol::runGlobalInitializers(argc, argv, envp);
    if (!status.isOK()) {
        severe(LogComponent::kDefault) << "Failed global initialization: " << status;
        quickExit(EXIT_FAILURE);
    }

    startupConfigActions(std::vector<std::string>(argv, argv + argc));
    cmdline_utils::censorArgvArray(argc, argv);

    mongol::logCommonStartupWarnings(serverGlobalParams);

    try {
        int exitCode = _main();
        return exitCode;
    } catch (const SocketException& e) {
        error() << "uncaught SocketException in mongols main: " << e.toString();
    } catch (const DBException& e) {
        error() << "uncaught DBException in mongols main: " << e.toString();
    } catch (const std::exception& e) {
        error() << "uncaught std::exception in mongols main:" << e.what();
    } catch (...) {
        error() << "uncaught unknown exception in mongols main";
    }

    return 20;
}

#if defined(_WIN32)
// In Windows, wmain() is an alternate entry point for main(), and receives the same parameters
// as main() but encoded in Windows Unicode (UTF-16); "wide" 16-bit wchar_t characters.  The
// WindowsCommandLine object converts these wide character strings to a UTF-8 coded equivalent
// and makes them available through the argv() and envp() members.  This enables mongolSMain()
// to process UTF-8 encoded arguments and environment variables without regard to platform.
int wmain(int argc, wchar_t* argvW[], wchar_t* envpW[]) {
    WindowsCommandLine wcl(argc, argvW, envpW);
    int exitCode = mongolSMain(argc, wcl.argv(), wcl.envp());
    quickExit(exitCode);
}
#else
int main(int argc, char* argv[], char** envp) {
    int exitCode = mongolSMain(argc, argv, envp);
    quickExit(exitCode);
}
#endif

void mongol::signalShutdown() {
    // Notify all threads shutdown has started
    dbexitCalled = true;
}

void mongol::exitCleanly(ExitCode code) {
    // TODO: do we need to add anything?
    {
        Client& client = cc();
        ServiceContext::UniqueOperationContext uniqueTxn;
        OperationContext* txn = client.getOperationContext();
        if (!txn) {
            uniqueTxn = client.makeOperationContext();
            txn = uniqueTxn.get();
        }

        auto catalogMgr = grid.catalogManager(txn);
        if (catalogMgr) {
            catalogMgr->shutDown(txn);
            auto cursorManager = grid.getCursorManager();
            cursorManager->killAllCursors();
            cursorManager->reapZombieCursors();
        }
    }

    mongol::dbexit(code);
}

void mongol::dbexit(ExitCode rc, const char* why) {
    dbexitCalled = true;
    audit::logShutdown(ClientBasic::getCurrent());

#if defined(_WIN32)
    // Windows Service Controller wants to be told when we are done shutting down
    // and call quickExit itself.
    //
    if (rc == EXIT_WINDOWS_SERVICE_STOP) {
        log() << "dbexit: exiting because Windows service was stopped";
        return;
    }
#endif

    log() << "dbexit: " << why << " rc:" << rc;
    quickExit(rc);
}
