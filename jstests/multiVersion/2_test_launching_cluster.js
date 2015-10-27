//
// Tests launching multi-version ShardingTest clusters
//

load('./jstests/multiVersion/libs/verify_versions.js');

(function() {
"use strict";
// Check our latest versions
var versionsToCheck = [ "last-stable",
                        "latest" ];
                       
jsTest.log( "Testing legacy versions..." );

for( var i = 0; i < versionsToCheck.length; i++ ){

    var version = versionsToCheck[ i ];
    
    // Set up a cluster
    
    var st = new ShardingTest({ shards : 2, 
                                mongols : 2,
                                sync: true, // Old clusters can't use replsets for config servers
                                other : { 
                                    mongolsOptions : { binVersion : version },
                                    configOptions : { binVersion : version },
                                    shardOptions : { binVersion : version }
                                } });
    
    var shards = [ st.shard0, st.shard1 ];
    var mongolses = [ st.s0, st.s1 ];
    var configs = [ st.config0 ];
    
    // Make sure the started versions are actually the correct versions
    for( var j = 0; j < shards.length; j++ ) assert.binVersion( shards[j], version );
    for( j = 0; j < mongolses.length; j++ ) assert.binVersion( mongolses[j], version );
    for( j = 0; j < configs.length; j++ ) assert.binVersion( configs[j], version );
    
    st.stop();
}

jsTest.log( "Testing mixed versions..." );
        
// Set up a multi-version cluster

st = new ShardingTest({ shards : 2,
                            mongols : 2,
                            other : {
                                
                                // Three config servers
                                sync : true,
                                
                                mongolsOptions : { binVersion : versionsToCheck },
                                configOptions : { binVersion : versionsToCheck },
                                shardOptions : { binVersion : versionsToCheck }

                            } });
    
shards = [ st.shard0, st.shard1 ];
mongolses = [ st.s0, st.s1 ];
configs = [ st.config0, st.config1, st.config2 ];

// Make sure we have hosts of all the different versions
var versionsFound = [];
for ( j = 0; j < shards.length; j++ ) 
    versionsFound.push( shards[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );

versionsFound = [];
for ( j = 0; j < mongolses.length; j++ ) 
    versionsFound.push( mongolses[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );
    
versionsFound = [];
for ( j = 0; j < configs.length; j++ ) 
    versionsFound.push( configs[j].getBinVersion() );
    
assert.allBinVersions( versionsToCheck, versionsFound );
    
st.stop();


jsTest.log( "Testing mixed versions with replica sets..." );
        
// Set up a multi-version cluster w/ replica sets

st = new ShardingTest({ shards : 2,
                            mongols : 2,
                            other : {
                                
                                // Three config servers
                                sync : true,
                                
                                // Replica set shards
                                rs : true,
                                
                                mongolsOptions : { binVersion : versionsToCheck },
                                configOptions : { binVersion : versionsToCheck },
                                rsOptions : { binVersion : versionsToCheck, protocolVersion: 0 }
                            } });
    
var nodesA = st.rs0.nodes;
var nodesB = st.rs1.nodes;
mongolses = [ st.s0, st.s1 ];
configs = [ st.config0, st.config1, st.config2 ];

var getVersion = function( mongol ){
    var result = mongol.getDB( "admin" ).runCommand({ serverStatus : 1 });
    return result.version;
};

// Make sure we have hosts of all the different versions
versionsFound = [];
for ( j = 0; j < nodesA.length; j++ ) 
    versionsFound.push( nodesA[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );

versionsFound = [];
for ( j = 0; j < nodesB.length; j++ ) 
    versionsFound.push( nodesB[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );

versionsFound = [];
for ( j = 0; j < mongolses.length; j++ )
    versionsFound.push( mongolses[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );

versionsFound = [];
for ( j = 0; j < configs.length; j++ )
    versionsFound.push( configs[j].getBinVersion() );

assert.allBinVersions( versionsToCheck, versionsFound );

jsTest.log("DONE!");
   
st.stop();
})();

