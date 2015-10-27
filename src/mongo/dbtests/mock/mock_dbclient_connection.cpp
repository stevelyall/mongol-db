/*    Copyright 2012 10gen Inc.
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

#include "mongol/dbtests/mock/mock_dbclient_connection.h"

#include "mongol/dbtests/mock/mock_dbclient_cursor.h"
#include "mongol/util/net/sock.h"
#include "mongol/util/time_support.h"

using mongol::BSONObj;

using std::string;
using std::vector;

namespace mongol {
MockDBClientConnection::MockDBClientConnection(MockRemoteDBServer* remoteServer, bool autoReconnect)
    : _remoteServerInstanceID(remoteServer->getInstanceID()),
      _remoteServer(remoteServer),
      _isFailed(false),
      _sockCreationTime(mongol::curTimeMicros64()),
      _autoReconnect(autoReconnect) {}

MockDBClientConnection::~MockDBClientConnection() {}

bool MockDBClientConnection::connect(const char* hostName, std::string& errmsg) {
    if (_remoteServer->isRunning()) {
        _remoteServerInstanceID = _remoteServer->getInstanceID();
        return true;
    }

    errmsg.assign("cannot connect to " + _remoteServer->getServerAddress());
    return false;
}

bool MockDBClientConnection::runCommand(const string& dbname,
                                        const BSONObj& cmdObj,
                                        BSONObj& info,
                                        int options) {
    checkConnection();

    try {
        return _remoteServer->runCommand(_remoteServerInstanceID, dbname, cmdObj, info, options);
    } catch (const mongol::SocketException&) {
        _isFailed = true;
        throw;
    }

    return false;
}

rpc::UniqueReply MockDBClientConnection::runCommandWithMetadata(StringData database,
                                                                StringData command,
                                                                const BSONObj& metadata,
                                                                const BSONObj& commandArgs) {
    checkConnection();

    try {
        return _remoteServer->runCommandWithMetadata(
            _remoteServerInstanceID, database, command, metadata, commandArgs);
    } catch (const mongol::SocketException&) {
        _isFailed = true;
        throw;
    }

    MONGO_UNREACHABLE;
}

std::unique_ptr<mongol::DBClientCursor> MockDBClientConnection::query(const string& ns,
                                                                     mongol::Query query,
                                                                     int nToReturn,
                                                                     int nToSkip,
                                                                     const BSONObj* fieldsToReturn,
                                                                     int queryOptions,
                                                                     int batchSize) {
    checkConnection();

    try {
        mongol::BSONArray result(_remoteServer->query(_remoteServerInstanceID,
                                                     ns,
                                                     query,
                                                     nToReturn,
                                                     nToSkip,
                                                     fieldsToReturn,
                                                     queryOptions,
                                                     batchSize));

        std::unique_ptr<mongol::DBClientCursor> cursor;
        cursor.reset(new MockDBClientCursor(this, result));
        return cursor;
    } catch (const mongol::SocketException&) {
        _isFailed = true;
        throw;
    }

    std::unique_ptr<mongol::DBClientCursor> nullPtr;
    return nullPtr;
}

mongol::ConnectionString::ConnectionType MockDBClientConnection::type() const {
    return mongol::ConnectionString::CUSTOM;
}

bool MockDBClientConnection::isFailed() const {
    return _isFailed;
}

string MockDBClientConnection::getServerAddress() const {
    return _remoteServer->getServerAddress();
}

string MockDBClientConnection::toString() const {
    return _remoteServer->toString();
}

unsigned long long MockDBClientConnection::query(stdx::function<void(const BSONObj&)> f,
                                                 const string& ns,
                                                 mongol::Query query,
                                                 const BSONObj* fieldsToReturn,
                                                 int queryOptions) {
    verify(false);
    return 0;
}

unsigned long long MockDBClientConnection::query(
    stdx::function<void(mongol::DBClientCursorBatchIterator&)> f,
    const std::string& ns,
    mongol::Query query,
    const mongol::BSONObj* fieldsToReturn,
    int queryOptions) {
    verify(false);
    return 0;
}

uint64_t MockDBClientConnection::getSockCreationMicroSec() const {
    return _sockCreationTime;
}

void MockDBClientConnection::insert(const string& ns, BSONObj obj, int flags) {
    _remoteServer->insert(ns, obj, flags);
}

void MockDBClientConnection::insert(const string& ns, const vector<BSONObj>& objList, int flags) {
    for (vector<BSONObj>::const_iterator iter = objList.begin(); iter != objList.end(); ++iter) {
        insert(ns, *iter, flags);
    }
}

void MockDBClientConnection::remove(const string& ns, Query query, bool justOne) {
    remove(ns, query, (justOne ? RemoveOption_JustOne : 0));
}

void MockDBClientConnection::remove(const string& ns, Query query, int flags) {
    _remoteServer->remove(ns, query, flags);
}

void MockDBClientConnection::killCursor(long long cursorID) {
    verify(false);  // unimplemented
}

bool MockDBClientConnection::callRead(mongol::Message& toSend, mongol::Message& response) {
    verify(false);  // unimplemented
    return false;
}

bool MockDBClientConnection::call(mongol::Message& toSend,
                                  mongol::Message& response,
                                  bool assertOk,
                                  string* actualServer) {
    verify(false);  // unimplemented
    return false;
}

void MockDBClientConnection::say(mongol::Message& toSend, bool isRetry, string* actualServer) {
    verify(false);  // unimplemented
}

bool MockDBClientConnection::lazySupported() const {
    verify(false);  // unimplemented
    return false;
}

double MockDBClientConnection::getSoTimeout() const {
    return 0;
}

void MockDBClientConnection::checkConnection() {
    if (_isFailed && _autoReconnect) {
        _remoteServerInstanceID = _remoteServer->getInstanceID();
    }
}
}
