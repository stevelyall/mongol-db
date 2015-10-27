// Tests "stacking" multiple migration cleanup threads and their behavior when the collection changes

// start up a new sharded cluster
var st = new ShardingTest({ shards : 2, mongols : 1 });

// stop balancer since we want manual control for this
st.stopBalancer();

var mongols = st.s;
var admin = mongols.getDB("admin");
var shards = mongols.getDB("config").shards.find().toArray();
var coll = mongols.getCollection("foo.bar");

// Enable sharding of the collection
printjson(mongols.adminCommand({ enablesharding : coll.getDB() + "" }));
printjson(mongols.adminCommand({ movePrimary : coll.getDB() + "", to : shards[0]._id }));
printjson(mongols.adminCommand({ shardcollection : coll + "", key: { _id : 1 } }));

var numChunks = 30;

// Create a bunch of chunks
for (var i = 0; i < numChunks; i++) {
    printjson(mongols.adminCommand({ split : coll + "", middle : { _id : i } }))
}

jsTest.log("Inserting a lot of small documents...")

// Insert a lot of small documents to make multiple cursor batches
var bulk = coll.initializeUnorderedBulkOp();
for (var i = 0; i < 10 * 1000; i++) {
    bulk.insert({ _id : i });
}
assert.writeOK(bulk.execute());

jsTest.log("Opening a mongold cursor...");

// Open a new cursor on the mongold
var cursor = coll.find();
var next = cursor.next();

jsTest.log("Moving a bunch of chunks to stack cleanup...")

// Move a bunch of chunks, but don't close the cursor so they stack.
for (var i = 0; i < numChunks; i++) {
    printjson(mongols.adminCommand({ moveChunk : coll + "", find : { _id : i }, to : shards[1]._id }))
}

jsTest.log("Dropping and re-creating collection...")

coll.drop()
bulk = coll.initializeUnorderedBulkOp();
for (var i = 0; i < numChunks; i++) {
    bulk.insert({ _id : i });
}
assert.writeOK(bulk.execute());

sleep(10 * 1000);

jsTest.log("Checking that documents were not cleaned up...")

for (var i = 0; i < numChunks; i++) {
    assert.neq(null, coll.findOne({ _id : i }))   
}

jsTest.log("DONE!")

st.stop();


