// expression_parser_text.cpp

/**
 *    Copyright (C) 2013 10gen Inc.
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

#include "mongol/base/init.h"
#include "mongol/db/fts/fts_language.h"
#include "mongol/db/fts/fts_spec.h"
#include "mongol/db/jsobj.h"
#include "mongol/db/matcher/expression_parser.h"
#include "mongol/db/matcher/expression_text.h"

namespace mongol {

using std::unique_ptr;
using std::string;

StatusWithMatchExpression expressionParserTextCallbackReal(const BSONObj& queryObj) {
    // Validate queryObj, but defer construction of FTSQuery (which requires access to the
    // target namespace) until stage building time.

    int expectedFieldCount = 1;

    if (mongol::String != queryObj["$search"].type()) {
        return StatusWithMatchExpression(ErrorCodes::TypeMismatch,
                                         "$search requires a string value");
    }

    string language = "";
    BSONElement languageElt = queryObj["$language"];
    if (!languageElt.eoo()) {
        expectedFieldCount++;
        if (mongol::String != languageElt.type()) {
            return StatusWithMatchExpression(ErrorCodes::TypeMismatch,
                                             "$language requires a string value");
        }
        language = languageElt.String();
        Status status = fts::FTSLanguage::make(language, fts::TEXT_INDEX_VERSION_2).getStatus();
        if (!status.isOK()) {
            return StatusWithMatchExpression(ErrorCodes::BadValue,
                                             "$language specifies unsupported language");
        }
    }
    string query = queryObj["$search"].String();

    BSONElement caseSensitiveElt = queryObj["$caseSensitive"];
    bool caseSensitive = fts::FTSQuery::caseSensitiveDefault;
    if (!caseSensitiveElt.eoo()) {
        expectedFieldCount++;
        if (mongol::Bool != caseSensitiveElt.type()) {
            return StatusWithMatchExpression(ErrorCodes::TypeMismatch,
                                             "$caseSensitive requires a boolean value");
        }
        caseSensitive = caseSensitiveElt.trueValue();
    }

    BSONElement diacriticSensitiveElt = queryObj["$diacriticSensitive"];
    bool diacriticSensitive = fts::FTSQuery::diacriticSensitiveDefault;
    if (!diacriticSensitiveElt.eoo()) {
        expectedFieldCount++;
        if (mongol::Bool != diacriticSensitiveElt.type()) {
            return StatusWithMatchExpression(ErrorCodes::TypeMismatch,
                                             "$diacriticSensitive requires a boolean value");
        }
        diacriticSensitive = diacriticSensitiveElt.trueValue();
    }

    if (queryObj.nFields() != expectedFieldCount) {
        return StatusWithMatchExpression(ErrorCodes::BadValue, "extra fields in $text");
    }

    unique_ptr<TextMatchExpression> e(new TextMatchExpression());
    Status s = e->init(query, language, caseSensitive, diacriticSensitive);
    if (!s.isOK()) {
        return StatusWithMatchExpression(s);
    }
    return {std::move(e)};
}

MONGO_INITIALIZER(MatchExpressionParserText)(::mongol::InitializerContext* context) {
    expressionParserTextCallback = expressionParserTextCallbackReal;
    return Status::OK();
}
}
