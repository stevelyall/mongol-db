/**
 *    Copyright (C) 2008 10gen Inc.
 *
 *    This program is free software: you can redistribute it and/or  modify
 *    it under the terms of the GNU Affero General Public License, version 3,
 *    as published by the Free Software Foundation.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *    As a special exception, the copyright holders give permission to link the
 *    code of portions of this program with the OpenSSL library under certain
 *    conditions as described in each individual source file and distribute
 *    linked combinations including the program with the OpenSSL library. You
 *    must comply with the GNU Affero General Public License in all respects
 *    for all of the code used other than as permitted herein. If you modify
 *    file(s) with this exception, you may extend this exception to your
 *    version of the file(s), but you are not obligated to do so. If you do not
 *    wish to do so, delete this exception statement from your version. If you
 *    delete this exception statement from all source files in the program,
 *    then also delete it in the license file.
 */

#define MONGO_LOG_DEFAULT_COMPONENT ::mongol::logger::LogComponent::kDefault

#include "mongol/platform/basic.h"

#include <iostream>
#include <signal.h>

#include "mongol/base/initializer.h"
#include "mongol/client/dbclientinterface.h"
#include "mongol/db/dbmessage.h"
#include "mongol/stdx/thread.h"
#include "mongol/tools/mongolbridge_options.h"
#include "mongol/util/log.h"
#include "mongol/util/net/listen.h"
#include "mongol/util/net/message.h"
#include "mongol/util/quick_exit.h"
#include "mongol/util/stacktrace.h"
#include "mongol/util/static_observer.h"
#include "mongol/util/text.h"
#include "mongol/util/timer.h"

using namespace mongol;
using namespace std;

namespace mongol {
bool inShutdown() {
    return false;
}
}  // namespace mongol

void cleanup(int sig);

class Forwarder {
public:
    Forwarder(MessagingPort& mp) : mp_(mp) {}

    void operator()() const {
        DBClientConnection dest;
        string errmsg;

        Timer connectTimer;
        while (!dest.connect(HostAndPort(mongolBridgeGlobalParams.destUri), errmsg)) {
            // If we can't connect for the configured timeout, give up
            //
            if (connectTimer.seconds() >= mongolBridgeGlobalParams.connectTimeoutSec) {
                cout << "Unable to establish connection from " << mp_.psock->remoteString()
                     << " to " << mongolBridgeGlobalParams.destUri << " after "
                     << connectTimer.seconds() << " seconds. Giving up." << endl;
                mp_.shutdown();
                return;
            }

            sleepmillis(500);
        }

        Message m;
        while (1) {
            try {
                m.reset();
                if (!mp_.recv(m)) {
                    cout << "end connection " << mp_.psock->remoteString() << endl;
                    mp_.shutdown();
                    break;
                }
                sleepmillis(mongolBridgeGlobalParams.delay);

                int oldId = m.header().getId();
                if (m.operation() == dbQuery || m.operation() == dbMsg ||
                    m.operation() == dbGetMore || m.operation() == dbCommand) {
                    bool exhaust = false;
                    if (m.operation() == dbQuery) {
                        DbMessage d(m);
                        QueryMessage q(d);
                        exhaust = q.queryOptions & QueryOption_Exhaust;
                    }
                    Message response;
                    dest.port().call(m, response);

                    // nothing to reply with?
                    if (response.empty()) {
                        cout << "end connection " << dest.toString() << endl;
                        mp_.shutdown();
                        break;
                    }

                    mp_.reply(m, response, oldId);
                    while (exhaust) {
                        MsgData::View header = response.header();
                        QueryResult::View qr = header.view2ptr();
                        if (qr.getCursorId()) {
                            response.reset();
                            dest.port().recv(response);
                            mp_.reply(m, response);  // m argument is ignored anyway
                        } else {
                            exhaust = false;
                        }
                    }
                } else {
                    dest.port().say(m, oldId);
                }
            } catch (...) {
                log() << "caught exception in Forwarder, continuing" << endl;
            }
        }
    }

private:
    MessagingPort& mp_;
};

set<MessagingPort*>& ports(*(new std::set<MessagingPort*>()));

class MyListener : public Listener {
public:
    MyListener(int port) : Listener("bridge", "", port) {}
    virtual void acceptedMP(MessagingPort* mp) {
        ports.insert(mp);
        Forwarder f(*mp);
        stdx::thread t(f);
        t.detach();
    }
};

unique_ptr<MyListener> listener;


void cleanup(int sig) {
    ListeningSockets::get()->closeAll();
    for (set<MessagingPort*>::iterator i = ports.begin(); i != ports.end(); i++)
        (*i)->shutdown();
    quickExit(0);
}
#if !defined(_WIN32)
void myterminate() {
    printStackTrace(severe().stream() << "bridge terminate() called, printing stack:\n");
    ::abort();
}

void setupSignals() {
    signal(SIGINT, cleanup);
    signal(SIGTERM, cleanup);
    signal(SIGPIPE, cleanup);
    signal(SIGABRT, cleanup);
    signal(SIGSEGV, cleanup);
    signal(SIGBUS, cleanup);
    signal(SIGFPE, cleanup);
    set_terminate(myterminate);
}
#else
inline void setupSignals() {}
#endif

int toolMain(int argc, char** argv, char** envp) {
    mongol::runGlobalInitializersOrDie(argc, argv, envp);

    static StaticObserver staticObserver;

    setupSignals();

    listener.reset(new MyListener(mongolBridgeGlobalParams.port));
    listener->setupSockets();
    listener->initAndListen();

    return 0;
}

#if defined(_WIN32)
// In Windows, wmain() is an alternate entry point for main(), and receives the same parameters
// as main() but encoded in Windows Unicode (UTF-16); "wide" 16-bit wchar_t characters.  The
// WindowsCommandLine object converts these wide character strings to a UTF-8 coded equivalent
// and makes them available through the argv() and envp() members.  This enables toolMain()
// to process UTF-8 encoded arguments and environment variables without regard to platform.
int wmain(int argc, wchar_t* argvW[], wchar_t* envpW[]) {
    WindowsCommandLine wcl(argc, argvW, envpW);
    int exitCode = toolMain(argc, wcl.argv(), wcl.envp());
    quickExit(exitCode);
}
#else
int main(int argc, char* argv[], char** envp) {
    int exitCode = toolMain(argc, argv, envp);
    quickExit(exitCode);
}
#endif
