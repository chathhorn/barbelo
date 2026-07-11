import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysis } from "../src/core/boards.js";
import { parsePbn } from "../src/parsers/pbn.js";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import { csvFrom } from "./helpers/load-app.js";

// North/South make 10 tricks in spades and 9 in notrump; East/West make
// nothing. Board 1, so a 4S/3NT game is DD-available for NS.
function ddPbn(nsSpadeTricks = 10) {
  return [
    "[Board \"1\"]",
    "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]",
    "[OptimumResultTable \"Declarer;Denomination\\2R;Result\\2R\"]",
    `N S ${nsSpadeTricks}`,
    "N NT 9",
    "N H 8",
    "N D 8",
    "N C 8",
    `S S ${nsSpadeTricks}`,
    "S NT 9",
    "S H 8",
    "S D 8",
    "S C 8",
    "E S 3",
    "E NT 4",
    "E H 5",
    "E D 5",
    "E C 5",
    "W S 3",
    "W NT 4",
    "W H 5",
    "W D 5",
    "W C 5"
  ].join("\n");
}

function analyzeCsv(rows, analysis) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), analysis || null);
}

const HEADER = ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"];

test("declared scorecard verdicts come from the same-contract cohort median", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "4 S", "="],
    ["1", "3", "4", "N", "4 S", "+1"],
    ["1", "5", "6", "N", "4 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const board = report.declaredScorecard.boards[0];
  assert.equal(board.cohortSize, 2);
  assert.equal(board.cohortMedian, 10.5);
  assert.equal(board.verdict, "trailed");
  assert.equal(board.basis, "cohort");
  assert.equal(report.declaredScorecard.trailed, 1);
});

test("failure triage: a peer making the same contract means the tricks were there", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "4 S", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.declaredScorecard.boards[0].triage.key, "play");
});

test("failure triage falls back to double-dummy, then auction, then shared", () => {
  const analysis = buildAnalysis(parsePbn(ddPbn(10), "t.pbn"));
  const ddCase = buildPairImprovementReport(analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "3 NT", "="]
  ], analysis), "1");
  assert.equal(ddCase.declaredScorecard.boards[0].triage.key, "play-dd");

  const auctionCase = buildPairImprovementReport(analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "6 S", "-2"],
    ["1", "3", "4", "N", "4 S", "="]
  ], analysis), "1");
  assert.equal(auctionCase.declaredScorecard.boards[0].triage.key, "auction");

  const sharedCase = buildPairImprovementReport(analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "6 S", "-1"],
    ["1", "3", "4", "N", "6 S", "-2"]
  ], analysis), "1");
  assert.equal(sharedCase.declaredScorecard.boards[0].triage.key, "shared");
});

test("defended scorecard measures tricks conceded against the room", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "E", "4 S", "="],
    ["1", "3", "4", "E", "4 S", "-1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const board = report.defendedScorecard.boards[0];
  assert.equal(board.conceded, 10);
  assert.equal(board.cohortMedian, 9);
  assert.equal(board.trickEdge, -1);
  assert.equal(board.flagged, true);
  assert.equal(report.defendedScorecard.netTricks, -1);
});

test("overtrick meter prices the extra trick against the real score column", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "+1"],
    ["1", "5", "6", "N", "3 NT", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const board = report.overtrickMeter.boards[0];
  assert.equal(board.mpIfUp, 1, "one more trick ties both peers: 0 MP becomes 1 MP");
  assert.equal(board.mpIfDown, 0, "already bottom: going down costs nothing");
  assert.equal(board.peerTookTrick, true);
  assert.equal(board.flagged, true);
  assert.equal(report.overtrickMeter.pushWorth, 1);
});

test("overtrick meter does not flag a board that was already a top", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "3 NT", "+1"],
    ["1", "3", "4", "N", "3 NT", "="]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const board = report.overtrickMeter.boards[0];
  assert.equal(board.mpIfUp, 0);
  assert.equal(board.flagged, false);
});

test("bidding scorecard buckets: bid & made, missed, stayed low, failed, competitive", () => {
  const analysis = buildAnalysis(parsePbn(ddPbn(10), "t.pbn"));
  const bucketOf = (rows, key = "1") => {
    const report = buildPairImprovementReport(analyzeCsv([HEADER, ...rows], analysis), key);
    return report.biddingScorecard.gameBoards[0];
  };

  assert.equal(bucketOf([
    ["1", "1", "2", "N", "4 S", "="],
    ["1", "3", "4", "N", "2 S", "+2"]
  ]).bucket, "bidMade");

  const missed = bucketOf([
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="]
  ]);
  assert.equal(missed.bucket, "missed");
  assert.equal(missed.peersMadeGame, 1);

  assert.equal(bucketOf([
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "3 S", "+1"]
  ]).bucket, "stayedLow", "no peer made a game: staying low was with the field");

  assert.equal(bucketOf([
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "2 S", "+2"]
  ]).bucket, "bidFailed");

  assert.equal(bucketOf([
    ["1", "1", "2", "N", "4 S X", "="],
    ["1", "3", "4", "N", "4 S", "="]
  ]).bucket, "competitive", "doubled own contracts are excluded from bidding judgment");
});

test("a defending pair with a makeable game is judged on what the same-direction field did", () => {
  const analysis = buildAnalysis(parsePbn(ddPbn(10), "t.pbn"));
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "E", "2 H", "="],
    ["1", "3", "4", "N", "4 S", "="]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const board = report.biddingScorecard.gameBoards[0];
  assert.equal(board.bucket, "missed", "sold out to 2H while a peer bid and made the NS game");
});

test("slam-strength boards are listed separately", () => {
  const analysis = buildAnalysis(parsePbn(ddPbn(12), "t.pbn"));
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "4 S", "="],
    ["1", "3", "4", "N", "4 S", "+2"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.biddingScorecard.slams.length, 1);
  assert.equal(report.biddingScorecard.slams[0].bidSlam, false);
});
