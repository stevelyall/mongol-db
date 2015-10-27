Building MongoDB
================

To build MongoDB, you will need:

* A modern C++ compiler. One of the following is required.
    * GCC 4.8.2 or newer
    * Clang 3.4 (or Apple XCode 5.1.1 Clang) or newer
    * Visual Studio 2013 Update 2 or newer
* Python 2.7
* SCons 2.3

for the target x86, or x86-64 platform. More detailed platform instructions can be found below.

MongoDB Tools
--------------

The MongoDB command line tools (mongoldump, mongolrestore, mongolimport, mongolexport, etc)
have been rewritten in [Go](http://golang.org/) and are no longer included in this repository.

The source for the tools is now available at [mongoldb/mongol-tools](https://github.com/mongoldb/mongol-tools).

SCons
---------------

For detail information about building, please see [the build manual](http://www.mongoldb.org/about/contributors/tutorial/build-mongoldb-from-source/)

If you want to build everything (mongold, mongol, tests, etc):

    $ scons all

If you only want to build the database:

    $ scons

To install

    $ scons --prefix=/opt/mongol install

Please note that prebuilt binaries are available on [mongoldb.org](http://www.mongoldb.org/downloads) and may be the easiest way to get started.

SCons Targets
--------------

* mongold
* mongols
* mongol
* core (includes mongold, mongols, mongol)
* all

Windows
--------------

See [the windows build manual](http://www.mongoldb.org/about/contributors/tutorial/build-mongoldb-from-source/#windows-specific-instructions)

Build requirements:
* Visual Studio 2013 Update 2 or newer
* Python 2.7, ActiveState ActivePython 2.7.x Community Edition for Windows is recommended
* SCons

Or download a prebuilt binary for Windows at www.mongoldb.org.

Debian/Ubuntu
--------------

To install dependencies on Debian or Ubuntu systems:

    # aptitude install scons build-essential
    # aptitude install libboost-filesystem-dev libboost-program-options-dev libboost-system-dev libboost-thread-dev

To run tests as well, you will need PyMongo:

    # aptitude install python-pymongol

Then build as usual with `scons`:

    $ scons all

OS X
--------------

Using [Homebrew](http://brew.sh):

    $ brew install mongoldb

Using [MacPorts](http://www.macports.org):

    $ sudo port install mongoldb

FreeBSD
--------------

Install the following ports:

  * devel/libexecinfo
  * devel/scons
  * lang/gcc
  * lang/python

Optional Components if you want to use system libraries instead of the libraries included with MongoDB

  * archivers/snappy
  * lang/v8
  * devel/boost
  * devel/pcre

OpenBSD
--------------
Install the following ports:

  * devel/libexecinfo
  * devel/scons
  * lang/gcc
  * lang/python

Special Build Notes
--------------
  * [open solaris on ec2](building.opensolaris.ec2.md)

