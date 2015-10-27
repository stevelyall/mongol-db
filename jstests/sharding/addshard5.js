// Tests that dropping and re-adding a shard with the same name to a cluster doesn't mess up
// migrations

(function() {

'use strict';

var st = new ShardingTest({ shards: 3, mongols: 1 });

var mongols = st.s;
var admin = mongols.getDB('admin');
var config = mongols.getDB('config');
var coll = mongols.getCollection('foo.bar');

// Get all the shard info and connections
var shards = [];
config.shards.find().sort({ _id: 1 }).forEach(function(doc) {
    shards.push(Object.merge(doc, { conn: new Mongo(doc.host) }));
});

// Remove the last shard so we can use it later
assert.commandWorked(mongols.adminCommand({ removeShard: shards[2]._id }));
assert.commandWorked(mongols.adminCommand({ removeShard: shards[2]._id }));

// Shard collection
assert.commandWorked(mongols.adminCommand({ enableSharding: coll.getDB() + ''}));

// Just to be sure what primary we start from
printjson(mongols.adminCommand({ movePrimary: coll.getDB() + '', to: shards[0]._id }));
assert.commandWorked(mongols.adminCommand({ shardCollection: coll + '', key: { _id: 1 } }));

// Insert one document
assert.writeOK(coll.insert({ hello: 'world'}));

// Migrate the collection to and from shard2 so shard1 loads the shard2 host
assert.commandWorked(mongols.adminCommand(
    { moveChunk: coll + '', find: { _id: 0 }, to: shards[1]._id, _waitForDelete: true }));
assert.commandWorked(mongols.adminCommand(
    { moveChunk: coll + '', find: { _id: 0 }, to: shards[0]._id, _waitForDelete: true }));

// Drop and re-add shard with last shard's host
assert.commandWorked(mongols.adminCommand({ removeShard: shards[1]._id }));
assert.commandWorked(mongols.adminCommand({ removeShard: shards[1]._id }));

assert.commandWorked(mongols.adminCommand({ addShard: shards[2].host, name: shards[1]._id }));

jsTest.log('Shard was dropped and re-added with same name...');
st.printShardingStatus();

shards[0].conn.getDB('admin').runCommand({ setParameter: 1, traceExceptions: true });
shards[2].conn.getDB('admin').runCommand({ setParameter: 1, traceExceptions: true });

// Try a migration
assert.commandWorked(mongols.adminCommand({ moveChunk: coll + '', find: { _id: 0 }, to: shards[1]._id }));

assert.neq(null, shards[2].conn.getCollection(coll + '').findOne());

st.stop();

})();
