import test from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import {
  buildPairExercises,
  overtrickBandFor,
  ladderBandFor,
} from "../src/core/exercises.js";
import { csvFrom } from "./helpers/load-app.js";

function analyzeCsv(rows) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
}

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
