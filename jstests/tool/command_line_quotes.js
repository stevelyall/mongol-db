jsTest.log("Testing spaces in mongoldump command-line options...");

var mongold = MongoRunner.runMongod();
var coll = mongold.getDB("spaces").coll;
coll.drop();
coll.insert({a: 1});
coll.insert({a: 2});

var query = "{\"a\": {\"$gt\": 1} }";
assert(!MongoRunner.runMongoTool(
  "mongoldump",
  {
    "host": "127.0.0.1:" + mongold.port,
    "db": "spaces",
    "collection": "coll",
    "query": query
  }
));

MongoRunner.stopMongod(mongold);

jsTest.log("Test completed successfully");
