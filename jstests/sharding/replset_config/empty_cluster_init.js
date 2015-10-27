//
// Tests initialization of an empty cluster with multiple mongolses.
// Starts a bunch of mongolses in parallel, and ensures that there's only a single config 
// version initialization.
//

var configRS = new ReplSetTest({ name: "configRS", nodes: 3, useHostName: true });
configRS.startSet({ configsvr: '',
                    journal: "",
                    storageEngine: 'wiredTiger' });
var replConfig = configRS.getReplSetConfig();
replConfig.configsvr = true;
configRS.initiate(replConfig);

//
// Start a bunch of mongolses which will probably interfere
//

jsTest.log("Starting first set of mongolses in parallel...");

var mongolses = [];
for (var i = 0; i < 3; i++) {
    var mongols = MongoRunner.runMongos({ binVersion: "latest",
                                         configdb: configRS.getURL(),
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
    var mongols = MongoRunner.runMongos({ binVersion: "latest",
                                         configdb: configRS.getURL(),
                                         waitForConnect: false });
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
}, "Later mongols " + mongolses[mongolses.length - 1].host + " did not start.", 5 * 60 * 1000);

// Shut down our mongolses now that we've tested them
for (var i = 0; i < mongolses.length; i++) {
    MongoRunner.stopMongos(mongolses[i]);
}

//
// Check version and that the version was only updated once
//

assert.eq(5, version.minCompatibleVersion);
assert.eq(6, version.currentVersion);
assert(version.clusterId);
assert.eq(undefined, version.excluding);

var oplog = configRS.getPrimary().getDB('local').oplog.rs;
var updates = oplog.find({ ns: "config.version" }).toArray();
assert.eq(1, updates.length, 'ops to config.version: ' + tojson(updates));

configRS.stopSet(15);

