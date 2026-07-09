"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, hasSample, readSample } = require("./helpers/load-app.js");

const app = loadApp();
const { parsePbn, parseDeal, buildAnalysis } = app.PBNAnalyzer;

const DEAL_1 = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";
const DEAL_2 = "N:T987.J87.J87.J87 AKQJ.AKQ.AKQ.AKQ 654.654.654.T965 32.T932.T932.432";

test("records split correctly when Board precedes Event", () => {
  const pbn = [
    "[Board \"1\"]",
    "[Event \"Club Game\"]",
    `[Deal \"${DEAL_1}\"]`,
    "",
    "[Board \"2\"]",
    "[Event \"Club Game\"]",
    `[Deal \"${DEAL_2}\"]`
  ].join("\n");
  const parsed = parsePbn(pbn, "t.pbn");
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].tags.Board, "1");
  assert.equal(parsed.records[0].tags.Deal, DEAL_1);
  assert.equal(parsed.records[1].tags.Board, "2");
  assert.equal(parsed.records[1].tags.Deal, DEAL_2);

  const analysis = buildAnalysis(parsed);
  assert.equal(analysis.boards.length, 2);
  assert.equal(analysis.boards[0].hands.N.hcp, 37);
  assert.equal(analysis.boards[1].hands.E.hcp, 37);
});

test("records still split correctly when Event comes first", () => {
  const pbn = [
    "[Event \"Club Game\"]",
    "[Board \"1\"]",
    `[Deal \"${DEAL_1}\"]`,
    "",
    "[Event \"Club Game\"]",
    "[Board \"2\"]",
    `[Deal \"${DEAL_2}\"]`
  ].join("\n");
  const parsed = parsePbn(pbn, "t.pbn");
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].tags.Deal, DEAL_1);
  assert.equal(parsed.records[1].tags.Deal, DEAL_2);
});

test("deal rotation assigns hands from any first seat", () => {
  const deal = parseDeal("E:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432");
  assert.equal(deal.valid, true);
  assert.equal(deal.hands.E.S, "AKQJ");
  assert.equal(deal.hands.S.S, "T987");
  assert.equal(deal.hands.W.S, "654");
  assert.equal(deal.hands.N.S, "32");
});

test("sample PBN files keep parsing with full-deck invariants", (t) => {
  if (!hasSample("01.pbn")) return t.skip("samples/01.pbn not present");
  const parsed = parsePbn(String(readSample("01.pbn")), "01.pbn");
  const analysis = buildAnalysis(parsed);
  assert.ok(analysis.boards.length >= 24);
  analysis.boards.forEach((board) => {
    assert.equal(board.validDeal, true, `board ${board.boardNo} deal invalid`);
    const totalHcp = ["N", "E", "S", "W"].reduce((acc, seat) => acc + board.hands[seat].hcp, 0);
    assert.equal(totalHcp, 40, `board ${board.boardNo} HCP sum ${totalHcp}`);
  });
});
