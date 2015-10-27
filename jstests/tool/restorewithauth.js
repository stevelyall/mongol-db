/* SERVER-4972
 * Test for mongolrestore on server with --auth allows restore without credentials of colls 
 * with no index
 */
/*
 * 1) Start mongol without auth.
 * 2) Write to collection
 * 3) Take dump of the collection using mongoldump.
 * 4) Drop the collection.
 * 5) Stop mongold from step 1.
 * 6) Restart mongold with auth.
 * 7) Add admin user to kick authentication
 * 8) Try restore without auth credentials. The restore should fail
 * 9) Try restore with correct auth credentials. The restore should succeed this time.
 */


baseName = "jstests_restorewithauth";
var conn = MongoRunner.runMongod({nojournal: "", bind_ip: "127.0.0.1"});

// write to ns foo.bar
var foo = conn.getDB( "foo" );
for( var i = 0; i < 4; i++ ) {
    foo["bar"].save( { "x": i } );
    foo["baz"].save({"x": i});
}

// make sure the collection exists
var collNames = foo.getCollectionNames();
assert.neq(-1, collNames.indexOf("bar"), "bar collection doesn't exist");

//make sure it has no index except _id
assert.eq(foo.bar.getIndexes().length, 1);
assert.eq(foo.baz.getIndexes().length, 1);

foo.bar.createIndex({x:1});
assert.eq(foo.bar.getIndexes().length, 2);
assert.eq(foo.baz.getIndexes().length, 1);

// get data dump
var dumpdir = MongoRunner.dataDir + "/restorewithauth-dump1/";
resetDbpath( dumpdir );
x = runMongoProgram("mongoldump", "--db", "foo", "-h", "127.0.0.1:"+ conn.port, "--out", dumpdir);

// now drop the db
foo.dropDatabase();

// stop mongold
MongoRunner.stopMongod(conn);

// start mongold with --auth
conn = MongoRunner.runMongod({auth: "", nojournal: "", bind_ip: "127.0.0.1"});

// admin user
var admin = conn.getDB( "admin" )
admin.createUser({user:  "admin" , pwd: "admin", roles: jsTest.adminUserRoles});
admin.auth( "admin" , "admin" );

var foo = conn.getDB( "foo" )

// make sure no collection with the same name exists
collNames = foo.getCollectionNames();
assert.eq(-1, collNames.indexOf("bar"), "bar collection already exists");
assert.eq(-1, collNames.indexOf("baz"), "baz collection already exists");

// now try to restore dump
x = runMongoProgram( "mongolrestore", "-h", "127.0.0.1:" + conn.port,  "--dir" , dumpdir, "-vvvvv" );

// make sure that the collection isn't restored
collNames = foo.getCollectionNames();
assert.eq(-1, collNames.indexOf("bar"), "bar collection was restored");
assert.eq(-1, collNames.indexOf("baz"), "baz collection was restored");

// now try to restore dump with correct credentials
x = runMongoProgram( "mongolrestore",
                     "-h", "127.0.0.1:" + conn.port,
                     "-d", "foo",
                     "--authenticationDatabase=admin",
                     "-u", "admin",
                     "-p", "admin",
                     "--dir", dumpdir + "foo/",
                     "-vvvvv");

// make sure that the collection was restored
collNames = foo.getCollectionNames();
assert.neq(-1, collNames.indexOf("bar"), "bar collection was not restored");
assert.neq(-1, collNames.indexOf("baz"), "baz collection was not restored");

// make sure the collection has 4 documents
assert.eq(foo.bar.count(), 4);
assert.eq(foo.baz.count(), 4);

foo.dropDatabase();

foo.createUser({user: 'user', pwd: 'password', roles: jsTest.basicUserRoles});

// now try to restore dump with foo database credentials
x = runMongoProgram("mongolrestore",
                    "-h", "127.0.0.1:" + conn.port,
                    "-d", "foo",
                    "-u", "user",
                    "-p", "password",
                    "--dir", dumpdir + "foo/",
                    "-vvvvv");

// make sure that the collection was restored
collNames = foo.getCollectionNames();
assert.neq(-1, collNames.indexOf("bar"), "bar collection was not restored");
assert.neq(-1, collNames.indexOf("baz"), "baz collection was not restored");
assert.eq(foo.bar.count(), 4);
assert.eq(foo.baz.count(), 4);
assert.eq(foo.bar.getIndexes().length + foo.baz.getIndexes().length, 3); // _id on foo, _id on bar, x on foo

MongoRunner.stopMongod(conn);
