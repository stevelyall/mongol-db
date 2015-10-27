/**
 * Copyright (C) 2015 MongoDB Inc.
 *
 * This program is free software: you can redistribute it and/or  modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * As a special exception, the copyright holders give permission to link the
 * code of portions of this program with the OpenSSL library under certain
 * conditions as described in each individual source file and distribute
 * linked combinations including the program with the OpenSSL library. You
 * must comply with the GNU Affero General Public License in all respects
 * for all of the code used other than as permitted herein. If you modify
 * file(s) with this exception, you may extend this exception to your
 * version of the file(s), but you are not obligated to do so. If you do not
 * wish to do so, delete this exception statement from your version. If you
 * delete this exception statement from all source files in the program,
 * then also delete it in the license file.
 */

#pragma once

#include <jsapi.h>
#include <vm/PosixNSPR.h>

#include "mongol/client/dbclientcursor.h"
#include "mongol/scripting/mozjs/bindata.h"
#include "mongol/scripting/mozjs/bson.h"
#include "mongol/scripting/mozjs/countdownlatch.h"
#include "mongol/scripting/mozjs/cursor.h"
#include "mongol/scripting/mozjs/cursor_handle.h"
#include "mongol/scripting/mozjs/db.h"
#include "mongol/scripting/mozjs/dbcollection.h"
#include "mongol/scripting/mozjs/dbpointer.h"
#include "mongol/scripting/mozjs/dbquery.h"
#include "mongol/scripting/mozjs/dbref.h"
#include "mongol/scripting/mozjs/engine.h"
#include "mongol/scripting/mozjs/error.h"
#include "mongol/scripting/mozjs/global.h"
#include "mongol/scripting/mozjs/internedstring.h"
#include "mongol/scripting/mozjs/jsthread.h"
#include "mongol/scripting/mozjs/maxkey.h"
#include "mongol/scripting/mozjs/minkey.h"
#include "mongol/scripting/mozjs/mongol.h"
#include "mongol/scripting/mozjs/mongolhelpers.h"
#include "mongol/scripting/mozjs/nativefunction.h"
#include "mongol/scripting/mozjs/numberint.h"
#include "mongol/scripting/mozjs/numberlong.h"
#include "mongol/scripting/mozjs/numberdecimal.h"
#include "mongol/scripting/mozjs/object.h"
#include "mongol/scripting/mozjs/oid.h"
#include "mongol/scripting/mozjs/regexp.h"
#include "mongol/scripting/mozjs/timestamp.h"

namespace mongol {
namespace mozjs {

/**
 * Implementation Scope for MozJS
 *
 * The Implementation scope holds the actual mozjs runtime and context objects,
 * along with a number of global prototypes for mongolDB specific types. Each
 * ImplScope requires it's own thread and cannot be accessed from any thread
 * other than the one it was created on (this is a detail inherited from the
 * JSRuntime). If you need a scope that can be accessed by different threads
 * over the course of it's lifetime, see MozJSProxyScope
 *
 * For more information about overriden fields, see mongol::Scope
 */
class MozJSImplScope final : public Scope {
    MONGO_DISALLOW_COPYING(MozJSImplScope);

public:
    static const std::size_t kMaxStackBytes = (1024 * 1024);

    explicit MozJSImplScope(MozJSScriptEngine* engine);
    ~MozJSImplScope();

    void init(const BSONObj* data) override;

    void reset() override;

    void kill();

    bool isKillPending() const override;

    OperationContext* getOpContext() const;

    void registerOperation(OperationContext* txn) override;

    void unregisterOperation() override;

    void localConnectForDbEval(OperationContext* txn, const char* dbName) override;

    void externalSetup() override;

    std::string getError() override;

    bool hasOutOfMemoryException() override;

    void gc() override;

    double getNumber(const char* field) override;
    int getNumberInt(const char* field) override;
    long long getNumberLongLong(const char* field) override;
    Decimal128 getNumberDecimal(const char* field) override;
    std::string getString(const char* field) override;
    bool getBoolean(const char* field) override;
    BSONObj getObject(const char* field) override;

