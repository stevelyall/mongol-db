/**
* Test that split/move chunk update the dbhash on the config server
*/

st = new ShardingTest({ name: "dbhash", shards : 2, mongols : 2, verbose : 2, sync: true });
st.stopBalancer();

var mongols = st.s0;
var shards = mongols.getCollection( "config.shards" ).find().toArray();
var admin = mongols.getDB( "admin" );
var configs = st._configServers

assert(admin.runCommand({ enablesharding : "test" }).ok);
printjson(admin.runCommand({ movePrimary : "test", to : shards[0]._id }));
assert(admin.runCommand({ shardcollection : "test.foo" , key : { x : 1 } }).ok);

mongols.getCollection("test.foo").insert({x:1});
assert.eq(1, st.config.chunks.count(), "there should only be 1 chunk")

var dbhash1 = configs[0].getDB("config").runCommand( "dbhash");
printjson("dbhash before split and move is " + dbhash1.collections.chunks);

// split the chunk and move one chunk to the non-primary shard
assert(admin.runCommand({ split : "test.foo", middle : { x : 0 } }).ok);
assert( admin.runCommand({ moveChunk : "test.foo",
                              find : { x : 0 },
                              to : shards[1]._id,
                              _waitForDelete : true }).ok );

st.printShardingStatus();
assert.eq(2, st.config.chunks.count(), "there should be 2 chunks")

var dbhash2 = configs[0].getDB("config").runCommand("dbhash");
printjson("dbhash after split and move is " + dbhash2.collections.chunks);

assert.neq(dbhash1.collections.chunks, dbhash2.collections.chunks, "The hash should be different after split and move." )

st.stop();
