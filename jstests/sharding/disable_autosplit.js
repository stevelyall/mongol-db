//
// Tests disabling of autosplit from mongols
//

var chunkSize = 1 //MB

var st = new ShardingTest({ shards : 1, 
                            mongols : 1, 
                            other : { 
                                
                                chunksize : chunkSize,
                                mongolsOptions : { noAutoSplit : "" }
                                
                            } })

var data = "x"
while( data.length < chunkSize * 1024 * 1024 ){
    data += data
}

var mongols = st.s0
var admin = mongols.getDB( "admin" )
var config = mongols.getDB( "config" )
var coll = mongols.getCollection( "foo.bar" )

printjson( admin.runCommand({ enableSharding : coll.getDB() + "" }) )
printjson( admin.runCommand({ shardCollection : coll + "", key : { _id : 1 } }) )

for( var i = 0; i < 20; i++ ){
    coll.insert({ data : data })
}

// Make sure we haven't split
assert.eq( 1, config.chunks.find({ ns : coll + "" }).count() )

st.printShardingStatus()

jsTestLog( "Done!" )

st.stop()
