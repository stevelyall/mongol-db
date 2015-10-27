// Tests whether new sharding is detected on insert by mongols
(function() {

var st = new ShardingTest({ name: "test",
                            shards: 10,
                            mongols: 3 });

var mongolsA = st.s0
var mongolsB = st.s1
var mongolsC = st.s2

var admin = mongolsA.getDB("admin")
var config = mongolsA.getDB("config")

var collA = mongolsA.getCollection( "foo.bar" )
var collB = mongolsB.getCollection( "" + collA )
var collC = mongolsB.getCollection( "" + collA )

admin.runCommand({ enableSharding : "" + collA.getDB() });
st.ensurePrimaryShard(collA.getDB().getName(), 'shard0001');
admin.runCommand({ shardCollection : "" + collA, key : { _id : 1 } })

var shards = config.shards.find().sort({ _id : 1 }).toArray()

jsTestLog( "Splitting up the collection..." )

// Split up the collection
for( var i = 0; i < shards.length; i++ ){
    printjson( admin.runCommand({ split : "" + collA, middle : { _id : i } }) )
    printjson( admin.runCommand({ moveChunk : "" + collA, find : { _id : i }, to : shards[i]._id }) )
}

mongolsB.getDB("admin").runCommand({ flushRouterConfig : 1 })
mongolsC.getDB("admin").runCommand({ flushRouterConfig : 1 })
printjson( collB.count() )
printjson( collC.count() )

// Change up all the versions...
for( var i = 0; i < shards.length; i++ ){
    printjson( admin.runCommand({ moveChunk : "" + collA, find : { _id : i }, to : shards[ (i + 1) % shards.length ]._id }) )
}

// Make sure mongols A is up-to-date
mongolsA.getDB("admin").runCommand({ flushRouterConfig : 1 })

config.printShardingStatus( true )

jsTestLog( "Running count!" )

printjson( collB.count() )
printjson( collC.find().toArray() )

st.stop();

})();
