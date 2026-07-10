import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fixture from "./helpers/bws-fixture.js";
import * as parser from "../src/parsers/bws.js";

const SAMPLE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples", "01.BWS");
const SNAPSHOT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "01-receiveddata.json");

function parseFixtureFile(options) {
  return parser.parseBwsBuffer(fixture.buildBwsFile(options), "fixture.BWS");
}

function baseReceivedFields(overrides) {
  return Object.assign({
    id: 1,
    section: 1,
    table: 3,
    round: 1,
    board: 9,
    pairNS: 3,
    pairEW: 10,
    declarer: 3,
    nsEw: "N",
    contract: "4 H",
    result: "=",
    leadCard: null,
    remarks: null,
    dateSerial: 46203, // 06/30/26
    timeSerial: 40034 / 86400, // 11:07:14
    erased: 0
  }, overrides);
}

function selectedCandidate(parsed) {
  return parsed.metadata.diagnostics.candidates
    .find((candidate) => candidate.pageSize === parsed.metadata.diagnostics.selectedPageSize);
}

test("public API shape is unchanged", () => {
  assert.deepEqual(Object.keys(parser).sort(), [
    "parseBwsBuffer",
    "parseBwsPlayerNumberRow",
    "parseBwsPlayerNumberRowDetailed",
    "parseBwsReceivedRow",
    "parseBwsReceivedRowDetailed",
    "parseResultsCsv"
  ]);
});

test("received row keeps its emitted key set", () => {
  const parsed = parseFixtureFile({ pages: [[fixture.buildReceivedRow(baseReceivedFields())]] });
  assert.equal(parsed.receivedData.length, 1);
  assert.deepEqual(Object.keys(parsed.receivedData[0]), [
    "ID", "Section", "Table", "Round", "Board", "PairNS", "PairEW", "Declarer",
    "NS/EW", "Contract", "Result", "LeadCard", "Remarks", "DateLog", "TimeLog",
    "Erased", "_page", "_row", "_offset"
  ]);
});

test("Erased boolean is decoded from the null-mask bit", () => {
  const parsed = parseFixtureFile({
    pages: [[
      fixture.buildReceivedRow(baseReceivedFields({ id: 1, erased: 0 })),
      fixture.buildReceivedRow(baseReceivedFields({ id: 2, table: 4, erased: 1 }))
    ]]
  });
  assert.equal(parsed.receivedData.length, 2, "erased rows are still emitted");
  assert.equal(parsed.receivedData.find((row) => row.ID === 1).Erased, 0);
  assert.equal(parsed.receivedData.find((row) => row.ID === 2).Erased, 1);
  assert.equal(parsed.metadata.diagnostics.erasedRows, 1);
});

test("other booleans set in the mask do not leak into Erased", () => {
  const parsed = parseFixtureFile({
    pages: [[fixture.buildReceivedRow(baseReceivedFields({
      processed: 1, processed1: 1, processed2: 1, processed3: 1, processed4: 1, externalUpdate: 1, erased: 0
    }))]]
  });
  assert.equal(parsed.receivedData[0].Erased, 0);
});

test("rows flagged 0x4000 in the row directory are skipped as deleted", () => {
  const keep = fixture.buildReceivedRow(baseReceivedFields({ id: 1 }));
  const drop = fixture.buildReceivedRow(baseReceivedFields({ id: 2, table: 4 }));
  const parsed = parseFixtureFile({ pages: [[keep, { bytes: drop, flags: fixture.DELETED_FLAG }]] });
  assert.deepEqual(parsed.receivedData.map((row) => row.ID), [1]);
  assert.equal(selectedCandidate(parsed).received.rejections.deleted_row, 1);
  assert.equal(parsed.metadata.diagnostics.deletedRowSlots, 1);
});

test("rows flagged 0x8000 (lookup) are still read, like mdbtools", () => {
  const row = fixture.buildReceivedRow(baseReceivedFields({ id: 7 }));
  const parsed = parseFixtureFile({ pages: [[{ bytes: row, flags: fixture.LOOKUP_FLAG }]] });
  assert.deepEqual(parsed.receivedData.map((r) => r.ID), [7]);
});

test("trick-count Result text passes through verbatim", () => {
  const results = ["12", "9", "=", "+1", "-2"];
  const parsed = parseFixtureFile({
    pages: [[...results.map((result, index) => fixture.buildReceivedRow(baseReceivedFields({
      id: index + 1, table: index + 1, result
    })))]]
  });
  assert.deepEqual(parsed.receivedData.map((row) => row.Result), results);
});

test("adjusted rows with empty Contract but Remarks are emitted", () => {
  const parsed = parseFixtureFile({
    pages: [[fixture.buildReceivedRow(baseReceivedFields({
      contract: null, result: null, remarks: "40%-60%"
    }))]]
  });
  assert.equal(parsed.receivedData.length, 1);
  assert.equal(parsed.receivedData[0].Contract, "");
  assert.equal(parsed.receivedData[0].Result, "");
  assert.equal(parsed.receivedData[0].Remarks, "40%-60%");
});

