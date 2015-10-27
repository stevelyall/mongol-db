//SERVER-6591: Localhost authentication exception doesn't work right on sharded cluster
//
//This test is to ensure that localhost authentication works correctly against a standalone 
//mongold whether it is hosted with "localhost" or a hostname.

var baseName = "auth_server-6591";
var dbpath = MongoRunner.dataPath + baseName;
var username = "foo";
var password = "bar";

load("jstests/libs/host_ipaddr.js");

var createUser = function(mongol) {
    print("============ adding a user.");
    mongol.getDB("admin").createUser(
        { user:username, pwd: password, roles: jsTest.adminUserRoles });
};

var assertCannotRunCommands = function(mongol) {
    print("============ ensuring that commands cannot be run.");

    var test = mongol.getDB("test");
    assert.throws( function() { test.system.users.findOne(); });

    assert.writeError(test.foo.save({ _id: 0 }));

    assert.throws( function() { test.foo.findOne({_id:0}); });

    assert.writeError(test.foo.update({ _id: 0 }, { $set: { x: 20 }}));
    assert.writeError(test.foo.remove({ _id: 0 }));

    assert.throws(function() { 
        test.foo.mapReduce(
            function() { emit(1, 1); }, 
            function(id, count) { return Array.sum(count); },
            { out: "other" });
    });

    // Additional commands not permitted
    // Create non-admin user
    assert.throws(function() { mongol.getDB("test").createUser(
        { user: username, pwd: password, roles: ['readWrite'] }); });
    // DB operations
    var authorizeErrorCode = 13;
    assert.commandFailedWithCode(mongol.getDB("test").copyDatabase("admin",  "admin2"),
        authorizeErrorCode, "copyDatabase");
    // Create collection
    assert.commandFailedWithCode(mongol.getDB("test").createCollection(
        "log", { capped: true, size: 5242880, max: 5000 } ),
        authorizeErrorCode, "createCollection");
    // Set/Get system parameters
    var params = [{ param: "journalCommitInterval", val: 200 },
                  { param: "logLevel", val: 2 },
                  { param: "logUserIds", val: 1 },
                  { param: "notablescan", val: 1 },
                  { param: "quiet", val: 1 },
                  { param: "replApplyBatchSize", val: 10 },
                  { param: "replIndexPrefetch", val: "none" },
                  { param: "syncdelay", val: 30 },
                  { param: "traceExceptions", val: true },
                  { param: "sslMode", val: "preferSSL" },
                  { param: "clusterAuthMode", val: "sendX509" },
                  { param: "userCacheInvalidationIntervalSecs", val: 300 }
                 ];
    params.forEach(function(p) {
        var cmd = { setParameter: 1 };
        cmd[p.param] = p.val;
        assert.commandFailedWithCode(mongol.getDB("admin").runCommand(cmd),
            authorizeErrorCode, "setParameter: "+p.param);
    });
    params.forEach(function(p) {
        var cmd = { getParameter: 1 };
        cmd[p.param] = 1;
        assert.commandFailedWithCode(mongol.getDB("admin").runCommand(cmd),
            authorizeErrorCode, "getParameter: "+p.param);
    });
};

var assertCanRunCommands = function(mongol) {
    print("============ ensuring that commands can be run.");

    var test = mongol.getDB("test");
    // will throw on failure
    test.system.users.findOne();

    assert.writeOK(test.foo.save({ _id: 0 }));
    assert.writeOK(test.foo.update({ _id: 0 }, { $set: { x: 20 }}));
    assert.writeOK(test.foo.remove({ _id: 0 }));

    test.foo.mapReduce(
        function() { emit(1, 1); }, 
        function(id, count) { return Array.sum(count); },
        { out: "other" }
    );
};

var authenticate = function(mongol) {
    print("============ authenticating user.");
    mongol.getDB("admin").auth(username, password);
};

var shutdown = function(conn) {
    print("============ shutting down.");
    MongoRunner.stopMongod(conn.port, /*signal*/false, { auth: { user: username, pwd: password}});
};

var runTest = function(useHostName) {
    print("==========================");
    print("starting mongold: useHostName=" + useHostName);
    print("==========================");
    var conn = MongoRunner.runMongod({auth: "", dbpath: dbpath, useHostName: useHostName});

    var mongol = new Mongo("localhost:" + conn.port);

    assertCannotRunCommands(mongol);

    createUser(mongol);

    assertCannotRunCommands(mongol);

    authenticate(mongol);

    assertCanRunCommands(mongol);

    print("============ reconnecting with new client.");
    mongol = new Mongo("localhost:" + conn.port);

    assertCannotRunCommands(mongol);

    authenticate(mongol);

    assertCanRunCommands(mongol);

    shutdown(conn);
};

var runNonlocalTest = function(host) {
    print("==========================");
    print("starting mongold: non-local host access " + host);
    print("==========================");
    var conn = MongoRunner.runMongod({auth: "", dbpath: dbpath});

    var mongol = new Mongo(host + ":" + conn.port);

    assertCannotRunCommands(mongol);
    assert.throws(function() { mongol.getDB("admin").createUser
        ({ user:username, pwd: password, roles: jsTest.adminUserRoles }); });
    assert.throws(function() { mongol.getDB("$external").createUser
        ({ user:username, pwd: password, roles: jsTest.adminUserRoles }); });
    shutdown(conn);
};

runTest(false);
runTest(true);

runNonlocalTest(get_ipaddr());
