'use strict';

/**
 * Represents a MongoDB cluster.
 */

var Cluster = function(options) {
    if (!(this instanceof Cluster)) {
        return new Cluster(options);
    }

    function validateClusterOptions(options) {
        var allowedKeys = [
            'masterSlave',
            'replication',
            'sameCollection',
            'sameDB',
            'setupFunctions',
            'sharded',
            'useLegacyConfigServers'
            ];

        Object.keys(options).forEach(function(option) {
            assert.contains(option, allowedKeys,
                'invalid option: ' + tojson(option) +
                '; valid options are: ' + tojson(allowedKeys));
        });

        options.masterSlave = options.masterSlave || false;
        assert.eq('boolean', typeof options.masterSlave);

        options.replication = options.replication || false;
        assert.eq('boolean', typeof options.replication);

        options.sameCollection = options.sameCollection || false;
        assert.eq('boolean', typeof options.sameCollection);

        options.sameDB = options.sameDB || false;
        assert.eq('boolean', typeof options.sameDB);

        options.sharded = options.sharded || false;
        assert.eq('boolean', typeof options.sharded);

        if (typeof options.useLegacyConfigServers !== 'undefined') {
            assert(options.sharded, "Must be sharded if 'useLegacyConfigServers' is specified");
        }

        options.useLegacyConfigServers = options.useLegacyConfigServers || false;
        assert.eq('boolean', typeof options.useLegacyConfigServers);

        options.setupFunctions = options.setupFunctions || {};
        assert.eq('object', typeof options.setupFunctions);

        options.setupFunctions.mongold = options.setupFunctions.mongold || function(db) { };
        assert.eq('function', typeof options.setupFunctions.mongold);

        options.setupFunctions.mongols = options.setupFunctions.mongols || function(db) { };
        assert.eq('function', typeof options.setupFunctions.mongols);

        assert(!options.masterSlave || !options.replication, "Both 'masterSlave' and " +
               "'replication' cannot be true");
        assert(!options.masterSlave || !options.sharded, "Both 'masterSlave' and 'sharded' cannot" +
               "be true");
    }

    var conn;

    var st;

    var initialized = false;

    var _conns = {
        mongols: [],
        mongold: []
    };
    var nextConn = 0;
    var primaries = [];

    // TODO: Define size of replica set from options
    var replSetNodes = 3;

    validateClusterOptions(options);
    Object.freeze(options);

    this.setup = function setup() {
        var verbosityLevel = 0;

        if (initialized) {
            throw new Error('cluster has already been initialized');
        }

        if (options.sharded) {
            // TODO: allow 'options' to specify the number of shards and mongols processes
            var shardConfig = {
                shards: 2,
                mongols: 2,
                // Legacy config servers are pre-3.2 style, 3-node non-replica-set config servers
                sync: options.useLegacyConfigServers,
                verbose: verbosityLevel
            };

            // TODO: allow 'options' to specify an 'rs' config
            if (options.replication) {
                shardConfig.rs = {
                    nodes: replSetNodes,
                    // Increase the oplog size (in MB) to prevent rollover
                    // during write-heavy workloads
                    oplogSize: 1024,
                    verbose: verbosityLevel
                };
            }

            st = new ShardingTest(shardConfig);

            conn = st.s; // mongols

            this.shardCollection = function() {
                st.shardColl.apply(st, arguments);
            };

            this.teardown = function() {
                st.stop();
            };

            // Save all mongols and mongold connections
            var i = 0;
            var mongols = st.s0;
            var mongold = st.d0;
            while (mongols) {
                _conns.mongols.push(mongols);
                ++i;
                mongols = st['s' + i];
            }
            if (options.replication) {
                var rsTest = st.rs0;

                i = 0;
                while (rsTest) {
                    this._addReplicaSetConns(rsTest);
                    primaries.push(rsTest.getPrimary());
                    ++i;
                    rsTest = st['rs' + i];
                }
            }
            i = 0;
            while (mongold) {
                _conns.mongold.push(mongold);
                ++i;
                mongold = st['d' + i];
            }
        } else if (options.replication) {
            // TODO: allow 'options' to specify the number of nodes
            var replSetConfig = {
                nodes: replSetNodes,
                // Increase the oplog size (in MB) to prevent rollover during write-heavy workloads
                oplogSize: 1024,
                nodeOptions: { verbose: verbosityLevel }
            };

            var rst = new ReplSetTest(replSetConfig);
            rst.startSet();

            // Send the replSetInitiate command and wait for initiation
            rst.initiate();
            rst.awaitSecondaryNodes();

            conn = rst.getPrimary();
            primaries = [conn];

            this.teardown = function() {
                rst.stopSet();
            };

            this._addReplicaSetConns(rst);

        } else if (options.masterSlave) {
            var rt = new ReplTest('replTest');

            var master = rt.start(true);
            var slave = rt.start(false);
            conn = master;

            master.adminCommand({ setParameter: 1, logLevel: verbosityLevel });
            slave.adminCommand({ setParameter: 1, logLevel: verbosityLevel });

            this.teardown = function() {
                rt.stop();
            };

            _conns.mongold = [master, slave];

        } else { // standalone server
            conn = db.getMongo();
            db.adminCommand({ setParameter: 1, logLevel: verbosityLevel });

            _conns.mongold = [conn];
        }

        initialized = true;

        this.executeOnMongodNodes(options.setupFunctions.mongold);
        this.executeOnMongosNodes(options.setupFunctions.mongols);
    };


    this._addReplicaSetConns = function _addReplicaSetConns(rsTest) {
        _conns.mongold.push(rsTest.getPrimary());
        rsTest.getSecondaries().forEach(function (secondaryConn) {
            _conns.mongold.push(secondaryConn);
        });
    };

    this.executeOnMongodNodes = function executeOnMongodNodes(fn) {
        if (!initialized) {
            throw new Error('cluster must be initialized before functions can be executed ' +
                            'against it');
        }
        if (!fn || typeof(fn) !== 'function' || fn.length !== 1) {
            throw new Error('mongold function must be a function that takes a db as an argument');
        }
        _conns.mongold.forEach(function(mongoldConn) {
            fn(mongoldConn.getDB('admin'));
        });
    };

    this.executeOnMongosNodes = function executeOnMongosNodes(fn) {
        if (!initialized) {
            throw new Error('cluster must be initialized before functions can be executed ' +
                            'against it');
        }
        if (!fn || typeof(fn) !== 'function' || fn.length !== 1) {
            throw new Error('mongols function must be a function that takes a db as an argument');
        }
        _conns.mongols.forEach(function(mongolsConn) {
            fn(mongolsConn.getDB('admin'));
        });
    };

    this.teardown = function teardown() { };

    this.getDB = function getDB(dbName) {
        if (!initialized) {
            throw new Error('cluster has not been initialized yet');
        }

        return conn.getDB(dbName);
    };

    this.getHost = function getHost() {
        if (!initialized) {
            throw new Error('cluster has not been initialized yet');
        }

        // Alternate mongols connections for sharded clusters
        if (this.isSharded()) {
            return _conns.mongols[nextConn++ % _conns.mongols.length].host;
        }
        return conn.host;
    };

    this.isSharded = function isSharded() {
        return !!options.sharded;
    };

    this.isReplication = function isReplication() {
        return !!options.replication;
    };

    this.shardCollection = function shardCollection() {
        assert(this.isSharded(), 'cluster is not sharded');
        throw new Error('cluster has not been initialized yet');
    };

    // Provide a serializable form of the cluster for use in workload states. This
    // method is required because we don't currently support the serialization of Mongo
    // connection objects.
    //
    // Serialized format:
    // {
    //      mongols: [
    //          "localhost:30998",
    //          "localhost:30999"
    //      ],
    //      config: [
    //          "localhost:29000",
    //          "localhost:29001",
    //          "localhost:29002"
    //      ],
    //      shards: {
    //          "test-rs0": [
    //              "localhost:20006",
    //              "localhost:20007",
    //              "localhost:20008"
    //          ],
    //          "test-rs1": [
    //              "localhost:20009",
    //              "localhost:20010",
    //              "localhost:20011"
    //          ]
    //      }
    // }
    this.getSerializedCluster = function getSerializedCluster() {
        // TODO: Add support for non-sharded clusters.
        if (!this.isSharded()) {
            return '';
        }

        var cluster = {
            mongols: [],
            config: [],
            shards: {}
        };

        var i = 0;
        var mongols = st.s0;
        while (mongols) {
            cluster.mongols.push(mongols.name);
            ++i;
            mongols = st['s' + i];
        }

        i = 0;
        var config = st.c0;
        while (config) {
            cluster.config.push(config.name);
            ++i;
            config = st['c' + i];
        }

        i = 0;
        var shard = st.shard0;
        while (shard) {
            if (shard.name.includes('/')) {
                // If the shard is a replica set, the format of st.shard0.name in ShardingTest is
                // "test-rs0/localhost:20006,localhost:20007,localhost:20008".
                var [setName, shards] = shard.name.split('/');
                cluster.shards[setName] = shards.split(',');
            } else {
                // If the shard is a standalone mongold, the format of st.shard0.name in ShardingTest
                // is "localhost:20006".
                cluster.shards[i] = [shard.name];
            }
            ++i;
            shard = st['shard' + i];
        }
        return cluster;
    }

    this.startBalancer = function startBalancer() {
        assert(this.isSharded(), 'cluster is not sharded');
        st.startBalancer();
    };

    this.stopBalancer = function stopBalancer() {
        assert(this.isSharded(), 'cluster is not sharded');
        st.stopBalancer();
    };

    this.awaitReplication = function awaitReplication() {
        if (this.isReplication()) {
            var wc = {
                writeConcern: {
                    w: replSetNodes, // all nodes in replica set
                    wtimeout: 300000 // wait up to 5 minutes
                }
            };
            primaries.forEach(function(primary) {
                var startTime = Date.now();
                jsTest.log(primary.host + ': awaitReplication started');

                // Insert a document with a writeConcern for all nodes in the replica set to
                // ensure that all previous workload operations have completed on secondaries
                var result = primary.getDB('test').fsm_teardown.insert({ a: 1 }, wc);
                assert.writeOK(result, 'teardown insert failed: ' + tojson(result));
                assert(primary.getDB('test').fsm_teardown.drop(), 'teardown drop failed');

                var totalTime = Date.now() - startTime;
                jsTest.log(primary.host + ': awaitReplication completed in ' + totalTime + ' ms');
            });
        }
    };
};

/**
 * Returns true if 'clusterOptions' represents a standalone mongold,
 * and false otherwise.
 */
Cluster.isStandalone = function isStandalone(clusterOptions) {
    return !clusterOptions.sharded && !clusterOptions.replication && !clusterOptions.masterSlave;
};
