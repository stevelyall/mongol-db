//
// Tests mongols's failure tolerance for replica set shards and read preference queries
//
// Sets up a cluster with three shards, the first shard of which has an unsharded collection and
// half a sharded collection.  The second shard has the second half of the sharded collection, and
// the third shard has nothing.  Progressively shuts down the primary of each shard to see the
// impact on the cluster.
//
// Three different connection states are tested - active (connection is active through whole
// sequence), idle (connection is connected but not used before a shard change), and new
// (connection connected after shard change).
//

var options = {rs : true, rsOptions : { nodes : 2 }};

var st = new ShardingTest({shards : 3, mongols : 1, other : options});
st.stopBalancer();

var mongols = st.s0;
var admin = mongols.getDB( "admin" );
var shards = mongols.getDB( "config" ).shards.find().toArray();

assert.commandWorked( admin.runCommand({ setParameter : 1, traceExceptions : true }) );

var collSharded = mongols.getCollection( "fooSharded.barSharded" );
var collUnsharded = mongols.getCollection( "fooUnsharded.barUnsharded" );

// Create the unsharded database
assert.writeOK(collUnsharded.insert({ some : "doc" }));
assert.writeOK(collUnsharded.remove({}));
printjson( admin.runCommand({ movePrimary : collUnsharded.getDB().toString(),
                              to : shards[0]._id }) );

// Create the sharded database
assert.commandWorked( admin.runCommand({ enableSharding : collSharded.getDB().toString() }) );
printjson( admin.runCommand({ movePrimary : collSharded.getDB().toString(), to : shards[0]._id }) );
assert.commandWorked( admin.runCommand({ shardCollection : collSharded.toString(),
                                         key : { _id : 1 } }) );
assert.commandWorked( admin.runCommand({ split : collSharded.toString(), middle : { _id : 0 } }) );
assert.commandWorked( admin.runCommand({ moveChunk : collSharded.toString(),
                                         find : { _id : 0 },
                                         to : shards[1]._id }) );

st.printShardingStatus();

//
// Setup is complete
//

jsTest.log("Inserting initial data...");

var mongolsConnActive = new Mongo( mongols.host );
var mongolsConnIdle = null;
var mongolsConnNew = null;

var wc = {writeConcern: {w: 2, wtimeout: 60000}};

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -1 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 1 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 1 }, wc));

jsTest.log("Stopping primary of third shard...");

mongolsConnIdle = new Mongo( mongols.host );

st.rs2.stop(st.rs2.getPrimary());

jsTest.log("Testing active connection with third primary down...");

assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -2 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 2 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 2 }, wc));

jsTest.log("Testing idle connection with third primary down...");

assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -3 }, wc));
assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 3 }, wc));
assert.writeOK(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 3 }, wc));

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with third primary down...");

mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = new Mongo( mongols.host );
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -4 }, wc));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 4 }, wc));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 4 }, wc));

gc(); // Clean up new connections

jsTest.log("Stopping primary of second shard...");

mongolsConnIdle = new Mongo( mongols.host );

// Need to save this node for later
var rs1Secondary = st.rs1.getSecondary();

st.rs1.stop(st.rs1.getPrimary());

jsTest.log("Testing active connection with second primary down...");

// Reads with read prefs
mongolsConnActive.setSlaveOk();
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));
mongolsConnActive.setSlaveOk(false);

mongolsConnActive.setReadPref("primary");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.throws(function() {
    mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

//Ensure read prefs override slaveOK
mongolsConnActive.setSlaveOk();
mongolsConnActive.setReadPref("primary");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.throws(function() {
    mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));
mongolsConnActive.setSlaveOk(false);

mongolsConnActive.setReadPref("secondary");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnActive.setReadPref("primaryPreferred");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnActive.setReadPref("secondaryPreferred");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnActive.setReadPref("nearest");
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

// Writes
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -5 }, wc));
assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 5 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 5 }, wc));

jsTest.log("Testing idle connection with second primary down...");

// Writes
assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -6 }, wc));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 6 }, wc));
assert.writeOK(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 6 }, wc));

// Reads with read prefs
mongolsConnIdle.setSlaveOk();
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );
mongolsConnIdle.setSlaveOk(false);

mongolsConnIdle.setReadPref("primary");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.throws(function() {
    mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

// Ensure read prefs override slaveOK
mongolsConnIdle.setSlaveOk();
mongolsConnIdle.setReadPref("primary");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.throws(function() {
    mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));
mongolsConnIdle.setSlaveOk(false);

mongolsConnIdle.setReadPref("secondary");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnIdle.setReadPref("primaryPreferred");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnIdle.setReadPref("secondaryPreferred");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

mongolsConnIdle.setReadPref("nearest");
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

jsTest.log("Testing new connections with second primary down...");

// Reads with read prefs
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primary");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primary");
assert.throws(function() {
    mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primary");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

// Ensure read prefs override slaveok
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
mongolsConnNew.setReadPref("primary");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
mongolsConnNew.setReadPref("primary");
assert.throws(function() {
    mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 });
});
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
mongolsConnNew.setReadPref("primary");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondary");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondary");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondary");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("primaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("secondaryPreferred");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("nearest");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("nearest");
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setReadPref("nearest");
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

gc(); // Clean up new connections incrementally to compensate for slow win32 machine.

// Writes
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -7 }, wc));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 7 }, wc));
mongolsConnNew = new Mongo( mongols.host );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 7 }, wc));

gc(); // Clean up new connections

jsTest.log("Stopping primary of first shard...");

mongolsConnIdle = new Mongo( mongols.host );

st.rs0.stop(st.rs0.getPrimary());

jsTest.log("Testing active connection with first primary down...");

mongolsConnActive.setSlaveOk();
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -8 }));
assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 8 }));
assert.writeError(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 8 }));

jsTest.log("Testing idle connection with first primary down...");

assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -9 }));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 9 }));
assert.writeError(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 9 }));

mongolsConnIdle.setSlaveOk();
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with first primary down...");

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -10 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 10 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 10 }));

gc(); // Clean up new connections

jsTest.log("Stopping second shard...");

mongolsConnIdle = new Mongo( mongols.host );

st.rs1.stop(rs1Secondary);

jsTest.log("Testing active connection with second shard down...");

mongolsConnActive.setSlaveOk();
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -11 }));
assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 11 }));
assert.writeError(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 11 }));

jsTest.log("Testing idle connection with second shard down...");

assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -12 }));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 12 }));
assert.writeError(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 12 }));

mongolsConnIdle.setSlaveOk();
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with second shard down...");

mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = new Mongo( mongols.host );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -13 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 13 }));
mongolsConnNew = new Mongo( mongols.host );
assert.writeError(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 13 }));

gc(); // Clean up new connections

jsTest.log("DONE!");
st.stop();

