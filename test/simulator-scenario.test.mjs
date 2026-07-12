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
import { parseBwsBuffer } from "../src/parsers/bws.js";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { parsePbn } from "../src/parsers/pbn.js";
import fixture from "./helpers/bws-fixture.js";
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
const INVALID_DEAL = "N:AKQ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";

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

function assertStableSerializableScenario(inputs) {
  const first = buildBridgeSimulatorScenario(inputs);
  const second = buildBridgeSimulatorScenario(inputs);
  assert.ok(first, "scenario should be playable");
  assert.equal(JSON.stringify(first), JSON.stringify(second), "variant scenario should be deterministic");
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first, "variant scenario should be JSON-serializable");
  assert.doesNotThrow(() => structuredClone(first));
  assertCanonicalHand(first.representativeHand.cards);
  return first;
}

function bwsReceivedRow(overrides = {}) {
  return fixture.buildReceivedRow({
    id: 1,
    section: 1,
    table: 1,
    round: 1,
    board: 1,
    pairNS: 1,
    pairEW: 2,
    declarer: 1,
    nsEw: "N",
    contract: "3 NT",
    result: "=",
    leadCard: null,
    remarks: null,
    dateSerial: 46203,
    timeSerial: 0.5,
    erased: 0,
    ...overrides,
  });
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

test("missing or blank summary metrics remain unavailable instead of becoming zero", () => {
  const { results, report } = scenarioFor(RICH_SESSION);
  const missingSummary = {
    ...report,
    summary: {
      ...report.summary,
      percent: null,
      mpVsAverage: "   ",
    },
  };
  const missingScenario = buildBridgeSimulatorScenario({ results, report: missingSummary });
  assert.equal(missingScenario.debrief.sessionFacts[0].segments[0].text, "Session percentage is not available for this session.");
  assert.equal(missingScenario.debrief.sessionFacts[0].segments[0].claimKind, "static");
  assert.equal(missingScenario.debrief.sessionFacts[1].segments[0].text, "MP versus average is not available for this session.");
  assert.equal(missingScenario.debrief.sessionFacts[1].segments[0].claimKind, "static");

  const zeroSummary = {
    ...report,
    summary: { ...report.summary, percent: "0", mpVsAverage: 0 },
  };
  const zeroScenario = buildBridgeSimulatorScenario({ results, report: zeroSummary });
  assert.equal(zeroScenario.debrief.sessionFacts[0].segments[0].text, "Session percentage: 0%.");
  assert.equal(zeroScenario.debrief.sessionFacts[1].segments[0].text, "MP versus average: 0.");
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

test("replayed boards retain the diagnosed result-row identity without inventing a hand", () => {
  const { results, report } = scenarioFor([
    HEADER,
    ["1", "1", "2", "N", "4 S", "="],
    ["1", "1", "6", "N", "4 S", "-1"],
    ["1", "3", "4", "N", "4 S", "="],
  ]);
  assert.equal(report.rows.length, 2, "both plays by the selected pair should reach the report");
  const failing = report.reviewItems.find((item) => item.pairScore === -50);
  assert.ok(failing, "the failing replay should remain the review item");

  const scenario = assertStableSerializableScenario({ results, report });
  const expectedKey = `${failing.row.fieldKey}|row:${failing.row.index}`;
  assert.deepEqual(scenario.coaching.checkpointRowKeys, [expectedKey]);
  const featured = scenario.wings.find((wing) => wing.featuredBoard);
  assert.equal(featured.featuredBoard.rowIdentity.rowIndex, failing.row.index);
  assert.equal(featured.featuredBoard.pairScore, -50);
  assert.equal(scenario.representativeHand.source, "practice");
  assert.equal(scenario.provenance.hasPbn, false);
  assert.match(scenario.representativeHand.provenanceNote[0].text, /Practice Deck/);
});

test("multi-section pair keys keep scenarios scoped to their own section", () => {
  const results = analyzeCsv([
    ["Section", "Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "1", "2", "N", "3 NT", "="],
    ["1", "1", "3", "4", "N", "3 NT", "+1"],
    ["2", "1", "1", "2", "N", "2 S", "+1"],
    ["2", "1", "3", "4", "N", "4 S", "="],
  ]);
  const sectionOneReport = buildPairImprovementReport(results, "S1:1");
  const sectionTwoReport = buildPairImprovementReport(results, "S2:1");
  assert.ok(sectionOneReport && sectionTwoReport);
  assert.deepEqual(sectionOneReport.rows.map((view) => view.row.fieldKey), ["1|1"]);
  assert.deepEqual(sectionTwoReport.rows.map((view) => view.row.fieldKey), ["2|1"]);

  const sectionOne = assertStableSerializableScenario({ results, report: sectionOneReport });
  const sectionTwo = assertStableSerializableScenario({ results, report: sectionTwoReport });
  assert.equal(sectionOne.identity.pairKey, "S1:1");
  assert.equal(sectionTwo.identity.pairKey, "S2:1");
  assert.ok(sectionOne.coaching.checkpointRowKeys.every((key) => key.startsWith("1|1|row:")));
  assert.ok(sectionTwo.coaching.checkpointRowKeys.every((key) => key.startsWith("2|1|row:")));
  assert.notEqual(sectionOne.seed, sectionTwo.seed, "section-scoped pairs should not share a scenario seed");
  assert.equal(sectionOne.representativeHand.source, "practice");
  assert.equal(sectionTwo.representativeHand.source, "practice");
});

test("BWS erased and adjusted rows cannot become coaching evidence or a PBN hand", () => {
  const raw = parseBwsBuffer(fixture.buildBwsFile({
    pages: [[
      bwsReceivedRow({ id: 1, erased: 1 }),
      bwsReceivedRow({ id: 2, contract: null, result: null, remarks: "40%-60%" }),
      bwsReceivedRow({ id: 3, table: 2, pairNS: 3, pairEW: 4, result: "+1" }),
      bwsReceivedRow({ id: 4, table: 3, pairNS: 5, pairEW: 6, result: "-1" }),
    ]],
  }), "adjusted-erased.BWS");
  assert.equal(raw.receivedData.find((row) => row.ID === 1).Erased, 1, "fixture should traverse the real BWS erased flag");
  const analysis = buildAnalysis(parsePbn(pbnForBoards([1]), "adjusted-erased.pbn"));
  const results = buildResultsAnalysis(raw, analysis);
  assert.ok(!results.rows.some((row) => row.id === 1), "erased row should be removed by results ingestion");
  const adjusted = results.rows.find((row) => row.id === 2);
  assert.deepEqual(adjusted.adjustment, { nsPercent: 40, ewPercent: 60 });
  assert.equal(adjusted.scoreNS, null);
  assert.ok(results.warnings.some((warning) => /erased/i.test(warning)));
  assert.ok(results.warnings.some((warning) => /director-adjusted/i.test(warning)));

  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].row.id, 2);
  assert.equal(report.reviewItems.length, 0, "adjusted result should not enter the review queue");
  const scenario = assertStableSerializableScenario({ analysis, results, report });
  assert.equal(scenario.mode, "defend-crown");
  assert.equal(scenario.coaching.suitableEvidenceCount, 0);
  assert.equal(scenario.coaching.boardSpecificCheckpointCount, 0);
  assert.ok(scenario.wings.every((wing) => wing.featuredBoard == null));
  assert.equal(scenario.provenance.compatibilityStatus, "match");
  assert.equal(scenario.representativeHand.source, "practice");
  assert.equal(scenario.provenance.usedValidDeal, false);
  assert.match(scenario.representativeHand.provenanceNote[0].text, /no valid joined 13-card loaded-PBN hand/i);
  assert.doesNotMatch(scenario.representativeHand.provenanceNote[0].text, /^Using /);
});

test("an overlapping but invalid PBN deal always falls back to a labeled Practice Deck", () => {
  const invalidPbn = `[Board "1"]\n[Deal "${INVALID_DEAL}"]`;
  const analysis = buildAnalysis(parsePbn(invalidPbn, "invalid-deal.pbn"));
  assert.equal(analysis.boards.length, 1);
  assert.equal(analysis.boards[0].validDeal, false);
  const results = analyzeCsv([
    HEADER,
    ["1", "1", "2", "N", "3 NT", "="],
    ["1", "3", "4", "N", "3 NT", "+1"],
  ], analysis);
  const report = buildPairImprovementReport(results, "1");
  assert.equal(results.summary.compatibility.status, "match", "board overlap alone should exercise the invalid-deal guard");

  const scenario = assertStableSerializableScenario({ analysis, results, report });
  assert.equal(scenario.provenance.hasPbn, true);
  assert.equal(scenario.provenance.compatibilityStatus, "match");
  assert.equal(scenario.provenance.usedValidDeal, false);
  assert.equal(scenario.representativeHand.source, "practice");
  assert.equal(scenario.representativeHand.boardNo, null);
  assert.equal(scenario.representativeHand.seat, null);
  assert.match(scenario.representativeHand.provenanceNote[0].text, /no valid joined 13-card loaded-PBN hand/i);
  assert.doesNotMatch(scenario.representativeHand.provenanceNote[0].text, /Using .*loaded PBN Board/i);
});

test("BWS placeholder identities stay blank and named peers never enter scenario or hostile copy", () => {
  const raw = parseBwsBuffer(fixture.buildBwsFile({
    pages: [
      [
        bwsReceivedRow({ id: 1 }),
        bwsReceivedRow({ id: 2, table: 2, pairNS: 3, pairEW: 4, result: "+2" }),
      ],
      [
        fixture.buildPlayerRow({ section: 1, table: 1, round: 1, direction: "N", number: null, name: null, placeholder: true }),
        fixture.buildPlayerRow({ section: 1, table: 1, round: 1, direction: "S", number: null, name: null, placeholder: true }),
        fixture.buildPlayerRow({ section: 1, table: 2, round: 1, direction: "N", number: "3", name: "Alice Example", timeSerial: 46203.5 }),
        fixture.buildPlayerRow({ section: 1, table: 2, round: 1, direction: "S", number: "4", name: "Bob Example", timeSerial: 46203.5 }),
      ],
    ],
  }), "placeholder-names.BWS");
  assert.equal(raw.playerNumbers.filter((player) => !player.Name && !player.Number).length, 2);
  const results = buildResultsAnalysis(raw);
  const selectedStanding = results.pairStandings.find((standing) => String(standing.key) === "1");
  assert.equal(selectedStanding.players, "", "placeholder seats must not become a selected-pair name");
  const report = buildPairImprovementReport(results, "1");
  assert.equal(report.summary.players, "");
  assert.match(report.reviewItems[0].diagnosis.explanation, /Alice Example \/ Bob Example/, "fixture should carry a real named peer into report evidence");

  const scenario = assertStableSerializableScenario({ results, report });
  const serialized = JSON.stringify(scenario);
  assert.equal(scenario.identity.players, "");
  assert.doesNotMatch(serialized, /Alice Example|Bob Example|Table\s+\d+/i);
  assert.ok(scenario.boss.hostileSpeech.every((segment) => segment.claimKind === "fiction"));
  assert.doesNotMatch(scenario.boss.hostileSpeech.map((segment) => segment.text).join(" "), /Alice|Bob|Table\s+\d+/i);
  const transformed = scenario.wings
    .flatMap((wing) => wing.coachFeedback.details)
    .find((segment) => segment.transform === "player-names-redacted");
  assert.ok(transformed, "named report evidence should record its redaction transform");
  assert.match(transformed.text, /Pair 3's/);
  assert.equal(scenario.representativeHand.source, "practice");
});

test("changing pairs in one parsed session changes substantive mission content but never hostile identity", () => {
  const rows = [
    [1, 1, 1, 2, "3 NT", "="],
    [2, 2, 1, 2, "2 S", "+1"],
    [3, 3, 1, 2, "3 H X", "-2"],
    [4, 1, 3, 4, "3 NT", "+1"],
    [5, 2, 3, 4, "4 S", "="],
    [6, 3, 3, 4, "2 S", "="],
    [7, 1, 5, 6, "3 NT", "+1"],
    [8, 2, 5, 6, "4 S", "="],
    [9, 3, 5, 6, "2 S", "+1"],
    [10, 1, 7, 8, "3 NT", "-1"],
    [11, 2, 7, 8, "3 S", "+1"],
    [12, 3, 7, 8, "2 S", "="],
  ].map(([id, board, pairNS, pairEW, contract, result]) => bwsReceivedRow({
    id,
    table: Math.ceil(id / 3),
    round: board,
    board,
    pairNS,
    pairEW,
    declarer: pairNS,
    contract,
    result,
  }));
  const playerRows = [
    fixture.buildPlayerRow({ section: 1, table: 1, round: 1, direction: "N", number: "101", name: "Nora One", timeSerial: 46203.5 }),
    fixture.buildPlayerRow({ section: 1, table: 1, round: 1, direction: "S", number: "102", name: "Sam One", timeSerial: 46203.5 }),
    fixture.buildPlayerRow({ section: 1, table: 4, round: 1, direction: "N", number: "701", name: "Nora Seven", timeSerial: 46203.5 }),
    fixture.buildPlayerRow({ section: 1, table: 4, round: 1, direction: "S", number: "702", name: "Sam Seven", timeSerial: 46203.5 }),
  ];
  const raw = parseBwsBuffer(fixture.buildBwsFile({ pages: [rows, playerRows] }), "pair-personalization.BWS");
  const results = buildResultsAnalysis(raw);
  const pairOneReport = buildPairImprovementReport(results, "1");
  const pairSevenReport = buildPairImprovementReport(results, "7");
  assert.match(pairOneReport.summary.players, /Nora One/);
  assert.match(pairSevenReport.summary.players, /Nora Seven/);

  const pairOne = assertStableSerializableScenario({ results, report: pairOneReport });
  const pairSeven = assertStableSerializableScenario({ results, report: pairSevenReport });
  assert.notEqual(pairOne.seed, pairSeven.seed);
  assert.match(pairOne.briefing.fullText.map((segment) => segment.text).join(" "), /penalty \/ double decisions/i);
  assert.match(pairSeven.briefing.fullText.map((segment) => segment.text).join(" "), /declarer play/i);

  const missionDifferences = [
    JSON.stringify(pairOne.briefing.fullText) !== JSON.stringify(pairSeven.briefing.fullText),
    JSON.stringify(pairOne.wings.map((wing) => [wing.themeKey, wing.featuredBoard && wing.featuredBoard.rowIdentity.key])) !==
      JSON.stringify(pairSeven.wings.map((wing) => [wing.themeKey, wing.featuredBoard && wing.featuredBoard.rowIdentity.key])),
    JSON.stringify(pairOne.palette) !== JSON.stringify(pairSeven.palette),
    JSON.stringify(pairOne.representativeHand.cards) !== JSON.stringify(pairSeven.representativeHand.cards),
  ];
  assert.ok(missionDifferences.filter(Boolean).length >= 2, "pair selection should change at least two substantive mission systems");

  for (const scenario of [pairOne, pairSeven]) {
    const selectedIdentity = [scenario.identity.pairLabel, scenario.identity.players]
      .flatMap((value) => String(value).split(/\s*\/\s*/))
      .filter(Boolean);
    const hostileContent = JSON.stringify({
      wings: scenario.wings.map((wing) => ({ themeKey: wing.themeKey, encounterSkin: wing.encounterSkin })),
      boss: {
        key: scenario.boss.key,
        title: scenario.boss.title,
        themeKey: scenario.boss.themeKey,
        encounterSkin: scenario.boss.encounterSkin,
        hostileSpeech: scenario.boss.hostileSpeech,
      },
    });
    selectedIdentity.forEach((identity) => {
      assert.ok(!hostileContent.includes(identity), `hostile content leaked selected identity ${JSON.stringify(identity)}`);
    });
  }
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
