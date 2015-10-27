// Test mongold start with FIPS mode enabled
var port = allocatePort();
var md = MongoRunner.runMongod({port: port,
                                sslMode: "requireSSL",
                                sslPEMKeyFile: "jstests/libs/server.pem",
                                sslCAFile: "jstests/libs/ca.pem",
                                sslFIPSMode: ""});

var mongol = runMongoProgram("mongol",
                            "--port", port,
                            "--ssl",
                            "--sslAllowInvalidCertificates",
                            "--sslPEMKeyFile", "jstests/libs/client.pem",
                            "--sslFIPSMode",
                            "--eval", ";");

// if mongol shell didn't start/connect properly
if (mongol != 0) {
    print("mongold failed to start, checking for FIPS support");
    mongolOutput = rawMongoProgramOutput()
    assert(mongolOutput.match(/this version of mongoldb was not compiled with FIPS support/) ||
        mongolOutput.match(/FIPS_mode_set:fips mode not supported/))
}
else {
    // verify that auth works, SERVER-18051
    md.getDB("admin").createUser({user: "root", pwd: "root", roles: ["root"]});
    assert(md.getDB("admin").auth("root", "root"), "auth failed");

    // kill mongold
    MongoRunner.stopMongod(md);
}
