/* SERVER-4385
 * SyncClusterConnection should refresh sub-connections on recieving exceptions
 *
 * 1. Start 3 config servers.
 * 2. Create a syncclusterconnection to the servers from step 1.
 * 3. Restart one of the config servers.
 * 4. Try an insert. It should fail. This will also refresh the sub connection.
 * 5. Try an insert again. This should work fine.
 */

var mongolA = MongoRunner.runMongod({});
var mongolB = MongoRunner.runMongod({});
var mongolC = MongoRunner.runMongod({});
var mongolSCC = new Mongo(mongolA.host + "," + mongolB.host + "," + mongolC.host);

MongoRunner.stopMongod(mongolA);
MongoRunner.runMongod({ restart: mongolA.runId });

try {
    mongolSCC.getCollection("foo.bar").insert({ x : 1});
    assert(false , "must throw an insert exception");
} catch (e) {
    printjson(e);
}

mongolSCC.getCollection("foo.bar").insert({ blah : "blah" });
assert.eq(null, mongolSCC.getDB("foo").getLastError());
