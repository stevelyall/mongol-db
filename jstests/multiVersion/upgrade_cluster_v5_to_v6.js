/**
 * Tests upgrading a cluster which has 3.0 mongols.
 */

load( './jstests/multiVersion/libs/multi_rs.js' )
load( './jstests/multiVersion/libs/multi_cluster.js' )

/**
 * @param isRSCluster {bool} use replica set shards.
 */
var runTest = function(isRSCluster) {
"use strict";

jsTest.log( "Starting" + ( isRSCluster ? " (replica set)" : "" ) + " cluster" + "..." );

jsTest.log( "Starting 2.6 cluster..." );

var options = {
    
    mongolsOptions : { binVersion : "2.6" },
    configOptions : { binVersion : "2.6" },
    shardOptions : { binVersion : "2.6" },
    
    rsOptions : { binVersion : "2.6" /*, oplogSize : 100, smallfiles : null */ },

    sync: true, // Old clusters can't use replsets for config servers
    rs : isRSCluster
}

var st = new ShardingTest({ shards : 2, mongols : 2, other : options });

// Just stop balancer, to simulate race conds
st.setBalancer(false);

var shards = st.s0.getDB("config").shards.find().toArray();
var configConnStr = st._configDB;

//
// Make sure 3.2 mongolses won't start in 2.6 cluster
//

jsTest.log("Starting v3.2 mongols in 2.6 cluster...");

var mongols = MongoRunner.runMongos({ binVersion : "3.2", configdb : configConnStr });
assert.eq(null, mongols);

mongols = MongoRunner.runMongos({ binVersion : "3.2", configdb : configConnStr, upgrade : "" });
assert.eq(null, mongols);

jsTest.log("3.2 mongolses did not start or upgrade in 2.6 cluster (which is correct).");

//
// Upgrade 2.6 cluster to 2.6/3.0
//

var configDB = st.s.getDB('config');
var clusterID = configDB.getCollection('version').findOne().clusterId;

jsTest.log("Upgrading 2.6 cluster to 2.6/3.0 cluster...");

// upgrade config to v4 (This is a required to make 3.0 mongols startable).
mongols = MongoRunner.runMongos({ binVersion : "3.0", configdb : configConnStr, upgrade : "" });
assert.eq(null, mongols);

var version = configDB.getCollection('version').findOne();
printjson(version);

assert.eq(version.minCompatibleVersion, 5);
assert.eq(version.currentVersion, 6);
assert.eq(clusterID, version.clusterId); // clusterId shouldn't change
assert.eq(version.excluding, undefined);

st.upgradeCluster(MongoRunner.versionIterator(["2.6","3.0"]));
// Restart of mongols here is unfortunately necessary, connection pooling otherwise causes problems
st.restartMongoses();

//
// Upgrade 2.6/3.0 cluster to only 3.0
//

jsTest.log("Upgrading 2.6/3.0 cluster to 3.0 cluster...");

st.upgradeCluster("3.0");
st.restartMongoses();

//
// Upgrade 3.0 cluster to only 3.2
//

st.upgradeCluster("3.2");
st.restartMongoses();

//
// Verify cluster version is correct
//

// Make sure that you can't run 2.4 mongols
mongols = MongoRunner.runMongos({
    binVersion : "2.4",
    configdb : configConnStr,
    nohttpinterface: ""
});
assert.eq(null, mongols);

// Make sure that you can run 2.6 mongols
mongols = MongoRunner.runMongos({ binVersion : "2.6", configdb : configConnStr });
assert.neq(null, mongols);

// Make sure that you can run 3.0 mongols
mongols = MongoRunner.runMongos({ binVersion : "3.0", configdb : configConnStr });
assert.neq(null, mongols);
MongoRunner.stopMongos(mongols);

// Make sure that you can run 3.2 mongols
mongols = MongoRunner.runMongos({ binVersion : "3.2", configdb : configConnStr });
assert.neq(null, mongols);
MongoRunner.stopMongos(mongols);

jsTest.log("DONE!")

st.stop();

};

runTest(false);
runTest(true);
