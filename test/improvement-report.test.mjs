import test from "node:test";
import { buildAnalysis } from "../src/core/boards.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { parsePbn } from "../src/parsers/pbn.js";
import assert from "node:assert/strict";
import { csvFrom } from "./helpers/load-app.js";

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

test("a missed slam dominates the swing diagnosis even when ties carry equal loss", () => {
  // 4 ties (2.0 MP) vs 2 slam bidders (2.0 MP): the old comparison-count
  // tiebreak picked tieSplit and advised "small overtrick details".
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "5 D", "+1"],
    ["1", "3", "4", "N", "5 D", "+1"],
    ["1", "5", "6", "N", "5 D", "+1"],
    ["1", "7", "8", "N", "5 D", "+1"],
    ["1", "9", "10", "N", "5 D", "+1"],
    ["1", "11", "12", "N", "6 D", "="],
    ["1", "13", "14", "N", "6 D", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const item = report.reviewItems.find((entry) => String(entry.row.boardNo) === "1");
  assert.ok(item, "board 1 missing from review queue");
  assert.equal(item.diagnosis.categoryKey, "missedGameSlam");
});

test("a doubled peer table does not hijack a missed game into penalty/double", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S X", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(!categories.includes("penaltyDouble"), "peer-only double misclassified as penaltyDouble");
  const missed = report.lossLedger.categories.find((category) => category.key === "missedGameSlam");
  assert.ok(missed, "expected missedGameSlam");
  assert.equal(missed.comparisonCount, 2, "both game comparisons should count as missed game");
});

test("a double at the pair's own table still classifies as penalty/double", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 H X", "-2"],
    ["1", "3", "4", "N", "2 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(categories.includes("penaltyDouble"), `expected penaltyDouble, got ${categories.join(",")}`);
});

test("field average excludes the pair's own score", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "+2"],
    ["1", "5", "6", "N", "3 NT", "+2"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const view = report.rows.find((entry) => String(entry.row.boardNo) === "1");
  assert.equal(view.fieldAverage, 460, "field average should be the peer average, not include self");
  assert.equal(view.fieldDelta, -60);
});

test("big-swing partscore comparisons are not filed as partscore battles", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "1 S", "+1"],
    ["1", "3", "4", "N", "2 S", "+4"],
    ["2", "1", "2", "N", "1 S", "+1"],
    ["2", "3", "4", "N", "2 S", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const byBoard = new Map();
  report.lossLedger.boardItems.forEach((item) => byBoard.set(String(item.boardNo), item));
  assert.equal(byBoard.get("1").comparisons[0].categoryKey, "contractSelection", "230-point swing should not be a partscore battle");
  assert.equal(byBoard.get("2").comparisons[0].categoryKey, "partscoreBattle", "small partscore swing should stay a partscore battle");
});

test("a replayed board keeps two distinct plays apart", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "="],
    ["1", "1", "6", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "4 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const failing = report.reviewItems.find((item) => item.pairScore === -50);
  assert.ok(failing, "failing replay missing from review queue");
  assert.equal(failing.boardLossItem.targetScore, -50, "diagnosis attached to the wrong play of the replayed board");
  assert.equal(failing.diagnosis.categoryKey, "declarerTricks");
  const peerPairs = failing.peerComparison.rows.filter((row) => !row.isTarget).map((row) => String(row.pairNo));
  assert.ok(!peerPairs.includes("1"), "the pair's own replay row appeared as a peer");
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
