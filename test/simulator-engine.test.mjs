import test from "node:test";
import assert from "node:assert/strict";
import { FULL_LEVEL, SLICE_LEVEL } from "../src/core/simulator/level.js";
import {
  applyDamageToPlayer,
  createCombatState,
  tryShuffleHand,
  tryThrowCard,
  updateCombatTimers,
  updateProjectiles,
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

function walkTo(state, target, expectedSpaceId, maxTicks = 1200) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    const dx = target.x - state.player.position.x;
    const dz = target.z - state.player.position.z;
    if (Math.hypot(dx, dz) <= 0.18 && state.player.spaceId === expectedSpaceId) return;
    const desiredYaw = Math.atan2(dz, dx);
    const turn = Math.atan2(
      Math.sin(desiredYaw - state.player.yaw),
      Math.cos(desiredYaw - state.player.yaw)
    );
    stepSimulation(state, { turn, forward: 1 }, FIXED_DT);
  }
  assert.fail(`could not walk to ${expectedSpaceId} at ${target.x},${target.z}`);
}

test("thirteen card throws recover through a one-second shuffle", () => {
  const combat = createCombatState({ cards: CARDS, source: "pbn" });
  for (let index = 0; index < 13; index += 1) {
    const result = tryThrowCard(combat, { tick: index, angle: 0 });
    assert.equal(result.fired, true, `card ${index + 1}`);
    if (index < 12) updateCombatTimers(combat, 1);
  }
  assert.equal(combat.nextCardIndex, 0);
  assert.equal(combat.shuffleRemaining, 1);
  updateCombatTimers(combat, 0.99);
  assert.equal(tryThrowCard(combat, { tick: 14 }).fired, false);
  updateCombatTimers(combat, 0.02);
  assert.equal(tryThrowCard(combat, { tick: 14 }).fired, true);
});

test("an early shuffle reloads a partly used hand", () => {
  const combat = createCombatState({ cards: CARDS, source: "pbn" });
  assert.equal(tryShuffleHand(combat).reason, "full");
  assert.equal(tryThrowCard(combat, { tick: 1 }).fired, true);
  updateCombatTimers(combat, 1);
  assert.equal(tryThrowCard(combat, { tick: 2 }).fired, true);
  updateCombatTimers(combat, 1);
  assert.equal(combat.nextCardIndex, 2);

  assert.deepEqual(tryShuffleHand(combat), { started: true, reason: "", duration: 1 });
  assert.equal(combat.nextCardIndex, 0);
  assert.equal(combat.shuffles, 1);
  assert.equal(tryShuffleHand(combat).reason, "shuffling");
  assert.equal(tryThrowCard(combat, { tick: 3 }).fired, false);
  updateCombatTimers(combat, 1);
  assert.deepEqual(tryThrowCard(combat, { tick: 3 }).projectile.card, CARDS[0]);
});

test("the simulation turns reload input into an announced early shuffle", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  state.combat.nextCardIndex = 4;
  const events = stepSimulation(state, { reload: true }, FIXED_DT);
  assert.equal(state.combat.nextCardIndex, 0);
  assert.equal(state.combat.shuffleRemaining, 1);
  assert.ok(events.some((event) => event.type === "shuffle-started" && event.early === true && event.duration === 1));
});

