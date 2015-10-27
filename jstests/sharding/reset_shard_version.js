// Tests whether a reset sharding version triggers errors

jsTestLog( "Starting sharded cluster..." )

var st = new ShardingTest( { shards : 1, mongols : 2 } )

var mongolsA = st.s0
var mongolsB = st.s1

var collA = mongolsA.getCollection( jsTestName() + ".coll" )
collA.drop()
var collB = mongolsB.getCollection( "" + collA )

st.shardColl( collA, { _id : 1 }, false )

jsTestLog( "Inserting data..." )

// Insert some data
for ( var i = 0; i < 100; i++ ) {
    collA.insert( { _id : i } )
}

jsTestLog( "Setting connection versions on both mongolses..." )

assert.eq( collA.find().itcount(), 100 )
assert.eq( collB.find().itcount(), 100 )

jsTestLog( "Resetting connection version on shard..." )

var admin = st.shard0.getDB( "admin" )

printjson( admin.runCommand( {
    setShardVersion : "" + collA, version : new Timestamp( 0, 0 ), configdb : st._configDB,
    authoritative : true } ) )

jsTestLog( "Querying with version reset..." )

// This will cause a version check
assert.eq(0, collA.findOne({_id:0})['_id'])

jsTestLog( "Resetting connection version on shard again..." )

printjson( admin.runCommand( {
    setShardVersion : "" + collA, version : new Timestamp( 0, 0 ), configdb : st._configDB,
    authoritative : true } ) )

jsTestLog( "Doing count command with version reset..." )

assert.eq(100, collA.count()) // Test for SERVER-4196

st.stop()