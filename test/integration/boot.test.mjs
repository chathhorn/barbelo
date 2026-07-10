import test from "node:test";
import assert from "node:assert/strict";
import { loadApp, csvFrom } from "../helpers/load-app.js";

// Boots the real entry module (src/main.js) against DOM stubs and checks
// the public wiring that the browser relies on.
const app = await loadApp();

test("window.PBNAnalyzer exposes the stable public API", () => {
  assert.deepEqual(Object.keys(app.PBNAnalyzer).sort(), [
    "buildAnalysis",
    "buildPairImprovementReport",
    "buildResultsAnalysis",
    "contractGlyphHtml",
    "csvCell",
    "decodeTextBuffer",
    "getColumnDefs",
    "getCsvContexts",
    "parseBwsBuffer",
    "parseDeal",
    "parsePbn",
    "parseResultsCsv",
    "scoreDuplicateContract"
  ]);
});

test("parser compatibility globals stay attached", () => {
  assert.equal(typeof app.BarbeloPbnParser.parsePbn, "function");
  assert.equal(typeof app.BarbeloBwsParser.parseBwsBuffer, "function");
  assert.equal(typeof app.BarbeloBwsParser.parseResultsCsv, "function");
});

test("a CSV round-trips through the public API end to end", () => {
  const { parseResultsCsv, buildResultsAnalysis, buildPairImprovementReport } = app.PBNAnalyzer;
  const csv = csvFrom([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "-1"]
  ]);
  const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
  assert.equal(results.rows.length, 2);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.summary.percent, 100);
});
