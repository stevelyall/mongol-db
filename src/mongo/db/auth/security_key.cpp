/*
 *    Copyright (C) 2010 10gen Inc.
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

#include "mongol/db/auth/security_key.h"

#include <sys/stat.h>
#include <string>
#include <vector>

#include "mongol/base/status_with.h"
#include "mongol/client/sasl_client_authenticate.h"
#include "mongol/crypto/mechanism_scram.h"
#include "mongol/db/auth/action_set.h"
#include "mongol/db/auth/action_type.h"
#include "mongol/db/auth/authorization_manager.h"
#include "mongol/db/auth/internal_user_auth.h"
#include "mongol/db/auth/privilege.h"
#include "mongol/db/auth/sasl_options.h"
#include "mongol/db/auth/security_file.h"
#include "mongol/db/auth/user.h"
#include "mongol/db/server_options.h"
#include "mongol/util/log.h"
#include "mongol/util/password_digest.h"

namespace mongol {

using std::string;

bool setUpSecurityKey(const string& filename) {
    StatusWith<std::string> keyString = mongol::readSecurityFile(filename);
    if (!keyString.isOK()) {
        log() << keyString.getStatus().reason();
        return false;
    }

    std::string str = std::move(keyString.getValue());
    const unsigned long long keyLength = str.size();
    if (keyLength < 6 || keyLength > 1024) {
        log() << " security key in " << filename << " has length " << keyLength
              << ", must be between 6 and 1024 chars";
        return false;
    }

    // Generate MONGODB-CR and SCRAM credentials for the internal user based on
    // the keyfile.
    User::CredentialData credentials;
    credentials.password =
        mongol::createPasswordDigest(internalSecurity.user->getName().getUser().toString(), str);

    BSONObj creds =
        scram::generateCredentials(credentials.password, saslGlobalParams.scramIterationCount);
    credentials.scram.iterationCount = creds[scram::iterationCountFieldName].Int();
    credentials.scram.salt = creds[scram::saltFieldName].String();
    credentials.scram.storedKey = creds[scram::storedKeyFieldName].String();
    credentials.scram.serverKey = creds[scram::serverKeyFieldName].String();

    internalSecurity.user->setCredentials(credentials);

    int clusterAuthMode = serverGlobalParams.clusterAuthMode.load();
    if (clusterAuthMode == ServerGlobalParams::ClusterAuthMode_keyFile ||
        clusterAuthMode == ServerGlobalParams::ClusterAuthMode_sendKeyFile) {
        setInternalUserAuthParams(
            BSON(saslCommandMechanismFieldName
                 << "SCRAM-SHA-1" << saslCommandUserDBFieldName
                 << internalSecurity.user->getName().getDB() << saslCommandUserFieldName
                 << internalSecurity.user->getName().getUser() << saslCommandPasswordFieldName
                 << credentials.password << saslCommandDigestPasswordFieldName << false));
    }

    return true;
}

}  // namespace mongol
