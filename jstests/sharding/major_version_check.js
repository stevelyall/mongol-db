//
// Tests that only a correct major-version is needed to connect to a shard via mongols
//

var st = new ShardingTest({ shards : 1, mongols : 2 })
st.stopBalancer()

var mongols = st.s0
var staleMongos = st.s1
var admin = mongols.getDB( "admin" )
var config = mongols.getDB( "config" )
var coll = mongols.getCollection( "foo.bar" )

// This converter is needed as spidermonkey and v8 treat Timestamps slightly differently
// TODO: Is this a problem? SERVER-6079
var tsToObj = function( obj ){
    return { t : obj.t, i : obj.i }
}

// Shard collection
printjson( admin.runCommand({ enableSharding : coll.getDB() + "" }) )
printjson( admin.runCommand({ shardCollection : coll + "", key : { _id : 1 } }) )

// Make sure our stale mongols is up-to-date with no splits
staleMongos.getCollection( coll + "" ).findOne()

// Run one split
printjson( admin.runCommand({ split : coll + "", middle : { _id : 0 } }) )

// Make sure our stale mongols is not up-to-date with the split
printjson( admin.runCommand({ getShardVersion : coll + "" }) )
printjson( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }) )

// Compare strings b/c timestamp comparison is a bit weird
assert.eq( tsToObj( Timestamp( 1, 2 ) ), 
           tsToObj( admin.runCommand({ getShardVersion : coll + "" }).version ) )
assert.eq( tsToObj( Timestamp( 1, 0 ) ), 
           tsToObj( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }).version ) )

// See if our stale mongols is required to catch up to run a findOne on an existing connection
staleMongos.getCollection( coll + "" ).findOne()

printjson( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }) )

assert.eq( tsToObj( Timestamp( 1, 0 ) ), 
           tsToObj( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }).version ) )
           
// See if our stale mongols is required to catch up to run a findOne on a new connection
staleMongos = new Mongo( staleMongos.host )
staleMongos.getCollection( coll + "" ).findOne()

printjson( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }) )

assert.eq( tsToObj( Timestamp( 1, 0 ) ), 
           tsToObj( staleMongos.getDB( "admin" ).runCommand({ getShardVersion : coll + "" }).version ) )

st.stop()