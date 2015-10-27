"""
Standalone mongold fixture for executing JSTests against.
"""

from __future__ import absolute_import

import os
import os.path
import shutil
import time

import pymongol

from . import interface
from ... import config
from ... import core
from ... import errors
from ... import utils


class MongoDFixture(interface.Fixture):
    """
    Fixture which provides JSTests with a standalone mongold to run
    against.
    """

    AWAIT_READY_TIMEOUT_SECS = 300

    def __init__(self,
                 logger,
                 job_num,
                 mongold_executable=None,
                 mongold_options=None,
                 dbpath_prefix=None,
                 preserve_dbpath=False):

        interface.Fixture.__init__(self, logger, job_num)

        if "dbpath" in mongold_options and dbpath_prefix is not None:
            raise ValueError("Cannot specify both mongold_options.dbpath and dbpath_prefix")

        # Command line options override the YAML configuration.
        self.mongold_executable = utils.default_if_none(config.MONGOD_EXECUTABLE, mongold_executable)

        self.mongold_options = utils.default_if_none(mongold_options, {}).copy()
        self.preserve_dbpath = preserve_dbpath

        # The dbpath in mongold_options takes precedence over other settings to make it easier for
        # users to specify a dbpath containing data to test against.
        if "dbpath" not in self.mongold_options:
            # Command line options override the YAML configuration.
            dbpath_prefix = utils.default_if_none(config.DBPATH_PREFIX, dbpath_prefix)
            dbpath_prefix = utils.default_if_none(dbpath_prefix, config.DEFAULT_DBPATH_PREFIX)
            self.mongold_options["dbpath"] = os.path.join(dbpath_prefix,
                                                         "job%d" % (self.job_num),
                                                         config.FIXTURE_SUBDIR)
        self._dbpath = self.mongold_options["dbpath"]

        self.mongold = None

    def setup(self):
        if not self.preserve_dbpath:
            shutil.rmtree(self._dbpath, ignore_errors=True)

        try:
            os.makedirs(self._dbpath)
        except os.error:
            # Directory already exists.
            pass

        if "port" not in self.mongold_options:
            self.mongold_options["port"] = core.network.PortAllocator.next_fixture_port(self.job_num)
        self.port = self.mongold_options["port"]

        mongold = core.programs.mongold_program(self.logger,
                                              executable=self.mongold_executable,
                                              **self.mongold_options)
        try:
            self.logger.info("Starting mongold on port %d...\n%s", self.port, mongold.as_command())
            mongold.start()
            self.logger.info("mongold started on port %d with pid %d.", self.port, mongold.pid)
        except:
            self.logger.exception("Failed to start mongold on port %d.", self.port)
            raise

        self.mongold = mongold

    def await_ready(self):
        deadline = time.time() + MongoDFixture.AWAIT_READY_TIMEOUT_SECS

        # Wait until the mongold is accepting connections. The retry logic is necessary to support
        # versions of PyMongo <3.0 that immediately raise a ConnectionFailure if a connection cannot
        # be established.
        while True:
            # Check whether the mongold exited for some reason.
            if self.mongold.poll() is not None:
                raise errors.ServerFailure("Could not connect to mongold on port %d, process ended"
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
                        "Failed to connect to mongold on port %d after %d seconds"
                        % (self.port, MongoDFixture.AWAIT_READY_TIMEOUT_SECS))

                self.logger.info("Waiting to connect to mongold on port %d.", self.port)
                time.sleep(0.1)  # Wait a little bit before trying again.

        self.logger.info("Successfully contacted the mongold on port %d.", self.port)

    def teardown(self):
        running_at_start = self.is_running()
        success = True  # Still a success even if nothing is running.

        if not running_at_start and self.port is not None:
            self.logger.info("mongold on port %d was expected to be running in teardown(), but"
                             " wasn't." % (self.port))

        if self.mongold is not None:
            if running_at_start:
                self.logger.info("Stopping mongold on port %d with pid %d...",
                                 self.port,
                                 self.mongold.pid)
                self.mongold.stop()

            exit_code = self.mongold.wait()
            success = exit_code == 0

            if running_at_start:
                self.logger.info("Successfully terminated the mongold on port %d, exited with code"
                                 " %d.",
                                 self.port,
                                 exit_code)

        return success

    def is_running(self):
        return self.mongold is not None and self.mongold.poll() is None

    def get_connection_string(self):
        if self.mongold is None:
            raise ValueError("Must call setup() before calling get_connection_string()")

        return "localhost:%d" % self.port
