// Check that the output from printShardingStatus() (aka sh.status())
// contains important information that it should, like the major section
// headings and the names of sharded collections and their shard keys.


(function () {


var st = new ShardingTest({ shards: 1, mongols: 2, config: 1, other: { smallfiles: true } });

var mongols = st.s0;
var admin = mongols.getDB( "admin" );


function grabStatusOutput(configdb, verbose) {
    var res = print.captureAllOutput( function () {
            return printShardingStatus(configdb, verbose);
        } );
    var output = res.output.join("\n");
    jsTestLog(output);
    return output;
}

function assertPresentInOutput(output, content, what) {
    assert(output.includes(content), what + " \"" + content + "\" NOT present in output of "
                                     + "printShardingStatus() (but it should be)");
}

function assertNotPresentInOutput(output, content, what) {
    assert( ! output.includes(content), what + " \"" + content + "\" IS present in output of "
                                        + "printShardingStatus() (but it should not be)");
}



////////////////////////
// Basic tests
////////////////////////

var dbName = "thisIsTheDatabase";
var collName = "thisIsTheCollection";
var shardKeyName = "thisIsTheShardKey";
var nsName = dbName + "." + collName;

assert.commandWorked( admin.runCommand({ enableSharding: dbName }) );
var key = {};
key[shardKeyName] = 1;
assert.commandWorked( admin.runCommand({ shardCollection: nsName, key: key }) );


function testBasic(output) {
    assertPresentInOutput(output, "shards:", "section header");
    assertPresentInOutput(output, "databases:", "section header");
    assertPresentInOutput(output, "balancer:", "section header");
    assertPresentInOutput(output, "active mongolses:", "section header");
    assertNotPresentInOutput(output, "most recently active mongolses:", "section header");

    assertPresentInOutput(output, dbName, "database");
    assertPresentInOutput(output, collName, "collection");
    assertPresentInOutput(output, shardKeyName, "shard key");
}

function testBasicNormalOnly(output) {
    assertPresentInOutput(output, tojson(version) + " : 2\n", "active mongols version");
}

function testBasicVerboseOnly(output) {
    assertPresentInOutput(output, '"mongolVersion" : ' + tojson(version), "active mongols version");
    assertPresentInOutput(output, '"_id" : ' + tojson(s1Host), "active mongols hostname");
    assertPresentInOutput(output, '"_id" : ' + tojson(s2Host), "active mongols hostname");
}

var buildinfo = assert.commandWorked( mongols.adminCommand("buildinfo") );
var serverStatus1 = assert.commandWorked( mongols.adminCommand("serverStatus") );
var serverStatus2 = assert.commandWorked( st.s1.adminCommand("serverStatus") );
var version = buildinfo.version;
var s1Host = serverStatus1.host;
var s2Host = serverStatus2.host;


// Normal, active mongolses
var outputNormal = grabStatusOutput(st.config, false);
testBasic(outputNormal);
testBasicNormalOnly(outputNormal);

var outputVerbose = grabStatusOutput(st.config, true);
testBasic(outputVerbose);
testBasicVerboseOnly(outputVerbose);


// Take a copy of the config db, in order to test the harder-to-setup cases below.
// TODO: Replace this manual copy with copydb once SERVER-13080 is fixed.
var config = mongols.getDB("config");
var configCopy = mongols.getDB("configCopy");
config.getCollectionInfos().forEach( function (c) {
    // Create collection with options.
    assert.commandWorked( configCopy.createCollection(c.name, c.options) );
    // Clone the docs.
    config.getCollection(c.name).find().snapshot().forEach( function (d) {
        assert.writeOK( configCopy.getCollection(c.name).insert(d) );
    } );
    // Build the indexes.
    config.getCollection(c.name).getIndexes().forEach( function (i) {
        var key = i.key;
        delete i.key;
        delete i.ns;
        delete i.v;
        assert.commandWorked( configCopy.getCollection(c.name).ensureIndex(key, i) );
    } );
} );


// Inactive mongolses
// Make the first ping be older than now by 1 second more than the threshold
// Make the second ping be older still by the same amount again
var pingAdjustMs = 60000 + 1000;
var then = new Date();
then.setTime(then.getTime() - pingAdjustMs);
configCopy.mongols.update( { _id: s1Host }, { $set: { ping: then } } );
then.setTime(then.getTime() - pingAdjustMs);
configCopy.mongols.update( { _id: s2Host }, { $set: { ping: then } } );

var output = grabStatusOutput(configCopy, false);
assertPresentInOutput(output, "most recently active mongolses:", "section header");
assertPresentInOutput(output, tojson(version) + " : 1\n", "recent mongols version");

var output = grabStatusOutput(configCopy, true);
assertPresentInOutput(output, "most recently active mongolses:", "section header");
assertPresentInOutput(output, '"_id" : ' + tojson(s1Host), "recent mongols hostname");
assertNotPresentInOutput(output, '"_id" : ' + tojson(s2Host), "old mongols hostname");


// Older mongolses
configCopy.mongols.remove( { _id: s1Host } );

var output = grabStatusOutput(configCopy, false);
assertPresentInOutput(output, "most recently active mongolses:", "section header");
assertPresentInOutput(output, tojson(version) + " : 1\n", "recent mongols version");

var output = grabStatusOutput(configCopy, true);
assertPresentInOutput(output, "most recently active mongolses:", "section header");
assertNotPresentInOutput(output, '"_id" : ' + tojson(s1Host), "removed mongols hostname");
assertPresentInOutput(output, '"_id" : ' + tojson(s2Host), "recent mongols hostname");


// No mongolses at all
configCopy.mongols.remove({});

var output = grabStatusOutput(configCopy, false);
assertPresentInOutput(output, "most recently active mongolses:\n\tnone", "no mongolses");

var output = grabStatusOutput(configCopy, true);
assertPresentInOutput(output, "most recently active mongolses:\n\tnone", "no mongolses (verbose)");


assert( mongols.getDB(dbName).dropDatabase() );



////////////////////////
// Extended tests
////////////////////////

var testCollDetailsNum = 0;
function testCollDetails(args) {
    if (args === undefined || typeof(args) != "object") {
        args = {};
    }

    var getCollName = function (x) { return "test.test" + x.zeroPad(4); };
    var collName = getCollName(testCollDetailsNum);

    var cmdObj = { shardCollection: collName, key: { _id: 1 } };
    if (args.unique) {
        cmdObj.unique = true;
    }
    assert.commandWorked( admin.runCommand(cmdObj) );

    if (args.hasOwnProperty("unique")) {
        assert.writeOK( mongols.getDB("config").collections.update({ _id : collName },
                { $set : { "unique" : args.unique } }) );
    }
    if (args.hasOwnProperty("noBalance")) {
        assert.writeOK( mongols.getDB("config").collections.update({ _id : collName },
                { $set : { "noBalance" : args.noBalance } }) );
    }

    var output = grabStatusOutput(st.config);

    assertPresentInOutput(output, collName, "collection");
    // If any of the previous collection names are present, then their optional indicators
    // might also be present.  This might taint the results when we go searching through
    // the output.
    // This also means that earlier collNames can't be a prefix of later collNames.
    for (var i = 0; i < testCollDetailsNum; i++) {
        assertNotPresentInOutput(output, getCollName(i), "previous collection");
    }

    assertPresentInOutput(output, "unique: " + (!!args.unique), "unique shard key indicator");
    if (args.hasOwnProperty("unique") && typeof(args.unique) != "boolean") {
        // non-bool: actual value must be shown
        assertPresentInOutput(output, tojson(args.unique), "unique shard key indicator (non bool)");
    }

    assertPresentInOutput(output,
                          "balancing: " + (!args.noBalance),
                          "balancing indicator (inverse of noBalance)");
    if (args.hasOwnProperty("noBalance") && typeof(args.noBalance) != "boolean") {
        // non-bool: actual value must be shown
        assertPresentInOutput(output, tojson(args.noBalance), "noBalance indicator (non bool)");
    }

    assert( mongols.getCollection(collName).drop() );

    testCollDetailsNum++;
}

assert.commandWorked( admin.runCommand({ enableSharding: "test" }) );

// Defaults
testCollDetails({ });

// Expected values
testCollDetails({ unique: false, noBalance: false });
testCollDetails({ unique: true,  noBalance: true  });

// Unexpected truthy values
testCollDetails({ unique: "truthy unique value 1", noBalance: "truthy noBalance value 1" });
testCollDetails({ unique: 1,                       noBalance: 1 });
testCollDetails({ unique: -1,                      noBalance: -1 });
testCollDetails({ unique: {},                      noBalance: {} });

// Unexpected falsy values
testCollDetails({ unique: "",                      noBalance: "" });
testCollDetails({ unique: 0,                       noBalance: 0 });

assert( mongols.getDB("test").dropDatabase() );



st.stop();

})();
