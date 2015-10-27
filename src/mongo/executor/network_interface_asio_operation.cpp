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

#include "mongol/base/status_with.h"
#include "mongol/db/query/getmore_request.h"
#include "mongol/db/query/lite_parsed_query.h"
#include "mongol/executor/async_stream_interface.h"
#include "mongol/executor/connection_pool_asio.h"
#include "mongol/executor/downconvert_find_and_getmore_commands.h"
#include "mongol/executor/network_interface_asio.h"
#include "mongol/rpc/factory.h"
#include "mongol/rpc/metadata/metadata_hook.h"
#include "mongol/rpc/request_builder_interface.h"
#include "mongol/util/log.h"
#include "mongol/util/time_support.h"

namespace mongol {
namespace executor {

using asio::ip::tcp;

namespace {

// Metadata listener can be nullptr.
StatusWith<std::unique_ptr<Message>> messageFromRequest(const RemoteCommandRequest& request,
                                                        rpc::Protocol protocol,
                                                        rpc::EgressMetadataHook* metadataHook) {
    BSONObj query = request.cmdObj;
    auto requestBuilder = rpc::makeRequestBuilder(protocol);

    BSONObj maybeAugmented;
    // Handle outgoing request metadata.
    if (metadataHook) {
        BSONObjBuilder augmentedBob;
        augmentedBob.appendElements(request.metadata);

        auto writeStatus = callNoexcept(*metadataHook,
                                        &rpc::EgressMetadataHook::writeRequestMetadata,
                                        request.target,
                                        &augmentedBob);
        if (!writeStatus.isOK()) {
            return writeStatus;
        }

        maybeAugmented = augmentedBob.obj();
    } else {
        maybeAugmented = request.metadata;
    }

    auto toSend = rpc::makeRequestBuilder(protocol)
                      ->setDatabase(request.dbname)
                      .setCommandName(request.cmdObj.firstElementFieldName())
                      .setMetadata(maybeAugmented)
                      .setCommandArgs(request.cmdObj)
                      .done();
    return std::move(toSend);
}

}  // namespace

NetworkInterfaceASIO::AsyncOp::AsyncOp(NetworkInterfaceASIO* const owner,
                                       const TaskExecutor::CallbackHandle& cbHandle,
                                       const RemoteCommandRequest& request,
                                       const RemoteCommandCompletionFn& onFinish,
                                       Date_t now)
    : _owner(owner),
      _cbHandle(cbHandle),
      _request(request),
      _onFinish(onFinish),
      _start(now),
      _canceled(0),
      _timedOut(0),
      _access(std::make_shared<AsyncOp::AccessControl>()),
      _inSetup(true) {}

void NetworkInterfaceASIO::AsyncOp::cancel() {
    LOG(2) << "Canceling operation; original request was: " << request().toString();
    std::shared_ptr<AsyncOp::AccessControl> access;
    std::size_t generation;
    {
        stdx::lock_guard<stdx::mutex> lk(_access->mutex);
        access = _access;
        generation = access->id;
    }

    // An operation may be in mid-flight when it is canceled, so we cancel any
    // in-progress async ops but do not complete the operation now.
    asio::post(_owner->_io_service,
               [this, access, generation] {
                   // Ensure 'this' pointer is still valid.
                   stdx::lock_guard<stdx::mutex> lk(access->mutex);
                   if (generation == access->id) {
                       _canceled.store(1);
                       if (_connection) {
                           _connection->cancel();
                       }
                   }
               });
}

bool NetworkInterfaceASIO::AsyncOp::canceled() const {
    return (_canceled.load() == 1);
}

bool NetworkInterfaceASIO::AsyncOp::timedOut() const {
    return (_timedOut.load() == 1);
}

const TaskExecutor::CallbackHandle& NetworkInterfaceASIO::AsyncOp::cbHandle() const {
    return _cbHandle;
}

NetworkInterfaceASIO::AsyncConnection& NetworkInterfaceASIO::AsyncOp::connection() {
    invariant(_connection.is_initialized());
    return *_connection;
}

void NetworkInterfaceASIO::AsyncOp::setConnection(AsyncConnection&& conn) {
    invariant(!_connection.is_initialized());
    _connection = std::move(conn);
}

Status NetworkInterfaceASIO::AsyncOp::beginCommand(Message&& newCommand,
                                                   AsyncCommand::CommandType type,
                                                   const HostAndPort& target) {
    // NOTE: We operate based on the assumption that AsyncOp's
    // AsyncConnection does not change over its lifetime.
    invariant(_connection.is_initialized());

    // Construct a new AsyncCommand object for each command.
    _command.emplace(_connection.get_ptr(), type, std::move(newCommand), _owner->now(), target);
    return Status::OK();
}

Status NetworkInterfaceASIO::AsyncOp::beginCommand(const RemoteCommandRequest& request,
                                                   rpc::EgressMetadataHook* metadataHook) {
    // Check if we need to downconvert find or getMore commands.
    StringData commandName = request.cmdObj.firstElement().fieldNameStringData();
    const auto isFindCmd = commandName == LiteParsedQuery::kFindCommandName;
    const auto isGetMoreCmd = commandName == GetMoreRequest::kGetMoreCommandName;
    const auto isFindOrGetMoreCmd = isFindCmd || isGetMoreCmd;

    // If we aren't sending a find or getMore, or the server supports OP_COMMAND we don't have
    // to worry about downconversion.
    if (!isFindOrGetMoreCmd || connection().serverProtocols() == rpc::supports::kAll) {
        auto newCommand = messageFromRequest(request, operationProtocol(), metadataHook);
        if (!newCommand.isOK()) {
            return newCommand.getStatus();
        }
        return beginCommand(
            std::move(*newCommand.getValue()), AsyncCommand::CommandType::kRPC, request.target);
    } else if (isFindCmd) {
        auto downconvertedFind = downconvertFindCommandRequest(request);
        if (!downconvertedFind.isOK()) {
            return downconvertedFind.getStatus();
        }
        return beginCommand(std::move(downconvertedFind.getValue()),
                            AsyncCommand::CommandType::kDownConvertedFind,
                            request.target);
    } else {
        invariant(isGetMoreCmd);
        auto downconvertedGetMore = downconvertGetMoreCommandRequest(request);
        if (!downconvertedGetMore.isOK()) {
            return downconvertedGetMore.getStatus();
        }
        return beginCommand(std::move(downconvertedGetMore.getValue()),
                            AsyncCommand::CommandType::kDownConvertedGetMore,
                            request.target);
    }
}

NetworkInterfaceASIO::AsyncCommand* NetworkInterfaceASIO::AsyncOp::command() {
    invariant(_command.is_initialized());
    return _command.get_ptr();
}

void NetworkInterfaceASIO::AsyncOp::finish(const ResponseStatus& status) {
    _onFinish(status);
}

const RemoteCommandRequest& NetworkInterfaceASIO::AsyncOp::request() const {
    return _request;
}

Date_t NetworkInterfaceASIO::AsyncOp::start() const {
    return _start;
}

rpc::Protocol NetworkInterfaceASIO::AsyncOp::operationProtocol() const {
    invariant(_operationProtocol.is_initialized());
    return *_operationProtocol;
}

void NetworkInterfaceASIO::AsyncOp::setOperationProtocol(rpc::Protocol proto) {
    invariant(!_operationProtocol.is_initialized());
    _operationProtocol = proto;
}

void NetworkInterfaceASIO::AsyncOp::reset() {
    // We don't reset owner as it never changes
    _cbHandle = {};
    _request = {};
    _onFinish = {};
    _connectionPoolHandle = {};
    // We don't reset _connection as we want to reuse it.
    // Ditto for _operationProtocol.
    _start = {};
    _timeoutAlarm.reset();
    _canceled.store(0u);
    _timedOut.store(0u);
    _command = boost::none;
    // _inSetup should always be false at this point.
}

void NetworkInterfaceASIO::AsyncOp::setOnFinish(RemoteCommandCompletionFn&& onFinish) {
    _onFinish = std::move(onFinish);
}

}  // namespace executor
}  // namespace mongol
