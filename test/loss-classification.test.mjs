import test from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import { csvFrom } from "./helpers/load-app.js";

// Table-driven coverage of classifyLossComparison: each board is an
// independent traveler where pair 1 (NS) loses to one peer, crafted to
// land in one specific category.
const CASES = [
  {
    board: 1,
    category: "declarerTricks",
    rows: [
      ["1", "1", "2", "N", "3 NT", "="],
      ["1", "3", "4", "N", "3 NT", "+1"]
    ]
  },
  {
    board: 2,
    category: "defensiveTricks",
    rows: [
      ["2", "1", "2", "E", "2 S", "+1"],
      ["2", "3", "4", "E", "2 S", "="]
    ]
  },
  {
    board: 3,
    category: "penaltyDouble",
    rows: [
      ["3", "1", "2", "N", "3 H X", "-1"],
      ["3", "3", "4", "N", "3 H", "="]
    ]
  },
  {
    board: 4,
    category: "overreach",
    rows: [
      ["4", "1", "2", "N", "5 D", "-1"],
      ["4", "3", "4", "N", "3 D", "+1"]
    ]
  },
  {
    board: 5,
    category: "missedGameSlam",
    rows: [
      ["5", "1", "2", "N", "3 S", "+1"],
      ["5", "3", "4", "N", "4 S", "="]
    ]
  },
  {
    board: 6,
    category: "wrongStrain",
    rows: [
      ["6", "1", "2", "N", "2 S", "="],
      ["6", "3", "4", "N", "2 H", "+1"]
    ]
  },
  {
    board: 7,
    category: "partscoreBattle",
    rows: [
      ["7", "1", "2", "N", "2 S", "="],
      ["7", "3", "4", "N", "3 S", "="]
    ]
  },
  {
    board: 8,
    category: "competitiveAuction",
    rows: [
      ["8", "1", "2", "E", "4 S", "="],
      ["8", "3", "4", "E", "3 S", "+1"]
    ]
  },
  {
    board: 9,
    category: "contractSelection",
    rows: [
      ["9", "1", "2", "N", "3 NT", "="],
      ["9", "3", "4", "N", "5 D", "+1"]
    ]
  },
  {
    board: 10,
    category: "tieSplit",
    rows: [
      ["10", "1", "2", "N", "2 NT", "="],
      ["10", "3", "4", "N", "2 NT", "="]
    ]
  }
];

const header = ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"];
const csv = csvFrom([header, ...CASES.flatMap((entry) => entry.rows)]);
const results = buildResultsAnalysis(parseResultsCsv(csv, "matrix.csv", csv.length), null);
const report = buildPairImprovementReport(results, "1");
const byBoard = new Map(report.lossLedger.boardItems.map((item) => [String(item.boardNo), item]));

for (const entry of CASES) {
  test(`board ${entry.board} classifies as ${entry.category}`, () => {
    const item = byBoard.get(String(entry.board));
    assert.ok(item, `no loss recorded for board ${entry.board}`);
    assert.equal(item.comparisons.length, 1);
    assert.equal(item.comparisons[0].categoryKey, entry.category);
  });
}

test("every loss category maps to a decision type", () => {
  const typeKeys = new Set(report.decisionTypes.map((type) => type.key));
  assert.ok(typeKeys.size >= 5, `expected several decision types, got ${[...typeKeys].join(",")}`);
  const totalFromTypes = report.decisionTypes.reduce((acc, type) => acc + type.totalLoss, 0);
  assert.equal(totalFromTypes, report.lossLedger.totalLoss);
});
