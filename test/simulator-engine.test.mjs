import test from "node:test";
import assert from "node:assert/strict";
import { FULL_LEVEL, SLICE_LEVEL } from "../src/core/simulator/level.js";
import {
  applyDamageToPlayer,
  createCombatState,
  tryThrowCard,
  updateCombatTimers,
} from "../src/core/simulator/combat.js";
import {
  FIXED_DT,
  createSimulation,
  getSimulationSnapshot,
  resetEncounter,
  restartRun,
  simulationStats,
  stepSimulation,
} from "../src/core/simulator/simulation.js";

const CARDS = ["SA", "SK", "SQ", "SJ", "ST", "S9", "H8", "H7", "D6", "D5", "C4", "C3", "C2"]
  .map((value) => ({ suit: value[0], rank: value[1] }));

const SCENARIO = Object.freeze({
  seed: "engine-test",
  representativeHand: { source: "pbn", cards: CARDS },
  wings: [{ slot: "A" }, { slot: "B" }, { slot: "C" }],
  boss: { title: "The Bottom Board" },
});

test("thirteen card throws always recover through a bounded shuffle", () => {
  const combat = createCombatState({ cards: CARDS, source: "pbn" });
  for (let index = 0; index < 13; index += 1) {
    const result = tryThrowCard(combat, { tick: index, angle: 0 });
    assert.equal(result.fired, true, `card ${index + 1}`);
    if (index < 12) updateCombatTimers(combat, 1);
  }
  assert.equal(combat.nextCardIndex, 0);
  assert.ok(combat.shuffleRemaining > 0 && combat.shuffleRemaining <= 0.5);
  updateCombatTimers(combat, 0.5);
  assert.equal(tryThrowCard(combat, { tick: 14 }).fired, true);
});

test("System Notes absorb half of damage and Practice Mode is invulnerable", () => {
  const player = { composure: 100, systemNotes: 20 };
  assert.deepEqual(applyDamageToPlayer(player, 30, "standard"), {
    rawDamage: 30,
    absorbed: 15,
    composureLost: 15,
    defeated: false,
    practice: false,
  });
  assert.equal(player.composure, 85);
  assert.equal(player.systemNotes, 5);
  const practice = { composure: 100, systemNotes: 0 };
  assert.equal(applyDamageToPlayer(practice, 500, "practice").composureLost, 0);
  assert.equal(practice.composure, 100);
});

test("live boss objective uses the personalized scenario title", () => {
  const state = createSimulation({
    scenario: { ...SCENARIO, boss: { title: "Complacency" } },
    level: SLICE_LEVEL,
  });
  state.progress.bossActive = true;
  assert.equal(getSimulationSnapshot(state).objectiveText, "Reseat Complacency.");
});

test("simulation movement is deterministic and yaw zero moves toward +X", () => {
  const first = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  const second = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  for (let tick = 0; tick < 35; tick += 1) {
    stepSimulation(first, { forward: 1 }, FIXED_DT);
    stepSimulation(second, { forward: 1 }, FIXED_DT);
  }
  assert.deepEqual(getSimulationSnapshot(first), getSimulationSnapshot(second));
  assert.ok(first.player.position.x > first.player.spawnPosition.x);
  assert.equal(first.player.position.z, first.player.spawnPosition.z);
});

test("cleared wing interaction awards one persistent Review Slip and fixed Honor", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  state.enemies.filter((enemy) => enemy.wingId === "a").forEach((enemy) => { enemy.alive = false; });
  state.encounter = { ...state.encounter, kind: "wing", wingId: "a" };
  const slip = state.reviewSlips[0];
  state.player.position = { ...slip.position };
  state.player.spaceId = slip.spaceId;
  const events = stepSimulation(state, { interact: true }, FIXED_DT);
  assert.ok(events.some((event) => event.type === "review-slip"));
  assert.equal(state.progress.slips, 1);
  assert.equal(state.player.honor, 500);
  assert.equal(state.portalStates["hub-to-vault"].open, true);

  resetEncounter(state, "test");
  assert.equal(state.progress.slips, 1);
  assert.equal(state.reviewSlips[0].collected, true);
  assert.equal(state.player.honor, 500);
  assert.ok(state.enemies.filter((enemy) => enemy.wingId === "a").every((enemy) => !enemy.alive));
});

