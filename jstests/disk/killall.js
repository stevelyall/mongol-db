/**
 * Verify that killing an instance of mongold while it is in a long running computation or infinite
 * loop still leads to clean shutdown, and that said shutdown is prompt.
 *
 * For our purposes, "prompt" is defined as "before stopMongod() decides to send a SIGKILL", which
 * would not result in a zero return code.
 */

var baseName = "jstests_disk_killall";
var dbpath = MongoRunner.dataPath + baseName;

var mongold = MongoRunner.runMongod({dbpath: dbpath});
var db = mongold.getDB( "test" );
var collection = db.getCollection( baseName );
assert.writeOK(collection.insert({}));

var awaitShell = startParallelShell(
            "db." + baseName + ".count( { $where: function() { while( 1 ) { ; } } } )",
            mongold.port);
sleep( 1000 );

/**
 * 0 == mongold's exit code on Windows, or when it receives TERM, HUP or INT signals.  On UNIX
 * variants, stopMongod sends a TERM signal to mongold, then waits for mongold to stop.  If mongold
 * doesn't stop in a reasonable amount of time, stopMongod sends a KILL signal, in which case mongold
 * will not exit cleanly.  We're checking in this assert that mongold will stop quickly even while
 * evaling an infinite loop in server side js.
 */
var exitCode = MongoRunner.stopMongod(mongold);
assert.eq(0, exitCode, "got unexpected exitCode");

// Waits for shell to complete
exitCode = awaitShell({checkExitSuccess: false});
assert.neq(0, exitCode, "expected shell to exit abnormally due to mongold being terminated");

mongold = MongoRunner.runMongod({
    port: mongold.port,
    restart: true,
    cleanData: false,
    dbpath: mongold.dbpath
});
db = mongold.getDB( "test" );
collection = db.getCollection( baseName );

assert( collection.stats().ok );
assert( collection.drop() );

MongoRunner.stopMongod(mongold);
