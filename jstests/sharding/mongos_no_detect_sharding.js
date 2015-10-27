// Tests whether new sharding is detected on insert by mongols

var st = new ShardingTest( name = "test", shards = 1, verbose = 2, mongols = 2 );

var mongols = st.s
var config = mongols.getDB("config")

config.settings.update({ _id : "balancer" }, { $set : { stopped : true } }, true )


print( "Creating unsharded connection..." )


var mongols2 = st._mongols[1]

var coll = mongols2.getCollection( "test.foo" )
coll.insert({ i : 0 })

print( "Sharding collection..." )

var admin = mongols.getDB("admin")

assert.eq( coll.getShardVersion().ok, 0 )

admin.runCommand({ enableSharding : "test" })
admin.runCommand({ shardCollection : "test.foo", key : { _id : 1 } })

print( "Seeing if data gets inserted unsharded..." )
print( "No splits occur here!" )

// Insert a bunch of data which should trigger a split
var bulk = coll.initializeUnorderedBulkOp();
for( var i = 0; i < 100; i++ ){
    bulk.insert({ i : i + 1 });
}
assert.writeOK(bulk.execute());

config.printShardingStatus( true )

assert.eq( coll.getShardVersion().ok, 1 )
assert.eq( 101, coll.find().itcount() )

st.stop()
