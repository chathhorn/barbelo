"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, csvFrom } = require("./helpers/load-app.js");

const app = loadApp();
const { parseResultsCsv, buildResultsAnalysis } = app.PBNAnalyzer;

function analyzeCsv(rows) {
  const csv = csvFrom(rows);
  return buildResultsAnalysis(parseResultsCsv(csv, "t.csv", csv.length), null);
}

function analyzeRaw(receivedData, playerNumbers) {
  return buildResultsAnalysis({
    fileName: "t",
    sourceType: "TEST",
    receivedData,
    playerNumbers: playerNumbers || [],
    warnings: []
  }, null);
}

test("Mitchell CSVs split NS and EW pairs sharing a number (no rosters needed)", () => {
  const results = analyzeCsv([
    ["Board", "Table", "Round", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "1", "1", "1", "N", "3 NT", "="],
    ["2", "2", "1", "2", "2", "N", "2 S", "+1"],
    ["2", "1", "2", "1", "2", "N", "2 S", "="],
    ["1", "2", "2", "2", "1", "N", "3 NT", "-1"]
  ]);
  assert.equal(results.participantMode, "side");
  assert.equal(results.pairStandings.length, 4);
  const keys = results.pairStandings.map((standing) => String(standing.key)).sort();
  assert.equal(keys.join(","), "1:EW,1:NS,2:EW,2:NS");
  assert.ok(results.warnings.some((warning) => /Mitchell/i.test(warning)));
});

test("Howell-style numbering (no NS/EW collisions) keeps shared pair identity", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["2", "2", "1", "N", "2 S", "+1"]
  ]);
  assert.equal(results.participantMode, "pair");
  assert.equal(results.pairStandings.length, 2);
});

test("a board with a single result gives neither side 100%", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="]
  ]);
  assert.equal(results.rows[0].nsPercent, null);
  assert.equal(results.rows[0].ewPercent, null);
  assert.equal(results.rows[0].boardTop, 0);
});

test("multi-section games matchpoint each section separately and scope pair identity", () => {
  const results = analyzeCsv([
    ["Section", "Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "1", "2", "N", "3 NT", "="],
    ["1", "1", "3", "4", "N", "3 NT", "-1"],
    ["2", "1", "1", "2", "N", "2 S", "+1"],
    ["2", "1", "3", "4", "N", "4 S", "="]
  ]);
  assert.equal(results.pairStandings.length, 8);
  const bySection = new Map(results.rows.map((row) => [`${row.section}:${row.pairNS}`, row]));
  assert.equal(bySection.get("1:1").nsMatchpoints, 1);
  assert.equal(bySection.get("1:1").boardTop, 1);
  assert.equal(bySection.get("2:1").nsMatchpoints, 0);
  assert.ok(results.warnings.some((warning) => /sections detected/i.test(warning)));
});

test("director-adjusted rows award percentages without distorting the field", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result", "Remarks"],
    ["1", "1", "2", "N", "3 NT", "=", ""],
    ["1", "3", "4", "N", "3 NT", "-1", ""],
    ["1", "5", "6", "N", "2 NT", "+1", ""],
    ["1", "7", "8", "", "", "", "40%-60%"]
  ]);
  const adjusted = results.rows.find((row) => row.pairNS === 7);
  assert.equal(adjusted.nsPercent, 40);
  assert.equal(adjusted.ewPercent, 60);
  assert.equal(adjusted.scoringError, "");
  const scored = results.rows.find((row) => row.pairNS === 1);
  assert.equal(scored.boardTop, 2);
  assert.equal(scored.nsMatchpoints, 2);
  assert.ok(results.warnings.some((warning) => /director-adjusted/i.test(warning)));
});

test("AVE remark variants parse to percentage awards", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result", "Remarks"],
    ["1", "1", "2", "N", "3 NT", "=", ""],
    ["1", "3", "4", "N", "3 NT", "+1", ""],
    ["1", "5", "6", "", "", "", "AVE+/AVE-"],
    ["2", "1", "2", "", "", "", "AVE"]
  ]);
  const split = results.rows.find((row) => row.pairNS === 5);
  assert.equal(split.nsPercent, 60);
  assert.equal(split.ewPercent, 40);
  const flat = results.rows.find((row) => row.boardNo === 2);
  assert.equal(flat.nsPercent, 50);
  assert.equal(flat.ewPercent, 50);
});

