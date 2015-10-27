//
// Tests mongols-only query behavior
//

var st = new ShardingTest({shards : 1,
                           mongols : 1,
                           verbose : 0});

var mongols = st.s0;
var coll = mongols.getCollection("foo.bar");

//
//
// Ensure we can't use exhaust option through mongols
coll.remove({});
assert.writeOK(coll.insert({a : 'b'}));
var query = coll.find({});
assert.neq(null, query.next());
query = coll.find({}).addOption(DBQuery.Option.exhaust);
assert.throws(function(){ query.next(); });

//
//
// Ensure we can't trick mongols by inserting exhaust option on a command through mongols
coll.remove({});
assert.writeOK(coll.insert({a : 'b'}));
var cmdColl = mongols.getCollection(coll.getDB().toString() + ".$cmd");
var cmdQuery = cmdColl.find({ ping : 1 }).limit(1);
assert.commandWorked(cmdQuery.next());
cmdQuery = cmdColl.find({ ping : 1 }).limit(1).addOption(DBQuery.Option.exhaust);
assert.throws(function(){ cmdQuery.next(); });

jsTest.log("DONE!");

st.stop();