    void setNumber(const char* field, double val) override;
    void setString(const char* field, StringData val) override;
    void setBoolean(const char* field, bool val) override;
    void setElement(const char* field, const BSONElement& e, const BSONObj& parent) override;
    void setObject(const char* field, const BSONObj& obj, bool readOnly) override;
    void setFunction(const char* field, const char* code) override;

    int type(const char* field) override;

    void rename(const char* from, const char* to) override;

    int invoke(ScriptingFunction func,
               const BSONObj* args,
               const BSONObj* recv,
               int timeoutMs = 0,
               bool ignoreReturn = false,
               bool readOnlyArgs = false,
               bool readOnlyRecv = false) override;

    bool exec(StringData code,
              const std::string& name,
              bool printResult,
              bool reportError,
              bool assertOnError,
              int timeoutMs) override;

    void injectNative(const char* field, NativeFunction func, void* data = 0) override;

    ScriptingFunction _createFunction(const char* code,
                                      ScriptingFunction functionNumber = 0) override;

    void newFunction(StringData code, JS::MutableHandleValue out);

    BSONObj callThreadArgs(const BSONObj& obj);

    template <typename T>
    typename std::enable_if<std::is_same<T, BinDataInfo>::value, WrapType<T>&>::type getProto() {
        return _binDataProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, BSONInfo>::value, WrapType<T>&>::type getProto() {
        return _bsonProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, CountDownLatchInfo>::value, WrapType<T>&>::type
    getProto() {
        return _countDownLatchProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, CursorInfo>::value, WrapType<T>&>::type getProto() {
        return _cursorProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, CursorHandleInfo>::value, WrapType<T>&>::type
    getProto() {
        return _cursorHandleProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, DBCollectionInfo>::value, WrapType<T>&>::type
    getProto() {
        return _dbCollectionProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, DBPointerInfo>::value, WrapType<T>&>::type getProto() {
        return _dbPointerProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, DBQueryInfo>::value, WrapType<T>&>::type getProto() {
        return _dbQueryProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, DBInfo>::value, WrapType<T>&>::type getProto() {
        return _dbProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, DBRefInfo>::value, WrapType<T>&>::type getProto() {
        return _dbRefProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, ErrorInfo>::value, WrapType<T>&>::type getProto() {
        return _errorProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, JSThreadInfo>::value, WrapType<T>&>::type getProto() {
        return _jsThreadProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, MaxKeyInfo>::value, WrapType<T>&>::type getProto() {
        return _maxKeyProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, MinKeyInfo>::value, WrapType<T>&>::type getProto() {
        return _minKeyProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, MongoExternalInfo>::value, WrapType<T>&>::type
    getProto() {
        return _mongolExternalProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, MongoHelpersInfo>::value, WrapType<T>&>::type
    getProto() {
        return _mongolHelpersProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, MongoLocalInfo>::value, WrapType<T>&>::type getProto() {
        return _mongolLocalProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, NativeFunctionInfo>::value, WrapType<T>&>::type
    getProto() {
        return _nativeFunctionProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, NumberIntInfo>::value, WrapType<T>&>::type getProto() {
        return _numberIntProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, NumberLongInfo>::value, WrapType<T>&>::type getProto() {
        return _numberLongProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, NumberDecimalInfo>::value, WrapType<T>&>::type
    getProto() {
        return _numberDecimalProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, ObjectInfo>::value, WrapType<T>&>::type getProto() {
        return _objectProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, OIDInfo>::value, WrapType<T>&>::type getProto() {
        return _oidProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, RegExpInfo>::value, WrapType<T>&>::type getProto() {
        return _regExpProto;
    }

    template <typename T>
    typename std::enable_if<std::is_same<T, TimestampInfo>::value, WrapType<T>&>::type getProto() {
        return _timestampProto;
    }

    void setQuickExit(int exitCode);
    bool getQuickExit(int* exitCode);

    static const char* const kExecResult;
    static const char* const kInvokeResult;

    static MozJSImplScope* getThreadScope();
    void setOOM();
    void setParentStack(std::string);
    const std::string& getParentStack() const;

    std::size_t getGeneration() const;

    void advanceGeneration() override;

    JS::HandleId getInternedStringId(InternedString name) {
        return _internedStrings.getInternedString(name);
    }

private:
    void _MozJSCreateFunction(const char* raw,
                              ScriptingFunction functionNumber,
                              JS::MutableHandleValue fun);

    /**
     * This structure exists exclusively to construct the runtime and context
     * ahead of the various global prototypes in the ImplScope construction.
     * Basically, we have to call some c apis on the way up and down and this
     * takes care of that
     */
    struct MozRuntime {
    public:
        MozRuntime();
        ~MozRuntime();

        PRThread* _thread = nullptr;
        JSRuntime* _runtime = nullptr;
        JSContext* _context = nullptr;
    };

    /**
     * The connection state of the scope.
     *
     * This is for dbeval and the shell
     */
    enum class ConnectState : char {
        Not,
        Local,
        External,
    };

    struct MozJSEntry;
    friend struct MozJSEntry;

    static void _reportError(JSContext* cx, const char* message, JSErrorReport* report);
    static bool _interruptCallback(JSContext* cx);
    static void _gcCallback(JSRuntime* rt, JSGCStatus status, void* data);
    bool _checkErrorState(bool success, bool reportError = true, bool assertOnError = true);

    void installDBAccess();
    void installBSONTypes();
    void installFork();

    void setCompileOptions(JS::CompileOptions* co);

    MozJSScriptEngine* _engine;
    MozRuntime _mr;
    JSRuntime* _runtime;
    JSContext* _context;
    WrapType<GlobalInfo> _globalProto;
    JS::HandleObject _global;
    std::vector<JS::PersistentRootedValue> _funcs;
    InternedStringTable _internedStrings;
    std::atomic<bool> _pendingKill;
    std::string _error;
    unsigned int _opId;        // op id for this scope
    OperationContext* _opCtx;  // Op context for DbEval
    std::atomic<bool> _pendingGC;
    ConnectState _connectState;
    Status _status;
    int _exitCode;
    bool _quickExit;
    std::string _parentStack;
    std::size_t _generation;

    WrapType<BinDataInfo> _binDataProto;
    WrapType<BSONInfo> _bsonProto;
    WrapType<CountDownLatchInfo> _countDownLatchProto;
    WrapType<CursorInfo> _cursorProto;
    WrapType<CursorHandleInfo> _cursorHandleProto;
    WrapType<DBCollectionInfo> _dbCollectionProto;
    WrapType<DBPointerInfo> _dbPointerProto;
    WrapType<DBQueryInfo> _dbQueryProto;
    WrapType<DBInfo> _dbProto;
    WrapType<DBRefInfo> _dbRefProto;
    WrapType<ErrorInfo> _errorProto;
    WrapType<JSThreadInfo> _jsThreadProto;
    WrapType<MaxKeyInfo> _maxKeyProto;
    WrapType<MinKeyInfo> _minKeyProto;
    WrapType<MongoExternalInfo> _mongolExternalProto;
    WrapType<MongoHelpersInfo> _mongolHelpersProto;
    WrapType<MongoLocalInfo> _mongolLocalProto;
    WrapType<NativeFunctionInfo> _nativeFunctionProto;
    WrapType<NumberIntInfo> _numberIntProto;
    WrapType<NumberLongInfo> _numberLongProto;
    WrapType<NumberDecimalInfo> _numberDecimalProto;
    WrapType<ObjectInfo> _objectProto;
    WrapType<OIDInfo> _oidProto;
    WrapType<RegExpInfo> _regExpProto;
    WrapType<TimestampInfo> _timestampProto;
};

inline MozJSImplScope* getScope(JSContext* cx) {
    return static_cast<MozJSImplScope*>(JS_GetContextPrivate(cx));
}

}  // namespace mozjs
}  // namespace mongol
