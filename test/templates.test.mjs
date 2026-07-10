import test from "node:test";
import assert from "node:assert/strict";
import { parseResultsCsv } from "../src/parsers/csv.js";
import { parsePbn } from "../src/parsers/pbn.js";
import { buildAnalysis } from "../src/core/boards.js";
import { buildResultsAnalysis } from "../src/core/results.js";
import { STATE } from "../src/ui/state.js";
import {
  renderBoardCard,
  renderBoardTraveler,
  renderDealDiagram,
  renderDoubleDummyTable
} from "../src/ui/boardsView.js";
import { renderReportSubsection } from "../src/ui/reportView.js";
import { csvFrom, installDomStubs } from "./helpers/load-app.js";

installDomStubs();

// Template functions return HTML strings and read only their arguments
// plus STATE, so they are testable without a DOM.

const PBN = [
  "[Event \"Test\"]",
  "[Board \"4\"]",
  "[Dealer \"W\"]",
  "[Vulnerable \"All\"]",
  "[Deal \"N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432\"]",
  "[OptimumResultTable \"Declarer;Denomination\\2R;Result\\2R\"]",
  "N NT 9",
  "N S 10",
  "N H 6",
  "N D 5",
  "N C 5",
  "S NT 9",
  "S S 10",
  "S H 6",
  "S D 5",
  "S C 5",
  "E NT 4",
  "E S 3",
  "E H 7",
  "E D 8",
  "E C 8",
  "W NT 4",
  "W S 3",
  "W H 7",
  "W D 8",
  "W C 8"
].join("\n");

const analysis = buildAnalysis(parsePbn(PBN, "t.pbn"));
const board = analysis.boards[0];

const csv = csvFrom([
  ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
  ["4", "1", "2", "N", "4 S", "="],
  ["4", "3", "4", "N", "4 S", "-1"],
  ["4", "5", "6", "N", "3 NT", "="],
  ["4", "7", "8", "N", "3 NT", "="]
]);
const results = buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), analysis);

function withState(patch, callback) {
  const before = { results: STATE.results, reportPair: STATE.reportPair };
  Object.assign(STATE, patch);
  try {
    return callback();
  } finally {
    Object.assign(STATE, before);
  }
}

test("deal diagram encodes vulnerability, dealer, and voids", () => {
  const html = withState({ results }, () => renderDealDiagram(board, results.boardsByNumber.get("4")));
  assert.match(html, /band ns top vul/);
  assert.match(html, /band ew left vul/);
  assert.match(html, /dealer-pip w/);
  assert.match(html, /Both vul/);
  assert.match(html, /hand-cards/);
  assert.match(html, /4=3=3=3/);
});

test("deal diagram shows a placeholder when the PBN has no deal", () => {
  const bare = buildAnalysis(parsePbn("[Board \"9\"]", "t.pbn")).boards[0];
  const html = renderDealDiagram(bare, null);
  assert.match(html, /No deal recorded/);
  assert.doesNotMatch(html, /hand-suit/);
});

test("traveler ranks ties, colors scores, and highlights the reviewed pair", () => {
  const html = withState({ results, reportPair: "3" }, () => renderBoardTraveler(board));
  assert.match(html, /2=/);
  assert.match(html, /traveler-top/);
  assert.match(html, /traveler-selected/);
  assert.match(html, /Selected pair/);
  assert.match(html, /score pos/);
  assert.match(html, /score neg/);
  assert.match(html, /suit-glyph spade/);
});

test("player names from results are escaped in the traveler", () => {
  const hostileCsv = csvFrom([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result", "Table", "Round"],
    ["4", "1", "2", "N", "4 S", "=", "1", "1"],
    ["4", "3", "4", "N", "4 S", "-1", "2", "1"]
  ]);
  const raw = parseResultsCsv(hostileCsv, "t.csv", hostileCsv.length);
  raw.playerNumbers = [
    { Section: 1, Table: 1, Direction: "N", Number: "1", Name: "<img src=x onerror=alert(1)>", Round: 1 },
    { Section: 1, Table: 1, Direction: "S", Number: "2", Name: "O\"Malley & Sons", Round: 1 }
  ];
  const hostile = buildResultsAnalysis(raw, analysis);
  const html = withState({ results: hostile }, () => renderBoardTraveler(board));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("double dummy table shades part-score and game makes", () => {
  const html = renderDoubleDummyTable(board);
  assert.match(html, /dd-game/);
  assert.match(html, /dd-part/);
  assert.match(html, /scope="row"/);
  assert.match(html, /suit-glyph heart/);
});

test("board card composes placard, par chip, and sections", () => {
  const html = withState({ results }, () => renderBoardCard(board));
  assert.match(html, /Board 4/);
  assert.match(html, /Dealer <b>West<\/b>/);
  assert.match(html, /vul-chip vul/);
  assert.match(html, /Traveler - 4 results/);
  assert.match(html, /Raw PBN tags/);
});

test("report subsections honor open and id options", () => {
  const open = renderReportSubsection("x", "Title", "<p>body</p>");
  const closed = renderReportSubsection("x", "Title", "<p>body</p>", "", { open: false, id: "rs-x" });
  assert.match(open, /<details class="report-subsection x" open>/);
  assert.match(closed, /<details class="report-subsection x" id="rs-x">/);
});

test("swing cards keep the contract inline in the title and have no redundant open link", async () => {
  const { buildPairImprovementReport } = await import("../src/core/report.js");
  const { renderSwingReview } = await import("../src/ui/reportView.js");
  const swingCsv = csvFrom([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "-2"],
    ["1", "3", "4", "N", "3 NT", "="],
    ["1", "5", "6", "N", "3 NT", "="]
  ]);
  const swingResults = buildResultsAnalysis(parseResultsCsv(swingCsv, "t.csv", swingCsv.length), null);
  const report = buildPairImprovementReport(swingResults, "1");
  const html = renderSwingReview(report);
  assert.match(html, /<h4><button [^>]*data-board-jump="1"[^>]*>Board 1<\/button> - <span class="contract">/);
  assert.match(html, /vs 2 peers/);
  assert.doesNotMatch(html, /Open board/);
  assert.doesNotMatch(html, /swing-actions/);
});

test("the coach avatar varies deterministically across advice texts", async () => {
  const { collieVariant, renderLossAdvice } = await import("../src/ui/reportView.js");
  assert.equal(collieVariant("stay low on part scores"), collieVariant("stay low on part scores"));
  const adviceTexts = [
    "Review doubles, redoubles, sacrifices, and penalty passes as separate decisions.",
    "Use these boards for auction review: level, strain, invitation, signoff.",
    "Review opening lead, count signals, suit preference, shifts, and cash-out timing.",
    "Replay the contract card by card before checking double-dummy.",
    "Focus on vulnerability, total-tricks judgment, balancing, selling out.",
    "Tied comparisons point to thin overtricks and partscore details."
  ];
  const variants = new Set(adviceTexts.map(collieVariant));
  assert.ok(variants.size >= 3, `expected pose variety, got ${[...variants].join(",")}`);
  for (const variant of variants) {
    assert.match(variant, /^(0[1-9]|10)$/);
  }
  const html = renderLossAdvice(adviceTexts[0]);
  assert.match(html, /assets\/collie-(0[1-9]|10)\.svg/);
  assert.doesNotMatch(html, /bc-avatar/);
});
