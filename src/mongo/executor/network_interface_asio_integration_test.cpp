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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kASIO

#include "mongol/platform/basic.h"

#include <algorithm>
#include <exception>

#include "mongol/client/connection_string.h"
#include "mongol/executor/async_stream_factory.h"
#include "mongol/executor/async_stream_interface.h"
#include "mongol/executor/async_timer_asio.h"
#include "mongol/executor/network_interface_asio.h"
#include "mongol/executor/network_interface_asio_test_utils.h"
#include "mongol/executor/task_executor.h"
#include "mongol/platform/random.h"
#include "mongol/rpc/get_status_from_command_result.h"
#include "mongol/stdx/future.h"
#include "mongol/stdx/memory.h"
#include "mongol/unittest/integration_test.h"
#include "mongol/unittest/unittest.h"
#include "mongol/util/assert_util.h"
#include "mongol/util/concurrency/thread_pool.h"
#include "mongol/util/log.h"
#include "mongol/util/scopeguard.h"

namespace mongol {
namespace executor {
namespace {

class NetworkInterfaceASIOIntegrationTest : public mongol::unittest::Test {
public:
    void setUp() override {
        NetworkInterfaceASIO::Options options{};
        options.streamFactory = stdx::make_unique<AsyncStreamFactory>();
        options.timerFactory = stdx::make_unique<AsyncTimerFactoryASIO>();
        options.connectionPoolOptions.maxConnections = 256u;
        _net = stdx::make_unique<NetworkInterfaceASIO>(std::move(options));
        _net->startup();
    }

    void tearDown() override {
        if (!_net->inShutdown()) {
            _net->shutdown();
        }
    }

    NetworkInterfaceASIO& net() {
        return *_net;
    }

    ConnectionString fixture() {
        return unittest::getFixtureConnectionString();
    }

    Deferred<StatusWith<RemoteCommandResponse>> runCommand(
        const TaskExecutor::CallbackHandle& cbHandle, const RemoteCommandRequest& request) {
        Deferred<StatusWith<RemoteCommandResponse>> deferred;
        net().startCommand(cbHandle,
                           request,
                           [deferred](StatusWith<RemoteCommandResponse> resp) mutable {
                               deferred.emplace(std::move(resp));
                           });
        return deferred;
    }

    StatusWith<RemoteCommandResponse> runCommandSync(const RemoteCommandRequest& request) {
        auto deferred = runCommand(makeCallbackHandle(), request);
        auto& res = deferred.get();
        if (res.isOK()) {
            log() << "got command result: " << res.getValue().toString();
        } else {
            log() << "command failed: " << res.getStatus();
        }
        return res;
    }

    void assertCommandOK(StringData db,
                         const BSONObj& cmd,
                         Milliseconds timeoutMillis = Milliseconds(-1)) {
        auto res = unittest::assertGet(runCommandSync(
            {fixture().getServers()[0], db.toString(), cmd, BSONObj(), timeoutMillis}));
        ASSERT_OK(getStatusFromCommandResult(res.data));
    }

    void assertCommandFailsOnClient(StringData db,
                                    const BSONObj& cmd,
                                    Milliseconds timeoutMillis,
                                    ErrorCodes::Error reason) {
        auto clientStatus = runCommandSync(
            {fixture().getServers()[0], db.toString(), cmd, BSONObj(), timeoutMillis});
        ASSERT_TRUE(clientStatus == reason);
    }

    void assertCommandFailsOnServer(StringData db,
                                    const BSONObj& cmd,
                                    Milliseconds timeoutMillis,
                                    ErrorCodes::Error reason) {
        auto res = unittest::assertGet(runCommandSync(
            {fixture().getServers()[0], db.toString(), cmd, BSONObj(), timeoutMillis}));
        auto serverStatus = getStatusFromCommandResult(res.data);
        ASSERT_TRUE(serverStatus == reason);
    }

private:
    std::unique_ptr<NetworkInterfaceASIO> _net;
};

TEST_F(NetworkInterfaceASIOIntegrationTest, Ping) {
    assertCommandOK("admin", BSON("ping" << 1));
}

TEST_F(NetworkInterfaceASIOIntegrationTest, Timeouts) {
    // Insert 1 document in collection foo.bar. If we don't do this our queries will return
    // immediately.
    assertCommandOK("foo",
                    BSON("insert"
                         << "bar"
                         << "documents" << BSON_ARRAY(BSON("foo" << 1))));

    // Run a find command with a $where with an infinite loop. The remote server should time this
    // out in 30 seconds, so we should time out client side first given our timeout of 100
    // milliseconds.
    assertCommandFailsOnClient("foo",
                               BSON("find"
                                    << "bar"
                                    << "filter" << BSON("$where"
                                                        << "while(true) { sleep(1); }")),
                               Milliseconds(100),
                               ErrorCodes::ExceededTimeLimit);

    // Run a find command with a $where with an infinite loop. The server should time out the
    // command.
    assertCommandFailsOnServer("foo",
                               BSON("find"
                                    << "bar"
                                    << "filter" << BSON("$where"
                                                        << "while(true) { sleep(1); };")),
                               Milliseconds(10000000000),  // big, big timeout.
                               ErrorCodes::JSInterpreterFailure);

    // Run a find command with a big timeout.It should return before we hit the ASIO
    // timeout
    assertCommandOK("foo",
                    BSON("find"
                         << "bar"
                         << "limit" << 1),
                    Milliseconds(10000000));
}

class StressTestOp {
public:
    using Fixture = NetworkInterfaceASIOIntegrationTest;
    using Pool = ThreadPoolInterface;

