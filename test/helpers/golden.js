"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadApp, samplePath, hasSample, readSample } = require("./load-app.js");

const FIXTURES_DIR = path.join(__dirname, "..", "golden", "fixtures");

const SESSIONS = [
  { name: "01", bws: "01.BWS", pbn: "01.pbn" },
  { name: "20260627", bws: "20260627.BWS", pbn: "20260627.pbn" },
  { name: "20260707", bws: "20260707.BWS", pbn: "20260707.pbn" }
];

// A compact, deterministic snapshot of everything the analysis pipeline
// computes for a session: standings, per-row matchpoints, and the
// improvement report's conclusions for three representative pairs.
function snapshotSession(session) {
  if (!hasSample(session.bws) || !hasSample(session.pbn)) return null;
  const app = loadApp();
  const { parsePbn, buildAnalysis, parseBwsBuffer, buildResultsAnalysis, buildPairImprovementReport } = app.PBNAnalyzer;

  const analysis = buildAnalysis(parsePbn(String(readSample(session.pbn)), session.pbn));
  const raw = parseBwsBuffer(new Uint8Array(readSample(session.bws)), session.bws);
  const results = buildResultsAnalysis(raw, analysis);

  const standings = results.pairStandings
    .map((standing) => [String(standing.key), standing.matchpoints, standing.top, standing.boards, round4(standing.percent)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const boards = {};
  Array.from(results.rowsByBoard.keys()).sort().forEach((boardNo) => {
    boards[boardNo] = results.rowsByBoard.get(boardNo)
      .map((row) => [row.id || row.index, row.scoreNS, row.nsMatchpoints, round4(row.nsPercent)])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
  });

  const keys = standings.map((entry) => entry[0]);
  const reportKeys = [...new Set([keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]])];
  const reports = {};
  reportKeys.forEach((key) => {
    const report = buildPairImprovementReport(results, key);
    if (!report) {
      reports[key] = null;
      return;
    }
    reports[key] = {
      boards: report.summary.boards,
      percent: round4(report.summary.percent),
      lostMatchpoints: report.summary.lostMatchpoints,
      declaredBoards: report.summary.declaredBoards,
      categories: report.lossLedger.categories.map((category) => [category.key, category.totalLoss, category.boardCount]),
      decisionTypes: report.decisionTypes.map((type) => [type.key, type.totalLoss, type.boardCount]),
      reviewBoards: report.reviewItems.map((item) => item.row.boardNo)
    };
  });

  return normalize({
    warnings: results.warnings.length,
    participantMode: results.participantMode,
    resultCount: results.summary.resultCount,
    scoredCount: results.summary.scoredCount,
    standings,
    boards,
    reports
  });
}

function round4(value) {
  return value == null ? null : Math.round(value * 10000) / 10000;
}

// JSON round-trip strips vm-realm prototypes and normalizes numbers.
function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadFixture(name) {
  const file = path.join(FIXTURES_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = { SESSIONS, FIXTURES_DIR, snapshotSession, loadFixture, samplePath };