test("boss defeat retains slips, unlocks exit, and completes through interaction", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  state.progress.slips = 1;
  state.progress.collectedSlipIds = ["review-slip-a"];
  state.progress.completedWings = ["a"];
  state.portalStates["hub-to-vault"].open = true;
  state.player.position = { x: 62, y: -0.2, z: 28 };
  state.player.spaceId = "traveler-vault";
  state.encounter = { ...state.encounter, kind: "boss", wingId: "" };
  const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
  boss.health = 1;
  boss.maxHealth = 1;
  stepSimulation(state, { fire: true }, FIXED_DT);
  let events = [];
  for (let tick = 0; tick < 12 && !state.progress.bossDefeated; tick += 1) {
    events = events.concat(stepSimulation(state, {}, FIXED_DT));
  }
  assert.equal(state.progress.bossDefeated, true);
  assert.ok(events.some((event) => event.type === "boss-defeated"));
  assert.equal(state.progress.slips, 1);
  assert.equal(state.portalStates["vault-to-results"].open, true);
  const completedHonor = state.player.honor;
  resetEncounter(state, "post-boss");
  assert.equal(boss.alive, false);
  assert.equal(state.progress.bossDefeated, true);
  assert.equal(state.player.honor, completedHonor);

  const exit = state.level.markers.find((marker) => marker.id === "next-round-exit");
  state.player.position = { ...exit.position };
  state.player.spaceId = exit.spaceId;
  const exitEvents = stepSimulation(state, { interact: true }, FIXED_DT);
  assert.ok(exitEvents.some((event) => event.type === "run-complete"));
  assert.equal(state.status, "complete");
  assert.equal(simulationStats(state).honor, 1000);
});

test("Restart Run clears all progress and encounter state", () => {
  const state = createSimulation({ scenario: SCENARIO, level: FULL_LEVEL });
  state.player.honor = 900;
  state.progress.slips = 2;
  state.progress.completedWings = ["a", "b"];
  restartRun(state);
  assert.equal(state.player.honor, 0);
  assert.equal(state.progress.slips, 0);
  assert.deepEqual(state.progress.completedWings, []);
  assert.equal(state.mode, "standard");
});

test("persistent checkpoints cannot respawn banked enemies or farm Honor", () => {
  const state = createSimulation({ scenario: SCENARIO, level: FULL_LEVEL, mode: "practice" });
  const first = state.enemies.find((enemy) => enemy.wingId === "a");
  const second = state.enemies.find((enemy) => enemy.wingId === "a" && enemy.id !== first.id);
  state.player.spaceId = "wing-a-chalkboard";
  state.player.position = { x: 50, y: 0.35, z: 54 };
  state.encounter.kind = "wing";
  state.encounter.wingId = "a";
  first.alive = false;
  first.health = 0;
  state.player.honor = 100;
  state.stats.honor = 100;
  state.stats.enemiesDefeated = 1;

  const secret = state.secrets.find((entry) => entry.secretId === "dummys-hand");
  state.player.position = { ...secret.position };
  stepSimulation(state, { interact: true }, FIXED_DT);
  assert.equal(state.player.honor, 350);

  second.alive = false;
  second.health = 0;
  state.player.honor += 100;
  state.stats.honor = state.player.honor;
  state.stats.enemiesDefeated += 1;
  resetEncounter(state, "test");

  assert.equal(first.alive, false, "enemy defeated before the persistent checkpoint stays down");
  assert.equal(second.alive, true, "enemy defeated after the checkpoint is restored");
  assert.equal(state.player.honor, 350);
  assert.equal(state.stats.enemiesDefeated, 1);
  assert.equal(secret.collected, true);
});

test("reset after a completed wing preserves completed actors and awards", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  const wingEnemies = state.enemies.filter((enemy) => enemy.wingId === "a");
  wingEnemies.forEach((enemy) => {
    enemy.alive = false;
    enemy.health = 0;
    state.player.honor += 100;
    state.stats.enemiesDefeated += 1;
  });
  state.stats.honor = state.player.honor;
  state.encounter = { ...state.encounter, kind: "wing", wingId: "a" };
  const slip = state.reviewSlips[0];
  state.player.position = { ...slip.position };
  state.player.spaceId = slip.spaceId;
  stepSimulation(state, { interact: true }, FIXED_DT);
  const wingHonor = state.player.honor;
  resetEncounter(state, "test-wing");
  assert.ok(wingEnemies.every((enemy) => !enemy.alive));
  assert.equal(state.progress.slips, 1);
  assert.equal(state.player.honor, wingHonor);
});
