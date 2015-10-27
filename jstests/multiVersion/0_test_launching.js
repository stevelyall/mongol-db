/**
 * This is a self-test for the multiversion suite. It tests whether or not multi-version
 * mongols/mongold instances can be launched.
 */

load("./jstests/multiVersion/libs/verify_versions.js");

(function() {
    "use strict";

    var versionsToCheck = [
        "last-stable",
        "latest",
        "",
    ];

    versionsToCheck.forEach(function(version) {
        var mongold1 = MongoRunner.runMongod({ binVersion : version, configsvr : "" });
        var mongold2 = MongoRunner.runMongod({ binVersion : version, configsvr : "" });
        var mongold3 = MongoRunner.runMongod({ binVersion : version, configsvr : "" });
        var configdbStr = mongold1.host + "," + mongold2.host + "," + mongold3.host;
        var mongols = MongoRunner.runMongos({ binVersion : version, configdb : configdbStr });

        // Make sure the started versions are actually the correct versions
        assert.binVersion( mongold1, version );
        assert.binVersion( mongold2, version );
        assert.binVersion( mongold3, version );
        assert.binVersion( mongols, version );

        MongoRunner.stopMongos( mongols );
        MongoRunner.stopMongod( mongold1 );
        MongoRunner.stopMongod( mongold2 );
        MongoRunner.stopMongod( mongold3 );
    });
})();
