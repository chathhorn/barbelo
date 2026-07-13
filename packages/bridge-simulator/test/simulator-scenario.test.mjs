import test from "node:test";
import assert from "node:assert/strict";

import {
  GENERIC_SCENARIO,
  GENERIC_SCENARIO_SEED,
  SCENARIO_SCHEMA_VERSION,
} from "../src/content.js";
import {
  canonicalCardKey,
  normalizeThirteenCards,
} from "../src/core/cards.js";
import { launch } from "../src/index.js";

function everyObjectIsFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((entry) => everyObjectIsFrozen(entry, seen));
}

function allKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  Object.entries(value).forEach(([key, entry]) => {
    keys.push(key);
    allKeys(entry, keys);
  });
  return keys;
}

test("the package exports one deeply immutable generic scenario", () => {
  assert.equal(GENERIC_SCENARIO.schemaVersion, SCENARIO_SCHEMA_VERSION);
  assert.equal(GENERIC_SCENARIO.seed, GENERIC_SCENARIO_SEED);
  assert.equal(everyObjectIsFrozen(GENERIC_SCENARIO), true);
  assert.doesNotThrow(() => structuredClone(GENERIC_SCENARIO));
});

test("generic coaching supplies three distinct wings and three debrief notes", () => {
  assert.deepEqual(
    GENERIC_SCENARIO.wings.map((wing) => wing.title),
    ["The Auction Pits", "The Trickworks", "The Lead Mines"]
  );
  assert.equal(new Set(GENERIC_SCENARIO.wings.map((wing) => wing.slot)).size, 3);
  assert.equal(new Set(GENERIC_SCENARIO.wings.map((wing) => wing.encounterSkin)).size, 3);
  GENERIC_SCENARIO.wings.forEach((wing) => {
    assert.ok(wing.coachFeedback.summary.length, `${wing.title} needs a coaching summary`);
    assert.ok(wing.coachFeedback.details.length, `${wing.title} needs coaching details`);
  });
  assert.equal(GENERIC_SCENARIO.debrief.notes.length, 3);
  assert.ok(GENERIC_SCENARIO.debrief.notes.every((note) => typeof note === "string" && note.trim()));
  assert.ok(GENERIC_SCENARIO.debrief.nextTableHabit.every((action) => typeof action === "string" && action.trim()));
});

test("the generic throwing hand contains thirteen unique valid cards", () => {
  const cards = GENERIC_SCENARIO.hand.cards;
  assert.equal(cards.length, 13);
  assert.equal(new Set(cards.map(canonicalCardKey)).size, 13);
  assert.deepEqual(normalizeThirteenCards(cards), cards);
});

test("generic content carries no analyzer session, report, pair, PBN, or provenance data", () => {
  const forbiddenKeys = new Set([
    "analysis",
    "results",
    "report",
    "session",
    "sessionFacts",
    "identity",
    "pairKey",
    "pairLabel",
    "players",
    "representativeHand",
    "provenance",
    "sourceFields",
    "rowIdentity",
    "featuredBoard",
  ].map((key) => key.toLowerCase()));
  const leakedKeys = allKeys(GENERIC_SCENARIO)
    .filter((key) => forbiddenKeys.has(key.toLowerCase()));
  assert.deepEqual(leakedKeys, []);
  assert.doesNotMatch(
    JSON.stringify(GENERIC_SCENARIO),
    /\b(?:session|report|pair|pbn|provenance)\b/i
  );
});

test("the public launch boundary requires an explicit asset base", async () => {
  await assert.rejects(
    launch({ replaceChildren() {}, classList: {} }),
    /assetBaseUrl is required/
  );
});
