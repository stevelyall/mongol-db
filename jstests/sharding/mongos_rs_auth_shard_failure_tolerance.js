//
// Tests mongols's failure tolerance for authenticated replica set shards and slaveOk queries
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

var options = { rs : true,
                rsOptions : { nodes : 2 },
                keyFile : "jstests/libs/key1" };

var st = new ShardingTest({shards : 3, mongols : 1, other : options});

var mongols = st.s0;
var admin = mongols.getDB( "admin" );

jsTest.log("Setting up initial admin user...");
var adminUser = "adminUser";
var password = "password";

// Create a user
admin.createUser({ user : adminUser, pwd : password, roles: [ "root" ] });
// There's an admin user now, so we need to login to do anything
// Login as admin user
admin.auth(adminUser, password);

st.stopBalancer();
var shards = mongols.getDB( "config" ).shards.find().toArray();

assert.commandWorked( admin.runCommand({ setParameter : 1, traceExceptions : true }) );

var collSharded = mongols.getCollection( "fooSharded.barSharded" );
var collUnsharded = mongols.getCollection( "fooUnsharded.barUnsharded" );

// Create the unsharded database with shard0 primary
assert.writeOK(collUnsharded.insert({ some : "doc" }));
assert.writeOK(collUnsharded.remove({}));
printjson( admin.runCommand({ movePrimary : collUnsharded.getDB().toString(),
                              to : shards[0]._id }) );

// Create the sharded database with shard1 primary
assert.commandWorked( admin.runCommand({ enableSharding : collSharded.getDB().toString() }) );
printjson( admin.runCommand({ movePrimary : collSharded.getDB().toString(), to : shards[1]._id }) );
assert.commandWorked( admin.runCommand({ shardCollection : collSharded.toString(),
                                         key : { _id : 1 } }) );
assert.commandWorked( admin.runCommand({ split : collSharded.toString(), middle : { _id : 0 } }) );
assert.commandWorked( admin.runCommand({ moveChunk : collSharded.toString(),
                                         find : { _id : -1 },
                                         to : shards[0]._id }) );

st.printShardingStatus();
var shardedDBUser = "shardedDBUser";
var unshardedDBUser = "unshardedDBUser";

jsTest.log("Setting up database users...");

// Create db users
collSharded.getDB().createUser({ user : shardedDBUser,
                                 pwd : password, roles : [ "readWrite" ] });
collUnsharded.getDB().createUser({ user : unshardedDBUser,
                                   pwd : password, roles : [ "readWrite" ] });

admin.logout();

function authDBUsers( conn ) {
    conn.getDB( collSharded.getDB().toString() ).auth(shardedDBUser, password);
    conn.getDB( collUnsharded.getDB().toString() ).auth(unshardedDBUser, password);
    return conn;
}

//
// Setup is complete
//

jsTest.log("Inserting initial data...");

var mongolsConnActive = authDBUsers( new Mongo( mongols.host ) );
authDBUsers(mongolsConnActive);
var mongolsConnIdle = null;
var mongolsConnNew = null;

var wc = {writeConcern: {w: 2, wtimeout: 60000}};

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -1 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 1 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 1 }, wc));

jsTest.log("Stopping primary of third shard...");

mongolsConnIdle = authDBUsers( new Mongo( mongols.host ) );

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

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -4 }, wc));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 4 }, wc));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 4 }, wc));

gc(); // Clean up new connections

jsTest.log("Stopping primary of second shard...");

mongolsConnActive.setSlaveOk();
mongolsConnIdle = authDBUsers( new Mongo( mongols.host ) );
mongolsConnIdle.setSlaveOk();

// Need to save this node for later
var rs1Secondary = st.rs1.getSecondary();

st.rs1.stop(st.rs1.getPrimary());

jsTest.log("Testing active connection with second primary down...");

assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : 1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeOK(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -5 }, wc));
assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 5 }, wc));
assert.writeOK(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 5 }, wc));

jsTest.log("Testing idle connection with second primary down...");

assert.writeOK(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -6 }, wc));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 6 }, wc));
assert.writeOK(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 6 }, wc));

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with second primary down...");

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeOK(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -7 }, wc));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 7 }, wc));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeOK(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 7 }, wc));

gc(); // Clean up new connections

jsTest.log("Stopping primary of first shard...");

mongolsConnActive.setSlaveOk();
mongolsConnIdle = authDBUsers( new Mongo( mongols.host ) );
mongolsConnIdle.setSlaveOk();

st.rs0.stop(st.rs0.getPrimary());

jsTest.log("Testing active connection with first primary down...");

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

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with first primary down...");

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : 1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -10 }));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 10 }));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 10 }));

gc(); // Clean up new connections

jsTest.log("Stopping second shard...");

mongolsConnActive.setSlaveOk();
mongolsConnIdle = authDBUsers( new Mongo( mongols.host ) );
mongolsConnIdle.setSlaveOk();

st.rs1.stop(rs1Secondary);

jsTest.log("Testing active connection with second shard down...");

assert.neq(null, mongolsConnActive.getCollection( collSharded.toString() ).findOne({ _id : -1 }));
assert.neq(null, mongolsConnActive.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }));

assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : -11 }));
assert.writeError(mongolsConnActive.getCollection( collSharded.toString() ).insert({ _id : 11 }));
assert.writeError(mongolsConnActive.getCollection( collUnsharded.toString() ).insert({ _id : 11 }));

jsTest.log("Testing idle connection with second shard down...");

assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : -12 }));
assert.writeError(mongolsConnIdle.getCollection( collSharded.toString() ).insert({ _id : 12 }));
assert.writeError(mongolsConnIdle.getCollection( collUnsharded.toString() ).insert({ _id : 12 }));

assert.neq(null, mongolsConnIdle.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
assert.neq(null, mongolsConnIdle.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

jsTest.log("Testing new connections with second shard down...");

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collSharded.toString() ).findOne({ _id : -1 }) );
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
mongolsConnNew.setSlaveOk();
assert.neq(null, mongolsConnNew.getCollection( collUnsharded.toString() ).findOne({ _id : 1 }) );

mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : -13 }));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collSharded.toString() ).insert({ _id : 13 }));
mongolsConnNew = authDBUsers( new Mongo( mongols.host ) );
assert.writeError(mongolsConnNew.getCollection( collUnsharded.toString() ).insert({ _id : 13 }));

gc(); // Clean up new connections

jsTest.log("DONE!");
st.stop();





