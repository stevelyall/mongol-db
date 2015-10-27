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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kSharding

#include "mongol/platform/basic.h"

#include "mongol/s/sharding_initialization.h"

#include <string>

#include "mongol/base/status.h"
#include "mongol/client/remote_command_targeter_factory_impl.h"
#include "mongol/client/syncclusterconnection.h"
#include "mongol/db/audit.h"
#include "mongol/db/server_options.h"
#include "mongol/db/service_context.h"
#include "mongol/executor/network_interface_factory.h"
#include "mongol/executor/task_executor.h"
#include "mongol/executor/thread_pool_task_executor.h"
#include "mongol/rpc/metadata/config_server_metadata.h"
#include "mongol/rpc/metadata/metadata_hook.h"
#include "mongol/rpc/metadata/config_server_metadata.h"
#include "mongol/s/catalog/forwarding_catalog_manager.h"
#include "mongol/s/client/shard_registry.h"
#include "mongol/s/client/sharding_network_connection_hook.h"
#include "mongol/s/cluster_last_error_info.h"
#include "mongol/s/grid.h"
#include "mongol/stdx/memory.h"
#include "mongol/util/concurrency/thread_pool.h"
#include "mongol/util/mongolutils/str.h"
#include "mongol/util/net/sock.h"

namespace mongol {

namespace {

using executor::NetworkInterface;
using executor::ThreadPoolTaskExecutor;

std::unique_ptr<ThreadPoolTaskExecutor> makeTaskExecutor(std::unique_ptr<NetworkInterface> net) {
    ThreadPool::Options tpOptions;
    tpOptions.poolName = "ShardWork";
    return stdx::make_unique<ThreadPoolTaskExecutor>(stdx::make_unique<ThreadPool>(tpOptions),
                                                     std::move(net));
}

// Same logic as sharding_connection_hook.cpp.
class ShardingEgressMetadataHook final : public rpc::EgressMetadataHook {
public:
    Status writeRequestMetadata(const HostAndPort& target, BSONObjBuilder* metadataBob) override {
        try {
            audit::writeImpersonatedUsersToMetadata(metadataBob);

            // Add config server optime to metadata sent to shards.
            std::string targetStr = target.toString();
            auto shard = grid.shardRegistry()->getShardNoReload(targetStr);
            if (!shard) {
                return Status(ErrorCodes::ShardNotFound,
                              str::stream() << "Shard not found for server: " << targetStr);
            }
            if (shard->isConfig()) {
                return Status::OK();
            }
            rpc::ConfigServerMetadata(grid.shardRegistry()->getConfigOpTime())
                .writeToMetadata(metadataBob);

            return Status::OK();
        } catch (...) {
            return exceptionToStatus();
        }
    }

    Status readReplyMetadata(const HostAndPort& replySource, const BSONObj& metadataObj) override {
        try {
            saveGLEStats(metadataObj, replySource.toString());

            auto shard = grid.shardRegistry()->getShardNoReload(replySource.toString());
            if (!shard) {
                return Status::OK();
            }
            // If this host is a known shard of ours, look for a config server optime in the
            // response metadata to use to update our notion of the current config server optime.
            auto responseStatus = rpc::ConfigServerMetadata::readFromMetadata(metadataObj);
            if (!responseStatus.isOK()) {
                return responseStatus.getStatus();
            }
            auto opTime = responseStatus.getValue().getOpTime();
            if (opTime.is_initialized()) {
                grid.shardRegistry()->advanceConfigOpTime(opTime.get());
            }
            return Status::OK();
        } catch (...) {
            return exceptionToStatus();
        }
    }
};

}  // namespace

Status initializeGlobalShardingState(OperationContext* txn,
                                     const ConnectionString& configCS,
                                     bool allowNetworking) {
    SyncClusterConnection::setConnectionValidationHook(
        [](const HostAndPort& target, const executor::RemoteCommandResponse& isMasterReply) {
            return ShardingNetworkConnectionHook::validateHostImpl(target, isMasterReply);
        });
    auto network =
        executor::makeNetworkInterface(stdx::make_unique<ShardingNetworkConnectionHook>(),
                                       stdx::make_unique<ShardingEgressMetadataHook>());
    auto networkPtr = network.get();
    auto shardRegistry(
        stdx::make_unique<ShardRegistry>(stdx::make_unique<RemoteCommandTargeterFactoryImpl>(),
                                         makeTaskExecutor(std::move(network)),
                                         networkPtr,
                                         makeTaskExecutor(executor::makeNetworkInterface()),
                                         configCS));

    std::unique_ptr<ForwardingCatalogManager> catalogManager;
    try {
        catalogManager = stdx::make_unique<ForwardingCatalogManager>(
            getGlobalServiceContext(),
            configCS,
            shardRegistry.get(),
            HostAndPort(getHostName(), serverGlobalParams.port));
    } catch (const DBException& ex) {
        return ex.toStatus();
    }

    shardRegistry->startup();
    grid.init(std::move(catalogManager),
              std::move(shardRegistry),
              stdx::make_unique<ClusterCursorManager>(getGlobalServiceContext()->getClockSource()));

    auto status = grid.catalogManager(txn)->startup(txn, allowNetworking);
    if (!status.isOK()) {
        return status;
    }

    if (serverGlobalParams.configsvrMode == CatalogManager::ConfigServerMode::NONE) {
        grid.shardRegistry()->reload(txn);
    }

    return Status::OK();
}

}  // namespace mongol
