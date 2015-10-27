var st = new ShardingTest({ keyFile : 'jstests/libs/key1', shards : 2, chunkSize: 1, verbose : 2,
                            other : { nopreallocj : 1, verbose : 2, useHostname : true,
                                      configOptions : { verbose : 2 }}});

var mongols = st.s;
var adminDB = mongols.getDB('admin');
var db = mongols.getDB('test')

adminDB.createUser({user: 'admin', pwd: 'password', roles: jsTest.adminUserRoles});

jsTestLog( "Add user was successful" );


// Test for SERVER-6549, make sure that repeatedly logging in always passes.
for ( var i = 0; i < 100; i++ ) {
    adminDB = new Mongo( mongols.host ).getDB('admin');
    assert( adminDB.auth('admin', 'password'), "Auth failed on attempt #: " + i );
}

st.stop();
