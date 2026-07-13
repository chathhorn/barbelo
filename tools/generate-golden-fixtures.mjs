// Regenerates test/golden/fixtures/*.json from the committed synthetic
// session and any locally available real sample sessions.
// Run after an INTENTIONAL behavior change: node tools/generate-golden-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { buildAnalysis } from "../src/core/boards.js";
import { parseBwsBuffer } from "../src/parsers/bws.js";
import { parsePbn } from "../src/parsers/pbn.js";
import { APP_BWS_BYTES, APP_PBN_TEXT } from "../test/fixtures/app-session.mjs";
import {
  FIXTURES_DIR,
  SESSIONS,
  snapshotPipeline,
  snapshotSession,
} from "../test/helpers/golden.mjs";

function writeFixture(name, snapshot) {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`wrote ${file}`);
}

fs.mkdirSync(FIXTURES_DIR, { recursive: true });
writeFixture(
  "synthetic-session",
  snapshotPipeline(
    parseBwsBuffer(APP_BWS_BYTES, "synthetic-session.BWS"),
    buildAnalysis(parsePbn(APP_PBN_TEXT, "synthetic-session.pbn")),
  ),
);

for (const session of SESSIONS) {
  const snapshot = snapshotSession(session);
  if (!snapshot) {
    console.log(`skip ${session.name}: samples not present`);
    continue;
  }
  writeFixture(session.name, snapshot);
}
