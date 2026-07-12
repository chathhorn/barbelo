import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysis } from "../src/core/boards.js";
import { buildPairImprovementReport } from "../src/core/report.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import {
  buildBridgeSimulatorScenario,
  buildPracticeDeck,
  canonicalizeCards,
} from "../src/core/simulator/scenario.js";
import { fingerprint, stableStringify } from "../src/core/simulator/seed.js";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { parsePbn } from "../src/parsers/pbn.js";
import { csvFrom } from "./helpers/load-app.js";

const HEADER = ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"];
const RICH_SESSION = [
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
  ["3", "7", "8", "N", "2 S", "="],
];

const WINNER_SESSION = [
  HEADER,
  ["1", "1", "2", "N", "3 NT", "+1"],
  ["1", "3", "4", "N", "3 NT", "="],
  ["2", "1", "2", "N", "4 S", "="],
  ["2", "3", "4", "N", "4 S", "-1"],
];

const DEAL = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";

function pbnForBoards(boardNumbers) {
  return boardNumbers.map((boardNo) => [
    `[Board "${boardNo}"]`,
    `[Deal "${DEAL}"]`,
  ].join("\n")).join("\n\n");
}

function analyzeCsv(rows, analysis = null) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "simulator.csv", csv.length), analysis);
}

function scenarioFor(rows, pairKey = "1", analysis = null) {
  const results = analyzeCsv(rows, analysis);
  const report = buildPairImprovementReport(results, pairKey);
  return { results, report, scenario: buildBridgeSimulatorScenario({ analysis, results, report }) };
}

function compatibilityClone(results, status) {
  return {
    ...results,
    summary: {
      ...results.summary,
      compatibility: {
        ...(results.summary.compatibility || {}),
        status,
      },
    },
  };
}

function withoutJoinedRows(report) {
  const rows = new Map();
  const cloneRow = (row) => {
    const key = row.index;
    if (!rows.has(key)) rows.set(key, { ...row, hasPbnBoard: false });
    return rows.get(key);
  };
  return {
    ...report,
    rows: report.rows.map((view) => ({ ...view, row: cloneRow(view.row) })),
    reviewItems: report.reviewItems.map((item) => ({ ...item, row: cloneRow(item.row) })),
  };
}

function segmentsIn(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Object.hasOwn(value, "claimKind")) output.push(value);
  Object.values(value).forEach((entry) => segmentsIn(entry, output, seen));
  return output;
}

function assertCanonicalHand(cards) {
  assert.equal(cards.length, 13);
  assert.equal(new Set(cards.map((card) => `${card.suit}${card.rank}`)).size, 13);
  assert.deepEqual(canonicalizeCards(cards), cards);
}

test("seed helpers and scenario output are deterministic, immutable, and serializable", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(fingerprint({ b: 1, a: 2 }), fingerprint({ a: 2, b: 1 }));
  assert.deepEqual(buildPracticeDeck("same-seed"), buildPracticeDeck("same-seed"));

  const { results, report } = scenarioFor(RICH_SESSION);
  const first = buildBridgeSimulatorScenario({ results, report });
  const second = buildBridgeSimulatorScenario({ results, report });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.match(first.seed, /^[0-9a-f]{8}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.wings), true);
  assert.equal(Object.isFrozen(first.wings[0].coachFeedback.summary[0]), true);
  assert.doesNotThrow(() => structuredClone(first));
});

test("normal sessions fill three wings with unique board evidence and per-segment provenance", () => {
  const { scenario } = scenarioFor(RICH_SESSION);
  assert.equal(scenario.wings.length, 3);
  assert.equal(scenario.coaching.normal, true);
  assert.equal(scenario.coaching.sparse, false);
  assert.equal(scenario.coaching.suitableEvidenceCount, 3);
  assert.equal(scenario.coaching.boardSpecificCheckpointCount, 3);
  assert.equal(new Set(scenario.coaching.checkpointRowKeys).size, 3);
  assert.deepEqual(scenario.wings.map((wing) => wing.featuredBoard.boardNo), [3, 2, 1]);
  assert.ok(scenario.wings.every((wing) => wing.personalized));
  assert.equal(scenario.boss.generic, true, "three checkpoint boards must not be repeated on the boss");

  const segments = segmentsIn(scenario);
  assert.ok(segments.length > 12);
  segments.forEach((segment) => {
    assert.ok(["report", "static", "fiction"].includes(segment.claimKind));
    if (segment.claimKind === "report") {
      assert.ok(segment.sourceFields.length, `${segment.text} has no evidence fields`);
      assert.equal(segment.contentId, null);
    } else {
      assert.ok(segment.contentId, `${segment.text} has no stable content id`);
      assert.deepEqual(segment.sourceFields, []);
    }
  });
});

test("sparse sessions use each suitable board once and fill remaining checkpoints honestly", () => {
  const { scenario } = scenarioFor([
    HEADER,
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "+1"],
    ["1", "5", "6", "N", "3 NT", "+1"],
  ]);
  assert.equal(scenario.wings.length, 3);
  assert.equal(scenario.coaching.normal, false);
  assert.equal(scenario.coaching.sparse, true);
  assert.equal(scenario.coaching.suitableEvidenceCount, 1);
  assert.equal(scenario.coaching.boardSpecificCheckpointCount, 1);
  assert.equal(scenario.coaching.checkpointRowKeys.length, 1);
  assert.ok(scenario.wings.every((wing) => wing.personalized), "report-level fallback checkpoints must remain session-aware");
  assert.equal(scenario.wings.filter((wing) => wing.featuredBoard).length, 1);
  assert.equal(scenario.boss.generic, true, "the sparse board must not be reused for the boss");
});

