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

test("mpVsAverage measures the session against the field average, not a perfect top", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "+1"],
    ["1", "3", "4", "N", "3 NT", "="],
    ["1", "5", "6", "N", "3 NT", "-1"],
    ["2", "1", "2", "N", "3 NT", "-1"],
    ["2", "3", "4", "N", "3 NT", "="],
    ["2", "5", "6", "N", "3 NT", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  // One top and one bottom on top-2 boards: exactly average.
  assert.equal(report.summary.mpVsAverage, 0);
  assert.equal(report.summary.mpConceded, 2);
  assert.equal(report.summary.mpVsAverage != null && "lostMatchpoints" in report.summary, false, "lostMatchpoints headline replaced by mpVsAverage");
});

test("a mildly below-average board with no real flag stays out of the review queue", () => {
  // 41.7% board: worse than average but flagged by nothing - the old
  // pct<50 catch-all and severity floor put boards like this in every
  // pair's queue.
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "-1"],
    ["1", "5", "6", "N", "3 NT", "-1"],
    ["1", "7", "8", "N", "3 NT", "="],
    ["1", "9", "10", "N", "3 NT", "+1"],
    ["1", "11", "12", "N", "3 NT", "+1"],
    ["1", "13", "14", "N", "3 NT", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const view = report.rows[0];
  assert.ok(view.percent > 40 && view.percent < 50, `expected a 40-50% board, got ${view.percent}`);
  assert.equal(report.reviewItems.length, 0, "unflagged below-average board leaked into the review queue");
});

test("overreach needs a vulnerability-scaled swing or a real minus score", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "3 S", "+1"],
    ["2", "1", "2", "N", "4 S", "-1"],
    ["2", "3", "4", "N", "3 S", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const byBoard = new Map();
  report.lossLedger.boardItems.forEach((item) => byBoard.set(String(item.boardNo), item));
  // Board 1 (none vul): -50 vs +170 is a 220 swing, over the 200 gate.
  assert.equal(byBoard.get("1").comparisons[0].categoryKey, "overreach");
  // Board 2 (NS vul): -100 vs +170 is 270, under the 300 vul gate.
  assert.equal(byBoard.get("2").comparisons[0].categoryKey, "contractSelection", "vulnerable down-one should not be branded overreach");
});

const DD_PBN = [
  "[Board \"1\"]",
  "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]",
  "[OptimumResultTable \"Declarer;Denomination\\2R;Result\\2R\"]",
  "N NT 9",
  "N S 10",
  "N H 8",
  "N D 8",
  "N C 8",
  "S NT 9",
  "S S 10",
  "S H 8",
  "S D 8",
  "S C 8",
  "E NT 4",
  "E S 3",
  "E H 5",
  "E D 5",
  "E C 5",
  "W NT 4",
  "W S 3",
  "W H 5",
  "W D 5",
  "W C 5"
].join("\n");

test("failing a double-dummy-makeable contract is a play problem, not overreach", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "2 S", "+2"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const item = report.lossLedger.boardItems[0];
  assert.equal(item.comparisons[0].categoryKey, "declarerTricks", "DD says 4S makes: the failure is the play, not the auction");
  const reviewItem = report.reviewItems.find((entry) => String(entry.row.boardNo) === "1");
  assert.ok(/could make|the play/.test(reviewItem.diagnosis.explanation), "diagnosis should point at the play");
});

test("trick flags are relative to the field's DD deviation, not raw DD", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  // Everyone one trick under DD: the normal club result, nothing to flag.
  const flat = buildPairImprovementReport(analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "4 S", "-1"],
    ["1", "5", "6", "N", "4 S", "-1"]
  ], analysis), "1");
  assert.equal(flat.rows[0].relativeTrickDelta, 0, "matching the field's DD deviation should read as zero");
  // Two tricks under a field that took DD tricks: flag it.
  const behind = buildPairImprovementReport(analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "-2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="]
  ], analysis), "1");
  assert.equal(behind.rows[0].relativeTrickDelta, -2);
  const item = behind.reviewItems.find((entry) => String(entry.row.boardNo) === "1");
  assert.ok(item.reasons.some((reason) => reason.label.includes("trick loss vs field")), "field-relative trick loss should be flagged");
});

test("an above-average board is never a review candidate, even with a failed contract", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "5 S", "-2"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.rows[0].percent, 100, "down one should have won the board");
  assert.equal(report.reviewItems.length, 0, "a winning board must not be flagged for review");
});

test("profile weakness and focus sentence name the same biggest problem", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["2", "1", "2", "N", "3 NT", "-1"],
    ["2", "3", "4", "N", "3 NT", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const weakness = report.profile.weaknesses.find((entry) => entry.label === "Biggest Loss Theme");
  assert.ok(weakness, "biggest loss theme missing");
  assert.equal(weakness.value, report.decisionTypes[0].label, "profile weakness and focus must rank from the same partition");
  assert.ok(report.profile.focus.toLowerCase().includes(report.decisionTypes[0].label.toLowerCase()));
});

test("a made doubled contract loses to the missed slam, not to penalty/double", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "5 C X", "="],
    ["1", "3", "4", "N", "6 C", "="],
    ["1", "5", "6", "N", "6 C", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const categories = report.lossLedger.categories.map((category) => category.key);
  assert.ok(categories.includes("missedGameSlam"), `expected missedGameSlam, got ${categories.join(",")}`);
  assert.ok(!categories.includes("penaltyDouble"), "a made doubled contract is not a double problem");
});

test("the field DD baseline only uses same-declaring-side peers", () => {
  // Pair 1 defends East's 2S while NS peers declare 3NT: the NS rows'
  // DD deltas must not pollute the defending pair's baseline.
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "E", "2 S", "="],
    ["1", "3", "4", "N", "3 NT", "-1"],
    ["1", "5", "6", "N", "3 NT", "-1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const view = report.rows[0];
  assert.equal(view.fieldDdDelta, null, "no same-declaring-side peer: baseline must stay null");
});

test("a single-table disaster is still flagged despite a null percent", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "7 NT X", "-5"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.rows[0].percent, null, "single-table board should have no percent");
  assert.equal(report.reviewItems.length, 1, "failed doubled contract must still be flagged");
  assert.ok(report.reviewItems[0].reasons.some((reason) => reason.label.includes("failed doubled")));
});

test("field context tracks rival head-to-heads and table opponents", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "+1"],
    ["1", "3", "4", "N", "3 NT", "="],
    ["2", "1", "2", "N", "2 S", "="],
    ["2", "3", "4", "N", "2 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const rival = report.fieldContext.rivals.find((entry) => String(entry.pairNo) === "3");
  assert.ok(rival, "same-direction rival missing");
  assert.equal(rival.wins, 1);
  assert.equal(rival.losses, 0);
  assert.equal(rival.ties, 1);
  assert.equal(rival.netMp, 0.5);
  const opponent = report.fieldContext.opponents.find((entry) => String(entry.pairNo) === "2");
  assert.ok(opponent, "table opponent missing");
  assert.equal(opponent.boardCount, 2);
});

test("placeholder player identities never read as names in coaching prose", async () => {
  const { peerDisplayName } = await import("../src/core/report.js");
  assert.equal(peerDisplayName("4", "Table 9 South"), "Pair 4");
  assert.equal(peerDisplayName("4", "Ann West / Bo East"), "Pair 4 - Ann West / Bo East");
  assert.equal(peerDisplayName("4", ""), "Pair 4");
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
