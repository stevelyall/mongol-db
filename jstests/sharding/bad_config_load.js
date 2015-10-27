//
// Test for what happens when config servers are down and the database config is loaded
// Should fail sanely
//
(function() {
"use strict";

var st = new ShardingTest({ shards : 1, mongols : 1 })

var mongols = st.s
var coll = mongols.getCollection( "foo.bar" )

// Make sure mongols has no database info currently loaded
mongols.getDB( "admin" ).runCommand({ flushRouterConfig : 1 })

jsTestLog( "Setup complete!" )
st.printShardingStatus()

jsTestLog( "Stopping config servers" );
for (var i = 0; i < st._configServers.length; i++) {
    MongoRunner.stopMongod(st._configServers[i]);
}

jsTestLog( "Config flushed and config servers down!" )

// Throws transport error first and subsequent times when loading config data, not no primary
for( var i = 0; i < 2; i++ ){
    try {
        coll.findOne()
        // Should always throw
        assert( false )
    }
    catch( e ){
        
        printjson( e )
        
        // Make sure we get a transport error, and not a no-primary error
        assert(e.code == 8002  ||       // All servers down/unreachable in SyncClusterConnection
               e.code == 10276 ||       // Transport error
               e.code == 13328 ||       // Connect error
               e.code == 13639 ||       // Connect error to replSet primary
               e.code == ErrorCodes.HostUnreachable ||
               e.code == ErrorCodes.NotMaster ||
               e.code == ErrorCodes.FailedToSatisfyReadPreference);
    }
}

jsTestLog( "Done!" )

st.stop()
}());