import test from "node:test";
import assert from "node:assert/strict";
import { loadApp, csvFrom } from "./helpers/load-app.js";

const app = await loadApp();
const { parseResultsCsv, buildResultsAnalysis, buildPairImprovementReport, parsePbn, buildAnalysis } = app.PBNAnalyzer;

function analyzeCsv(rows, analysis) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), analysis || null);
}

test("failing a contract that peers made in the identical contract is declarer play, not overreach", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "S", "7 NT", "-1"],
    ["1", "3", "4", "S", "7 NT", "="],
    ["1", "5", "6", "S", "7 NT", "="],
    ["1", "7", "8", "S", "7 NT", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  assert.ok(report, "report missing");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(categories.includes("declarerTricks"), `expected declarerTricks, got ${categories.join(",")}`);
  assert.ok(!categories.includes("overreach"), "overreach should not be diagnosed for a same-contract trick loss");
  assert.equal(report.reviewItems[0].diagnosis.categoryKey, "declarerTricks");
});

test("defended boards with different contracts are competitive-auction losses, not defense", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "E", "3 H", "="],
    ["1", "3", "4", "E", "5 H", "-3"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(categories.includes("competitiveAuction"), `expected competitiveAuction, got ${categories.join(",")}`);
  assert.ok(!categories.includes("defensiveTricks"), "different-contract auction swings must not be blamed on defense");
});

test("defense is still diagnosed when peers defended the identical contract", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "E", "2 S", "+1"],
    ["1", "3", "4", "E", "2 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(categories.includes("defensiveTricks"), `expected defensiveTricks, got ${categories.join(",")}`);
});

test("a session winner with no losses gets an empty review queue, not their best boards", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "+1"],
    ["1", "3", "4", "N", "3 NT", "="],
    ["2", "1", "2", "N", "4 S", "="],
    ["2", "3", "4", "N", "4 S", "-1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.summary.percent, 100);
  assert.equal(report.reviewItems.length, 0);
});

test("pair profile never lists a sub-50% stat as a strength or duplicates strength/weakness", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "E", "3 NT", "="],
    ["1", "3", "4", "E", "3 NT", "-2"],
    ["2", "1", "2", "E", "4 S", "+1"],
    ["2", "3", "4", "E", "4 S", "-1"],
    ["3", "1", "2", "E", "2 H", "+2"],
    ["3", "3", "4", "E", "2 H", "-1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  report.profile.strengths.forEach((strength) => {
    const match = String(strength.value).match(/(\d+(?:\.\d+)?)%/);
    if (match) assert.ok(Number(match[1]) >= 50, `strength below 50%: ${strength.value}`);
  });
  const strengthValues = new Set(report.profile.strengths.map((item) => item.value));
  report.profile.weaknesses.forEach((weakness) => {
    assert.ok(!strengthValues.has(weakness.value), `stat listed as both strength and weakness: ${weakness.value}`);
  });
});

test("bestMakeable reports 'Nothing makes' instead of a level-0 contract", () => {
  const pbn = [
    "[Board \"1\"]",
    "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]",
    "[OptimumResultTable \"Declarer;Denomination\\2R;Result\\2R\"]",
    "N NT 5",
    "N S 6",
    "N H 5",
    "N D 5",
    "N C 3",
    "S NT 5",
    "S S 6",
    "S H 5",
    "S D 5",
    "S C 3",
    "E NT 7",
    "E S 7",
    "E H 8",
    "E D 8",
    "E C 8",
    "W NT 7",
    "W S 7",
    "W H 8",
    "W D 8",
    "W C 8"
  ].join("\n");
  const analysis = buildAnalysis(parsePbn(pbn, "t.pbn"));
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "2 S", "-2"],
    ["1", "3", "4", "N", "1 S", "-1"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.rows[0].bestMakeable.text, "Nothing makes");
  assert.equal(report.rows[0].bestMakeable.className, "None");
});

test("swing items report total board MP loss, with the category loss kept on the diagnosis", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "S", "7 NT", "-1"],
    ["1", "3", "4", "S", "7 NT", "="],
    ["1", "5", "6", "S", "7 NT", "="],
    ["1", "7", "8", "S", "7 NT", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const item = report.reviewItems[0];
  assert.equal(item.mpLoss, 3);
  assert.equal(item.diagnosis.lostMp, 3);
});

test("director-adjusted boards never appear in the review queue", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result", "Remarks"],
    ["1", "1", "2", "N", "3 NT", "=", ""],
    ["1", "3", "4", "N", "3 NT", "+1", ""],
    ["1", "5", "6", "N", "3 NT", "+2", ""],
    ["1", "7", "8", "", "", "", "30%-70%"],
    ["2", "7", "8", "N", "2 S", "-1", ""],
    ["2", "1", "2", "N", "2 S", "=", ""]
  ]);
  const report = buildPairImprovementReport(results, "7");
  assert.ok(report, "report missing");
  assert.ok(
    report.reviewItems.every((item) => String(item.row.boardNo) !== "1"),
    "adjusted board 1 leaked into the review queue"
  );
});
