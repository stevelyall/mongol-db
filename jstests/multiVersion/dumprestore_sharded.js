// dumprestore_sharded.js

load( './jstests/multiVersion/libs/dumprestore_helpers.js' )


// The base name to use for various things in the test, including the dbpath and the database name
var testBaseName = "jstests_tool_dumprestore_sharded";

// Paths to external directories to be used to store dump files
var dumpDir = MongoRunner.dataPath + testBaseName + "_dump_external/";
var testDbpath = MongoRunner.dataPath + testBaseName + "_dbpath_external/";



// Test dumping from a sharded cluster across versions
var shardedDumpTests = {
    'serverSourceVersion' : [ "latest", "last-stable" ],
    'serverDestVersion' :[ "latest", "last-stable" ],
    'mongolDumpVersion' :[ "latest", "last-stable" ],
    'mongolRestoreVersion' :[ "latest", "last-stable" ],
    'dumpDir' : [ dumpDir ],
    'testDbpath' : [ testDbpath ],
    'dumpType' : [ "mongols" ],
    'restoreType' : [ "mongold" ]
};
runAllDumpRestoreTests(shardedDumpTests);



// Test restoring to a sharded cluster across versions
var shardedRestoreTests = {
    'serverSourceVersion' : [ "latest", "last-stable" ],
    'serverDestVersion' :[ "latest", "last-stable" ],
    'mongolDumpVersion' :[ "latest", "last-stable" ],
    'mongolRestoreVersion' :[ "latest", "last-stable" ],
    'dumpDir' : [ dumpDir ],
    'testDbpath' : [ testDbpath ],
    'dumpType' : [ "mongold" ],
    'restoreType' : [ "mongols" ]
};
runAllDumpRestoreTests(shardedRestoreTests);