test("LeadCard and Remarks are parsed as real columns", () => {
  const parsed = parseFixtureFile({
    pages: [[fixture.buildReceivedRow(baseReceivedFields({
      leadCard: "SA", remarks: "late play"
    }))]]
  });
  assert.equal(parsed.receivedData[0].LeadCard, "SA");
  assert.equal(parsed.receivedData[0].Remarks, "late play");
});

test("pass-out rows parse with Contract PASS and empty Result", () => {
  const parsed = parseFixtureFile({
    pages: [[fixture.buildReceivedRow(baseReceivedFields({
      contract: "PASS", result: null, declarer: 4
    }))]]
  });
  assert.equal(parsed.receivedData[0].Contract, "PASS");
  assert.equal(parsed.receivedData[0].Result, "");
});

test("rows longer than 255 bytes crack via the Jet3 jump table", () => {
  const remarks = "board fouled - " + "x".repeat(230);
  const row = fixture.buildReceivedRow(baseReceivedFields({ remarks, leadCard: "H4" }));
  assert.ok(row.length > 255, `fixture row is ${row.length} bytes`);
  const parsed = parseFixtureFile({ pages: [[row]] });
  assert.equal(parsed.receivedData.length, 1);
  assert.equal(parsed.receivedData[0].Remarks, remarks);
  assert.equal(parsed.receivedData[0].LeadCard, "H4");
  assert.equal(parsed.receivedData[0].Contract, "4 H");
});

test("high bytes decode as Windows-1252, including the 0x80-0x9F range", () => {
  const parsed = parseFixtureFile({
    pages: [
      [fixture.buildReceivedRow(baseReceivedFields({ remarks: "split 60–40% €" }))],
      [fixture.buildPlayerRow({ section: 1, table: 1, direction: "N", number: "123", name: "Hélène Œuf", timeSerial: 46203.5 })]
    ]
  });
  assert.equal(parsed.receivedData[0].Remarks, "split 60–40% €");
  assert.equal(parsed.playerNumbers[0].Name, "Hélène Œuf");
});

test("player rows split Direction, Number and Name as real columns", () => {
  const parsed = parseFixtureFile({
    pages: [[
      fixture.buildPlayerRow({ section: 1, table: 1, direction: "N", number: "9826653", name: "Hazel Kuhn", timeSerial: 46203.4610763889 }),
      fixture.buildPlayerRow({ section: 1, table: 1, direction: "E", number: "42", name: "22nd Street Pro", timeSerial: 46203.5 }),
      fixture.buildPlayerRow({ section: 1, table: 2, direction: "S", number: null, name: null, round: 3, placeholder: true })
    ]]
  });
  assert.equal(parsed.playerNumbers.length, 3);
  const [north, east] = parsed.playerNumbers;
  assert.deepEqual(
    [north.Direction, north.Number, north.Name],
    ["N", "9826653", "Hazel Kuhn"]
  );
  assert.deepEqual(
    [east.Direction, east.Number, east.Name],
    ["E", "42", "22nd Street Pro"],
    "a name starting with digits keeps its digits"
  );
  const placeholder = parsed.playerNumbers[2];
  assert.deepEqual(
    [placeholder.Direction, placeholder.Number, placeholder.Name, placeholder.Round],
    ["S", "", "", 3]
  );
  assert.equal(Object.prototype.hasOwnProperty.call(placeholder, "TimeLog"), false);
});

test("timestamps round the day fraction to the nearest second", () => {
  const parsed = parseFixtureFile({
    pages: [
      [fixture.buildReceivedRow(baseReceivedFields({ timeSerial: 40033.6 / 86400 }))],
      [fixture.buildPlayerRow({ section: 1, table: 1, direction: "N", number: "1", name: "A", timeSerial: 46207 + 39836.7 / 86400 })]
    ]
  });
  // truncation would give 11:07:13 / 11:03:56
  assert.equal(parsed.receivedData[0].TimeLog, "11:07:14");
  assert.equal(parsed.playerNumbers[0].TimeLog, "07/04/26 11:03:57");
});

test("a Jet4 version byte yields zero rows and an explicit warning", () => {
  const parsed = parseFixtureFile({
    jetVersion: 0x01,
    pages: [[fixture.buildReceivedRow(baseReceivedFields())]]
  });
  assert.equal(parsed.receivedData.length, 0);
  assert.equal(parsed.playerNumbers.length, 0);
  assert.ok(
    parsed.warnings.some((warning) => /Jet4.*not supported|not supported.*Jet4/i.test(warning)),
    JSON.stringify(parsed.warnings)
  );
  const diagnostics = parsed.metadata.diagnostics;
  assert.equal(diagnostics.acceptedReceivedRows, 0);
  assert.ok(Array.isArray(diagnostics.candidates) && diagnostics.candidates.length > 0);
  assert.ok(diagnostics.candidates[0].received.rejections != null, "diagnostics shape kept for the renderer");
});

