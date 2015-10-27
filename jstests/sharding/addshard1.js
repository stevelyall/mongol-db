s = new ShardingTest({name: "add_shard1", shards: 1, useHostname: false });

assert.eq( 1, s.config.shards.count(), "initial server count wrong" );

// create a shard and add a database; if the database is not duplicated the mongold should accepted
// it as shard
conn1 = MongoRunner.runMongod({});

db1 = conn1.getDB( "testDB" );
numObjs = 0;
for (i=0; i<3; i++){
    assert.writeOK(db1.foo.save( { a : i } ));
    numObjs++;
}

var configDB = s.s.getDB('config');
assert.eq(null, configDB.databases.findOne({ _id: 'testDB' }));

newShard = "myShard";
assert.commandWorked(s.admin.runCommand({ addshard: "localhost:" + conn1.port,
                                          name: newShard,
                                          maxSize: 1024
                                        }));

assert.neq(null, configDB.databases.findOne({ _id: 'testDB' }));

var newShardDoc = configDB.shards.findOne({ _id: newShard });
assert.eq(1024, newShardDoc.maxSize);

// a mongold with an existing database name should not be allowed to become a shard
conn2 = MongoRunner.runMongod({});
db2 = conn2.getDB( "otherDB" );
assert.writeOK(db2.foo.save({ a: 1 }));
db3 = conn2.getDB( "testDB" );
assert.writeOK(db3.foo.save({ a: 1 } ));

s.config.databases.find().forEach( printjson )
rejectedShard = "rejectedShard";
assert( ! s.admin.runCommand( { addshard: "localhost:" + conn2.port , name : rejectedShard } ).ok,
        "accepted mongold with duplicate db" );

// check that all collection that were local to the mongold's are accessible through the mongols
sdb1 = s.getDB( "testDB" );
assert.eq( numObjs , sdb1.foo.count() , "wrong count for database that existed before addshard" );
sdb2 = s.getDB( "otherDB" );
assert.eq( 0 , sdb2.foo.count() , "database of rejected shard appears through mongols" );

// make sure we can move a DB from the original mongold to a previoulsy existing shard
assert.eq( s.normalize( s.config.databases.findOne( { _id : "testDB" } ).primary ), newShard , "DB primary is wrong" );
origShard = s.getNonPrimaries( "testDB" )[0];
s.adminCommand( { moveprimary : "testDB" , to : origShard } );
assert.eq( s.normalize( s.config.databases.findOne( { _id : "testDB" } ).primary ), origShard , "DB primary didn't move" );
assert.eq( numObjs , sdb1.foo.count() , "wrong count after moving datbase that existed before addshard" );

// make sure we can shard the original collections
sdb1.foo.ensureIndex( { a : 1 }, { unique : true } ) // can't shard populated collection without an index
s.adminCommand( { enablesharding : "testDB" } );
s.adminCommand( { shardcollection : "testDB.foo" , key: { a : 1 } } );
s.adminCommand( { split : "testDB.foo", middle: { a : Math.floor(numObjs/2) } } );
assert.eq( 2 , s.config.chunks.count(), "wrong chunk number after splitting collection that existed before" );
assert.eq( numObjs , sdb1.foo.count() , "wrong count after splitting collection that existed before" );

MongoRunner.stopMongod(conn1);
MongoRunner.stopMongod(conn2);
s.stop();
