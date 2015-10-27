%define name    mongoldb
%define version %{dynamic_version}
%define release %{dynamic_release}

Name:    %{name}
Version: %{version}
Release: %{release}
Summary: MongoDB client shell and tools
License: AGPL 3.0
URL: http://www.mongoldb.org
Group: Databases

Source0: http://downloads.mongoldb.org/src/%{name}-src-r%{version}.tar.gz
BuildRoot: %{_tmppath}/%{name}-%{version}-%{release}-root
BuildRequires: js-devel, readline-devel, boost-devel, pcre-devel
BuildRequires: gcc-c++, scons

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

This package contains the mongol shell, import/export tools, and other client utilities.


%package server
Summary: MongoDB server, sharding server, and support scripts
Group: Databases
Requires: mongoldb

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

This package contains the MongoDB server software, MongoDB sharded cluster query router, default configuration files, and init.d scripts.


%package devel
Summary: Headers and libraries for MongoDB development
Group: Databases

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
%setup -n %{name}-src-r%{version}

%build
scons --prefix=$RPM_BUILD_ROOT/usr all
# XXX really should have shared library here

%install
scons --prefix=$RPM_BUILD_ROOT%{_usr} install
mkdir -p $RPM_BUILD_ROOT%{_mandir}/man1
cp debian/*.1 $RPM_BUILD_ROOT%{_mandir}/man1/
mkdir -p $RPM_BUILD_ROOT%{_sysconfdir}/init.d
cp rpm/init.d-mongold $RPM_BUILD_ROOT%{_sysconfdir}/init.d/mongold
chmod a+x $RPM_BUILD_ROOT%{_sysconfdir}/init.d/mongold
mkdir -p $RPM_BUILD_ROOT%{_sysconfdir}
cp rpm/mongold.conf $RPM_BUILD_ROOT%{_sysconfdir}/mongold.conf
mkdir -p $RPM_BUILD_ROOT%{_sysconfdir}/sysconfig
cp rpm/mongold.sysconfig $RPM_BUILD_ROOT%{_sysconfdir}/sysconfig/mongold
mkdir -p $RPM_BUILD_ROOT%{_var}/lib/mongol
mkdir -p $RPM_BUILD_ROOT%{_var}/log/mongol
touch $RPM_BUILD_ROOT%{_var}/log/mongol/mongold.log

%clean
scons -c
rm -rf $RPM_BUILD_ROOT

%pre server
%{_sbindir}/useradd -M -r -U -d %{_var}/lib/mongol -s /bin/false \
    -c mongold mongold > /dev/null 2>&1

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
  /sbin/service mongold stop >/dev/null 2>&1 || :
fi

%files
%defattr(-,root,root,-)
%doc README GNU-AGPL-3.0.txt

%{_bindir}/mongol
%{_bindir}/mongoldump
%{_bindir}/mongolexport
%{_bindir}/mongolfiles
%{_bindir}/mongolimport
%{_bindir}/mongolrestore
%{_bindir}/mongolstat

%{_mandir}/man1/mongol.1*
%{_mandir}/man1/mongold.1*
%{_mandir}/man1/mongoldump.1*
%{_mandir}/man1/mongolexport.1*
%{_mandir}/man1/mongolfiles.1*
%{_mandir}/man1/mongolimport.1*
%{_mandir}/man1/mongolsniff.1*
%{_mandir}/man1/mongolstat.1*
%{_mandir}/man1/mongolrestore.1*

%files server
%defattr(-,root,root,-)
%config(noreplace) %{_sysconfdir}/mongold.conf
%{_bindir}/mongold
%{_bindir}/mongols
%{_mandir}/man1/mongols.1*
%{_sysconfdir}/init.d/mongold
%{_sysconfdir}/sysconfig/mongold
%attr(0755,mongold,mongold) %dir %{_var}/lib/mongol
%attr(0755,mongold,mongold) %dir %{_var}/log/mongol
%attr(0640,mongold,mongold) %config(noreplace) %verify(not md5 size mtime) %{_var}/log/mongol/mongold.log

%files devel
%{_includedir}/mongol
%{_libdir}/libmongolclient.a
#%{_libdir}/libmongoltestfiles.a

%changelog
* Sun Mar 21 2010 Ludovic Bellière <xrogaan@gmail.com>
- Update mongol.spec for mandriva packaging

* Thu Jan 28 2010 Richard M Kreuter <richard@10gen.com>
- Minor fixes.

* Sat Oct 24 2009 Joe Miklojcik <jmiklojcik@shopwiki.com> - 
- Wrote mongol.spec.
