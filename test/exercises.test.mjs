import test from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import {
  buildPairExercises,
  buildBidItAgainCard,
  buildTrickTargetCard,
  buildReadRoomCard,
  overtrickBandFor,
  ladderBandFor,
} from "../src/core/exercises.js";
import { buildAnalysis } from "../src/core/boards.js";
import { parsePbn } from "../src/parsers/pbn.js";
import { csvFrom } from "./helpers/load-app.js";

function analyzeCsv(rows, analysis) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), analysis || null);
}

// NS make 10 tricks in spades (a DD game); EW make nothing.
const DD_PBN = [
  "[Board \"1\"]",
  "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]",
  "[OptimumResultTable \"Declarer;Denomination\\2R;Result\\2R\"]",
  "N S 10",
  "N NT 9",
  "N H 8",
  "N D 8",
  "N C 8",
  "S S 10",
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

const HEADER = ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"];

// A small session rich enough to fire all three phase-1 card types:
// board 1 has a flagged overtrick (peer took the trick), board 2 is a
// counter-intuitive ladder row (plus score, bad percent), and there is
// a doubled contract for the scoring drill.
const SESSION = [
  HEADER,
  ["1", "1", "2", "N", "3 NT", "="],
  ["1", "3", "4", "N", "3 NT", "+1"],
  ["1", "5", "6", "N", "3 NT", "+1"],
  ["1", "7", "8", "N", "3 NT", "-1"],
  ["2", "1", "2", "N", "2 S", "+1"],
  ["2", "3", "4", "N", "4 S", "="],
  ["2", "5", "6", "N", "4 S", "="],
  ["2", "7", "8", "N", "3 S", "+1"],
  ["3", "1", "2", "N", "3 H X", "-2"],
  ["3", "3", "4", "N", "2 S", "="],
  ["3", "5", "6", "N", "2 S", "+1"],
  ["3", "7", "8", "N", "2 S", "="]
];

function reportFor(pairKey, rows = SESSION) {
  const results = analyzeCsv(rows);
  return { results, report: buildPairImprovementReport(results, pairKey) };
}

test("generation is deterministic: same inputs, byte-identical quiz", () => {
  const a = reportFor("1");
  const b = reportFor("1");
  assert.equal(
    JSON.stringify(buildPairExercises(a.results, a.report)),
    JSON.stringify(buildPairExercises(b.results, b.report))
  );
});

test("the quiz stays small, works without a PBN, and masks only ladder deals", () => {
  const { results, report } = reportFor("1");
  const quiz = buildPairExercises(results, report);
  assert.ok(quiz.cards.length >= 3 && quiz.cards.length <= 4, `expected 3-4 cards, got ${quiz.cards.length}`);
  const types = quiz.cards.map((card) => card.type);
  assert.ok(types.includes("overtrick"), "overtrick card missing");
  assert.ok(types.includes("ladder"), "ladder card missing");
  assert.ok(types.includes("scoring"), "scoring card missing");
  quiz.cards.forEach((card) => {
    assert.ok(card.options.length >= 2, `${card.id} has too few options`);
    assert.ok(card.options.some((option) => option.key === card.answerKey), `${card.id} answer key not among options`);
    if (card.maskBoard) assert.match(card.dealLabel, /^Deal [A-Z]$/);
  });
});

test("overtrick card prices the trick against the real column", () => {
  const { results, report } = reportFor("1");
  const quiz = buildPairExercises(results, report);
  const card = quiz.cards.find((entry) => entry.type === "overtrick");
  // Pair 1 made 3NT= while two peers made +1: one more trick jumps
  // 1/3 of the top (33 percent points) with the trick field-proven.
  assert.equal(card.boardNo, 1);
  assert.equal(card.answerKey, "jump");
  assert.match(card.reveal.room, /took that trick/);
});

test("overtrick and ladder band edges are stable", () => {
  assert.equal(overtrickBandFor(0), "nothing");
  assert.equal(overtrickBandFor(10), "nudge");
  assert.equal(overtrickBandFor(25), "jump");
  assert.equal(ladderBandFor(80), "top");
  assert.equal(ladderBandFor(50), "middle");
  assert.equal(ladderBandFor(10), "bottom");
});

test("ladder card prefers the counter-intuitive row and never includes the queried score in the column", () => {
  const { results, report } = reportFor("1");
  const quiz = buildPairExercises(results, report);
  const card = quiz.cards.find((entry) => entry.type === "ladder");
  // Board 2: +140 (2S+1) is a PLUS score that scored 16.7% - the
  // counter-intuitive pick.
  assert.equal(card.boardNo, 2);
  assert.equal(card.answerKey, "bottom");
  assert.equal(card.prompt.column.length, 3, "column must exclude the queried row");
  assert.ok(!card.prompt.column.includes("+140") || card.prompt.column.filter((s) => s === "+140").length === 0);
});

test("scoring card distractors are distinct, labeled, and never equal the answer", () => {
  const { results, report } = reportFor("1");
  const quiz = buildPairExercises(results, report);
  const cards = quiz.cards.filter((entry) => entry.type === "scoring");
  assert.ok(cards.length >= 1);
  cards.forEach((card) => {
    const labels = card.options.map((option) => option.label);
    assert.equal(new Set(labels).size, labels.length, "duplicate option labels");
    const correct = card.options.find((option) => option.key === "correct");
    assert.ok(correct, "correct option missing");
    Object.keys(card.optionNotes || {}).forEach((key) => {
      assert.notEqual(key, "correct", "the correct answer must not carry a miscount note");
    });
  });
});

test("a doubled-heavy loss profile drills the doubled contract", () => {
  const { results, report } = reportFor("1");
  // Pair 1 went for 3HX-2, so penalty/double ranks in their themes and
  // the doubled contract must appear among their scoring flashcards.
  const quiz = buildPairExercises(results, report);
  const scoring = quiz.cards.filter((entry) => entry.type === "scoring");
  assert.ok(scoring.length >= 1, "scoring cards missing entirely");
  assert.ok(scoring.some((card) => /\bX\b/.test(card.prompt.lead)), "doubled contract missing from the drill");
});

test("tiny sessions degrade gracefully instead of inventing cards", () => {
  const { results, report } = reportFor("1", [
    HEADER,
    ["1", "1", "2", "N", "3 NT", "="]
  ]);
  const quiz = buildPairExercises(results, report);
  // Single table: no peers to price overtricks or build a ladder; the
  // scoring drill can still run on their own contract.
  assert.ok(!quiz.cards.some((card) => card.type === "overtrick"), "overtrick card needs peers");
  assert.ok(!quiz.cards.some((card) => card.type === "ladder"), "ladder card needs a column");
});

test("bid-it-again grades only on field consensus and prices from real results", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  // 4 of 5 same-direction peers bid game: consensus "game".
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="],
    ["1", "7", "8", "N", "4 S", "="],
    ["1", "9", "10", "N", "4 S", "-1"],
    ["1", "11", "12", "N", "2 S", "+2"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const card = buildBidItAgainCard(results, report, new Set());
  assert.ok(card, "card missing");
  assert.equal(card.neutral, false);
  assert.equal(card.answerKey, "game");
  assert.match(card.reveal.room, /4 of 5 same-direction tables bid game; 3 made it/);
  assert.match(card.reveal.room, /Game bidders averaged/);
  assert.match(card.reveal.dd, /one layout/);
  assert.ok(card.hands && card.hands.seats.join("") === "NS");
});

test("a split room is a judgment call: neutral card, no wrong answer", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  // 2 of 4 peers bid game: no consensus.
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="],
    ["1", "7", "8", "N", "3 S", "+1"],
    ["1", "9", "10", "N", "2 S", "+2"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const card = buildBidItAgainCard(results, report, new Set());
  assert.ok(card, "card missing");
  assert.equal(card.neutral, true);
  assert.equal(card.answerKey, "");
  assert.match(card.reveal.coachRight, /judgment call/i);
  assert.equal(card.reveal.coachRight, card.reveal.coachWrong, "a split room must coach identically either way");
});

test("trick target uses DD as the key and prefers human-corroborated boards", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const card = buildTrickTargetCard(results, report, new Set());
  assert.ok(card, "card missing");
  assert.equal(card.answerKey, "10");
  assert.ok(card.options.some((option) => option.key === "10"), "DD answer must be among the options");
  assert.match(card.reveal.room, /the computer's number was human/);
  assert.match(card.reveal.yours, /one layout/);
});

test("read the room counts same-direction game bidders with exact buttons in small fields", () => {
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="],
    ["1", "7", "8", "N", "3 S", "+1"]
  ]);
  const report = buildPairImprovementReport(results, "1");
  const card = buildReadRoomCard(results, report, new Set());
  assert.ok(card, "card missing (should work without a PBN)");
  assert.equal(card.answerKey, "2");
  assert.deepEqual(card.options.map((option) => option.key), ["0", "1", "2", "3"], "exact counts expected in a small field");
  assert.match(card.reveal.room, /2 of 3 bid game; 2 made it/);
});

test("no quiz card repeats another card's board", () => {
  const analysis = buildAnalysis(parsePbn(DD_PBN, "t.pbn"));
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "2 S", "+2"],
    ["1", "3", "4", "N", "4 S", "="],
    ["1", "5", "6", "N", "4 S", "="],
    ["1", "7", "8", "N", "4 S", "="],
    ["1", "9", "10", "N", "4 S", "-1"]
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  const quiz = buildPairExercises(results, report);
  const boardCards = quiz.cards.filter((card) => card.type !== "scoring");
  const boards = boardCards.map((card) => String(card.boardNo));
  assert.equal(new Set(boards).size, boards.length, `duplicate boards across cards: ${boards.join(",")}`);
});

test("passed-out rows never become scoring flashcards", () => {
  const { results, report } = reportFor("1", [
    HEADER,
    ["1", "1", "2", "", "PASS", ""],
    ["1", "3", "4", "N", "3 NT", "="]
  ]);
  const quiz = buildPairExercises(results, report);
  quiz.cards.filter((card) => card.type === "scoring").forEach((card) => {
    assert.doesNotMatch(card.prompt.lead, /pass/i);
  });
});
