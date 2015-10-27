/*    Copyright 2013 10gen Inc.
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

#pragma once


#include "mongol/base/disallow_copying.h"
#include "mongol/base/status.h"
#include "mongol/logger/appender.h"
#include "mongol/logger/console.h"
#include "mongol/logger/encoder.h"

namespace mongol {
namespace logger {

/**
 * Appender for writing to the console (stdout).
 */
template <typename Event, typename ConsoleType = Console>
class ConsoleAppender : public Appender<Event> {
    MONGO_DISALLOW_COPYING(ConsoleAppender);

public:
    typedef Encoder<Event> EventEncoder;

    explicit ConsoleAppender(EventEncoder* encoder) : _encoder(encoder) {}
    virtual Status append(const Event& event) {
        ConsoleType console;
        _encoder->encode(event, console.out()).flush();
        if (!console.out())
            return Status(ErrorCodes::LogWriteFailed, "Error writing log message to console.");
        return Status::OK();
    }

private:
    std::unique_ptr<EventEncoder> _encoder;
};

}  // namespace logger
}  // namespace mongol
