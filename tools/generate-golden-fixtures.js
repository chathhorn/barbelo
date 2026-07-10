"use strict";

// Regenerates test/golden/fixtures/*.json from the sample sessions.
// Run after an INTENTIONAL behavior change: node tools/generate-golden-fixtures.js

const fs = require("node:fs");
const path = require("node:path");
const { snapshotSession, SESSIONS, FIXTURES_DIR } = require("../test/helpers/golden.js");

for (const session of SESSIONS) {
  const snapshot = snapshotSession(session);
  if (!snapshot) {
    console.log(`skip ${session.name}: samples not present`);
    continue;
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const file = path.join(FIXTURES_DIR, `${session.name}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 1) + "\n");
  console.log(`wrote ${file}`);
}
