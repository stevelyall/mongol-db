/*
 * Regression test for SERVER-4892.
 *
 * Verify that a client can delete cursors that it creates, when mongold is running with "auth"
 * enabled.
 */

var baseName = 'jstests_auth_server4892';
var dbpath = MongoRunner.dataPath + baseName;
resetDbpath(dbpath);
var mongoldCommonArgs = {
    dbpath: dbpath,
    noCleanData: true,
};

/*
 * Start an instance of mongold, pass it as a parameter to operation(), then stop the instance of
 * mongold before unwinding or returning out of with_mongold().
 *
 * 'extraMongodArgs' are extra arguments to pass on the mongold command line, as an object.
 */
function withMongod(extraMongodArgs, operation) {
    var mongold = MongoRunner.runMongod(Object.merge(mongoldCommonArgs, extraMongodArgs));

    try {
        operation( mongold );
    } finally {
        MongoRunner.stopMongod( mongold.port );
    }
}

/*
 * Fail an assertion if the given "mongold" instance does not have exactly expectNumLiveCursors live
 * cursors on the server.
 */
function expectNumLiveCursors(mongold, expectedNumLiveCursors) {
    var conn = new Mongo( mongold.host );
    var db = mongold.getDB( 'admin' );
    db.auth( 'admin', 'admin' );
    var actualNumLiveCursors = db.serverStatus().metrics.cursor.open.total;
    assert( actualNumLiveCursors == expectedNumLiveCursors,
          "actual num live cursors (" + actualNumLiveCursors + ") != exptected ("
          + expectedNumLiveCursors + ")");
}

withMongod({noauth: ""}, function setupTest(mongold) {
    var admin, somedb, conn;
    conn = new Mongo( mongold.host );
    admin = conn.getDB( 'admin' );
    somedb = conn.getDB( 'somedb' );
    admin.createUser({user: 'admin', pwd: 'admin', roles: jsTest.adminUserRoles});
    admin.auth('admin', 'admin');
    somedb.createUser({user: 'frim', pwd: 'fram', roles: jsTest.basicUserRoles});
    somedb.data.drop();
    for (var i = 0; i < 10; ++i) {
        assert.writeOK(somedb.data.insert( { val: i } ));
    }
    admin.logout();
} );

withMongod({auth: ""}, function runTest(mongold) {
    var conn = new Mongo( mongold.host );
    var somedb = conn.getDB( 'somedb' );
    somedb.auth('frim', 'fram');

    expectNumLiveCursors( mongold, 0 );

    var cursor = somedb.data.find({}, {'_id': 1}).batchSize(1);
    cursor.next();
    expectNumLiveCursors( mongold, 1 );

    cursor = null;
    // NOTE(schwerin): We assume that after setting cursor = null, there are no remaining references
    // to the cursor, and that gc() will deterministically garbage collect it.
    gc();

  // NOTE(schwerin): dbKillCursors gets piggybacked on subsequent messages on the connection, so we
  // have to force a message to the server.
    somedb.data.findOne();

    expectNumLiveCursors( mongold, 0 );
});

