/**
 *    Copyright (C) 2014 MongoDB Inc.
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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kWrite

#include "mongol/platform/basic.h"

#include "mongol/db/ops/parsed_delete.h"

#include "mongol/db/catalog/collection.h"
#include "mongol/db/catalog/database.h"
#include "mongol/db/exec/delete.h"
#include "mongol/db/ops/delete_request.h"
#include "mongol/db/query/canonical_query.h"
#include "mongol/db/query/get_executor.h"
#include "mongol/db/query/query_planner_common.h"
#include "mongol/db/repl/replication_coordinator_global.h"
#include "mongol/util/assert_util.h"
#include "mongol/util/log.h"
#include "mongol/util/mongolutils/str.h"

namespace mongol {

ParsedDelete::ParsedDelete(OperationContext* txn, const DeleteRequest* request)
    : _txn(txn), _request(request) {}

Status ParsedDelete::parseRequest() {
    dassert(!_canonicalQuery.get());
    // It is invalid to request that the DeleteStage return the deleted document during a
    // multi-remove.
    invariant(!(_request->shouldReturnDeleted() && _request->isMulti()));

    // It is invalid to request that a ProjectionStage be applied to the DeleteStage if the
    // DeleteStage would not return the deleted document.
    invariant(_request->getProj().isEmpty() || _request->shouldReturnDeleted());

    if (CanonicalQuery::isSimpleIdQuery(_request->getQuery())) {
        return Status::OK();
    }

    return parseQueryToCQ();
}

Status ParsedDelete::parseQueryToCQ() {
    dassert(!_canonicalQuery.get());

    const WhereCallbackReal whereCallback(_txn, _request->getNamespaceString().db());

    // Limit should only used for the findAndModify command when a sort is specified. If a sort
    // is requested, we want to use a top-k sort for efficiency reasons, so should pass the
    // limit through. Generally, a delete stage expects to be able to skip documents that were
    // deleted out from under it, but a limit could inhibit that and give an EOF when the delete
    // has not actually deleted a document. This behavior is fine for findAndModify, but should
    // not apply to deletes in general.
    long long limit = (!_request->isMulti() && !_request->getSort().isEmpty()) ? -1 : 0;

    // The projection needs to be applied after the delete operation, so we specify an empty
    // BSONObj as the projection during canonicalization.
    const BSONObj emptyObj;
    auto statusWithCQ = CanonicalQuery::canonicalize(_request->getNamespaceString(),
                                                     _request->getQuery(),
                                                     _request->getSort(),
                                                     emptyObj,  // projection
                                                     0,         // skip
                                                     limit,
                                                     emptyObj,  // hint
                                                     emptyObj,  // min
                                                     emptyObj,  // max
                                                     false,     // snapshot
                                                     _request->isExplain(),
                                                     whereCallback);

    if (statusWithCQ.isOK()) {
        _canonicalQuery = std::move(statusWithCQ.getValue());
    }

    return statusWithCQ.getStatus();
}

const DeleteRequest* ParsedDelete::getRequest() const {
    return _request;
}

bool ParsedDelete::canYield() const {
    return !_request->isGod() && PlanExecutor::YIELD_AUTO == _request->getYieldPolicy() &&
        !isIsolated();
}

bool ParsedDelete::isIsolated() const {
    return _canonicalQuery.get()
        ? QueryPlannerCommon::hasNode(_canonicalQuery->root(), MatchExpression::ATOMIC)
        : LiteParsedQuery::isQueryIsolated(_request->getQuery());
}

bool ParsedDelete::hasParsedQuery() const {
    return _canonicalQuery.get() != NULL;
}

std::unique_ptr<CanonicalQuery> ParsedDelete::releaseParsedQuery() {
    invariant(_canonicalQuery.get() != NULL);
    return std::move(_canonicalQuery);
}

}  // namespace mongol
