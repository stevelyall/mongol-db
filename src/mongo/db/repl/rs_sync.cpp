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
*    must comply with the GNU Affero General Public License in all respects for
*    all of the code used other than as permitted herein. If you modify file(s)
*    with this exception, you may extend this exception to your version of the
*    file(s), but you are not obligated to do so. If you do not wish to do so,
*    delete this exception statement from your version. If you delete this
*    exception statement from all source files in the program, then also delete
*    it in the license file.
*/

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kReplication

#include "mongol/platform/basic.h"

#include "mongol/db/repl/rs_sync.h"

#include <vector>

#include "third_party/murmurhash3/MurmurHash3.h"

#include "mongol/base/counter.h"
#include "mongol/db/auth/authorization_session.h"
#include "mongol/db/client.h"
#include "mongol/db/commands/fsync.h"
#include "mongol/db/commands/server_status.h"
#include "mongol/db/curop.h"
#include "mongol/db/concurrency/d_concurrency.h"
#include "mongol/db/namespace_string.h"
#include "mongol/db/repl/bgsync.h"
#include "mongol/db/repl/minvalid.h"
#include "mongol/db/repl/optime.h"
#include "mongol/db/repl/repl_settings.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/db/repl/rs_initialsync.h"
#include "mongol/db/repl/sync_tail.h"
#include "mongol/db/server_parameters.h"
#include "mongol/db/stats/timer_stats.h"
#include "mongol/db/operation_context_impl.h"
#include "mongol/db/storage/storage_options.h"
#include "mongol/util/exit.h"
#include "mongol/util/fail_point_service.h"
#include "mongol/util/log.h"

namespace mongol {
namespace repl {

void runSyncThread() {
    Client::initThread("rsSync");
    AuthorizationSession::get(cc())->grantInternalAuthorization();
    ReplicationCoordinator* replCoord = getGlobalReplicationCoordinator();

    // Set initial indexPrefetch setting
    const std::string& prefetch = replCoord->getSettings().rsIndexPrefetch;
    if (!prefetch.empty()) {
        BackgroundSync::IndexPrefetchConfig prefetchConfig = BackgroundSync::PREFETCH_ALL;
        if (prefetch == "none")
            prefetchConfig = BackgroundSync::PREFETCH_NONE;
        else if (prefetch == "_id_only")
            prefetchConfig = BackgroundSync::PREFETCH_ID_ONLY;
        else if (prefetch == "all")
            prefetchConfig = BackgroundSync::PREFETCH_ALL;
        else {
            warning() << "unrecognized indexPrefetch setting " << prefetch << ", defaulting "
                      << "to \"all\"";
        }
        BackgroundSync::get()->setIndexPrefetchConfig(prefetchConfig);
    }

    while (!inShutdown()) {
        // After a reconfig, we may not be in the replica set anymore, so
        // check that we are in the set (and not an arbiter) before
        // trying to sync with other replicas.
        // TODO(spencer): Use a condition variable to await loading a config
        if (replCoord->getMemberState().startup()) {
            warning() << "did not receive a valid config yet";
            sleepsecs(1);
            continue;
        }

        const MemberState memberState = replCoord->getMemberState();

        // An arbiter can never transition to any other state, and doesn't replicate, ever
        if (memberState.arbiter()) {
            break;
        }

        // If we are removed then we don't belong to the set anymore
        if (memberState.removed()) {
            sleepsecs(5);
            continue;
        }

        try {
            if (memberState.primary() && !replCoord->isWaitingForApplierToDrain()) {
                sleepsecs(1);
                continue;
            }

            bool initialSyncRequested = BackgroundSync::get()->getInitialSyncRequestedFlag();
            // Check criteria for doing an initial sync:
            // 1. If the oplog is empty, do an initial sync
            // 2. If minValid has _initialSyncFlag set, do an initial sync
            // 3. If initialSyncRequested is true
            if (getGlobalReplicationCoordinator()->getMyLastOptime().isNull() ||
                getInitialSyncFlag() || initialSyncRequested) {
                syncDoInitialSync();
                continue;  // start from top again in case sync failed.
            }
            if (!replCoord->setFollowerMode(MemberState::RS_RECOVERING)) {
                continue;
            }

            /* we have some data.  continue tailing. */
            SyncTail tail(BackgroundSync::get(), multiSyncApply);
            tail.oplogApplication();
        } catch (const DBException& e) {
            log() << "Received exception while syncing: " << e.toString();
            sleepsecs(10);
        } catch (const std::exception& e) {
            log() << "Received exception while syncing: " << e.what();
            sleepsecs(10);
        }
    }
}

}  // namespace repl
}  // namespace mongol