    Deferred<Status> run(Fixture* fixture, Pool* pool) {
        auto cb = makeCallbackHandle();
        auto self = *this;
        auto out =
            fixture->runCommand(cb,
                                {unittest::getFixtureConnectionString().getServers()[0],
                                 "foo",
                                 _command,
                                 Seconds(5)})
                .then(pool,
                      [self](StatusWith<RemoteCommandResponse> resp) -> Status {
                          auto status = resp.isOK()
                              ? getStatusFromCommandResult(resp.getValue().data)
                              : resp.getStatus();

                          return status == self._expected
                              ? Status::OK()
                              : Status{ErrorCodes::BadValue,
                                       str::stream() << "Expected "
                                                     << ErrorCodes::errorString(self._expected)
                                                     << " but got " << status.toString()};
                      });
        if (_cancel) {
            // TODO: have this happen at some random time in the future.
            fixture->net().cancelCommand(cb);
        }
        return out;
    }

    static Deferred<Status> runTimeoutOp(Fixture* fixture, Pool* pool) {
        return StressTestOp(BSON("find"
                                 << "bar"
                                 << "filter" << BSON("$where"
                                                     << "while(true) { sleep(1); }")),
                            ErrorCodes::ExceededTimeLimit,
                            false).run(fixture, pool);
    }

    static Deferred<Status> runCompleteOp(Fixture* fixture, Pool* pool) {
        return StressTestOp(BSON("find"
                                 << "baz"
                                 << "limit" << 1),
                            ErrorCodes::OK,
                            false).run(fixture, pool);
    }

    static Deferred<Status> runCancelOp(Fixture* fixture, Pool* pool) {
        return StressTestOp(BSON("find"
                                 << "bar"
                                 << "filter" << BSON("$where"
                                                     << "while(true) { sleep(1); }")),
                            ErrorCodes::CallbackCanceled,
                            true).run(fixture, pool);
    }

private:
    StressTestOp(const BSONObj& command, ErrorCodes::Error expected, bool cancel)
        : _command(command), _expected(expected), _cancel(cancel) {}

    BSONObj _command;
    ErrorCodes::Error _expected;
    bool _cancel;
};

TEST_F(NetworkInterfaceASIOIntegrationTest, StressTest) {
    const std::size_t numOps = 10000;
    std::vector<Deferred<Status>> ops;

    std::unique_ptr<SecureRandom> seedSource{SecureRandom::create()};
    auto seed = seedSource->nextInt64();

    log() << "Random seed is " << seed;
    auto rng = PseudoRandom(seed);  // TODO: read from command line
    log() << "Starting stress test...";

    ThreadPool::Options threadPoolOpts;
    threadPoolOpts.poolName = "StressTestPool";
    threadPoolOpts.maxThreads = 8;
    ThreadPool pool(threadPoolOpts);
    pool.startup();

    auto poolGuard = MakeGuard([&pool] {
        pool.schedule([&pool] { pool.shutdown(); });
        pool.join();
    });

    std::generate_n(std::back_inserter(ops),
                    numOps,
                    [&rng, &pool, this] {
                        switch (rng.nextInt32(3)) {
                            case 0:
                                return StressTestOp::runCancelOp(this, &pool);
                            case 1:
                                return StressTestOp::runCompleteOp(this, &pool);

                            case 2:
                                // TODO: Reenable runTimeoutOp after we fix whatever bug causes it
                                // to hang.
                                // return StressTestOp::runTimeoutOp(this, &pool);
                                return StressTestOp::runCompleteOp(this, &pool);
                            default:

                                MONGO_UNREACHABLE;
                        }
                    });

    log() << "running ops";
    auto res = helpers::collect(ops, &pool)
                   .then(&pool,
                         [](std::vector<Status> opResults) -> Status {
                             for (const auto& opResult : opResults) {
                                 if (!opResult.isOK()) {
                                     return opResult;
                                 }
                             }
                             return Status::OK();
                         })
                   .get();
    ASSERT_OK(res);
}

}  // namespace
}  // namespace executor
}  // namespace mongol
