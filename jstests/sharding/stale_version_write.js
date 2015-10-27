// Tests whether a reset sharding version triggers errors

jsTest.log( "Starting sharded cluster..." )

var st = new ShardingTest( { shards : 1, mongols : 2, verbose : 2 } )

st.stopBalancer()

var mongolsA = st.s0
var mongolsB = st.s1

jsTest.log( "Adding new collections...")

var collA = mongolsA.getCollection( jsTestName() + ".coll" )
assert.writeOK(collA.insert({ hello : "world" }));

var collB = mongolsB.getCollection( "" + collA )
assert.writeOK(collB.insert({ hello : "world" }));

jsTest.log( "Enabling sharding..." )

printjson( mongolsA.getDB( "admin" ).runCommand({ enableSharding : "" + collA.getDB() }) )
printjson( mongolsA.getDB( "admin" ).runCommand({ shardCollection : "" + collA, key : { _id : 1 } }) )

// MongoD doesn't know about the config shard version *until* MongoS tells it
collA.findOne()

jsTest.log( "Trigger shard version mismatch..." );

assert.writeOK(collB.insert({ goodbye : "world" }));

print( "Inserted..." )

assert.eq( 3, collA.find().itcount() )
assert.eq( 3, collB.find().itcount() )

st.stop()
