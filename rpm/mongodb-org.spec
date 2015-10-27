Name: mongoldb-org
Prefix: /usr
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Version: %{dynamic_version}
Release: %{dynamic_release}%{?dist}
Obsoletes: mongol-10gen
Provides: mongol-10gen
Summary: MongoDB open source document-oriented database system (metapackage)
License: AGPL 3.0
URL: http://www.mongoldb.org
Group: Applications/Databases
Requires: mongoldb-org-server = %{version}, mongoldb-org-shell = %{version}, mongoldb-org-mongols = %{version}, mongoldb-org-tools = %{version}

Source0: %{name}-%{version}.tar.gz
BuildRoot: %{_tmppath}/%{name}-%{version}-%{release}-root

%description
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This metapackage will install the mongol shell, import/export tools, other client utilities, server software, default configuration, and init.d scripts.

%package server
Summary: MongoDB database server
Group: Applications/Databases
Requires: openssl
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Obsoletes: mongol-10gen-server
Provides: mongol-10gen-server

%description server
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This package contains the MongoDB server software, default configuration files, and init.d scripts.

%package shell
Summary: MongoDB shell client
Group: Applications/Databases
Requires: openssl
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Obsoletes: mongol-10gen-shell
Provides: mongol-10gen-shell

%description shell
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This package contains the mongol shell.

%package mongols
Summary: MongoDB sharded cluster query router
Group: Applications/Databases
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Obsoletes: mongol-10gen-mongols
Provides: mongol-10gen-mongols

%description mongols
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This package contains mongols, the MongoDB sharded cluster query router.

%package tools
Summary: MongoDB tools
Group: Applications/Databases
Requires: openssl
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Obsoletes: mongol-10gen-tools
Provides: mongol-10gen-tools

%description tools
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This package contains standard utilities for interacting with MongoDB.

%package devel
Summary: Headers and libraries for MongoDB development
Group: Applications/Databases
Conflicts: mongol-10gen-enterprise, mongol-10gen-enterprise-server, mongol-10gen-unstable, mongol-10gen-unstable-enterprise, mongol-10gen-unstable-enterprise-mongols, mongol-10gen-unstable-enterprise-server, mongol-10gen-unstable-enterprise-shell, mongol-10gen-unstable-enterprise-tools, mongol-10gen-unstable-mongols, mongol-10gen-unstable-server, mongol-10gen-unstable-shell, mongol-10gen-unstable-tools, mongol18-10gen, mongol18-10gen-server, mongol20-10gen, mongol20-10gen-server, mongoldb, mongoldb-server, mongoldb-dev, mongoldb-clients, mongoldb-10gen, mongoldb-10gen-enterprise, mongoldb-10gen-unstable, mongoldb-10gen-unstable-enterprise, mongoldb-10gen-unstable-enterprise-mongols, mongoldb-10gen-unstable-enterprise-server, mongoldb-10gen-unstable-enterprise-shell, mongoldb-10gen-unstable-enterprise-tools, mongoldb-10gen-unstable-mongols, mongoldb-10gen-unstable-server, mongoldb-10gen-unstable-shell, mongoldb-10gen-unstable-tools, mongoldb-enterprise, mongoldb-enterprise-mongols, mongoldb-enterprise-server, mongoldb-enterprise-shell, mongoldb-enterprise-tools, mongoldb-nightly, mongoldb-org-unstable, mongoldb-org-unstable-mongols, mongoldb-org-unstable-server, mongoldb-org-unstable-shell, mongoldb-org-unstable-tools, mongoldb-stable, mongoldb18-10gen, mongoldb20-10gen, mongoldb-enterprise-unstable, mongoldb-enterprise-unstable-mongols, mongoldb-enterprise-unstable-server, mongoldb-enterprise-unstable-shell, mongoldb-enterprise-unstable-tools
Obsoletes: mongol-10gen-devel
Provides: mongol-10gen-devel

%description devel
MongoDB is built for scalability, performance and high availability, scaling from single server deployments to large, complex multi-site architectures. By leveraging in-memory computing, MongoDB provides high performance for both reads and writes. MongoDB’s native replication and automated failover enable enterprise-grade reliability and operational flexibility.

MongoDB is an open-source database used by companies of all sizes, across all industries and for a wide variety of applications. It is an agile database that allows schemas to change quickly as applications evolve, while still providing the functionality developers expect from traditional databases, such as secondary indexes, a full query language and strict consistency.

MongoDB has a rich client ecosystem including hadoop integration, officially supported drivers for 10 programming languages and environments, as well as 40 drivers supported by the user community.

