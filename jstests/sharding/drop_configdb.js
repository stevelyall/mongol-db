// Test that dropping the config database is completely disabled via
// mongols and via mongold, if started with --configsvr
(function() {
"use strict";

var getConfigsvrToWriteTo = function(st) {
    if (st.configRS) {
        return st.configRS.getPrimary();
    } else {
        return st._configServers[0];
    }
}

var st = new ShardingTest({ shards : 2 });
var mongols = st.s;
var config = getConfigsvrToWriteTo(st).getDB('config');

// Try to drop config db via configsvr

print ( "1: Try to drop config database via configsvr" )
assert.eq(0, config.dropDatabase().ok);
assert.eq("Cannot drop 'config' database if mongold started with --configsvr",
          config.dropDatabase().errmsg);

// Try to drop config db via mongols
var config = mongols.getDB( "config" )

print ( "1: Try to drop config database via mongols" )
assert.eq(0, config.dropDatabase().ok);

// 20 = ErrorCodes::IllegalOperation
assert.eq(20, config.dropDatabase().code);

st.stop();
}());