import test from "node:test";
import { buildAnalysis } from "../src/core/boards.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { scoreDuplicateContract } from "../src/core/scoring.js";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { parsePbn } from "../src/parsers/pbn.js";
import assert from "node:assert/strict";
import { csvFrom } from "./helpers/load-app.js";

function score(contract, result, declarer, vulnerable) {
  return scoreDuplicateContract(contract, result, declarer, vulnerable);
}

test("duplicate scoring table stays correct", () => {
  assert.equal(score("3 NT", "=", "N", "None").scoreDeclarer, 400);
  assert.equal(score("3 NT", "=", "N", "NS").scoreDeclarer, 600);
  assert.equal(score("4 S X", "=", "E", "EW").scoreDeclarer, 790);
  assert.equal(score("2 S X", "=", "S", "None").scoreDeclarer, 470);
  assert.equal(score("6 C", "=", "W", "All").scoreDeclarer, 1370);
  assert.equal(score("7 NT XX", "=", "N", "NS").scoreDeclarer, 2980);
  assert.equal(score("1 NT", "+2", "E", "None").scoreDeclarer, 150);
  assert.equal(score("2 D X", "+1", "S", "None").scoreDeclarer, 280);
  assert.equal(score("3 H", "-5", "W", "EW").scoreDeclarer, -500);
  assert.equal(score("3 H X", "-5", "W", "None").scoreDeclarer, -1100);
  assert.equal(score("3 H X", "-3", "W", "All").scoreDeclarer, -800);
  assert.equal(score("2 S XX", "-2", "N", "None").scoreDeclarer, -600);
  assert.equal(score("PASS", "", "", "None").scoreNS, 0);
});

test("blank result is unscorable, not silently 'made exactly'", () => {
  const scored = score("3 NT", "", "N", "None");
  assert.equal(scored.scoreNS, null);
  assert.ok(scored.error);
});

test("bare-number results are absolute tricks with 0-13 bounds", () => {
  assert.equal(score("3 NT", "9", "N", "None").scoreDeclarer, 400);
  assert.equal(score("3 NT", "7", "N", "NS").scoreDeclarer, -200);
  assert.equal(score("3 NT", "14", "N", "None").scoreNS, null);
  assert.equal(score("1 NT", "+7", "N", "None").scoreNS, null);
  assert.equal(score("1 C", "-8", "N", "None").scoreNS, null);
});

test("missing declarer info yields a scoring error instead of defaulting to NS", () => {
  const csv = csvFrom([
    ["Board", "Contract", "Result"],
    ["1", "3 NT", "="]
  ]);
  const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
  assert.equal(results.rows.length, 1);
  assert.equal(results.rows[0].scoreNS, null);
  assert.ok(results.rows[0].scoringError);
});

test("declarer pair number attributes the declaring side", () => {
  const csv = csvFrom([
    ["Board", "PairNS", "PairEW", "Declarer", "Contract", "Result"],
    ["1", "4", "7", "7", "2 S", "+1"]
  ]);
  const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
  assert.equal(results.rows[0].scoreNS, -140);
});

test("rows with blank or unrecognized board numbers are skipped with a warning", () => {
  const csv = csvFrom([
    ["Bd", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["2", "3", "4", "S", "2 S", "+1"]
  ]);
  const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
  assert.equal(results.rows.length, 0);
  assert.ok(results.warnings.some((warning) => /no recognizable board number/i.test(warning)));

  const blankCsv = csvFrom([
    ["Board", "NS/EW", "Contract", "Result"],
    ["", "N", "3 NT", "="],
    ["5", "N", "3 NT", "="]
  ]);
  const blankResults = buildResultsAnalysis(parseResultsCsv(blankCsv, "t.csv", blankCsv.length), null);
  assert.equal(blankResults.rows.length, 1);
  assert.equal(blankResults.rows[0].boardNo, 5);
});

test("missing Vulnerable/Dealer tags fall back to the standard board cycle", () => {
  const pbn = [
    "[Board \"2\"]",
    "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]"
  ].join("\n");
  const analysis = buildAnalysis(parsePbn(pbn, "t.pbn"));
  assert.equal(analysis.boards[0].vulnerable, "NS");
  assert.equal(analysis.boards[0].dealer, "E");

  const csv = csvFrom([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["2", "1", "2", "N", "3 NT", "="]
  ]);
  const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), analysis);
  assert.equal(results.rows[0].scoreNS, 600);
});

test("PBN 'Love' and 'Both' vulnerability synonyms are normalized", () => {
  const pbn = [
    "[Board \"1\"]",
    "[Vulnerable \"Love\"]",
    "",
    "[Board \"2\"]",
    "[Vulnerable \"Both\"]"
  ].join("\n");
  const analysis = buildAnalysis(parsePbn(pbn, "t.pbn"));
  assert.equal(analysis.boards[0].vulnerable, "None");
  assert.equal(analysis.boards[1].vulnerable, "All");
});

test("boards without a parseable deal report no voids", () => {
  const pbn = "[Board \"1\"]\n[Event \"No deal here\"]";
  const analysis = buildAnalysis(parsePbn(pbn, "t.pbn"));
  assert.equal(analysis.boards[0].voids.length, 0);
  assert.equal(analysis.boards[0].longSuits.length, 0);
});
