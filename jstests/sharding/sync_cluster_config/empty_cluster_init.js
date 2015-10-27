//
// Tests initialization of an empty cluster with multiple mongolses.
// Starts a bunch of mongolses in parallel, and ensures that there's only a single config 
// version initialization.
//

jsTest.log("Start config servers...")

var configSvrA = MongoRunner.runMongod({ configsvr: "", journal: "", verbose : 2 });
var configSvrB = MongoRunner.runMongod({ configsvr: "", journal: "", verbose : 2 });
var configSvrC = MongoRunner.runMongod({ configsvr: "", journal: "", verbose : 2 });

var configConnStr = [configSvrA.host, configSvrB.host, configSvrC.host].join(",");

var configConn = configSvrA;

// Start profiling the config db
configConn.getDB("config").setProfilingLevel(2);

//
// Start a bunch of mongolses which will probably interfere
//

jsTest.log("Starting first set of mongolses in parallel...");

var mongolses = [];
for (var i = 0; i < 3; i++) {
    var mongols = MongoRunner.runMongos({ binVersion : "latest", 
                                         configdb : configConnStr,
                                         waitForConnect : false });
    
    mongolses.push(mongols);
}

// Eventually connect to a mongol host, to be sure that the config upgrade happened
// (This can take longer on extremely slow bbots or VMs)
var mongolsConn = null;
assert.soon(function() {
    try {
        mongolsConn = new Mongo(mongolses[0].host);
        return true;
    }
    catch (e) {
        print("Waiting for connect...");
        printjson(e);
        return false;
    }
}, "Mongos " + mongolses[0].host + " did not start.", 5 * 60 * 1000 );

var version = mongolsConn.getCollection("config.version").findOne();

//
// Start a second set of mongolses which should respect the initialized version
//

jsTest.log("Starting second set of mongolses...");

for (var i = 0; i < 3; i++) {
    var mongols = MongoRunner.runMongos({ binVersion : "latest", 
                                         configdb : configConnStr,
                                         waitForConnect : false });
    
    mongolses.push(mongols);
}

// Eventually connect to a host
assert.soon(function() {
    try {
        mongolsConn = new Mongo(mongolses[mongolses.length - 1].host);
        return true;
    }
    catch (e) {
        print("Waiting for connect...");
        printjson(e);
        return false;
    }
}, "Later mongols " + mongolses[ mongolses.length - 1 ].host + " did not start.", 5 * 60 * 1000 );

// Shut down our mongolses now that we've tested them
for (var i = 0; i < mongolses.length; i++) {
    MongoRunner.stopMongos(mongolses[i]);
}

jsTest.log("Mongoses stopped...");

//
// Check version and that the version was only updated once
//

printjson(version);

assert.eq(version.minCompatibleVersion, 5);
assert.eq(version.currentVersion, 6);
assert(version.clusterId);
assert.eq(version.excluding, undefined);

jsTest.log("Ensuring config.version collection only written once...");

var updates = configConn.getDB("config").system.profile.find({ op : "update", 
                                                               ns : "config.version" }).toArray();
printjson(updates);
assert.eq(updates.length, 1);

MongoRunner.stopMongod(configSvrA);
MongoRunner.stopMongod(configSvrB);
MongoRunner.stopMongod(configSvrC);

jsTest.log("DONE!");


