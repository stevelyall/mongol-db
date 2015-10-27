/* Copyright 2013 10gen Inc.
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

namespace mongol {
namespace mutablebson {

inline Element Element::operator[](size_t n) const {
    return findNthChild(n);
}

inline Element Element::operator[](StringData name) const {
    return findFirstChildNamed(name);
}

inline double Element::getValueDouble() const {
    dassert(hasValue() && isType(mongol::NumberDouble));
    return getValue()._numberDouble();
}

inline StringData Element::getValueString() const {
    dassert(hasValue() && isType(mongol::String));
    return getValueStringOrSymbol();
}

inline BSONObj Element::getValueObject() const {
    dassert(hasValue() && isType(mongol::Object));
    return getValue().Obj();
}

inline BSONArray Element::getValueArray() const {
    dassert(hasValue() && isType(mongol::Array));
    return BSONArray(getValue().Obj());
}

inline bool Element::isValueUndefined() const {
    return isType(mongol::Undefined);
}

inline OID Element::getValueOID() const {
    dassert(hasValue() && isType(mongol::jstOID));
    return getValue().__oid();
}

inline bool Element::getValueBool() const {
    dassert(hasValue() && isType(mongol::Bool));
    return getValue().boolean();
}

inline Date_t Element::getValueDate() const {
    dassert(hasValue() && isType(mongol::Date));
    return getValue().date();
}

inline bool Element::isValueNull() const {
    return isType(mongol::jstNULL);
}

inline StringData Element::getValueSymbol() const {
    dassert(hasValue() && isType(mongol::Symbol));
    return getValueStringOrSymbol();
}

inline int32_t Element::getValueInt() const {
    dassert(hasValue() && isType(mongol::NumberInt));
    return getValue()._numberInt();
}

inline Timestamp Element::getValueTimestamp() const {
    dassert(hasValue() && isType(mongol::bsonTimestamp));
    return getValue().timestamp();
}

inline int64_t Element::getValueLong() const {
    dassert(hasValue() && isType(mongol::NumberLong));
    return getValue()._numberLong();
}

inline Decimal128 Element::getValueDecimal() const {
    dassert(hasValue() && isType(mongol::NumberDecimal));
    return getValue()._numberDecimal();
}

inline bool Element::isValueMinKey() const {
    return isType(mongol::MinKey);
}

inline bool Element::isValueMaxKey() const {
    return isType(mongol::MaxKey);
}

inline bool Element::ok() const {
    dassert(_doc != NULL);
    return _repIdx <= kMaxRepIdx;
}

inline Document& Element::getDocument() {
    return *_doc;
}

inline const Document& Element::getDocument() const {
    return *_doc;
}

inline bool Element::isType(BSONType type) const {
    return (getType() == type);
}

inline Element::RepIdx Element::getIdx() const {
    return _repIdx;
}

inline Element::Element(Document* doc, RepIdx repIdx) : _doc(doc), _repIdx(repIdx) {
    dassert(_doc != NULL);
}

inline StringData Element::getValueStringOrSymbol() const {
    const BSONElement value = getValue();
    const char* str = value.valuestr();
    const size_t size = value.valuestrsize() - 1;
    return StringData(str, size);
}

inline bool operator==(const Element& l, const Element& r) {
    return (l._doc == r._doc) && (l._repIdx == r._repIdx);
}

inline bool operator!=(const Element& l, const Element& r) {
    return !(l == r);
}


}  // namespace mutablebson
}  // namespace mongol
