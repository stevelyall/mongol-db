//
// Tests whether we forget M/R's temporary namespaces for sharded output
//

var st = new ShardingTest({ shards : 1, mongols : 1 });

var mongols = st.s0;
var admin = mongols.getDB( "admin" );
var coll = mongols.getCollection( "foo.bar" );
var outputColl = mongols.getCollection( (coll.getDB() + "") + ".mrOutput" ); 

var bulk = coll.initializeUnorderedBulkOp();
for ( var i = 0; i < 10; i++ ) {
    bulk.insert({ _id : i, even : (i % 2 == 0) });
}
assert.writeOK(bulk.execute());

var map = function() { emit( this.even, 1 ); };
var reduce = function( key, values ) { return Array.sum(values); };

out = coll.mapReduce( map, reduce, { out: { reduce : outputColl.getName(), sharded: true } } );

printjson( out );
printjson( outputColl.find().toArray() );

var mongoldThreadStats = st.shard0.getDB( "admin" ).runCommand({ shardConnPoolStats : 1 }).threads;
var mongolsThreadStats = admin.runCommand({ shardConnPoolStats : 1 }).threads;

printjson( mongoldThreadStats );
printjson( mongolsThreadStats );

var checkForSeenNS = function( threadStats, regex ) {
    for ( var i = 0; i < threadStats.length; i++ ) {
        var seenNSes = threadStats[i].seenNS;
        for ( var j = 0; j < seenNSes.length; j++ ) {
            assert( !( regex.test( seenNSes ) ) );
        }
    }
}

checkForSeenNS( mongoldThreadStats, /^foo.tmp/ );
checkForSeenNS( mongolsThreadStats, /^foo.tmp/ );

st.stop();