test("Defend the Crown has an explicit boundary and never fabricates a board diagnosis", () => {
  const { report, scenario } = scenarioFor(WINNER_SESSION);
  assert.equal(report.decisionTypes.length, 0);
  assert.equal(report.reviewItems.length, 0);
  assert.equal(scenario.mode, "defend-crown");
  assert.equal(scenario.boss.key, "complacency");
  assert.equal(scenario.boss.generic, true);
  assert.equal(scenario.coaching.boardSpecificCheckpointCount, 0);
  assert.equal(scenario.wings.length, 3);
  assert.ok(scenario.wings.every((wing) => wing.personalized));

  const withTheme = {
    ...report,
    decisionTypes: [{ key: "manualReview", label: "Manual Review", advice: "Inspect the traveler." }],
  };
  assert.equal(buildBridgeSimulatorScenario({ results: scenarioFor(WINNER_SESSION).results, report: withTheme }).mode, "restore-honor");
});

test("compatibility status controls loaded-PBN hand eligibility exactly", () => {
  const analysis = buildAnalysis(parsePbn(pbnForBoards([1, 2, 3]), "simulator.pbn"));
  const results = analyzeCsv(RICH_SESSION, analysis);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(results.summary.compatibility.status, "match");

  for (const status of ["match", "partial"]) {
    const statusResults = compatibilityClone(results, status);
    const scenario = buildBridgeSimulatorScenario({ analysis, results: statusResults, report });
    assert.equal(scenario.provenance.compatibilityStatus, status);
    assert.equal(scenario.representativeHand.source, "pbn");
    assert.equal(scenario.provenance.usedValidDeal, true);
    assert.equal(scenario.representativeHand.seat, "N");
    assertCanonicalHand(scenario.representativeHand.cards);
    assert.match(scenario.representativeHand.provenanceNote[0].text, /loaded PBN Board/);
    assert.match(scenario.representativeHand.provenanceNote[0].text, /not proof/);
  }

  for (const status of ["warning", "mismatch", "unknown"]) {
    const statusResults = compatibilityClone(results, status);
    const first = buildBridgeSimulatorScenario({ analysis, results: statusResults, report });
    const second = buildBridgeSimulatorScenario({ analysis, results: statusResults, report });
    assert.equal(first.representativeHand.source, "practice", status);
    assert.equal(first.provenance.usedValidDeal, false, status);
    assertCanonicalHand(first.representativeHand.cards);
    assert.deepEqual(first.representativeHand.cards, second.representativeHand.cards, status);
    assert.doesNotMatch(first.representativeHand.provenanceNote[0].text, /session hand/i);
  }

  const partialWithoutJoin = buildBridgeSimulatorScenario({
    analysis,
    results: compatibilityClone(results, "partial"),
    report: withoutJoinedRows(report),
  });
  assert.equal(partialWithoutJoin.representativeHand.source, "practice");
  assert.match(partialWithoutJoin.representativeHand.provenanceNote[0].text, /no valid joined loaded-PBN hand/i);
});

test("a defended representative board uses the opening leader's analyzed hand", () => {
  const analysis = buildAnalysis(parsePbn(pbnForBoards([1]), "defense.pbn"));
  const { scenario } = scenarioFor([
    HEADER,
    ["1", "1", "2", "E", "3 NT", "+1"],
    ["1", "3", "4", "E", "3 NT", "="],
  ], "1", analysis);
  assert.equal(scenario.provenance.compatibilityStatus, "match");
  assert.equal(scenario.representativeHand.source, "pbn");
  assert.equal(scenario.representativeHand.seat, "S", "South leads clockwise after East declares");
  assert.deepEqual(scenario.representativeHand.cards.map((card) => `${card.suit}${card.rank}`), [
    "S6", "S5", "S4", "H6", "H5", "H4", "D6", "D5", "D4", "CT", "C9", "C6", "C5",
  ]);
});

test("neutral coaching redacts peer player names while retaining evidence provenance", () => {
  const { results, report } = scenarioFor([
    HEADER,
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "+1"],
  ]);
  const item = report.reviewItems[0];
  const namedRows = item.peerComparison.rows.map((row) => row.isTarget
    ? row
    : { ...row, players: "Alice Example & Bob Example", pairNo: "3" });
  const namedItem = {
    ...item,
    peerComparison: { ...item.peerComparison, rows: namedRows },
    diagnosis: {
      ...item.diagnosis,
      explanation: "Compare this result with Pair 3 - Alice Example & Bob Example's better score.",
    },
  };
  const namedReport = { ...report, reviewItems: [namedItem] };
  const scenario = buildBridgeSimulatorScenario({ results, report: namedReport });
  const serialized = JSON.stringify(scenario);
  assert.doesNotMatch(serialized, /Alice Example|Bob Example/);
  const diagnosis = scenario.wings.find((wing) => wing.featuredBoard).coachFeedback.details[0];
  assert.equal(diagnosis.claimKind, "report");
  assert.equal(diagnosis.transform, "player-names-redacted");
  assert.deepEqual(diagnosis.sourceFields, ["report.reviewItems[].diagnosis.explanation"]);
});

test("invalid and duplicate card sets are rejected", () => {
  const valid = buildPracticeDeck("cards");
  assertCanonicalHand(valid);
  assert.equal(canonicalizeCards(valid.slice(0, 12)), null);
  assert.equal(canonicalizeCards([...valid.slice(0, 12), valid[0]]), null);
  assert.equal(canonicalizeCards([...valid.slice(0, 12), { suit: "S", rank: "X" }]), null);
  assert.equal(canonicalizeCards([...valid.slice(0, 12), { suit: "S", rank: "AK" }]), null);
});
