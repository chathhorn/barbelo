"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");
const { referenceScore } = require("./helpers/reference-scorer.js");

const app = loadApp();
const { scoreDuplicateContract } = app.PBNAnalyzer;

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const STRAINS = ["C", "D", "H", "S", "NT"];
const DOUBLINGS = ["", "X", "XX"];

test("every contract/result/vulnerability combination matches the reference scorer", () => {
  let cases = 0;
  for (const level of LEVELS) {
    for (const strain of STRAINS) {
      for (const doubling of DOUBLINGS) {
        const contractText = `${level} ${strain}${doubling ? ` ${doubling}` : ""}`;
        for (const vulnerable of [false, true]) {
          const vulnerability = vulnerable ? "NS" : "EW";
          const target = level + 6;
          for (let tricks = 0; tricks <= 13; tricks += 1) {
            const diff = tricks - target;
            const resultText = diff === 0 ? "=" : diff > 0 ? `+${diff}` : String(diff);
            const scored = scoreDuplicateContract(contractText, resultText, "N", vulnerability);
            const expected = referenceScore(level, strain === "NT" ? "N" : strain, doubling, vulnerable, tricks);
            assert.equal(
              scored.scoreDeclarer,
              expected,
              `${contractText} ${resultText} ${vulnerable ? "vul" : "nonvul"}: app ${scored.scoreDeclarer} vs reference ${expected}`
            );
            cases += 1;
          }
        }
      }
    }
  }
  assert.equal(cases, 7 * 5 * 3 * 2 * 14);
});

test("passed-out boards score zero for both sides at any vulnerability", () => {
  for (const vulnerability of ["None", "NS", "EW", "All"]) {
    const scored = scoreDuplicateContract("PASS", "", "", vulnerability);
    assert.equal(scored.scoreNS, 0);
    assert.equal(scored.scoreDeclarer, 0);
  }
});
