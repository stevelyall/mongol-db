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

#include "mongol/db/jsobj.h"
#include "mongol/rpc/metadata/repl_set_metadata.h"
#include "mongol/unittest/unittest.h"

namespace mongol {
namespace rpc {
namespace {

using repl::OpTime;

TEST(ReplResponseMetadataTest, Roundtrip) {
    OpTime opTime(Timestamp(1234, 100), 5);
    OpTime opTime2(Timestamp(7777, 100), 6);
    ReplSetMetadata metadata(3, opTime, opTime2, 6, 12, -1);

    ASSERT_EQ(opTime, metadata.getLastOpCommitted());
    ASSERT_EQ(opTime2, metadata.getLastOpVisible());

    BSONObjBuilder builder;
    metadata.writeToMetadata(&builder);

    BSONObj expectedObj(BSON(
        kReplSetMetadataFieldName << BSON(
            "term" << 3 << "lastOpCommitted" << BSON("ts" << opTime.getTimestamp() << "t"
                                                          << opTime.getTerm()) << "lastOpVisible"
                   << BSON("ts" << opTime2.getTimestamp() << "t" << opTime2.getTerm())
                   << "configVersion" << 6 << "primaryIndex" << 12 << "syncSourceIndex" << -1)));

    BSONObj serializedObj = builder.obj();
    ASSERT_EQ(expectedObj, serializedObj);

    auto cloneStatus = ReplSetMetadata::readFromMetadata(serializedObj);
    ASSERT_OK(cloneStatus.getStatus());

    const auto& clonedMetadata = cloneStatus.getValue();
    ASSERT_EQ(opTime, clonedMetadata.getLastOpCommitted());
    ASSERT_EQ(opTime2, clonedMetadata.getLastOpVisible());

    BSONObjBuilder clonedBuilder;
    clonedMetadata.writeToMetadata(&clonedBuilder);

    BSONObj clonedSerializedObj = clonedBuilder.obj();
    ASSERT_EQ(expectedObj, clonedSerializedObj);
}

}  // unnamed namespace
}  // namespace rpc
}  // namespace mongol