test("blank placeholder player rows never overwrite recovered names", () => {
  const results = analyzeRaw([
    { Board: 1, Table: 2, Round: 1, PairNS: 2, PairEW: 8, "NS/EW": "N", Contract: "3 NT", Result: "=" },
    { Board: 2, Table: 1, Round: 2, PairNS: 1, PairEW: 8, "NS/EW": "N", Contract: "2 S", Result: "=" }
  ], [
    { Section: 1, Table: 2, Direction: "E", Number: "4116666", Name: "Gary Urkevich", Round: 1 },
    { Section: 1, Table: 2, Direction: "W", Number: "3876748", Name: "Theresa Griffin", Round: 1 },
    { Section: 1, Table: 1, Direction: "E", Number: "", Name: "", Round: 1 },
    { Section: 1, Table: 1, Direction: "W", Number: "", Name: "", Round: 1 }
  ]);
  const roster = results.pairRosters.get("8:EW") || results.pairRosters.get("8");
  assert.ok(roster, "pair 8 roster missing");
  assert.match(roster.label, /Gary Urkevich/);
  assert.doesNotMatch(roster.label, /Table 1/);
});

test("player rows join the pair seated during their round, not round 1", () => {
  const results = analyzeRaw([
    { Board: 1, Table: 1, Round: 1, PairNS: 1, PairEW: 2, "NS/EW": "N", Contract: "3 NT", Result: "=" },
    { Board: 9, Table: 1, Round: 5, PairNS: 1, PairEW: 3, "NS/EW": "N", Contract: "2 S", Result: "=" }
  ], [
    { Section: 1, Table: 1, Direction: "E", Number: "", Name: "Original Player", Round: 1 },
    { Section: 1, Table: 1, Direction: "E", Number: "", Name: "Late Sub", Round: 5 }
  ]);
  const subRoster = results.pairRosters.get("3:EW");
  assert.ok(subRoster, "pair 3 EW roster missing");
  assert.match(subRoster.label, /Late Sub/);
  const originalRoster = results.pairRosters.get("2:EW");
  assert.ok(originalRoster, "pair 2 EW roster missing");
  assert.match(originalRoster.label, /Original Player/);
  assert.doesNotMatch(originalRoster.label, /Late Sub/);
});

test("side-partnership pairs without rosters get placeholder labels, not the opposite pair's names", () => {
  const results = analyzeRaw([
    { Board: 1, Table: 1, Round: 1, PairNS: 3, PairEW: 3, "NS/EW": "N", Contract: "3 NT", Result: "=" },
    { Board: 1, Table: 2, Round: 1, PairNS: 4, PairEW: 4, "NS/EW": "N", Contract: "3 NT", Result: "-1" }
  ], [
    { Section: 1, Table: 1, Direction: "N", Number: "1", Name: "NS Three North", Round: 1 },
    { Section: 1, Table: 1, Direction: "S", Number: "2", Name: "NS Three South", Round: 1 }
  ]);
  assert.equal(results.participantMode, "side");
  const ewStanding = results.pairStandings.find((standing) => String(standing.key) === "3:EW");
  assert.ok(ewStanding, "3:EW standing missing");
  assert.doesNotMatch(String(ewStanding.players || ""), /NS Three/);
  assert.equal(ewStanding.knownPlayers, 0);
});

test("erased rows are excluded from matchpointing with a warning", () => {
  const results = analyzeRaw([
    { Board: 1, PairNS: 1, PairEW: 2, "NS/EW": "N", Contract: "3 NT", Result: "=", Erased: 0 },
    { Board: 1, PairNS: 1, PairEW: 2, "NS/EW": "N", Contract: "3 NT", Result: "-1", Erased: 1 },
    { Board: 1, PairNS: 3, PairEW: 4, "NS/EW": "N", Contract: "2 NT", Result: "=", Erased: 0 }
  ]);
  assert.equal(results.rows.length, 2);
  assert.equal(results.rows[0].boardTop, 1);
  assert.ok(results.warnings.some((warning) => /erased/i.test(warning)));
});

test("placeholder rows with pair number 0 do not flip a Howell into side partnerships", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result"],
    ["1", "1", "2", "N", "3 NT", "="],
    ["2", "2", "1", "N", "2 S", "+1"],
    ["3", "0", "0", "", "", ""]
  ]);
  assert.equal(results.participantMode, "pair");
  assert.equal(results.pairStandings.length, 2);
  assert.ok(!results.warnings.some((warning) => /Mitchell/i.test(warning)));
});

test("percentage adjustments above 100% are rejected as unscorable", () => {
  const results = analyzeCsv([
    ["Board", "PairNS", "PairEW", "NS/EW", "Contract", "Result", "Remarks"],
    ["1", "1", "2", "N", "3 NT", "=", ""],
    ["1", "3", "4", "N", "3 NT", "-1", ""],
    ["1", "5", "6", "", "", "", "150%-0%"]
  ]);
  const bogus = results.rows.find((row) => row.pairNS === 5);
  assert.equal(bogus.adjustment, null);
  assert.ok(bogus.scoringError);
  assert.equal(bogus.nsPercent, undefined);
});
