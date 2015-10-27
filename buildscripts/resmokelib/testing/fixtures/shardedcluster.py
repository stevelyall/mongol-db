"""
Sharded cluster fixture for executing JSTests against.
"""

from __future__ import absolute_import

import copy
import os.path
import time

import pymongol

from . import interface
from . import standalone
from . import replicaset
from ... import config
from ... import core
from ... import errors
from ... import logging
from ... import utils


class ShardedClusterFixture(interface.Fixture):
    """
    Fixture which provides JSTests with a sharded cluster to run
    against.
    """

    _CONFIGSVR_REPLSET_NAME = "config-rs"

    def __init__(self,
                 logger,
                 job_num,
                 mongols_executable=None,
                 mongols_options=None,
                 mongold_executable=None,
                 mongold_options=None,
                 dbpath_prefix=None,
                 preserve_dbpath=False,
                 num_shards=1,
                 separate_configsvr=True,
                 enable_sharding=None,
                 auth_options=None):
        """
        Initializes ShardedClusterFixture with the different options to
        the mongold and mongols processes.
        """

        interface.Fixture.__init__(self, logger, job_num)

        if "dbpath" in mongold_options:
            raise ValueError("Cannot specify mongold_options.dbpath")

        self.mongols_executable = mongols_executable
        self.mongols_options = utils.default_if_none(mongols_options, {})
        self.mongold_executable = mongold_executable
        self.mongold_options = utils.default_if_none(mongold_options, {})
        self.preserve_dbpath = preserve_dbpath
        self.num_shards = num_shards
        self.separate_configsvr = separate_configsvr
        self.enable_sharding = utils.default_if_none(enable_sharding, [])
        self.auth_options = auth_options

        # Command line options override the YAML configuration.
        dbpath_prefix = utils.default_if_none(config.DBPATH_PREFIX, dbpath_prefix)
        dbpath_prefix = utils.default_if_none(dbpath_prefix, config.DEFAULT_DBPATH_PREFIX)
        self._dbpath_prefix = os.path.join(dbpath_prefix,
                                           "job%d" % (self.job_num),
                                           config.FIXTURE_SUBDIR)

        self.configsvr = None
        self.mongols = None
        self.shards = []

    def setup(self):
        if self.separate_configsvr:
            if self.configsvr is None:
                self.configsvr = self._new_configsvr()
            self.configsvr.setup()

        if not self.shards:
            for i in xrange(self.num_shards):
                shard = self._new_shard(i)
                self.shards.append(shard)

        # Start up each of the shards
        for shard in self.shards:
            shard.setup()

    def await_ready(self):
        # Wait for the config server
        if self.configsvr is not None:
            self.configsvr.await_ready()

        # Wait for each of the shards
        for shard in self.shards:
            shard.await_ready()

        if self.mongols is None:
            self.mongols = self._new_mongols()

        # Start up the mongols
        self.mongols.setup()

        # Wait for the mongols
        self.mongols.await_ready()
        self.port = self.mongols.port

        client = utils.new_mongol_client(port=self.port)
        if self.auth_options is not None:
            auth_db = client[self.auth_options["authenticationDatabase"]]
            auth_db.authenticate(self.auth_options["username"],
                                 password=self.auth_options["password"],
                                 mechanism=self.auth_options["authenticationMechanism"])

        # Inform mongols about each of the shards
        for shard in self.shards:
            self._add_shard(client, shard)

        # Enable sharding on each of the specified databases
        for db_name in self.enable_sharding:
            self.logger.info("Enabling sharding for '%s' database...", db_name)
            client.admin.command({"enablesharding": db_name})

    def teardown(self):
        """
        Shuts down the sharded cluster.
        """
        running_at_start = self.is_running()
        success = True  # Still a success even if nothing is running.

        if not running_at_start:
            self.logger.info("Sharded cluster was expected to be running in teardown(), but"
                             " wasn't.")

        if self.configsvr is not None:
            if running_at_start:
                self.logger.info("Stopping config server...")

            success = self.configsvr.teardown() and success

            if running_at_start:
                self.logger.info("Successfully terminated the config server.")

        if self.mongols is not None:
            if running_at_start:
                self.logger.info("Stopping mongols...")

            success = self.mongols.teardown() and success

            if running_at_start:
                self.logger.info("Successfully terminated the mongols.")

        if running_at_start:
            self.logger.info("Stopping shards...")
        for shard in self.shards:
            success = shard.teardown() and success
        if running_at_start:
            self.logger.info("Successfully terminated all shards.")

        return success

    def is_running(self):
        """
        Returns true if the config server, all shards, and the mongols
        are all still operating, and false otherwise.
        """
        return (self.configsvr is not None and self.configsvr.is_running() and
                all(shard.is_running() for shard in self.shards) and
                self.mongols is not None and self.mongols.is_running())

    def _new_configsvr(self):
        """
        Returns a replicaset.ReplicaSetFixture configured to be used as
        the config server of a sharded cluster.
        """

        logger_name = "%s:configsvr" % (self.logger.name)
        mongold_logger = logging.loggers.new_logger(logger_name, parent=self.logger)

        mongold_options = copy.deepcopy(self.mongold_options)
        mongold_options["configsvr"] = ""
        mongold_options["dbpath"] = os.path.join(self._dbpath_prefix, "config")
        mongold_options["replSet"] = ShardedClusterFixture._CONFIGSVR_REPLSET_NAME
        mongold_options["storageEngine"] = "wiredTiger"

        return replicaset.ReplicaSetFixture(mongold_logger,
                                            self.job_num,
                                            mongold_executable=self.mongold_executable,
                                            mongold_options=mongold_options,
                                            preserve_dbpath=self.preserve_dbpath,
                                            num_nodes=3,
                                            auth_options=self.auth_options,
                                            replset_config_options={"configsvr": True})

    def _new_shard(self, index):
        """
        Returns a standalone.MongoDFixture configured to be used as a
        shard in a sharded cluster.
        """

        logger_name = "%s:shard%d" % (self.logger.name, index)
        mongold_logger = logging.loggers.new_logger(logger_name, parent=self.logger)

        mongold_options = copy.deepcopy(self.mongold_options)
        mongold_options["dbpath"] = os.path.join(self._dbpath_prefix, "shard%d" % (index))

        return standalone.MongoDFixture(mongold_logger,
                                        self.job_num,
                                        mongold_executable=self.mongold_executable,
                                        mongold_options=mongold_options,
                                        preserve_dbpath=self.preserve_dbpath)

    def _new_mongols(self):
        """
        Returns a _MongoSFixture configured to be used as the mongols for
        a sharded cluster.
        """

        logger_name = "%s:mongols" % (self.logger.name)
        mongols_logger = logging.loggers.new_logger(logger_name, parent=self.logger)

        mongols_options = copy.deepcopy(self.mongols_options)
        if self.separate_configsvr:
            configdb_replset = ShardedClusterFixture._CONFIGSVR_REPLSET_NAME
            configdb_port = self.configsvr.port
            mongols_options["configdb"] = "%s/localhost:%d" % (configdb_replset, configdb_port)
        else:
            mongols_options["configdb"] = "localhost:%d" % (self.shards[0].port)

        return _MongoSFixture(mongols_logger,
                              self.job_num,
                              mongols_executable=self.mongols_executable,
                              mongols_options=mongols_options)

    def _add_shard(self, client, shard):
        """
        Add the specified program as a shard by executing the addShard
        command.

        See https://docs.mongoldb.org/manual/reference/command/addShard
        for more details.
        """

        self.logger.info("Adding localhost:%d as a shard...", shard.port)
        client.admin.command({"addShard": "localhost:%d" % (shard.port)})


