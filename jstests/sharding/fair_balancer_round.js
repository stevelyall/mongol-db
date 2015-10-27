//
// Tests that a balancer round loads newly sharded collection data
//

var options = {mongolsOptions : {verbose : 1}};

var st = new ShardingTest({shards : 2, mongols : 2, other : options});

// Stop balancer initially
st.stopBalancer();

var mongols = st.s0;
var staleMongos = st.s1;
var coll = mongols.getCollection("foo.bar");

// Shard collection through first mongols
assert(mongols.adminCommand({enableSharding : coll.getDB() + ""}).ok);
st.ensurePrimaryShard(coll.getDB().getName(), 'shard0001');
assert(mongols.adminCommand({shardCollection : coll + "", key : {_id : 1}}).ok);

// Create a bunch of chunks
var numSplits = 20;
for ( var i = 0; i < numSplits; i++) {
    assert(mongols.adminCommand({split : coll + "", middle : {_id : i}}).ok);
}

// Stop the first mongols who setup the cluster.
st.stopMongos(0);

// Start balancer, which lets the stale mongols balance
assert.writeOK(staleMongos.getDB("config").settings.update({_id: "balancer"},
                                                           {$set: {stopped: false}},
                                                           true));

// Make sure we eventually start moving chunks
assert.soon(function() {
    return staleMongos.getCollection("config.changelog").count({what : /moveChunk/}) > 0;
}, "no balance happened", 5 * 60 * 1000);

jsTest.log("DONE!");

st.stop();
