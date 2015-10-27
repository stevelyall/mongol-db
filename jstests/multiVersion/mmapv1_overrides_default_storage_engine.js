/**
 * Test the upgrade process for 2.6 ~~> 3.2 and 3.0 ~~> 3.2, where mmapv1 should continue to be the
 * default storage engine. Repeat the process with --directoryperdb set.
 */
(function() {
    'use strict';

    var testCases = [
        {
            binVersion: '2.6',
        },
        {
            binVersion: '2.6',
            directoryperdb: '',
        },
        {
            binVersion: '3.0',
        },
        {
            binVersion: '3.0',
            directoryperdb: '',
        },
    ];

    // The mongold should start up with mmapv1 when the --storageEngine flag is omitted, or when
    // --storageEngine=mmapv1 is explicitly specified.
    testCases.forEach(function(testCase) {
        [null, 'mmapv1'].forEach(function(storageEngine) {
            jsTest.log('Upgrading from a ' + testCase.binVersion + ' instance with options='
                       + tojson(testCase) + ' to the latest version. This should succeed when the'
                       + ' latest version '
                       + (storageEngine ? ('explicitly specifies --storageEngine=' + storageEngine)
                                        : 'omits the --storageEngine flag'));

            var dbpath = MongoRunner.dataPath + 'mmapv1_overrides_default_storage_engine';
            resetDbpath(dbpath);

            var defaultOptions = {
                dbpath: dbpath,
                noCleanData: true,
            };

            // Start the old version.
            var mongoldOptions = Object.merge(defaultOptions, testCase);
            var conn = MongoRunner.runMongod(mongoldOptions);
            assert.neq(null, conn,
                       'mongold was unable to start up with options ' + tojson(mongoldOptions));
            assert.commandWorked(conn.getDB('test').runCommand({ping: 1}));
            MongoRunner.stopMongod(conn);

            // Start the newest version.
            mongoldOptions = Object.extend({}, defaultOptions);
            if (storageEngine) {
                mongoldOptions.storageEngine = storageEngine;
            }
            if (testCase.hasOwnProperty('directoryperdb')) {
                mongoldOptions.directoryperdb = testCase.directoryperdb;
            }
            conn = MongoRunner.runMongod(mongoldOptions);
            assert.neq(null, conn,
                       'mongold was unable to start up with options ' + tojson(mongoldOptions));
            assert.commandWorked(conn.getDB('test').runCommand({ping: 1}));
            MongoRunner.stopMongod(conn);
        });
    });

    // The mongold should not start up when --storageEngine=wiredTiger is specified.
    testCases.forEach(function(testCase) {
        jsTest.log('Upgrading from a ' + testCase.binVersion + ' instance with options='
                   + tojson(testCase) + ' to the latest version. This should fail when the latest'
                   + ' version specifies --storageEngine=wiredTiger');

        var dbpath = MongoRunner.dataPath + 'mmapv1_overrides_default_storage_engine';
        resetDbpath(dbpath);

        var defaultOptions = {
            dbpath: dbpath,
            noCleanData: true,
        };

        // Start the old version.
        var mongoldOptions = Object.merge(defaultOptions, testCase);
        var conn = MongoRunner.runMongod(mongoldOptions);
        assert.neq(null, conn,
                   'mongold was unable to start up with options ' + tojson(mongoldOptions));
        assert.commandWorked(conn.getDB('test').runCommand({ping: 1}));
        MongoRunner.stopMongod(conn);

        // Start the newest version.
        mongoldOptions = Object.extend({storageEngine: 'wiredTiger'}, defaultOptions);
        conn = MongoRunner.runMongod(mongoldOptions);
        assert.eq(null, conn,
                  'mongold should not have been able to start up with options '
                  + tojson(mongoldOptions));
    });
}());
