// The mongold process should always create a mongold.lock file in the data directory
// containing the process ID regardless of the storage engine requested.

(function() {
    // Ensures that mongold.lock exists and returns size of file.
    function getMongodLockFileSize(dir) {
        var files = listFiles(dir);
        for (var i in files) {
            var file = files[i];
            if (!file.isDirectory && file.baseName == 'mongold.lock') {
                return file.size;
            }
        }
        assert(false, 'mongold.lock not found in data directory ' + dir);
    }

    var baseName = "jstests_lock_file";
    var dbpath = MongoRunner.dataPath + baseName + '/';

    // Test framework will append --storageEngine command line option if provided to smoke.py.
    var mongold = MongoRunner.runMongod({dbpath: dbpath, smallfiles: ""});
    assert.neq(0, getMongodLockFileSize(dbpath),
               'mongold.lock should not be empty while server is running');

    MongoRunner.stopMongod(mongold);

    // mongold.lock must be empty after shutting server down.
    assert.eq(0, getMongodLockFileSize(dbpath),
              'mongold.lock not truncated after shutting server down');
}());
