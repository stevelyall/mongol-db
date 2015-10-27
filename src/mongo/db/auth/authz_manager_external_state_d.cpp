/**
*    Copyright (C) 2012 10gen Inc.
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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kAccessControl

#include "mongol/platform/basic.h"

#include "mongol/db/auth/authz_manager_external_state_d.h"

#include "mongol/base/status.h"
#include "mongol/db/auth/authorization_manager.h"
#include "mongol/db/auth/authz_session_external_state_d.h"
#include "mongol/db/auth/user_name.h"
#include "mongol/db/client.h"
#include "mongol/db/db_raii.h"
#include "mongol/db/dbdirectclient.h"
#include "mongol/db/dbhelpers.h"
#include "mongol/db/jsobj.h"
#include "mongol/db/operation_context.h"
#include "mongol/db/service_context.h"
#include "mongol/db/storage/storage_engine.h"
#include "mongol/stdx/memory.h"
#include "mongol/util/assert_util.h"
#include "mongol/util/log.h"
#include "mongol/util/mongolutils/str.h"

namespace mongol {

AuthzManagerExternalStateMongod::AuthzManagerExternalStateMongod() = default;
AuthzManagerExternalStateMongod::~AuthzManagerExternalStateMongod() = default;

std::unique_ptr<AuthzSessionExternalState>
AuthzManagerExternalStateMongod::makeAuthzSessionExternalState(AuthorizationManager* authzManager) {
    return stdx::make_unique<AuthzSessionExternalStateMongod>(authzManager);
}

Status AuthzManagerExternalStateMongod::query(
    OperationContext* txn,
    const NamespaceString& collectionName,
    const BSONObj& query,
    const BSONObj& projection,
    const stdx::function<void(const BSONObj&)>& resultProcessor) {
    try {
        DBDirectClient client(txn);
        client.query(resultProcessor, collectionName.ns(), query, &projection);
        return Status::OK();
    } catch (const DBException& e) {
        return e.toStatus();
    }
}

Status AuthzManagerExternalStateMongod::findOne(OperationContext* txn,
                                                const NamespaceString& collectionName,
                                                const BSONObj& query,
                                                BSONObj* result) {
    AutoGetCollectionForRead ctx(txn, collectionName);

    BSONObj found;
    if (Helpers::findOne(txn, ctx.getCollection(), query, found)) {
        *result = found.getOwned();
        return Status::OK();
    }
    return Status(ErrorCodes::NoMatchingDocument,
                  mongolutils::str::stream() << "No document in " << collectionName.ns()
                                            << " matches " << query);
}

}  // namespace mongol