test("System Notes absorb half of damage and the test harness can run invulnerably", () => {
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

function testProjectile(position, velocity = { x: 24, y: 0, z: 0 }) {
  return {
    id: "test-card",
    type: "card",
    owner: "player",
    ownerId: "player",
    position: { ...position },
    spaceId: "club-entrance",
    velocity,
    radius: 0.1,
    height: 0.08,
    damage: 34,
    lifetime: 1,
    alive: true,
  };
}

function testEnemy(id, x, z = 35) {
  return {
    id,
    kind: "enemy",
    archetype: "kibitzer",
    position: { x, y: 0, z },
    spaceId: "club-entrance",
    radius: 0.2,
    health: 1,
    maxHealth: 1,
    alive: true,
    active: true,
  };
}

test("projectile collision selects the nearest actor rather than array order", () => {
  const near = testEnemy("z-near", 5);
  const far = testEnemy("a-far", 6);
  const projectiles = [testProjectile({ x: 4, y: 1, z: 35 })];
  const events = updateProjectiles({
    level: SLICE_LEVEL,
    dynamics: { portals: {} },
    projectiles,
    entities: [far, near],
    obstacles: [],
    player: null,
    dt: 0.1,
    combat: { shotsHit: 0 },
  });
  assert.equal(near.alive, false);
  assert.equal(far.alive, true);
  assert.ok(events.some((event) => event.type === "enemy-defeated" && event.entityId === near.id));
});

test("projectile wall impact wins over an actor behind solid geometry", () => {
  const behindWall = testEnemy("behind-wall", 14.4, 30);
  const projectiles = [testProjectile({ x: 13, y: 1, z: 30 })];
  const events = updateProjectiles({
    level: SLICE_LEVEL,
    dynamics: { portals: {} },
    projectiles,
    entities: [behindWall],
    obstacles: [],
    player: null,
    dt: 0.1,
    combat: { shotsHit: 0 },
  });
  assert.equal(behindWall.alive, true);
  assert.ok(events.some((event) => event.type === "projectile-wall"));
  assert.ok(!events.some((event) => event.type === "enemy-hit"));
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

test("render snapshots cannot mutate or drift with live simulation state", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  const snapshot = getSimulationSnapshot(state);
  const originalX = snapshot.player.position.x;
  stepSimulation(state, { forward: 1 }, FIXED_DT);
  assert.equal(snapshot.player.position.x, originalX);
  snapshot.player.position.x = 999;
  snapshot.progress.completedWings.push("tampered");
  snapshot.entities[0].position.x = 999;
  assert.notEqual(state.player.position.x, 999);
  assert.ok(!state.progress.completedWings.includes("tampered"));
  assert.notEqual(state.enemies[0].position.x, 999);
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
  state.player.position = { ...slip.position };
  state.player.spaceId = slip.spaceId;
  const reopenEvents = stepSimulation(state, { interact: true }, FIXED_DT);
  assert.ok(reopenEvents.some((event) => event.type === "review-slip-reopened"));
  assert.equal(state.player.honor, 500, "reopening coaching cannot award Honor twice");
});

test("a coaching wing objective exposes remaining opponents and the cleared slip", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  walkTo(state, { x: 12.6, z: 35 }, "club-entrance");
  walkTo(state, { x: 16.2, z: 35 }, "movement-hall");
  walkTo(state, { x: 31, z: 35 }, "main-cardroom");
  walkTo(state, { x: 35, z: 50 }, "wing-a-entry");
  const wingEnemies = state.enemies.filter((enemy) => enemy.wingId === "a");
  assert.ok(wingEnemies.length > 1);
  assert.equal(
    getSimulationSnapshot(state).objectiveText,
    `Coaching Wing A: ${wingEnemies.length} opponents remain.`
  );

  wingEnemies[0].alive = false;
  assert.equal(
    getSimulationSnapshot(state).objectiveText,
    `Coaching Wing A: ${wingEnemies.length - 1} opponents remain.`
  );
  wingEnemies.slice(1).forEach((enemy) => { enemy.alive = false; });
  assert.equal(getSimulationSnapshot(state).objectiveText, "Coaching Wing A clear. Recover its Review Slip.");
});

test("boss defeat retains slips, reveals the exit, and completes through movement and interaction", () => {
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

  assert.equal(getSimulationSnapshot(state).objectiveText, "Follow the open victory gate to Move for the Next Round.");
  walkTo(state, { x: 59, z: 28 }, "traveler-vault");
  walkTo(state, { x: 74, z: 28 }, "results-posted");
  assert.equal(
    getSimulationSnapshot(state).objectiveText,
    "Approach Move for the Next Round, then press Interact."
  );
  walkTo(state, { x: 79.2, z: 28 }, "results-posted");
  assert.equal(getSimulationSnapshot(state).objectiveText, "Press Interact at Move for the Next Round.");
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

test("checkpoint rollback restores neutral enemies and pickups with global stats", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  const wingEnemies = state.enemies.filter((enemy) => enemy.wingId === "a");
  wingEnemies.forEach((enemy) => { enemy.alive = false; enemy.health = 0; });
  state.encounter = { ...state.encounter, kind: "wing", wingId: "a" };
  const slip = state.reviewSlips[0];
  state.player.position = { ...slip.position };
  state.player.spaceId = slip.spaceId;
  stepSimulation(state, { interact: true }, FIXED_DT);
  const checkpointHonor = state.player.honor;

  const neutralEnemy = state.enemies.find((enemy) => !enemy.wingId && enemy.archetype !== "bottom-board");
  neutralEnemy.alive = false;
  neutralEnemy.health = 0;
  state.player.honor += 100;
  state.stats.honor = state.player.honor;
  state.stats.enemiesDefeated += 1;
  const neutralPickup = state.pickups.find((pickup) => !pickup.wingId);
  neutralPickup.collected = true;
  neutralPickup.active = false;
  state.stats.pickups += 1;

  resetEncounter(state, "global-rollback");
  assert.equal(neutralEnemy.alive, true);
  assert.equal(neutralEnemy.health, neutralEnemy.maxHealth);
  assert.equal(neutralPickup.collected, false);
  assert.equal(neutralPickup.active, true);
  assert.equal(state.player.honor, checkpointHonor);
  assert.equal(state.stats.enemiesDefeated, 0);
  assert.equal(state.stats.pickups, 0);
});

test("wing enemies and the boss remain inside their authored encounters", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  state.progress.slips = 1;
  state.progress.completedWings = ["a"];
  state.portalStates["hub-to-vault"].open = true;
  state.player.position = { x: 54, y: 0, z: 28 };
  state.player.spaceId = "main-cardroom";
  const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
  boss.active = true;
  boss.alerted = true;
  state.progress.bossActive = true;
  for (let tick = 0; tick < 350; tick += 1) stepSimulation(state, {}, FIXED_DT);
  assert.equal(boss.spaceId, "traveler-vault");

  const wingEnemy = state.enemies.find((enemy) => enemy.wingId === "a");
  wingEnemy.position = { x: 35, y: 0.35, z: 49 };
  wingEnemy.spaceId = "wing-a-entry";
  wingEnemy.alerted = true;
  state.player.position = { x: 35, y: 0, z: 45 };
  state.player.spaceId = "main-cardroom";
  for (let tick = 0; tick < 180; tick += 1) stepSimulation(state, {}, FIXED_DT);
  assert.equal(wingEnemy.spaceId, "wing-a-entry");
});

test("either lift control calls a timed lift before the shortcut opens", () => {
  for (const controlId of ["lift-control-hub", "lift-control-wing-a"]) {
    const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
    state.progress.completedWings = ["a"];
    state.progress.slips = 1;
    const portalId = "wing-a-lift-shortcut";
    stepSimulation(state, {}, FIXED_DT);
    assert.equal(state.portalStates[portalId].open, false);
    const control = state.liftControls.find((entry) => entry.id === controlId);
    state.player.position = { ...control.position };
    state.player.spaceId = control.spaceId;
    const callEvents = stepSimulation(state, { interact: true }, FIXED_DT);
    assert.ok(callEvents.some((event) => event.type === "lift-called"));
    assert.equal(state.lifts[portalId].moving, true);
    assert.equal(state.portalStates[portalId].open, false);
    for (let tick = 0; tick < 30 && !state.lifts[portalId].ready; tick += 1) {
      stepSimulation(state, {}, FIXED_DT);
    }
    assert.equal(state.lifts[portalId].ready, true);
    assert.equal(state.portalStates[portalId].open, true);
  }
});
