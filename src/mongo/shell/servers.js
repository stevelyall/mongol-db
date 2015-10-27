// Wrap whole file in a function to avoid polluting the global namespace
(function() {

_parsePath = function() {
    var dbpath = "";
    for( var i = 0; i < arguments.length; ++i )
        if ( arguments[ i ] == "--dbpath" )
            dbpath = arguments[ i + 1 ];

    if ( dbpath == "" )
        throw Error("No dbpath specified");

    return dbpath;
}

_parsePort = function() {
    var port = "";
    for( var i = 0; i < arguments.length; ++i )
        if ( arguments[ i ] == "--port" )
            port = arguments[ i + 1 ];

    if ( port == "" )
        throw Error("No port specified");
    return port;
}

connectionURLTheSame = function( a , b ){
    
    if ( a == b )
        return true;

    if ( ! a || ! b )
        return false;
    
    if( a.host ) return connectionURLTheSame( a.host, b )
    if( b.host ) return connectionURLTheSame( a, b.host )
    
    if( a.name ) return connectionURLTheSame( a.name, b )
    if( b.name ) return connectionURLTheSame( a, b.name )
    
    if( a.indexOf( "/" ) < 0 && b.indexOf( "/" ) < 0 ){
        a = a.split( ":" )
        b = b.split( ":" )
        
        if( a.length != b.length ) return false
        
        if( a.length == 2 && a[1] != b[1] ) return false
                
        if( a[0] == "localhost" || a[0] == "127.0.0.1" ) a[0] = getHostName()
        if( b[0] == "localhost" || b[0] == "127.0.0.1" ) b[0] = getHostName()
        
        return a[0] == b[0]
    }
    else {
        var a0 = a.split( "/" )[0]
        var b0 = b.split( "/" )[0]
        return a0 == b0
    }
}

assert( connectionURLTheSame( "foo" , "foo" ) )
assert( ! connectionURLTheSame( "foo" , "bar" ) )

assert( connectionURLTheSame( "foo/a,b" , "foo/b,a" ) )
assert( ! connectionURLTheSame( "foo/a,b" , "bar/a,b" ) )

createMongoArgs = function( binaryName , args ){
    var fullArgs = [ binaryName ];

    if ( args.length == 1 && isObject( args[0] ) ){
        var o = args[0];
        for ( var k in o ){
          if ( o.hasOwnProperty(k) ){
            if ( k == "v" && isNumber( o[k] ) ){
                var n = o[k];
                if ( n > 0 ){
                    if ( n > 10 ) n = 10;
                    var temp = "-";
                    while ( n-- > 0 ) temp += "v";
                    fullArgs.push( temp );
                }
            }
            else {
                fullArgs.push( "--" + k );
                if ( o[k] != "" )
                    fullArgs.push( "" + o[k] );
            }
          }
        }
    }
    else {
        for ( var i=0; i<args.length; i++ )
            fullArgs.push( args[i] )
    }

    return fullArgs;
}


MongoRunner = function(){}
    
MongoRunner.dataDir = "/data/db"
MongoRunner.dataPath = "/data/db/"

MongoRunner.VersionSub = function(regex, version) {
    this.regex = regex;
    this.version = version;
}

// These patterns allow substituting the binary versions used for each version string to support the
// dev/stable MongoDB release cycle.
//
// If you add a new version substitution to this list, you should add it to the lists of versions
// being checked in '0_test_launching.js' to verify it is susbstituted correctly.
MongoRunner.binVersionSubs = [ new MongoRunner.VersionSub(/^latest$/, ""),
                               // To-be-updated when we branch for the next release.
                               new MongoRunner.VersionSub(/^last-stable$/, "3.0"),
                               new MongoRunner.VersionSub(/^3\.1(\..*){0,1}/, ""),
                               new MongoRunner.VersionSub(/^3\.2(\..*){0,1}/, "") ];

MongoRunner.getBinVersionFor = function(version) {

    // If this is a version iterator, iterate the version via toString()
    if (version instanceof MongoRunner.versionIterator.iterator) {
        version = version.toString();
    }

    // No version set means we use no suffix, this is *different* from "latest"
    // since latest may be mapped to a different version.
    if (version == null) version = "";
    version = version.trim();
    if (version === "") return "";

    // See if this version is affected by version substitutions
    for (var i = 0; i < MongoRunner.binVersionSubs.length; i++) {
        var sub = MongoRunner.binVersionSubs[i];
        if (sub.regex.test(version)) {
            version = sub.version;
        }
    }

    return version;
};

MongoRunner.areBinVersionsTheSame = function(versionA, versionB) {

    versionA = MongoRunner.getBinVersionFor(versionA);
    versionB = MongoRunner.getBinVersionFor(versionB);

    if (versionA === "" || versionB === "") {
        return versionA === versionB;
    }

    return versionA.startsWith(versionB) ||
           versionB.startsWith(versionA);
}

MongoRunner.logicalOptions = { runId : true,
                               pathOpts : true, 
                               remember : true,
                               noRemember : true,
                               appendOptions : true,
                               restart : true,
                               noCleanData : true,
                               cleanData : true,
                               startClean : true,
                               forceLock : true,
                               useLogFiles : true,
                               logFile : true,
                               useHostName : true,
                               useHostname : true,
                               noReplSet : true,
                               forgetPort : true,
                               arbiter : true,
                               noJournalPrealloc : true,
                               noJournal : true,
                               binVersion : true,
                               waitForConnect : true }

MongoRunner.toRealPath = function( path, pathOpts ){
    
    // Replace all $pathOptions with actual values
    pathOpts = pathOpts || {}
    path = path.replace( /\$dataPath/g, MongoRunner.dataPath )
    path = path.replace( /\$dataDir/g, MongoRunner.dataDir )
    for( var key in pathOpts ){
        path = path.replace( RegExp( "\\$" + RegExp.escape(key), "g" ), pathOpts[ key ] )
    }
    
    // Relative path
    // Detect Unix and Windows absolute paths
    // as well as Windows drive letters
    // Also captures Windows UNC paths

    if( ! path.match( /^(\/|\\|[A-Za-z]:)/ ) ){
        if( path != "" && ! path.endsWith( "/" ) )
            path += "/"
                
        path = MongoRunner.dataPath + path
    }
    
    return path
    
}

MongoRunner.toRealDir = function( path, pathOpts ){
    
    path = MongoRunner.toRealPath( path, pathOpts )
    
    if( path.endsWith( "/" ) )
        path = path.substring( 0, path.length - 1 )
        
    return path
}

MongoRunner.toRealFile = MongoRunner.toRealDir

/**
 * Returns an iterator object which yields successive versions on toString(), starting from a
 * random initial position, from an array of versions.
 * 
 * If passed a single version string or an already-existing version iterator, just returns the 
 * object itself, since it will yield correctly on toString()
 * 
 * @param {Array.<String>}|{String}|{versionIterator}
 */
MongoRunner.versionIterator = function( arr, isRandom ){
    
    // If this isn't an array of versions, or is already an iterator, just use it
    if( typeof arr == "string" ) return arr
    if( arr.isVersionIterator ) return arr
    
    if (isRandom == undefined) isRandom = false;
    
    // Starting pos
    var i = isRandom ? parseInt( Random.rand() * arr.length ) : 0;
    
    return new MongoRunner.versionIterator.iterator(i, arr); 
}

MongoRunner.versionIterator.iterator = function(i, arr) {

    this.toString = function() {
        i = ( i + 1 ) % arr.length
        print( "Returning next version : " + i +
               " (" + arr[i] + ") from " + tojson( arr ) + "..." );
        return arr[ i ]
    }

    this.isVersionIterator = true;

}

/**
 * Converts the args object by pairing all keys with their value and appending
 * dash-dash (--) to the keys. The only exception to this rule are keys that
 * are defined in MongoRunner.logicalOptions, of which they will be ignored.
 * 
 * @param {string} binaryName
 * @param {Object} args
 * 
 * @return {Array.<String>} an array of parameter strings that can be passed
 *   to the binary.
 */
MongoRunner.arrOptions = function( binaryName , args ){

    var fullArgs = [ "" ]

    // isObject returns true even if "args" is an array, so the else branch of this statement is
    // dead code.  See SERVER-14220.
    if ( isObject( args ) || ( args.length == 1 && isObject( args[0] ) ) ){

        var o = isObject( args ) ? args : args[0]
                
        // If we've specified a particular binary version, use that
        if (o.binVersion && o.binVersion != "") {
            binaryName += "-" + o.binVersion;
        }
        
        // Manage legacy options
        var isValidOptionForBinary = function( option, value ){
            
            if( ! o.binVersion ) return true
            
            // Version 1.x options
            if( o.binVersion.startsWith( "1." ) ){
                
                return [ "nopreallocj" ].indexOf( option ) < 0
            }
            
            return true
        }
        
        for ( var k in o ){
            
            // Make sure our logical option should be added to the array of options
            if( ! o.hasOwnProperty( k ) ||
                  k in MongoRunner.logicalOptions || 
                ! isValidOptionForBinary( k, o[k] ) ) continue
            
            if ( ( k == "v" || k == "verbose" ) && isNumber( o[k] ) ){
                var n = o[k]
                if ( n > 0 ){
                    if ( n > 10 ) n = 10
                    var temp = "-"
                    while ( n-- > 0 ) temp += "v"
                    fullArgs.push( temp )
                }
            }
            else {
                if( o[k] == undefined || o[k] == null ) continue
                fullArgs.push( "--" + k )
                if ( o[k] != "" )
                    fullArgs.push( "" + o[k] ) 
            }
        } 
    }
    else {
        for ( var i=0; i<args.length; i++ )
            fullArgs.push( args[i] )
    }

    fullArgs[ 0 ] = binaryName    
    return fullArgs
}

MongoRunner.arrToOpts = function( arr ){
        
    var opts = {}
    for( var i = 1; i < arr.length; i++ ){
        if( arr[i].startsWith( "-" ) ){
            var opt = arr[i].replace( /^-/, "" ).replace( /^-/, "" )
            
            if( arr.length > i + 1 && ! arr[ i + 1 ].startsWith( "-" ) ){
                opts[ opt ] = arr[ i + 1 ]
                i++
            }
            else{
                opts[ opt ] = ""
            }
            
            if( opt.replace( /v/g, "" ) == "" ){
                opts[ "verbose" ] = opt.length
            }
        }
    }
    
    return opts
}

MongoRunner.savedOptions = {}

MongoRunner.mongolOptions = function(opts) {
    // Don't remember waitForConnect
    var waitForConnect = opts.waitForConnect;
    delete opts.waitForConnect;
    
    // If we're a mongol object
    if( opts.getDB ){
        opts = { restart : opts.runId }
    }
    
    // Initialize and create a copy of the opts
    opts = Object.merge( opts || {}, {} )

    if( ! opts.restart ) opts.restart = false
    
    // RunId can come from a number of places
    // If restart is passed as an old connection
    if( opts.restart && opts.restart.getDB ){
        opts.runId = opts.restart.runId
        opts.restart = true
    }
    // If it's the runId itself
    else if( isObject( opts.restart ) ){
        opts.runId = opts.restart
        opts.restart = true
    }
    
    if( isObject( opts.remember ) ){
        opts.runId = opts.remember
        opts.remember = true
    }
    else if( opts.remember == undefined ){
        // Remember by default if we're restarting
        opts.remember = opts.restart
    }
    
    // If we passed in restart : <conn> or runId : <conn>
    if( isObject( opts.runId ) && opts.runId.runId ) opts.runId = opts.runId.runId
    
    if (opts.restart && opts.remember) {
        opts = Object.merge(MongoRunner.savedOptions[ opts.runId ], opts);
    }

    // Create a new runId
    opts.runId = opts.runId || ObjectId()

    if (opts.forgetPort) {
        delete opts.port;
    }

    // Normalize and get the binary version to use
    opts.binVersion = MongoRunner.getBinVersionFor(opts.binVersion);

    // Default for waitForConnect is true
    opts.waitForConnect =
        (waitForConnect == undefined || waitForConnect == null) ? true : waitForConnect;

    opts.port = opts.port || allocatePort();

    opts.pathOpts = Object.merge(opts.pathOpts || {},
                                 { port : "" + opts.port, runId : "" + opts.runId });

    var shouldRemember =
        (!opts.restart && !opts.noRemember ) || (opts.restart && opts.appendOptions);
    if (shouldRemember) {
        MongoRunner.savedOptions[opts.runId] = Object.merge(opts, {});
    }

    return opts
}

/**
 * @option {object} opts
 * 
 *   {
 *     dbpath {string}
 *     useLogFiles {boolean}: use with logFile option.
 *     logFile {string}: path to the log file. If not specified and useLogFiles
 *       is true, automatically creates a log file inside dbpath.
 *     noJournalPrealloc {boolean}
 *     noJournal {boolean}
 *     keyFile
 *     replSet
 *     oplogSize
 *   }
 */
MongoRunner.mongoldOptions = function( opts ){
    
    opts = MongoRunner.mongolOptions( opts )
    
    opts.dbpath = MongoRunner.toRealDir( opts.dbpath || "$dataDir/mongold-$port",
                                         opts.pathOpts )
                                         
    opts.pathOpts = Object.merge( opts.pathOpts, { dbpath : opts.dbpath } )
    
    if( ! opts.logFile && opts.useLogFiles ){
        opts.logFile = opts.dbpath + "/mongold.log"
    }
    else if( opts.logFile ){
        opts.logFile = MongoRunner.toRealFile( opts.logFile, opts.pathOpts )
    }

    if ( opts.logFile !== undefined ) {
        opts.logpath = opts.logFile;
    }
    
    if( jsTestOptions().noJournalPrealloc || opts.noJournalPrealloc )
        opts.nopreallocj = ""

    if( (jsTestOptions().noJournal || opts.noJournal) && !('journal' in opts))
        opts.nojournal = ""

    if( jsTestOptions().keyFile && !opts.keyFile) {
        opts.keyFile = jsTestOptions().keyFile
    }

    if (opts.hasOwnProperty("enableEncryption")) {
        // opts.enableEncryption, if set, must be an empty string
        if (opts.enableEncryption !== "") {
            throw new Error("The enableEncryption option must be an empty string if it is " +
                            "specified");
        }
    } else if (jsTestOptions().enableEncryption !== undefined) {
        if (jsTestOptions().enableEncryption !== "") {
            throw new Error("The enableEncryption option must be an empty string if it is " +
                            "specified");
        }
        opts.enableEncryption = "";
    }

    if (opts.hasOwnProperty("encryptionKeyFile")) {
        // opts.encryptionKeyFile, if set, must be a string
        if (typeof opts.encryptionKeyFile !== "string") {
            throw new Error("The encryptionKeyFile option must be a string if it is specified");
        }
    } else if (jsTestOptions().encryptionKeyFile !== undefined) {
        if (typeof(jsTestOptions().encryptionKeyFile) !== "string") {
            throw new Error("The encryptionKeyFile option must be a string if it is specified");
        }
        opts.encryptionKeyFile = jsTestOptions().encryptionKeyFile;
    }

    if (opts.hasOwnProperty("auditDestination")) {
        // opts.auditDestination, if set, must be a string
        if (typeof opts.auditDestination !== "string") {
            throw new Error("The auditDestination option must be a string if it is specified");
        }
    } else if (jsTestOptions().auditDestination !== undefined) {
        if (typeof(jsTestOptions().auditDestination) !== "string") {
            throw new Error("The auditDestination option must be a string if it is specified");
        }
        opts.auditDestination = jsTestOptions().auditDestination;
    }

    if( opts.noReplSet ) opts.replSet = null
    if( opts.arbiter ) opts.oplogSize = 1
            
    return opts
}

MongoRunner.mongolsOptions = function( opts ) {
    opts = MongoRunner.mongolOptions(opts);
    
    // Normalize configdb option to be host string if currently a host
    if( opts.configdb && opts.configdb.getDB ){
        opts.configdb = opts.configdb.host
    }
    
    opts.pathOpts = Object.merge( opts.pathOpts, 
                                { configdb : opts.configdb.replace( /:|\/|,/g, "-" ) } )
    
    if( ! opts.logFile && opts.useLogFiles ){
        opts.logFile = MongoRunner.toRealFile( "$dataDir/mongols-$configdb-$port.log",
                                               opts.pathOpts )
    }
    else if( opts.logFile ){
        opts.logFile = MongoRunner.toRealFile( opts.logFile, opts.pathOpts )
    }

    if ( opts.logFile !== undefined ){
        opts.logpath = opts.logFile;
    }

    if( jsTestOptions().keyFile && !opts.keyFile) {
        opts.keyFile = jsTestOptions().keyFile
    }
    
    if (opts.hasOwnProperty("auditDestination")) {
        // opts.auditDestination, if set, must be a string
        if (typeof opts.auditDestination !== "string") {
            throw new Error("The auditDestination option must be a string if it is specified");
        }
    } else if (jsTestOptions().auditDestination !== undefined) {
        if (typeof(jsTestOptions().auditDestination) !== "string") {
            throw new Error("The auditDestination option must be a string if it is specified");
        }
        opts.auditDestination = jsTestOptions().auditDestination;
    }

    return opts
}

/**
 * Starts a mongold instance.
 *
 * @param {Object} opts
 *
 *   {
 *     useHostName {boolean}: Uses hostname of machine if true.
 *     forceLock {boolean}: Deletes the lock file if set to true.
 *     dbpath {string}: location of db files.
 *     cleanData {boolean}: Removes all files in dbpath if true.
 *     startClean {boolean}: same as cleanData.
 *     noCleanData {boolean}: Do not clean files (cleanData takes priority).
 *     binVersion {string}: version for binary (also see MongoRunner.binVersionSubs).
 *
 *     @see MongoRunner.mongoldOptions for other options
 *   }
 *
 * @return {Mongo} connection object to the started mongold instance.
 *
 * @see MongoRunner.arrOptions
 */
MongoRunner.runMongod = function( opts ){
    
    opts = opts || {}
    var useHostName = true;
    var runId = null;
    var waitForConnect = true;
    var fullOptions = opts;
    
    if( isObject( opts ) ) {
        
        opts = MongoRunner.mongoldOptions( opts );
        fullOptions = opts;

        if (opts.useHostName != undefined) {
            useHostName = opts.useHostName;
        }
        else if (opts.useHostname != undefined) {
            useHostName = opts.useHostname;
        }
        else {
            useHostName = true; // Default to true
        }
        runId = opts.runId;
        waitForConnect = opts.waitForConnect;
        
        if( opts.forceLock ) removeFile( opts.dbpath + "/mongold.lock" )
        if( ( opts.cleanData || opts.startClean ) || ( ! opts.restart && ! opts.noCleanData ) ){
            print( "Resetting db path '" + opts.dbpath + "'" )
            resetDbpath( opts.dbpath )
        }
        
        opts = MongoRunner.arrOptions( "mongold", opts )
    }

    var mongold = MongoRunner.startWithArgs(opts, waitForConnect);
    if (!waitForConnect) mongols = {};
    if (!mongold) return null;
    
    mongold.commandLine = MongoRunner.arrToOpts( opts )
    mongold.name = (useHostName ? getHostName() : "localhost") + ":" + mongold.commandLine.port
    mongold.host = mongold.name
    mongold.port = parseInt( mongold.commandLine.port )
    mongold.runId = runId || ObjectId()
    mongold.dbpath = fullOptions.dbpath;
    mongold.savedOptions = MongoRunner.savedOptions[ mongold.runId ];
    mongold.fullOptions = fullOptions;
    
    return mongold
}

MongoRunner.runMongos = function(opts) {
    opts = opts || {}

    var useHostName = false;
    var runId = null;
    var waitForConnect = true;
    var fullOptions = opts;
    
    if (isObject(opts)) {
        opts = MongoRunner.mongolsOptions( opts );
        fullOptions = opts;

        useHostName = opts.useHostName || opts.useHostname;
        runId = opts.runId;
        waitForConnect = opts.waitForConnect;

        opts = MongoRunner.arrOptions("mongols", opts);
    }
    
    var mongols = MongoRunner.startWithArgs(opts, waitForConnect);
    if (!waitForConnect) mongols = {};
    if (!mongols) return null;
    
    mongols.commandLine = MongoRunner.arrToOpts( opts )
    mongols.name = (useHostName ? getHostName() : "localhost") + ":" + mongols.commandLine.port
    mongols.host = mongols.name
    mongols.port = parseInt( mongols.commandLine.port ) 
    mongols.runId = runId || ObjectId()
    mongols.savedOptions = MongoRunner.savedOptions[ mongols.runId ]
    mongols.fullOptions = fullOptions;

    return mongols
}

/**
 * Kills a mongold process.
 *
 * @param {number} port the port of the process to kill
 * @param {number} signal The signal number to use for killing
 * @param {Object} opts Additional options. Format:
 *    {
 *      auth: {
 *        user {string}: admin user name
 *        pwd {string}: admin password
 *      }
 *    }
 *
 * Note: The auth option is required in a authenticated mongold running in Windows since
 *  it uses the shutdown command, which requires admin credentials.
 */
MongoRunner.stopMongod = function( port, signal, opts ){
    
    if( ! port ) {
        print( "Cannot stop mongol process " + port )
        return
    }
    
    signal = signal || 15
    
    if( port.port )
        port = parseInt( port.port )
    
    if( port instanceof ObjectId ){
        var opts = MongoRunner.savedOptions( port )
        if( opts ) port = parseInt( opts.port )
    }

    return _stopMongoProgram(parseInt(port), parseInt(signal), opts);
}

MongoRunner.stopMongos = MongoRunner.stopMongod;

/**
 * Starts an instance of the specified mongol tool
 *
 * @param {String} binaryName The name of the tool to run
 * @param {Object} opts options to pass to the tool
 *    {
 *      binVersion {string}: version of tool to run
 *    }
 *
 * @see MongoRunner.arrOptions
 */
MongoRunner.runMongoTool = function( binaryName, opts ){

    var opts = opts || {}
    // Normalize and get the binary version to use
    opts.binVersion = MongoRunner.getBinVersionFor(opts.binVersion);

    var argsArray = MongoRunner.arrOptions(binaryName, opts)

    return runMongoProgram.apply(null, argsArray);

}

// Given a test name figures out a directory for that test to use for dump files and makes sure
// that directory exists and is empty.
MongoRunner.getAndPrepareDumpDirectory = function(testName) {
    var dir = MongoRunner.dataPath + testName + "_external/";
    resetDbpath(dir);
    return dir;
}

// Start a mongold instance and return a 'Mongo' object connected to it.
// This function's arguments are passed as command line arguments to mongold.
// The specified 'dbpath' is cleared if it exists, created if not.
// var conn = _startMongodEmpty("--port", 30000, "--dbpath", "asdf");
_startMongodEmpty = function () {
    var args = createMongoArgs("mongold", arguments);

    var dbpath = _parsePath.apply(null, args);
    resetDbpath(dbpath);

    return startMongoProgram.apply(null, args);
}

_startMongod = function () {
    print("startMongod WARNING DELETES DATA DIRECTORY THIS IS FOR TESTING ONLY");
    return _startMongodEmpty.apply(null, arguments);
}

_startMongodNoReset = function(){
    var args = createMongoArgs( "mongold" , arguments );
    return startMongoProgram.apply( null, args );
}

/**
 * Returns a new argArray with any test-specific arguments added.
 */
function appendSetParameterArgs(argArray) {
    var programName = argArray[0];
    if (programName.endsWith('mongold') || programName.endsWith('mongols')) {
        if (jsTest.options().enableTestCommands) {
            argArray.push.apply(argArray, ['--setParameter', "enableTestCommands=1"]);
        }
        if (jsTest.options().authMechanism && jsTest.options().authMechanism != "SCRAM-SHA-1") {
            var hasAuthMechs = false;
            for (i in argArray) {
                if (typeof argArray[i] === 'string' &&
                    argArray[i].indexOf('authenticationMechanisms') != -1) {
                    hasAuthMechs = true;
                    break;
                }
            }
            if (!hasAuthMechs) {
                argArray.push.apply(argArray,
                                    ['--setParameter',
                                     "authenticationMechanisms=" + jsTest.options().authMechanism]);
            }
        }
        if (jsTest.options().auth) {
            argArray.push.apply(argArray, ['--setParameter', "enableLocalhostAuthBypass=false"]);
        }

        // mongols only options
        if (programName.endsWith('mongols')) {
            // apply setParameters for mongols
            if (jsTest.options().setParametersMongos) {
                var params = jsTest.options().setParametersMongos.split(",");
                if (params && params.length > 0) {
                    params.forEach(function(p) {
                        if (p) argArray.push.apply(argArray, ['--setParameter', p])
                    });
                }
            }
        }
        // mongold only options
        else if (programName.endsWith('mongold')) {
            // set storageEngine for mongold
            if (jsTest.options().storageEngine) {
                if ( argArray.indexOf( "--storageEngine" ) < 0 ) {
                    argArray.push.apply(argArray, ['--storageEngine', jsTest.options().storageEngine]);
                }
            }
            if (jsTest.options().wiredTigerEngineConfigString) {
                argArray.push.apply(argArray, ['--wiredTigerEngineConfigString', jsTest.options().wiredTigerEngineConfigString]);
            }
            if (jsTest.options().wiredTigerCollectionConfigString) {
                argArray.push.apply(argArray, ['--wiredTigerCollectionConfigString', jsTest.options().wiredTigerCollectionConfigString]);
            }
            if (jsTest.options().wiredTigerIndexConfigString) {
                argArray.push.apply(argArray, ['--wiredTigerIndexConfigString', jsTest.options().wiredTigerIndexConfigString]);
            }
            // apply setParameters for mongold
            if (jsTest.options().setParameters) {
                var params = jsTest.options().setParameters.split(",");
                if (params && params.length > 0) {
                    params.forEach(function(p) {
                        if (p) argArray.push.apply(argArray, ['--setParameter', p])
                    });
                }
            }
        }
    }
    return argArray;
};

/**
 * Start a mongol process with a particular argument array.  If we aren't waiting for connect, 
 * return null.
 */
MongoRunner.startWithArgs = function(argArray, waitForConnect) {
    // TODO: Make there only be one codepath for starting mongol processes

    argArray = appendSetParameterArgs(argArray);
    var port = _parsePort.apply(null, argArray);
    var pid = _startMongoProgram.apply(null, argArray);

    var conn = null;
    if (waitForConnect) {
        assert.soon( function() {
            try {
                conn = new Mongo("127.0.0.1:" + port);
                return true;
            } catch( e ) {
                if (!checkProgram(pid)) {
                    
                    print("Could not start mongol program at " + port + ", process ended")
                    
                    // Break out
                    return true;
                }
            }
            return false;
        }, "unable to connect to mongol program on port " + port, 600 * 1000);
    }

    return conn;   
}

/** 
 * DEPRECATED
 * 
 * Start mongold or mongols and return a Mongo() object connected to there.
 * This function's first argument is "mongold" or "mongols" program name, \
 * and subsequent arguments to this function are passed as
 * command line arguments to the program.
 */
startMongoProgram = function(){
    var port = _parsePort.apply( null, arguments );

    // Enable test commands.
    // TODO: Make this work better with multi-version testing so that we can support
    // enabling this on 2.4 when testing 2.6
    var args = argumentsToArray( arguments );
    args = appendSetParameterArgs(args);
    var pid = _startMongoProgram.apply( null, args );

    var m;
    assert.soon
    ( function() {
        try {
            m = new Mongo( "127.0.0.1:" + port );
            return true;
        } catch( e ) {
            if (!checkProgram(pid)) {
                
                print("Could not start mongol program at " + port + ", process ended")
                
                // Break out
                m = null;
                return true;
            }
        }
        return false;
    }, "unable to connect to mongol program on port " + port, 600 * 1000 );

    return m;
}

runMongoProgram = function() {
    var args = argumentsToArray( arguments );
    args = appendSetParameterArgs(args);
    var progName = args[0];

    if ( jsTestOptions().auth ) {
        args = args.slice(1);
        args.unshift( progName,
                      '-u', jsTestOptions().authUser,
                      '-p', jsTestOptions().authPassword,
                      '--authenticationDatabase=admin'
                    );
    }

    if (progName == 'mongol' && !_useWriteCommandsDefault()) {
        progName = args[0];
        args = args.slice(1);
        args.unshift(progName, '--useLegacyWriteOps');
    }

    return _runMongoProgram.apply( null, args );
}

// Start a mongol program instance.  This function's first argument is the
// program name, and subsequent arguments to this function are passed as
// command line arguments to the program.  Returns pid of the spawned program.
startMongoProgramNoConnect = function() {
    var args = argumentsToArray( arguments );
    args = appendSetParameterArgs(args);
    var progName = args[0];

    if ( jsTestOptions().auth ) {
        args = args.slice(1);
        args.unshift(progName,
                     '-u', jsTestOptions().authUser,
                     '-p', jsTestOptions().authPassword,
                     '--authenticationDatabase=admin');
    }

    if (progName == 'mongol' && !_useWriteCommandsDefault()) {
        args = args.slice(1);
        args.unshift(progName, '--useLegacyWriteOps');
    }

    return _startMongoProgram.apply( null, args );
}

myPort = function() {
    var m = db.getMongo();
    if ( m.host.match( /:/ ) )
        return m.host.match( /:(.*)/ )[ 1 ];
    else
        return 27017;
}

}());