class _MongoSFixture(interface.Fixture):
    """
    Fixture which provides JSTests with a mongols to connect to.
    """

    def __init__(self,
                 logger,
                 job_num,
                 mongols_executable=None,
                 mongols_options=None):

        interface.Fixture.__init__(self, logger, job_num)

        # Command line options override the YAML configuration.
        self.mongols_executable = utils.default_if_none(config.MONGOS_EXECUTABLE, mongols_executable)

        self.mongols_options = utils.default_if_none(mongols_options, {}).copy()

        self.mongols = None

    def setup(self):
        if "chunkSize" not in self.mongols_options:
            self.mongols_options["chunkSize"] = 50

        if "port" not in self.mongols_options:
            self.mongols_options["port"] = core.network.PortAllocator.next_fixture_port(self.job_num)
        self.port = self.mongols_options["port"]

        mongols = core.programs.mongols_program(self.logger,
                                              executable=self.mongols_executable,
                                              **self.mongols_options)
        try:
            self.logger.info("Starting mongols on port %d...\n%s", self.port, mongols.as_command())
            mongols.start()
            self.logger.info("mongols started on port %d with pid %d.", self.port, mongols.pid)
        except:
            self.logger.exception("Failed to start mongols on port %d.", self.port)
            raise

        self.mongols = mongols

    def await_ready(self):
        deadline = time.time() + standalone.MongoDFixture.AWAIT_READY_TIMEOUT_SECS

        # Wait until the mongols is accepting connections. The retry logic is necessary to support
        # versions of PyMongo <3.0 that immediately raise a ConnectionFailure if a connection cannot
        # be established.
        while True:
            # Check whether the mongols exited for some reason.
            if self.mongols.poll() is not None:
                raise errors.ServerFailure("Could not connect to mongols on port %d, process ended"
                                           " unexpectedly." % (self.port))

            try:
                # Use a shorter connection timeout to more closely satisfy the requested deadline.
                client = utils.new_mongol_client(self.port, timeout_millis=500)
                client.admin.command("ping")
                break
            except pymongol.errors.ConnectionFailure:
                remaining = deadline - time.time()
                if remaining <= 0.0:
                    raise errors.ServerFailure(
                        "Failed to connect to mongols on port %d after %d seconds"
                        % (self.port, standalone.MongoDFixture.AWAIT_READY_TIMEOUT_SECS))

                self.logger.info("Waiting to connect to mongols on port %d.", self.port)
                time.sleep(0.1)  # Wait a little bit before trying again.

        self.logger.info("Successfully contacted the mongols on port %d.", self.port)

    def teardown(self):
        running_at_start = self.is_running()
        success = True  # Still a success even if nothing is running.

        if not running_at_start and self.port is not None:
            self.logger.info("mongols on port %d was expected to be running in teardown(), but"
                             " wasn't." % (self.port))

        if self.mongols is not None:
            if running_at_start:
                self.logger.info("Stopping mongols on port %d with pid %d...",
                                 self.port,
                                 self.mongols.pid)
                self.mongols.stop()

            exit_code = self.mongols.wait()
            success = exit_code == 0

            if running_at_start:
                self.logger.info("Successfully terminated the mongols on port %d, exited with code"
                                 " %d",
                                 self.port,
                                 exit_code)

        return success

    def is_running(self):
        return self.mongols is not None and self.mongols.poll() is None
