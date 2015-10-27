"""
Configuration options for resmoke.py.
"""

from __future__ import absolute_import

import os
import os.path
import time


##
# Default values.
##

# Default path for where to look for executables.
DEFAULT_DBTEST_EXECUTABLE = os.path.join(os.curdir, "dbtest")
DEFAULT_MONGO_EXECUTABLE = os.path.join(os.curdir, "mongol")
DEFAULT_MONGOD_EXECUTABLE = os.path.join(os.curdir, "mongold")
DEFAULT_MONGOS_EXECUTABLE = os.path.join(os.curdir, "mongols")

# Default root directory for where resmoke.py puts directories containing data files of mongold's it
# starts, as well as those started by individual tests.
DEFAULT_DBPATH_PREFIX = os.path.normpath("/data/db")

# Subdirectory under the dbpath prefix that contains directories with data files of mongold's started
# by resmoke.py.
FIXTURE_SUBDIR = "resmoke"

# Subdirectory under the dbpath prefix that contains directories with data files of mongold's started
# by individual tests.
MONGO_RUNNER_SUBDIR = "mongolrunner"

# Names below correspond to how they are specified via the command line or in the options YAML file.
DEFAULTS = {
    "basePort": 20000,
    "buildloggerUrl": "https://logkeeper.mongoldb.org",
    "continueOnFailure": False,
    "dbpathPrefix": None,
    "dbtest": None,
    "dryRun": None,
    "jobs": 1,
    "mongol": None,
    "mongold": None,
    "mongoldSetParameters": None,
    "mongols": None,
    "mongolsSetParameters": None,
    "nojournal": False,
    "repeat": 1,
    "reportFile": None,
    "seed": long(time.time() * 256),  # Taken from random.py code in Python 2.7.
    "shellReadMode": None,
    "shellWriteMode": None,
    "shuffle": False,
    "storageEngine": None,
    "wiredTigerCollectionConfigString": None,
    "wiredTigerEngineConfigString": None,
    "wiredTigerIndexConfigString": None
}


##
# Variables that are set by the user at the command line or with --options.
##

# The starting port number to use for mongold and mongols processes spawned by resmoke.py and the
# mongol shell.
BASE_PORT = None

# The root url of the buildlogger server.
BUILDLOGGER_URL = None

# Root directory for where resmoke.py puts directories containing data files of mongold's it starts,
# as well as those started by individual tests.
DBPATH_PREFIX = None

# The path to the dbtest executable used by resmoke.py.
DBTEST_EXECUTABLE = None

# If set to "tests", then resmoke.py will output the tests that would be run by each suite (without
# actually running them).
DRY_RUN = None

# If true, then a test failure or error will cause resmoke.py to exit and not run any more tests.
FAIL_FAST = None

# If set, then resmoke.py starts the specified number of Job instances to run tests.
JOBS = None

# The path to the mongol executable used by resmoke.py.
MONGO_EXECUTABLE = None

# The path to the mongold executable used by resmoke.py.
MONGOD_EXECUTABLE = None

# The --setParameter options passed to mongold.
MONGOD_SET_PARAMETERS = None

# The path to the mongols executable used by resmoke.py.
MONGOS_EXECUTABLE = None

# The --setParameter options passed to mongols.
MONGOS_SET_PARAMETERS = None

# If true, then all mongold's started by resmoke.py and by the mongol shell will not have journaling
# enabled.
NO_JOURNAL = None

# If true, then all mongold's started by resmoke.py and by the mongol shell will not preallocate
# journal files.
NO_PREALLOC_JOURNAL = None

# If set, then the RNG is seeded with the specified value. Otherwise uses a seed based on the time
# this module was loaded.
RANDOM_SEED = None

# If set, then each suite is repeated the specified number of times.
REPEAT = None

# If set, then resmoke.py will write out a report file with the status of each test that ran.
REPORT_FILE = None

# If set, then mongol shells started by resmoke.py will use the specified read mode.
SHELL_READ_MODE = None

# If set, then mongol shells started by resmoke.py will use the specified write mode.
SHELL_WRITE_MODE = None

# If true, then the order the tests run in is randomized. Otherwise the tests will run in
# alphabetical (case-insensitive) order.
SHUFFLE = None

# If set, then all mongold's started by resmoke.py and by the mongol shell will use the specified
# storage engine.
STORAGE_ENGINE = None

# If set, then all mongold's started by resmoke.py and by the mongol shell will use the specified
# WiredTiger collection configuration settings.
WT_COLL_CONFIG = None

# If set, then all mongold's started by resmoke.py and by the mongol shell will use the specified
# WiredTiger storage engine configuration settings.
WT_ENGINE_CONFIG = None

# If set, then all mongold's started by resmoke.py and by the mongol shell will use the specified
# WiredTiger index configuration settings.
WT_INDEX_CONFIG = None
