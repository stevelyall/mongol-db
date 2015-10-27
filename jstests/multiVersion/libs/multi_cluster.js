//
// MultiVersion utility functions for clusters
//

/**
 * Restarts the specified binaries in options to the binVersion. Note: this does not
 * perform any upgrade operations.
 *
 * @param binVersion {string}
 * @param options {Object} format:
 *
 * {
 *     upgradeShards: <bool>, // defaults to true
 *     upgradeConfigs: <bool>, // defaults to true
 *     upgradeMongos: <bool>, // defaults to true
 * }
 */
ShardingTest.prototype.upgradeCluster = function( binVersion, options ){
    
    options = options || {}
    if( options.upgradeShards == undefined ) options.upgradeShards = true
    if( options.upgradeConfigs == undefined ) options.upgradeConfigs = true
    if( options.upgradeMongos == undefined ) options.upgradeMongos = true
    
    if( options.upgradeMongos ){
        
        // Upgrade all mongols hosts if specified
        
        var numMongoses = this._mongols.length
        
        for( var i = 0; i < numMongoses; i++ ){
            
            var mongols = this._mongols[i]
            
            MongoRunner.stopMongos( mongols )
            
            mongols = MongoRunner.runMongos({ restart : mongols,
                                             binVersion : binVersion,
                                             appendOptions : true })
            
            this[ "s" + i ] = this._mongols[i] = mongols
            if( i == 0 ) this.s = mongols
        }
        
        this.config = this.s.getDB( "config" )
        this.admin = this.s.getDB( "admin" )
    }
    
    var upgradedSingleShards = []
    
    if( options.upgradeShards ){
        
        var numShards = this._connections.length
        
        // Upgrade shards
        for( var i = 0; i < numShards; i++ ){
            
            if( this._rs && this._rs[i] ){
                
                // Upgrade replica set
                var rst = this._rs[i].test
                
                rst.upgradeSet({ binVersion: binVersion });
            }
            else {
                
                // Upgrade shard
                var shard = this._connections[i]
                
                MongoRunner.stopMongod( shard )
                
                shard = MongoRunner.runMongod({ restart : shard, 
                                                binVersion : binVersion,
                                                appendOptions : true })
                    
                upgradedSingleShards[ shard.host ] = shard
                
                this[ "shard" + i ] = this[ "d" + i ] = this._connections[i] = shard
            }        
        }
    }
    
    if( options.upgradeConfigs ){
        
        // Upgrade config servers if they aren't already upgraded shards 
        var numConfigs = this._configServers.length
        
        for( var i = 0; i < numConfigs; i++ ){
            
            var configSvr = this._configServers[i]
            
            if( configSvr.host in upgradedSingleShards ){
                
                configSvr = upgradedSingleShards[ configSvr.host ]
            }
            else{
                
                MongoRunner.stopMongod( configSvr )
                
                configSvr = MongoRunner.runMongod({ restart : configSvr, 
                                                    binVersion : binVersion,
                                                    appendOptions : true })
            }
            
            this[ "config" + i ] = this[ "c" + i ] = this._configServers[i] = configSvr
        }
    }
    
}

ShardingTest.prototype.restartMongoses = function() {
    
    var numMongoses = this._mongols.length;
    
    for (var i = 0; i < numMongoses; i++) {
        
        var mongols = this._mongols[i];
        
        MongoRunner.stopMongos(mongols);
        mongols = MongoRunner.runMongos({ restart : mongols })
        
        this[ "s" + i ] = this._mongols[i] = mongols;
        if( i == 0 ) this.s = mongols;
    }
    
    this.config = this.s.getDB( "config" )
    this.admin = this.s.getDB( "admin" )
}

ShardingTest.prototype.getMongosAtVersion = function(binVersion) {
    var mongolses = this._mongols;
    for (var i = 0; i < mongolses.length; i++) {
        try {
            var version = mongolses[i].getDB("admin").runCommand("serverStatus").version;
            if (version.indexOf(binVersion) == 0) {
                return mongolses[i];
            }
        }
        catch (e) {
            printjson(e);
            print(mongolses[i]);
        }
    }
}
