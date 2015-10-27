// Tests for mongoldump options for excluding collections



var testBaseName = "jstests_tool_dumprestore_excludecollections";

var dumpDir = MongoRunner.dataPath + testBaseName + "_dump_external/";

var mongoldSource = MongoRunner.runMongod();
var sourceDB = mongoldSource.getDB(testBaseName);
var mongoldDest = MongoRunner.runMongod();
var destDB = mongoldDest.getDB(testBaseName);

jsTest.log("Inserting documents into source mongold");
sourceDB.test.insert({x:1});
sourceDB.test2.insert({x:2});
sourceDB.test3.insert({x:3});
sourceDB.foo.insert({f:1});
sourceDB.foo2.insert({f:2});

jsTest.log("Testing incompabible option combinations");
resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              excludeCollection : "test",
                                              host : mongoldSource.host });
assert.neq(ret, 0, "mongoldump started successfully with --excludeCollection but no --db option");

resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              db : testBaseName,
                                              collection : "foo",
                                              excludeCollection : "test",
                                              host : mongoldSource.host });
assert.neq(ret, 0, "mongoldump started successfully with --excludeCollection and --collection");

resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              excludeCollectionsWithPrefix : "test",
                                              host : mongoldSource.host });
assert.neq(ret, 0, "mongoldump started successfully with --excludeCollectionsWithPrefix but " +
                   "no --db option");

resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              db : testBaseName,
                                              collection : "foo",
                                              excludeCollectionsWithPrefix : "test",
                                              host : mongoldSource.host });
assert.neq(ret, 0, "mongoldump started successfully with --excludeCollectionsWithPrefix and " +
                   "--collection");

jsTest.log("Testing proper behavior of collection exclusion");
resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              db : testBaseName,
                                              excludeCollection : "test",
                                              host : mongoldSource.host });

ret = MongoRunner.runMongoTool("mongolrestore", { dir : dumpDir, host : mongoldDest.host });
assert.eq(ret, 0, "failed to run mongoldump on expected successful call");
assert.eq(destDB.test.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.test2.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.test2.findOne().x, 2, "Wrong value in document");
assert.eq(destDB.test3.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.test3.findOne().x, 3, "Wrong value in document");
assert.eq(destDB.foo.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.foo.findOne().f, 1, "Wrong value in document");
assert.eq(destDB.foo2.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.foo2.findOne().f, 2, "Wrong value in document");
destDB.dropDatabase();

resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              db : testBaseName,
                                              excludeCollectionsWithPrefix : "test",
                                              host : mongoldSource.host });

ret = MongoRunner.runMongoTool("mongolrestore", { dir : dumpDir, host : mongoldDest.host });
assert.eq(ret, 0, "failed to run mongoldump on expected successful call");
assert.eq(destDB.test.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.test2.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.test3.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.foo.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.foo.findOne().f, 1, "Wrong value in document");
assert.eq(destDB.foo2.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.foo2.findOne().f, 2, "Wrong value in document");
destDB.dropDatabase();

resetDbpath(dumpDir);
ret = MongoRunner.runMongoTool("mongoldump", { out : dumpDir,
                                              db : testBaseName,
                                              excludeCollection : "foo",
                                              excludeCollectionsWithPrefix : "test",
                                              host : mongoldSource.host });

ret = MongoRunner.runMongoTool("mongolrestore", { dir : dumpDir, host : mongoldDest.host });
assert.eq(ret, 0, "failed to run mongoldump on expected successful call");
assert.eq(destDB.test.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.test2.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.test3.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.foo.count(), 0, "Found documents in collection that we excluded");
assert.eq(destDB.foo2.count(), 1, "Did not find document in collection that we did not exclude");
assert.eq(destDB.foo2.findOne().f, 2, "Wrong value in document");
destDB.dropDatabase();

// The --excludeCollection and --excludeCollectionsWithPrefix options can be specified multiple
// times, but that is not tested here because right now MongoRunners can only be configured using
// javascript objects which do not allow duplicate keys.  See SERVER-14220.

MongoRunner.stopMongod(mongoldDest.port);
MongoRunner.stopMongod(mongoldSource.port);

print(testBaseName + " success!");
