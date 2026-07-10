import test from "node:test";
import assert from "node:assert/strict";
import { SESSIONS, snapshotSession, loadFixture } from "../helpers/golden.mjs";

// Golden-master tests: the full pipeline (BWS parse -> analysis join ->
// matchpoints -> standings -> improvement report) must keep producing
// exactly the committed numbers for the three real sample sessions.
// After an INTENTIONAL behavior change, regenerate with:
//   node tools/generate-golden-fixtures.js
for (const session of SESSIONS) {
  test(`session ${session.name} matches its golden fixture`, (t) => {
    const snapshot = snapshotSession(session);
    if (!snapshot) return t.skip(`samples/${session.bws} not present`);
    const fixture = loadFixture(session.name);
    assert.ok(fixture, `fixture missing - run node tools/generate-golden-fixtures.js`);
    assert.deepEqual(snapshot, fixture);
  });
}
