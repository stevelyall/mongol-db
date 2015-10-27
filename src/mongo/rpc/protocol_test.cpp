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

#include "mongol/base/status.h"
#include "mongol/db/jsobj.h"
#include "mongol/db/wire_version.h"
#include "mongol/rpc/protocol.h"
#include "mongol/unittest/unittest.h"

namespace {

using mongol::WireVersion;
using namespace mongol::rpc;
using mongol::unittest::assertGet;
using mongol::BSONObj;

// Checks if negotiation of the first to protocol sets results in the 'proto'
const auto assert_negotiated = [](ProtocolSet fst, ProtocolSet snd, Protocol proto) {
    auto negotiated = negotiate(fst, snd);
    ASSERT_TRUE(negotiated.isOK());
    ASSERT_TRUE(negotiated.getValue() == proto);
};

TEST(Protocol, SuccessfulNegotiation) {
    assert_negotiated(supports::kAll, supports::kAll, Protocol::kOpCommandV1);
    assert_negotiated(supports::kAll, supports::kOpCommandOnly, Protocol::kOpCommandV1);
    assert_negotiated(supports::kAll, supports::kOpQueryOnly, Protocol::kOpQuery);
}

// Checks that negotiation fails
const auto assert_not_negotiated = [](ProtocolSet fst, ProtocolSet snd) {
    auto proto = negotiate(fst, snd);
    ASSERT_TRUE(!proto.isOK());
    ASSERT_TRUE(proto.getStatus().code() == mongol::ErrorCodes::RPCProtocolNegotiationFailed);
};

TEST(Protocol, FailedNegotiation) {
    assert_not_negotiated(supports::kOpQueryOnly, supports::kOpCommandOnly);
    assert_not_negotiated(supports::kAll, supports::kNone);
    assert_not_negotiated(supports::kOpQueryOnly, supports::kNone);
    assert_not_negotiated(supports::kOpCommandOnly, supports::kNone);
}

TEST(Protocol, parseProtocolSetFromIsMasterReply) {
    {
        // MongoDB 3.2 (mongold)
        auto mongold32 =
            BSON("maxWireVersion" << static_cast<int>(WireVersion::FIND_COMMAND) << "minWireVersion"
                                  << static_cast<int>(WireVersion::RELEASE_2_4_AND_BEFORE));

        ASSERT_EQ(assertGet(parseProtocolSetFromIsMasterReply(mongold32)), supports::kAll);
    }
    {
        // MongoDB 3.2 (mongols)
        auto mongols32 =
            BSON("maxWireVersion" << static_cast<int>(WireVersion::FIND_COMMAND) << "minWireVersion"
                                  << static_cast<int>(WireVersion::RELEASE_2_4_AND_BEFORE) << "msg"
                                  << "isdbgrid");

        ASSERT_EQ(assertGet(parseProtocolSetFromIsMasterReply(mongols32)), supports::kOpQueryOnly);
    }
    {
        // MongoDB 3.0 (mongold)
        auto mongold30 = BSON("maxWireVersion"
                             << static_cast<int>(WireVersion::RELEASE_2_7_7) << "minWireVersion"
                             << static_cast<int>(WireVersion::RELEASE_2_4_AND_BEFORE));
        ASSERT_EQ(assertGet(parseProtocolSetFromIsMasterReply(mongold30)), supports::kOpQueryOnly);
    }
    {
        auto mongold24 = BSONObj();
        ASSERT_EQ(assertGet(parseProtocolSetFromIsMasterReply(mongold24)), supports::kOpQueryOnly);
    }
}

}  // namespace
