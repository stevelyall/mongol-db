/**
 *    Copyright (C) 2015 MongoDB Inc.
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
 *    must comply with the GNU Affero General Public License in all respects for
 *    all of the code used other than as permitted herein. If you modify file(s)
 *    with this exception, you may extend this exception to your version of the
 *    file(s), but you are not obligated to do so. If you do not wish to do so,
 *    delete this exception statement from your version. If you delete this
 *    exception statement from all source files in the program, then also delete
 *    it in the license file.
 */

#pragma once

#include <system_error>

#include <asio.hpp>

#include "mongol/base/disallow_copying.h"
#include "mongol/stdx/functional.h"
#include "mongol/util/time_support.h"

namespace mongol {
namespace executor {

/**
 * An asynchronous waitable timer interface.
 */
class AsyncTimerInterface {
    MONGO_DISALLOW_COPYING(AsyncTimerInterface);

public:
    virtual ~AsyncTimerInterface() = default;

    using Handler = stdx::function<void(std::error_code)>;

    /**
     * Cancel any asynchronous operations waiting on this timer, invoking
     * their handlers immediately with an 'operation aborted' error code.
     *
     * If the timer has already expired when cancel() is called, the handlers
     * for asyncWait operations may have already fired or been enqueued to
     * fire soon, in which case we cannot cancel them.
     *
     * Calling cancel() does not change this timer's expiration time; future
     * calls to asyncWait() will schedule callbacks to run as usual.
     */
    virtual void cancel() = 0;

    /**
     * Perform an asynchronous wait on this timer.
     */
    virtual void asyncWait(Handler handler) = 0;

protected:
    AsyncTimerInterface() = default;
};

/**
 * A factory for AsyncTimers.
 */
class AsyncTimerFactoryInterface {
    MONGO_DISALLOW_COPYING(AsyncTimerFactoryInterface);

public:
    virtual ~AsyncTimerFactoryInterface() = default;

    virtual std::unique_ptr<AsyncTimerInterface> make(asio::io_service* io_service,
                                                      Milliseconds expiration) = 0;

protected:
    AsyncTimerFactoryInterface() = default;
};

}  // namespace executor
}  // namespace mongol
