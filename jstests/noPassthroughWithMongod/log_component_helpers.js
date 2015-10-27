// Basic sanity check of log component helpers

(function(db) {
    "use strict";
    var mongol = db.getMongo();

    // Get current log component setttings. We will reset to these later.
    var originalSettings = assert.commandWorked(
            db.adminCommand({ getParameter:1, logComponentVerbosity:1 })
            ).logComponentVerbosity;

    // getLogComponents
    var components1 = mongol.getLogComponents();
    assert.docEq(components1, originalSettings);

    // getLogComponents via db
    var components2 = db.getLogComponents();
    assert.docEq(components2, originalSettings);

    // setLogLevel - default component
    mongol.setLogLevel(2);
    assert.eq(mongol.getLogComponents().verbosity, 2);

    db.setLogLevel(0);
    assert.eq(mongol.getLogComponents().verbosity, 0);

    // setLogLevel - valid log component
    mongol.setLogLevel(2, "storage.journal");
    assert.eq(mongol.getLogComponents().storage.journal.verbosity, 2);

    db.setLogLevel(1, "storage.journal");
    assert.eq(mongol.getLogComponents().storage.journal.verbosity, 1);

    // setLogLevel - invalid argument
    assert.throws(mongol.setLogLevel, [2, 24]);
    assert.throws(db.setLogLevel, [2, ["array", "not.allowed"]]);

    // Restore originalSettings
    assert.commandWorked(
            db.adminCommand({setParameter:1, logComponentVerbosity:originalSettings })
            );
 }(db));
