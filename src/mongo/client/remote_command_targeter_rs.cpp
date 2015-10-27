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

#include "mongol/platform/basic.h"

#include "mongol/client/remote_command_targeter_rs.h"

#include "mongol/base/status_with.h"
#include "mongol/client/connection_string.h"
#include "mongol/client/read_preference.h"
#include "mongol/client/replica_set_monitor.h"
#include "mongol/util/assert_util.h"
#include "mongol/util/mongolutils/str.h"
#include "mongol/util/net/hostandport.h"

namespace mongol {

RemoteCommandTargeterRS::RemoteCommandTargeterRS(const std::string& rsName,
                                                 const std::vector<HostAndPort>& seedHosts)
    : _rsName(rsName) {
    _rsMonitor = ReplicaSetMonitor::get(rsName);
    if (!_rsMonitor) {
        std::set<HostAndPort> seedServers(seedHosts.begin(), seedHosts.end());

        ReplicaSetMonitor::createIfNeeded(rsName, seedServers);
        _rsMonitor = ReplicaSetMonitor::get(rsName);

        fassert(28711, _rsMonitor != nullptr);
    }
}

ConnectionString RemoteCommandTargeterRS::connectionString() {
    return fassertStatusOK(28712, ConnectionString::parse(_rsMonitor->getServerAddress()));
}

StatusWith<HostAndPort> RemoteCommandTargeterRS::findHost(const ReadPreferenceSetting& readPref) {
    if (!_rsMonitor) {
        return Status(ErrorCodes::ReplicaSetNotFound,
                      str::stream() << "unknown replica set " << _rsName);
    }

    HostAndPort hostAndPort = _rsMonitor->getHostOrRefresh(readPref);
    if (hostAndPort.empty()) {
        if (readPref.pref == ReadPreference::PrimaryOnly) {
            return Status(ErrorCodes::NotMaster,
                          str::stream() << "No master found for set " << _rsName);
        }
        return Status(ErrorCodes::FailedToSatisfyReadPreference,
                      str::stream() << "could not find host matching read preference "
                                    << readPref.toString() << " for set " << _rsName);
    }

    return hostAndPort;
}

void RemoteCommandTargeterRS::markHostNotMaster(const HostAndPort& host) {
    invariant(_rsMonitor);

    _rsMonitor->failedHost(host);
}

void RemoteCommandTargeterRS::markHostUnreachable(const HostAndPort& host) {
    invariant(_rsMonitor);

    _rsMonitor->failedHost(host);
}

}  // namespace mongol
