//
// Tests mongols's failure tolerance for single-node shards
//
// Sets up a cluster with three shards, the first shard of which has an unsharded collection and
// half a sharded collection.  The second shard has the second half of the sharded collection, and
// the third shard has nothing.  Progressively shuts down each shard to see the impact on the
// cluster.
//
// Three different connection states are tested - active (connection is active through whole
// sequence), idle (connection is connected but not used before a shard change), and new
// (connection connected after shard change).
//

var st = new ShardingTest({shards : 3, mongols : 1});
st.stopBalancer();

var mongols = st.s0;
var admin = mongols.getDB( "admin" );
var shards = mongols.getDB( "config" ).shards.find().toArray();

assert.commandWorked( admin.runCommand({ setParameter : 1, traceExceptions : true }) );

var collSharded = mongols.getCollection( "fooSharded.barSharded" );
var collUnsharded = mongols.getCollection( "fooUnsharded.barUnsharded" );

assert.commandWorked( admin.runCommand({ enableSharding : collSharded.getDB().toString() }) );
printjson( admin.runCommand({ movePrimary : collSharded.getDB().toString(), to : shards[0]._id }) );
assert.commandWorked( admin.runCommand({ shardCollection : collSharded.toString(),
                                         key : { _id : 1 } }) );
assert.commandWorked( admin.runCommand({ split : collSharded.toString(), middle : { _id : 0 } }) );
assert.commandWorked( admin.runCommand({ moveChunk : collSharded.toString(),
                                         find : { _id : 0 },
                                         to : shards[1]._id }) );

// Create the unsharded database
assert.writeOK(collUnsharded.insert({ some : "doc" }));
assert.writeOK(collUnsharded.remove({}));
printjson( admin.runCommand({ movePrimary : collUnsharded.getDB().toString(), to : shards[0]._id }) );

st.printShardingStatus();

//
// Setup is complete
//

jsTest.log("Inserting initial data...");

var mongolsConnActive = new Mongo( mongols.host );
var mongolsConnIdle = null;
var mongolsConnNew = null;

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -1 }));
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 1 }));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 1 }));

jsTest.log("Stopping third shard...");

mongolsConnIdle = new Mongo( mongols.host );

MongoRunner.stopMongod( st.shard2 );

jsTest.log("Testing active connection...");

assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -2 }));
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 2 }));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 2 }));

jsTest.log("Testing idle connection...");

assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -3 }));
assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 3 }));
assert.writeOK(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 3 }));

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections...");

mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -4 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 4 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 4 }));

gc(); // Clean up new connections

jsTest.log("Stopping second shard...");

mongolsConnIdle = new Mongo( mongols.host );

MongoRunner.stopMongod( st.shard1 );

jsTest.log("Testing active connection...");

assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -5 }));

assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 5 }));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 5 }));

jsTest.log("Testing idle connection...");

assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -6 }));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 6 }));
assert.writeOK(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 6 }));

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections...");

mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -7 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 7 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 7 }));

gc(); // Clean up new connections

jsTest.log("DONE!");
st.stop();

