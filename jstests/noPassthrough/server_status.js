// Checks storage-engine specific sections of db.severStatus() output.

(function() {
    'use strict';

    // 'backgroundFlushing' is mmapv1-specific.
    var mongol = MongoRunner.runMongod({smallfiles: ""});
    var testDB = mongol.getDB('test');
    var serverStatus = assert.commandWorked(testDB.serverStatus());
    if (serverStatus.storageEngine.name == 'mmapv1') {
        assert(serverStatus.backgroundFlushing,
               'mmapv1 db.serverStatus() result must contain backgroundFlushing document: ' +
               tojson(serverStatus));
    }
    else {
        assert(!serverStatus.backgroundFlushing,
               'Unexpected backgroundFlushing document in non-mmapv1 db.serverStatus() result: ' +
               tojson(serverStatus));
    }
    MongoRunner.stopMongod(mongol);

    // 'dur' is mmapv1-specific and should only be generated when journaling is enabled.
    mongol = MongoRunner.runMongod({smallfiles: "", journal: ""});
    testDB = mongol.getDB('test');
    serverStatus = assert.commandWorked(testDB.serverStatus());
    if (serverStatus.storageEngine.name == 'mmapv1') {
        assert(serverStatus.dur,
               'mmapv1 db.serverStatus() result must contain "dur" document: ' +
               tojson(serverStatus));
    }
    else {
        assert(!serverStatus.dur,
               'Unexpected "dur" document in non-mmapv1 db.serverStatus() result: ' +
               tojson(serverStatus));
    }
    MongoRunner.stopMongod(mongol);
    mongol = MongoRunner.runMongod({smallfiles: "", nojournal: ""});
    testDB = mongol.getDB('test');
    serverStatus = assert.commandWorked(testDB.serverStatus());
    assert(!serverStatus.dur,
           'Unexpected "dur" document in db.serverStatus() result when journaling is disabled: ' +
           tojson(serverStatus));
    MongoRunner.stopMongod(mongol);
}());
