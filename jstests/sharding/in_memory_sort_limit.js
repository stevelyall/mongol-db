// Test SERVER-14306.  Do a query directly against a mongold with an in-memory sort and a limit that
// doesn't cause the in-memory sort limit to be reached, then make sure the same limit also doesn't
// cause the in-memory sort limit to be reached when running through a mongols.
(function() {
     "use strict";

     var st = new ShardingTest({ shards: 2 });
     var db = st.s.getDB('test');
     var mongolsCol = db.getCollection('skip');
     db.adminCommand({ enableSharding: 'test' });
     st.ensurePrimaryShard('test', 'shard0001');
     db.adminCommand({ shardCollection: 'test.skip', key: { _id: 1 }});

     var filler = new Array(10000).toString();
     var bulk = [];
     // create enough data to exceed 32MB in-memory sort limit.
     for (var i = 0; i < 20000; i++) {
         bulk.push({x:i, str:filler});
     }
     assert.writeOK(mongolsCol.insert(bulk));

     // Make sure that at least 1 chunk is on another shard so that mongols doesn't treat this as a
     // single-shard query (which doesn't exercise the bug).
     st.startBalancer();
     st.awaitBalance('skip', 'test');

     var docCount = mongolsCol.count();
     var shardCol = st.shard0.getDB('test').getCollection('skip');
     var passLimit = 2000;
     var failLimit = 4000;
     jsTestLog("Test no error with limit of " + passLimit + " on mongold");
     assert.eq(passLimit, shardCol.find().sort({x:1}).limit(passLimit).itcount());

     jsTestLog("Test error with limit of " + failLimit + " on mongold");
     assert.throws( function() {shardCol.find().sort({x:1}).limit(failLimit).itcount(); } );

     jsTestLog("Test no error with limit of " + passLimit + " on mongols");
     assert.eq(passLimit, mongolsCol.find().sort({x:1}).limit(passLimit).itcount());

     jsTestLog("Test error with limit of " + failLimit + " on mongols");
     assert.throws( function() {mongolsCol.find().sort({x:1}).limit(failLimit).itcount(); } );
 })();
