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

#include "mongol/executor/network_interface_asio.h"

#include <utility>

#include "mongol/executor/async_stream_factory.h"
#include "mongol/executor/async_stream_interface.h"
#include "mongol/executor/async_timer_asio.h"
#include "mongol/executor/async_timer_interface.h"
#include "mongol/executor/async_timer_mock.h"
#include "mongol/executor/connection_pool_asio.h"
#include "mongol/rpc/metadata/metadata_hook.h"
#include "mongol/stdx/chrono.h"
#include "mongol/stdx/memory.h"
#include "mongol/util/concurrency/thread_name.h"
#include "mongol/util/log.h"
#include "mongol/util/net/sock.h"
#include "mongol/util/net/ssl_manager.h"
#include "mongol/util/time_support.h"

namespace mongol {
namespace executor {

#if defined(_MSC_VER) && _MSC_VER < 1900
NetworkInterfaceASIO::Options::Options(Options&& other)
    : connectionPoolOptions(std::move(other.connectionPoolOptions)),
      timerFactory(std::move(other.timerFactory)),
      networkConnectionHook(std::move(other.networkConnectionHook)),
      streamFactory(std::move(other.streamFactory)),
      metadataHook(std::move(other.metadataHook)) {}

NetworkInterfaceASIO::Options& NetworkInterfaceASIO::Options::operator=(Options&& other) {
    connectionPoolOptions = std::move(other.connectionPoolOptions);
    timerFactory = std::move(other.timerFactory);
    networkConnectionHook = std::move(other.networkConnectionHook);
    streamFactory = std::move(other.streamFactory);
    metadataHook = std::move(other.metadataHook);
    return *this;
}
#endif

NetworkInterfaceASIO::NetworkInterfaceASIO(Options options)
    : _options(std::move(options)),
      _io_service(),
      _metadataHook(std::move(_options.metadataHook)),
      _hook(std::move(_options.networkConnectionHook)),
      _resolver(_io_service),
      _state(State::kReady),
      _timerFactory(std::move(_options.timerFactory)),
      _streamFactory(std::move(_options.streamFactory)),
      _connectionPool(stdx::make_unique<connection_pool_asio::ASIOImpl>(this),
                      _options.connectionPoolOptions),
      _isExecutorRunnable(false) {}

std::string NetworkInterfaceASIO::getDiagnosticString() {
    str::stream output;
    output << "NetworkInterfaceASIO";
    output << " inShutdown: " << inShutdown();
    return output;
}

void NetworkInterfaceASIO::appendConnectionStats(BSONObjBuilder* b) {
    _connectionPool.appendConnectionStats(b);
}

std::string NetworkInterfaceASIO::getHostName() {
    return getHostNameCached();
}

void NetworkInterfaceASIO::startup() {
    _serviceRunner = stdx::thread([this]() {
        setThreadName("NetworkInterfaceASIO");
        try {
            LOG(2) << "The NetworkInterfaceASIO worker thread is spinning up";
            asio::io_service::work work(_io_service);
            _io_service.run();
        } catch (...) {
            severe() << "Uncaught exception in NetworkInterfaceASIO IO worker thread of type: "
                     << exceptionToStatus();
            fassertFailed(28820);
        }
    });
    _state.store(State::kRunning);
}

void NetworkInterfaceASIO::shutdown() {
    _state.store(State::kShutdown);
    _io_service.stop();
    _serviceRunner.join();
    LOG(2) << "NetworkInterfaceASIO shutdown successfully";
}

void NetworkInterfaceASIO::waitForWork() {
    stdx::unique_lock<stdx::mutex> lk(_executorMutex);
    // TODO: This can be restructured with a lambda.
    while (!_isExecutorRunnable) {
        _isExecutorRunnableCondition.wait(lk);
    }
    _isExecutorRunnable = false;
}

void NetworkInterfaceASIO::waitForWorkUntil(Date_t when) {
    stdx::unique_lock<stdx::mutex> lk(_executorMutex);
    // TODO: This can be restructured with a lambda.
    while (!_isExecutorRunnable) {
        const Milliseconds waitTime(when - now());
        if (waitTime <= Milliseconds(0)) {
            break;
        }
        _isExecutorRunnableCondition.wait_for(lk, waitTime);
    }
    _isExecutorRunnable = false;
}

void NetworkInterfaceASIO::signalWorkAvailable() {
    stdx::unique_lock<stdx::mutex> lk(_executorMutex);
    _signalWorkAvailable_inlock();
}

void NetworkInterfaceASIO::_signalWorkAvailable_inlock() {
    if (!_isExecutorRunnable) {
        _isExecutorRunnable = true;
        _isExecutorRunnableCondition.notify_one();
    }
}

Date_t NetworkInterfaceASIO::now() {
    return Date_t::now();
}

void NetworkInterfaceASIO::startCommand(const TaskExecutor::CallbackHandle& cbHandle,
                                        const RemoteCommandRequest& request,
                                        const RemoteCommandCompletionFn& onFinish) {
    invariant(onFinish);
    {
        stdx::lock_guard<stdx::mutex> lk(_inProgressMutex);
        const auto insertResult = _inGetConnection.emplace(cbHandle);
        // We should never see the same CallbackHandle added twice
        invariant(insertResult.second);
    }

    LOG(2) << "startCommand: " << request.toString();

    auto startTime = now();

    auto nextStep = [this, startTime, cbHandle, request, onFinish](
        StatusWith<ConnectionPool::ConnectionHandle> swConn) {

        if (!swConn.isOK()) {
            LOG(2) << "Failed to get connection from pool: " << swConn.getStatus();

            bool wasPreviouslyCanceled = false;
            {
                stdx::lock_guard<stdx::mutex> lk(_inProgressMutex);
                wasPreviouslyCanceled = _inGetConnection.erase(cbHandle) == 0;
            }

            onFinish(wasPreviouslyCanceled
                         ? Status(ErrorCodes::CallbackCanceled, "Callback canceled")
                         : swConn.getStatus());
            signalWorkAvailable();
            return;
        }

        auto conn = static_cast<connection_pool_asio::ASIOConnection*>(swConn.getValue().get());

        AsyncOp* op = nullptr;

        {
            stdx::unique_lock<stdx::mutex> lk(_inProgressMutex);

            const auto eraseCount = _inGetConnection.erase(cbHandle);

            // If we didn't find the request, we've been canceled
            if (eraseCount == 0) {
                lk.unlock();
                onFinish({ErrorCodes::CallbackCanceled, "Callback canceled"});
                signalWorkAvailable();
                return;
            }

            // We can't release the AsyncOp until we know we were not canceled.
            auto ownedOp = conn->releaseAsyncOp();
            op = ownedOp.get();

            // Sanity check that we are getting a clean AsyncOp.
            invariant(!op->canceled());
            invariant(!op->timedOut());

            _inProgress.emplace(op, std::move(ownedOp));
        }

        op->_cbHandle = std::move(cbHandle);
        op->_request = std::move(request);
        op->_onFinish = std::move(onFinish);
        op->_connectionPoolHandle = std::move(swConn.getValue());
        op->_start = startTime;

        // Set timeout now that we have the correct request object
        if (op->_request.timeout != RemoteCommandRequest::kNoTimeout) {
            op->_timeoutAlarm = op->_owner->_timerFactory->make(&_io_service, op->_request.timeout);

            std::shared_ptr<AsyncOp::AccessControl> access;
            std::size_t generation;
            {
                stdx::lock_guard<stdx::mutex> lk(op->_access->mutex);
                access = op->_access;
                generation = access->id;
            }

            op->_timeoutAlarm->asyncWait([this, op, access, generation](std::error_code ec) {
                if (!ec) {
                    // We must pass a check for safe access before using op inside the
                    // callback or we may attempt access on an invalid pointer.
                    stdx::lock_guard<stdx::mutex> lk(access->mutex);
                    if (generation != access->id) {
                        // The operation has been cleaned up, do not access.
                        return;
                    }

                    LOG(2) << "Operation timed out: " << op->request().toString();

                    // An operation may be in mid-flight when it times out, so we
                    // cancel any in-progress async calls but do not complete the operation now.
                    if (op->_connection) {
                        op->_connection->cancel();
                    }
                    op->_timedOut.store(1);
                } else {
                    LOG(4) << "failed to time operation out: " << ec.message();
                }
            });
        }

        _beginCommunication(op);
    };

    // TODO: thread some higher level timeout through, rather than 5 minutes,
    // once we make timeouts pervasive in this api.
    asio::post(
        _io_service,
        [this, request, nextStep] { _connectionPool.get(request.target, Minutes(5), nextStep); });
}

void NetworkInterfaceASIO::cancelCommand(const TaskExecutor::CallbackHandle& cbHandle) {
    stdx::lock_guard<stdx::mutex> lk(_inProgressMutex);

    // If we found a matching cbHandle in _inGetConnection, then
    // simply removing it has the same effect as cancelling it, so we
    // can just return.
    if (_inGetConnection.erase(cbHandle) != 0)
        return;

    // TODO: This linear scan is unfortunate. It is here because our
    // primary data structure is to keep the AsyncOps in an
    // unordered_map by pointer, but here we only have the
    // callback. We could keep two data structures at the risk of
    // having them diverge.
    for (auto&& kv : _inProgress) {
        if (kv.first->cbHandle() == cbHandle) {
            kv.first->cancel();
            break;
        }
    }
}

void NetworkInterfaceASIO::cancelAllCommands() {
    decltype(_inGetConnection) newInGetConnection;
    {
        stdx::lock_guard<stdx::mutex> lk(_inProgressMutex);
        _inGetConnection.swap(newInGetConnection);
        for (auto&& kv : _inProgress)
            kv.first->cancel();
    }
}

void NetworkInterfaceASIO::setAlarm(Date_t when, const stdx::function<void()>& action) {
    // "alarm" must stay alive until it expires, hence the shared_ptr.
    auto alarm = std::make_shared<asio::steady_timer>(_io_service, when - now());
    alarm->async_wait([alarm, this, action](std::error_code ec) {
        if (!ec) {
            return action();
        } else if (ec != asio::error::operation_aborted) {
            // When the network interface is shut down, it will cancel all pending
            // alarms, raising an "operation_aborted" error here, which we ignore.
            warning() << "setAlarm() received an error: " << ec.message();
        }
    });
};

bool NetworkInterfaceASIO::inShutdown() const {
    return (_state.load() == State::kShutdown);
}

}  // namespace executor
}  // namespace mongol
