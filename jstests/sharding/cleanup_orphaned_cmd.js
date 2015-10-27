//
// Tests cleanup of orphaned data via the orphaned data cleanup command
//

var st = new ShardingTest({ shards: 2 });
st.stopBalancer();

var mongols = st.s0;
var admin = mongols.getDB( "admin" );
var shards = mongols.getCollection( "config.shards" ).find().toArray();
var coll = mongols.getCollection( "foo.bar" );

assert( admin.runCommand({ enableSharding : coll.getDB() + "" }).ok );
printjson( admin.runCommand({ movePrimary : coll.getDB() + "", to : shards[0]._id }) );
assert( admin.runCommand({ shardCollection : coll + "", key : { _id : 1 } }).ok );
assert( admin.runCommand({ split : coll + "", middle : { _id : 0 } }).ok );
assert( admin.runCommand({ moveChunk : coll + "", 
                           find : { _id : 0 }, 
                           to : shards[1]._id,
                           _waitForDelete : true }).ok );

st.printShardingStatus();

jsTest.log( "Inserting some regular docs..." );

var bulk = coll.initializeUnorderedBulkOp();
for ( var i = -50; i < 50; i++ ) bulk.insert({ _id : i });
assert.writeOK( bulk.execute() );

// Half of the data is on each shard

jsTest.log( "Inserting some orphaned docs..." );

var shard0Coll = st.shard0.getCollection( coll + "" );
assert.writeOK( shard0Coll.insert({ _id : 10 }));

assert.neq( 50, shard0Coll.count() );
assert.eq( 100, coll.find().itcount() );

jsTest.log( "Cleaning up orphaned data..." );

var shard0Admin = st.shard0.getDB( "admin" );
var result = shard0Admin.runCommand({ cleanupOrphaned : coll + "" });
while ( result.ok && result.stoppedAtKey ) {
    printjson( result );
    result = shard0Admin.runCommand({ cleanupOrphaned : coll + "",
                                      startingFromKey : result.stoppedAtKey });
}

printjson( result );
assert( result.ok );
assert.eq( 50, shard0Coll.count() );
assert.eq( 100, coll.find().itcount() );

jsTest.log( "Moving half the data out again (making a hole)..." );

assert( admin.runCommand({ split : coll + "", middle : { _id : -35 } }).ok );
assert( admin.runCommand({ split : coll + "", middle : { _id : -10 } }).ok );
// Make sure we wait for the deletion here, otherwise later cleanup could fail
assert( admin.runCommand({ moveChunk : coll + "", 
                           find : { _id : -35 }, 
                           to : shards[1]._id,
                           _waitForDelete : true }).ok );

// 1/4 the data is on the first shard

jsTest.log( "Inserting some more orphaned docs..." );

st.printShardingStatus();

var shard0Coll = st.shard0.getCollection( coll + "" );
assert.writeOK(shard0Coll.insert({ _id : -35 }));
assert.writeOK(shard0Coll.insert({ _id : -11 }));
assert.writeOK(shard0Coll.insert({ _id : 0 }));
assert.writeOK(shard0Coll.insert({ _id : 10 }));

assert.neq( 25, shard0Coll.count() );
assert.eq( 100, coll.find().itcount() );

jsTest.log( "Cleaning up more orphaned data..." );

var shard0Admin = st.shard0.getDB( "admin" );
var result = shard0Admin.runCommand({ cleanupOrphaned : coll + "",
                                      secondaryThrottle: true,
                                      writeConcern: { w: 1 }});
while ( result.ok && result.stoppedAtKey ) {
    printjson( result );
    result = shard0Admin.runCommand({ cleanupOrphaned : coll + "",
                                      startingFromKey : result.stoppedAtKey });
}

printjson( result );
assert( result.ok );
assert.eq( 25, shard0Coll.count() );
assert.eq( 100, coll.find().itcount() );

jsTest.log( "DONE!" );

st.stop();
