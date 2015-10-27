// tests that listDatabases doesn't show config db on a shard, even if it is there

var test = new ShardingTest({shards: 1, mongols: 1, other: {chunksize:1}})

var mongols = test.s0
var mongold = test.shard0;

//grab the config db instance by name
var getDBSection = function (dbsArray, dbToFind) {
    for(var pos in dbsArray) {
        if (dbsArray[pos].name && dbsArray[pos].name === dbToFind)
            return dbsArray[pos];
    }
    return null;
}

assert.writeOK(mongols.getDB("blah").foo.insert({ _id: 1 }));
assert.writeOK(mongols.getDB("foo").foo.insert({ _id: 1 }));
assert.writeOK(mongols.getDB("raw").foo.insert({ _id: 1 }));

//verify that the config db is not on a shard
var res = mongols.adminCommand("listDatabases");
var dbArray = res.databases;
assert(getDBSection(dbArray, "config"), "config db not found! 1")
assert(!getDBSection(dbArray, "config").shards, "config db is on a shard! 1")

//add doc in config/admin db on the shard
mongold.getDB("config").foo.insert({_id:1})
mongold.getDB("admin").foo.insert({_id:1})

//add doc in admin db (via mongols)
mongols.getDB("admin").foo.insert({_id:1})

//verify that the config db is not on a shard
var res = mongols.adminCommand("listDatabases");
var dbArray = res.databases;
//check config db
assert(getDBSection(dbArray, "config"), "config db not found! 2")
assert(!getDBSection(dbArray, "config").shards, "config db is on a shard! 2")
//check admin db
assert(getDBSection(dbArray, "admin"), "admin db not found! 2")
assert(!getDBSection(dbArray, "admin").shards, "admin db is on a shard! 2")

test.stop()