test("an unrecognized version byte falls back to the heuristic scan", () => {
  const bytes = fixture.buildBwsFile({ jetVersion: 0x7e, pages: [[fixture.buildReceivedRow(baseReceivedFields())]] });
  const parsed = parser.parseBwsBuffer(bytes, "odd.BWS");
  assert.equal(parsed.receivedData.length, 1);
  assert.ok(parsed.warnings.some((warning) => /version byte was not recognized/i.test(warning)));
});

test("garbage buffers degrade gracefully with warnings", () => {
  const bytes = new Uint8Array(8192).fill(0xff);
  const parsed = parser.parseBwsBuffer(bytes, "garbage.BWS");
  assert.equal(parsed.receivedData.length, 0);
  assert.ok(parsed.warnings.some((warning) => /No Bridgemate ReceivedData rows/.test(warning)));
  assert.ok(parsed.metadata.diagnostics.pageProfile.allFfPageCount > 0);
});

test("parseResultsCsv still parses CSV imports", () => {
  const parsed = parser.parseResultsCsv("Board,Contract,Result\n1,4 H,=\n", "results.csv", 30);
  assert.equal(parsed.receivedData.length, 1);
  assert.equal(parsed.receivedData[0].Contract, "4 H");
  assert.equal(parsed.metadata.diagnostics.csvRows, 2);
});

test("sample 01.BWS matches the mdb-export ground-truth snapshot", (t) => {
  if (!fs.existsSync(SAMPLE_PATH)) return t.skip("samples/01.BWS not present");
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  const parsed = parser.parseBwsBuffer(new Uint8Array(fs.readFileSync(SAMPLE_PATH)), "01.BWS");

  assert.equal(parsed.receivedData.length, snapshot.receivedRowCount, "ReceivedData row count");
  assert.equal(parsed.playerNumbers.length, snapshot.playerRowCount, "PlayerNumbers row count");
  assert.equal(parsed.metadata.diagnostics.erasedRows, snapshot.erasedRowCount);

  for (const expected of snapshot.receivedRows) {
    const actual = parsed.receivedData.find((row) => row.ID === expected.ID);
    assert.ok(actual, `row ID=${expected.ID} present`);
    for (const key of Object.keys(expected)) {
      assert.equal(actual[key], expected[key], `row ID=${expected.ID} field ${key}`);
    }
  }

  const passOut = parsed.receivedData.find((row) => row.ID === snapshot.passOutRow.ID);
  assert.ok(passOut, "pass-out row present");
  for (const key of Object.keys(snapshot.passOutRow)) {
    assert.equal(passOut[key], snapshot.passOutRow[key], `pass-out field ${key}`);
  }

  const keyOf = (row) => [row.Section, row.Table, row.Direction, row.Number, row.Name, row.Round, row.TimeLog || ""].join("|");
  const actualPlayers = new Set(parsed.playerNumbers.map(keyOf));
  for (const expected of snapshot.playerRows) {
    assert.ok(actualPlayers.has(keyOf(expected)), `player row ${keyOf(expected)}`);
  }
});

test("sample 01.BWS diagnostics keep the renderer contract", (t) => {
  if (!fs.existsSync(SAMPLE_PATH)) return t.skip("samples/01.BWS not present");
  const parsed = parser.parseBwsBuffer(new Uint8Array(fs.readFileSync(SAMPLE_PATH)), "01.BWS");
  const diagnostics = parsed.metadata.diagnostics;
  for (const key of ["sourceType", "fileSize", "signature", "recognizedJet", "selectedPageSize",
    "acceptedReceivedRows", "duplicateReceivedRows", "acceptedPlayerRows", "pageProfile", "candidates"]) {
    assert.ok(key in diagnostics, `diagnostics.${key}`);
  }
  const candidate = selectedCandidate(parsed);
  for (const key of ["filePages", "trailingBytes", "dataPages", "rowSlots", "rowSlices",
    "acceptedRows", "rejectedRows", "rejections"]) {
    assert.ok(key in candidate.received, `candidate.received.${key}`);
    assert.ok(key in candidate.players, `candidate.players.${key}`);
  }
});

test("rows spanning 256-byte jump-table boundaries round-trip through the fixture packer", () => {
  [200, 240, 260, 468, 520, 700, 900, 1200, 1500, 1900].forEach((length) => {
    const remarks = "R".repeat(length);
    const parsed = parseFixtureFile({
      pages: [[fixture.buildReceivedRow(baseReceivedFields({ remarks }))]]
    });
    assert.equal(parsed.receivedData.length, 1, `row with ${length}-char remarks rejected`);
    assert.equal(parsed.receivedData[0].Remarks, remarks, `remarks mangled at length ${length}`);
    assert.equal(parsed.receivedData[0].Contract, "4 H", `contract mangled at length ${length}`);
  });
});
