/**
 * Helpers for verifying versions of started MongoDB processes
 */

Mongo.prototype.getBinVersion = function() {
    var result = this.getDB( "admin" ).runCommand({ serverStatus : 1 })
    return result.version
}

// Checks that our mongoldb process is of a certain version
assert.binVersion = function(mongol, version) {
    var currVersion = mongol.getBinVersion();
    assert(MongoRunner.areBinVersionsTheSame(MongoRunner.getBinVersionFor(currVersion),
                                             MongoRunner.getBinVersionFor(version)),
           "version " + version + " (" + MongoRunner.getBinVersionFor(version) + ")" + 
           " is not the same as " + currVersion);
}


// Compares an array of desired versions and an array of found versions,
// looking for versions not found
assert.allBinVersions = function(versionsWanted, versionsFound) {
    
    for (var i = 0; i < versionsWanted.length; i++) {

        var found = false;
        for (var j = 0; j < versionsFound.length; j++) {
            if (MongoRunner.areBinVersionsTheSame(versionsWanted[i],
                                                  versionsFound[j]))
            {
                found = true;
                var version = versionsWanted[i];
                break;
            }
        }

        assert(found, "could not find version " + 
                      version + " (" + MongoRunner.getBinVersionFor(version) + ")" +
                      " in " + versionsFound);
    }
}
