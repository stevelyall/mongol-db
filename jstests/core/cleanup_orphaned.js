// Test that cleanupOrphaned cannot be run on stand alone mongold.
var res = db.adminCommand({ cleanupOrphaned: 'unsharded.coll' });
assert(!res.ok, tojson(res));
