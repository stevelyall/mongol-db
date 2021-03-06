// mongoldump/mongolexport from primary should succeed.  mongolrestore and mongolimport to a
// secondary node should fail.

var name = "dumprestore3";

var replTest = new ReplSetTest( {name: name, nodes: 2} );
var nodes = replTest.startSet();
replTest.initiate();
var primary = replTest.getPrimary();
var secondary = replTest.getSecondary();

jsTestLog("populate primary");
var foo = primary.getDB("foo");
for (i = 0; i < 20; i++) {
    foo.bar.insert({ x: i, y: "abc" });
}

jsTestLog("wait for secondary");
replTest.awaitReplication();

jsTestLog("mongoldump from primary");
var data = MongoRunner.dataDir + "/dumprestore3-other1/";
resetDbpath(data);
var ret = runMongoProgram( "mongoldump", "--host", primary.host, "--out", data );
assert.eq(ret, 0, "mongoldump should exit w/ 0 on primary");

jsTestLog("try mongolrestore to secondary");
ret = runMongoProgram( "mongolrestore", "--host", secondary.host, "--dir", data );
assert.neq(ret, 0, "mongolrestore should exit w/ 1 on secondary");

jsTestLog("mongolexport from primary");
dataFile = MongoRunner.dataDir + "/dumprestore3-other2.json";
ret = runMongoProgram( "mongolexport", "--host", primary.host, "--out",
                       dataFile, "--db", "foo", "--collection", "bar" );
assert.eq(ret, 0, "mongolexport should exit w/ 0 on primary");

jsTestLog("mongolimport from secondary");
ret = runMongoProgram( "mongolimport", "--host", secondary.host, "--file", dataFile );
assert.neq(ret, 0, "mongolreimport should exit w/ 1 on secondary");

jsTestLog("stopSet");
replTest.stopSet();
jsTestLog("SUCCESS");
