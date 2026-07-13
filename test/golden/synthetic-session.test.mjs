import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildAnalysis } from "../../src/core/boards.js";
import { parseBwsBuffer } from "../../src/parsers/bws.js";
import { parsePbn } from "../../src/parsers/pbn.js";
import { APP_BWS_BYTES, APP_PBN_TEXT } from "../fixtures/app-session.mjs";
import { snapshotPipeline } from "../helpers/golden.mjs";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "synthetic-session.json",
);

test("synthetic session matches its full-pipeline golden fixture", () => {
  const analysis = buildAnalysis(parsePbn(APP_PBN_TEXT, "synthetic-session.pbn"));
  const raw = parseBwsBuffer(APP_BWS_BYTES, "synthetic-session.BWS");
  const expected = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

  assert.deepEqual(snapshotPipeline(raw, analysis), expected);
});
