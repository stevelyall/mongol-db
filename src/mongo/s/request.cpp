// s/request.cpp

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

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kSharding

#include "mongol/platform/basic.h"

#include "mongol/s/request.h"

#include "mongol/db/auth/authorization_session.h"
#include "mongol/db/client.h"
#include "mongol/db/commands.h"
#include "mongol/db/lasterror.h"
#include "mongol/db/stats/counters.h"
#include "mongol/s/cluster_last_error_info.h"
#include "mongol/s/cursors.h"
#include "mongol/s/grid.h"
#include "mongol/s/strategy.h"
#include "mongol/util/log.h"
#include "mongol/util/timer.h"

namespace mongol {

using std::string;

Request::Request(Message& m, AbstractMessagingPort* p)
    : _clientInfo(&cc()), _m(m), _d(m), _p(p), _id(_m.header().getId()), _didInit(false) {
    ClusterLastErrorInfo::get(_clientInfo).newRequest();
}

void Request::init(OperationContext* txn) {
    if (_didInit) {
        return;
    }

    _m.header().setId(_id);
    LastError::get(_clientInfo).startRequest();
    ClusterLastErrorInfo::get(_clientInfo).clearRequestInfo();

    if (_d.messageShouldHaveNs()) {
        const NamespaceString nss(getns());

        uassert(ErrorCodes::IllegalOperation,
                "can't use 'local' database through mongols",
                nss.db() != "local");

        uassert(ErrorCodes::InvalidNamespace,
                str::stream() << "Invalid ns [" << nss.ns() << "]",
                nss.isValid());
    }

    AuthorizationSession::get(_clientInfo)->startRequest(txn);
    _didInit = true;
}

void Request::process(OperationContext* txn, int attempt) {
    init(txn);
    int op = _m.operation();
    verify(op > dbMsg);

    const MSGID msgId = _m.header().getId();

    Timer t;
    LOG(3) << "Request::process begin ns: " << getnsIfPresent() << " msg id: " << msgId
           << " op: " << op << " attempt: " << attempt;

    _d.markSet();

    bool iscmd = false;
    if (op == dbKillCursors) {
        Strategy::killCursors(txn, *this);
        globalOpCounters.gotOp(op, iscmd);
    } else if (op == dbQuery) {
        NamespaceString nss(getns());
        iscmd = nss.isCommand() || nss.isSpecialCommand();

        if (iscmd) {
            int n = _d.getQueryNToReturn();
            uassert(16978,
                    str::stream() << "bad numberToReturn (" << n
                                  << ") for $cmd type ns - can only be 1 or -1",
                    n == 1 || n == -1);

            Strategy::clientCommandOp(txn, *this);
        } else {
            Strategy::queryOp(txn, *this);
        }
    } else if (op == dbGetMore) {
        Strategy::getMore(txn, *this);
        globalOpCounters.gotOp(op, iscmd);
    } else {
        Strategy::writeOp(txn, op, *this);
        // globalOpCounters are handled by write commands.
    }

    LOG(3) << "Request::process end ns: " << getnsIfPresent() << " msg id: " << msgId
           << " op: " << op << " attempt: " << attempt << " " << t.millis() << "ms";
}

void Request::reply(Message& response, const string& fromServer) {
    verify(_didInit);
    long long cursor = response.header().getCursor();
    if (cursor) {
        if (fromServer.size()) {
            cursorCache.storeRef(fromServer, cursor, getns());
        } else {
            // probably a getMore
            // make sure we have a ref for this
            verify(cursorCache.getRef(cursor).size());
        }
    }
    _p->reply(_m, response, _id);
}

}  // namespace mongol