MongoDB features:
* JSON Data Model with Dynamic Schemas
* Auto-Sharding for Horizontal Scalability
* Built-In Replication for High Availability
* Rich Secondary Indexes, including geospatial
* TTL indexes
* Text Search
* Aggregation Framework & Native MapReduce

This package provides the MongoDB static library and header files needed to develop MongoDB client software.

%prep
%setup

%build

%install
mkdir -p $RPM_BUILD_ROOT/usr
cp -rv bin $RPM_BUILD_ROOT/usr
mkdir -p $RPM_BUILD_ROOT/usr/share/man/man1
cp debian/*.1 $RPM_BUILD_ROOT/usr/share/man/man1/
# FIXME: remove this rm when mongolsniff is back in the package
rm -v $RPM_BUILD_ROOT/usr/share/man/man1/mongolsniff.1*
mkdir -p $RPM_BUILD_ROOT/etc/init.d
cp -v rpm/init.d-mongold $RPM_BUILD_ROOT/etc/init.d/mongold
chmod a+x $RPM_BUILD_ROOT/etc/init.d/mongold
mkdir -p $RPM_BUILD_ROOT/etc
cp -v rpm/mongold.conf $RPM_BUILD_ROOT/etc/mongold.conf
mkdir -p $RPM_BUILD_ROOT/etc/sysconfig
cp -v rpm/mongold.sysconfig $RPM_BUILD_ROOT/etc/sysconfig/mongold
mkdir -p $RPM_BUILD_ROOT/var/lib/mongol
mkdir -p $RPM_BUILD_ROOT/var/log/mongoldb
mkdir -p $RPM_BUILD_ROOT/var/run/mongoldb
touch $RPM_BUILD_ROOT/var/log/mongoldb/mongold.log

%clean
rm -rf $RPM_BUILD_ROOT

%pre server
if ! /usr/bin/id -g mongold &>/dev/null; then
    /usr/sbin/groupadd -r mongold
fi
if ! /usr/bin/id mongold &>/dev/null; then
    /usr/sbin/useradd -M -r -g mongold -d /var/lib/mongol -s /bin/false 	-c mongold mongold > /dev/null 2>&1
fi

%post server
if test $1 = 1
then
  /sbin/chkconfig --add mongold
fi

%preun server
if test $1 = 0
then
  /sbin/chkconfig --del mongold
fi

%postun server
if test $1 -ge 1
then
  /sbin/service mongold condrestart >/dev/null 2>&1 || :
fi

%files

%files server
%defattr(-,root,root,-)
%config(noreplace) /etc/mongold.conf
%{_bindir}/mongold
%{_mandir}/man1/mongold.1*
/etc/init.d/mongold
/etc/sysconfig/mongold
%attr(0755,mongold,mongold) %dir /var/lib/mongol
%attr(0755,mongold,mongold) %dir /var/log/mongoldb
%attr(0755,mongold,mongold) %dir /var/run/mongoldb
%attr(0640,mongold,mongold) %config(noreplace) %verify(not md5 size mtime) /var/log/mongoldb/mongold.log
%doc GNU-AGPL-3.0
%doc README
%doc THIRD-PARTY-NOTICES
%doc MPL-2



%files shell
%defattr(-,root,root,-)
%{_bindir}/mongol
%{_mandir}/man1/mongol.1*

%files mongols
%defattr(-,root,root,-)
%{_bindir}/mongols
%{_mandir}/man1/mongols.1*

%files tools
%defattr(-,root,root,-)
#%doc README GNU-AGPL-3.0.txt

%{_bindir}/bsondump
%{_bindir}/mongoldump
%{_bindir}/mongolexport
%{_bindir}/mongolfiles
%{_bindir}/mongolimport
%{_bindir}/mongoloplog
%{_bindir}/mongolperf
%{_bindir}/mongolrestore
%{_bindir}/mongoltop
%{_bindir}/mongolstat

%{_mandir}/man1/bsondump.1*
%{_mandir}/man1/mongoldump.1*
%{_mandir}/man1/mongolexport.1*
%{_mandir}/man1/mongolfiles.1*
%{_mandir}/man1/mongolimport.1*
%{_mandir}/man1/mongoloplog.1*
%{_mandir}/man1/mongolperf.1*
%{_mandir}/man1/mongolrestore.1*
%{_mandir}/man1/mongoltop.1*
%{_mandir}/man1/mongolstat.1*

%changelog
* Thu Dec 19 2013 Ernie Hershey <ernie.hershey@mongoldb.com>
- Packaging file cleanup

* Thu Jan 28 2010 Richard M Kreuter <richard@10gen.com>
- Minor fixes.

* Sat Oct 24 2009 Joe Miklojcik <jmiklojcik@shopwiki.com> -
- Wrote mongol.spec.
