// Tests the state of sharding data after a replica set reconfig

(function() {

var st = new ShardingTest({ shards: 2,
                            mongols: 1,
                            other: {
                                rs: true,
                                rsOptions: { nodes : 1 }
                            }
                          });

var mongols = st.s0;
var admin = mongols.getDB("admin");
var shards = mongols.getCollection("config.shards").find().toArray();

var coll = mongols.getCollection("foo.bar");
var collSharded = mongols.getCollection("foo.barSharded");

assert.commandWorked(admin.runCommand({ enableSharding : coll.getDB() + "" }));
printjson(admin.runCommand({ movePrimary : coll.getDB() + "", to : shards[0]._id }));
assert.commandWorked(admin.runCommand({ shardCollection : collSharded.toString(),
                                        key : { _id : 1 } }));
assert.commandWorked(admin.runCommand({ moveChunk : collSharded.toString(),
                                        find : { _id : 0 },
                                        to : shards[1]._id }));

assert.writeOK(coll.insert({ some : "data" }));
assert.writeOK(collSharded.insert({ some : "data" }));
assert.eq(2, mongols.adminCommand({ getShardVersion : collSharded.toString() }).version.t);

st.printShardingStatus();

// Restart both primaries to reset our sharding data
var restartPrimaries = function() {
    var rs0Primary = st.rs0.getPrimary();
    var rs1Primary = st.rs1.getPrimary();

    st.rs0.stop(rs0Primary);
    st.rs1.stop(rs1Primary);

    ReplSetTest.awaitRSClientHosts(mongols, [rs0Primary, rs1Primary], { ok : false });

    st.rs0.start(rs0Primary, { restart : true });
    st.rs1.start(rs1Primary, { restart : true });

    ReplSetTest.awaitRSClientHosts(mongols, [rs0Primary, rs1Primary], { ismaster : true });
};

restartPrimaries();

// Sharding data gets initialized either when shards are hit by an unsharded query or if some
// metadata operation was run before the step down, which wrote a minOpTime recovery record. In
// this case we did a moveChunk above from shard0 to shard1, so we will have this record on
// shard0.
assert.neq("",
           st.rs0.getPrimary().adminCommand({ getShardVersion : coll.toString() }).configServer);
assert.eq("",
          st.rs1.getPrimary().adminCommand({ getShardVersion : coll.toString() }).configServer);

// Doing a find only accesses the primary (rs0), which is already recovered. Ensure that the
// secondary still has no sharding knowledge.
assert.neq(null, coll.findOne({}));
assert.eq("",
          st.rs1.getPrimary().adminCommand({ getShardVersion : coll.toString() }).configServer);

//
//
// Sharding data initialized when shards are hit by a sharded query
assert.neq(null, collSharded.findOne({}));
assert.neq("",
           st.rs0.getPrimary().adminCommand({ getShardVersion : coll.toString() }).configServer);
assert.neq("",
           st.rs1.getPrimary().adminCommand({ getShardVersion : coll.toString() }).configServer);


// Stepdown both primaries to reset our sharding data
var stepDownPrimaries = function() {

    var rs0Primary = st.rs0.getPrimary();
    var rs1Primary = st.rs1.getPrimary();

    try {
        rs0Primary.adminCommand({ replSetStepDown : 1000 * 1000, force : true });
        assert(false);
    }
    catch(ex) {
        // Expected connection exception, will check for stepdown later
    }

    try {
        rs1Primary.adminCommand({ replSetStepDown : 1000 * 1000, force : true });
        assert(false);
    }
    catch(ex) {
        // Expected connection exception, will check for stepdown later
    }

    ReplSetTest.awaitRSClientHosts(mongols, [rs0Primary, rs1Primary], { secondary : true });

    assert.commandWorked(new Mongo(rs0Primary.host).adminCommand({ replSetFreeze : 0 }));
    assert.commandWorked(new Mongo(rs1Primary.host).adminCommand({ replSetFreeze : 0 }));

    rs0Primary = st.rs0.getPrimary();
    rs1Primary = st.rs1.getPrimary();

    // Flush connections to avoid transient issues with conn pooling
    assert.commandWorked(rs0Primary.adminCommand({ connPoolSync : true }));
    assert.commandWorked(rs1Primary.adminCommand({ connPoolSync : true }));

    ReplSetTest.awaitRSClientHosts(mongols, [rs0Primary, rs1Primary], { ismaster : true });
};

stepDownPrimaries();

//
//
// No sharding metadata until shards are hit by a metadata operation
assert.eq({},
          st.rs0.getPrimary().adminCommand(
            { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);
assert.eq({},
          st.rs1.getPrimary().adminCommand(
            { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);

//
//
// Metadata commands should enable sharding data implicitly
assert.commandWorked(mongols.adminCommand({ split : collSharded.toString(), middle : { _id : 0 }}));
assert.eq({},
          st.rs0.getPrimary().adminCommand(
            { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);
assert.neq({},
           st.rs1.getPrimary().adminCommand(
            { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);

//
//
// MoveChunk command should enable sharding data implicitly on TO-shard
assert.commandWorked(mongols.adminCommand({ moveChunk : collSharded.toString(), find : { _id : 0 },
                                           to : shards[0]._id }));
assert.neq({},
           st.rs0.getPrimary().adminCommand(
                { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);
assert.neq({},
           st.rs1.getPrimary().adminCommand(
                { getShardVersion : collSharded.toString(), fullMetadata : true }).metadata);

jsTest.log( "DONE!" );

st.stop();

})();
