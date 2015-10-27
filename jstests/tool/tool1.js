// mongol tool tests, very basic to start with

baseName = "jstests_tool_tool1";
dbPath = MongoRunner.dataPath + baseName + "/";
externalPath = MongoRunner.dataPath + baseName + "_external/";
externalBaseName = "export.json";
externalFile = externalPath + externalBaseName;

function fileSize(){
    var l = listFiles( externalPath );
    for ( var i=0; i<l.length; i++ ){
        if ( l[i].baseName == externalBaseName )
            return l[i].size;
    }
    return -1;
}


resetDbpath( externalPath );

var m = MongoRunner.runMongod({dbpath: dbPath, noprealloc: "", bind_ip: "127.0.0.1"});
c = m.getDB( baseName ).getCollection( baseName );
c.save( { a: 1 } );
assert( c.findOne() );

runMongoProgram( "mongoldump", "--host", "127.0.0.1:" + m.port, "--out", externalPath );
c.drop();
runMongoProgram( "mongolrestore", "--host", "127.0.0.1:" + m.port, "--dir", externalPath );
assert.soon( "c.findOne()" , "mongoldump then restore has no data w/sleep" );
assert( c.findOne() , "mongoldump then restore has no data" );
assert.eq( 1 , c.findOne().a , "mongoldump then restore has no broken data" );

resetDbpath( externalPath );

assert.eq( -1 , fileSize() , "mongolexport prep invalid" );
runMongoProgram( "mongolexport", "--host", "127.0.0.1:" + m.port, "-d", baseName, "-c", baseName, "--out", externalFile );
assert.lt( 10 , fileSize() , "file size changed" );

c.drop();
runMongoProgram( "mongolimport", "--host", "127.0.0.1:" + m.port, "-d", baseName, "-c", baseName, "--file", externalFile );
assert.soon( "c.findOne()" , "mongol import json A" );
assert( c.findOne() && 1 == c.findOne().a , "mongol import json B" );
