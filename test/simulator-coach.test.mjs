import test from "node:test";
import assert from "node:assert/strict";

import { coachEntityFor } from "../src/core/simulator/coach.js";
import { createCombatState, updateProjectiles } from "../src/core/simulator/combat.js";
import { SLICE_LEVEL } from "../src/core/simulator/level.js";
import {
  FIXED_DT,
  createSimulation,
  drainSimulationEvents,
  simulationStats,
  stepSimulation,
} from "../src/core/simulator/simulation.js";

const SCENARIO = Object.freeze({
  seed: "coach-impact-test",
  representativeHand: null,
  wings: [{ slot: "A" }],
  boss: { title: "The Bottom Board" },
});

test("player cards stop on the current Coach without damage, Honor, or hostile accuracy", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "standard" });
  const coachBefore = coachEntityFor(state);
  const aim = Math.atan2(
    coachBefore.position.z - state.player.position.z,
    coachBefore.position.x - state.player.position.x
  );
  const events = [...stepSimulation(state, { turn: aim, fire: true }, FIXED_DT)];
  drainSimulationEvents(state);
  for (let tick = 0; tick < 20 && !events.some((event) => event.type === "coach-hit"); tick += 1) {
    events.push(...stepSimulation(state, {}, FIXED_DT));
    drainSimulationEvents(state);
  }

  const coachAfter = coachEntityFor(state);
  const hit = events.find((event) => event.type === "coach-hit");
  assert.ok(hit, "the thrown card should intersect the entrance Coach");
  assert.equal(hit.entityId, "border-collie-coach");
  assert.equal(hit.friendly, true);
  assert.deepEqual(coachAfter, coachBefore, "friendly impact cannot move or alter the Coach");
  assert.equal(coachAfter.blocking, false);
  assert.ok(!Object.hasOwn(coachAfter, "health"));
  assert.equal(state.projectiles.length, 0, "the friendly impact should stop the card");
  assert.equal(state.player.honor, 0);
  assert.equal(state.stats.enemiesDefeated, 0);
  assert.equal(state.combat.shotsFired, 1);
  assert.equal(state.combat.shotsHit, 0);
  assert.equal(state.combat.friendlyShots, 1);
  assert.deepEqual(simulationStats(state), {
    timeSeconds: state.elapsed,
    timeLabel: "0:00",
    accuracy: 0,
    accuracyLabel: "0%",
    enemiesDefeated: 0,
    biscuits: 0,
    secrets: 0,
    honor: 0,
    shotsFired: 1,
    shotsHit: 0,
    friendlyShots: 1,
    hostileShotsFired: 0,
  });
});

test("enemy projectiles ignore the Coach and continue to the player", () => {
  const coach = {
    id: "border-collie-coach",
    kind: "coach",
    position: { x: 5, y: 0, z: 35 },
    spaceId: "club-entrance",
    radius: 0.45,
    active: true,
    alive: true,
    blocking: false,
  };
  const player = {
    id: "player",
    position: { x: 6, y: 0, z: 35 },
    spaceId: "club-entrance",
    radius: 0.38,
    composure: 100,
    systemNotes: 0,
  };
  const projectile = {
    id: "enemy-card",
    type: "score-slip",
    owner: "enemy",
    ownerId: "test-enemy",
    position: { x: 4, y: 0.8, z: 35 },
    spaceId: "club-entrance",
    velocity: { x: 24, y: 0, z: 0 },
    radius: 0.22,
    height: 0.12,
    damage: 9,
    lifetime: 1,
    alive: true,
  };
  const combat = createCombatState({ seed: "enemy-coach-pass-through" });
  const coachBefore = structuredClone(coach);
  const events = updateProjectiles({
    level: SLICE_LEVEL,
    dynamics: { portals: {} },
    projectiles: [projectile],
    entities: [],
    allies: [coach],
    obstacles: [],
    player,
    dt: 0.1,
    mode: "standard",
    combat,
  });

  assert.ok(events.some((event) => event.type === "player-hit" && event.sourceId === "test-enemy"));
  assert.ok(!events.some((event) => event.type === "coach-hit"));
  assert.equal(player.composure, 91);
  assert.deepEqual(coach, coachBefore);
});

test("Coach derivation retains authored checkpoint placement and remains non-blocking", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
  assert.equal(coachEntityFor(state).spaceId, "club-entrance");

  state.player.spaceId = "movement-hall";
  assert.equal(coachEntityFor(state).spaceId, "main-cardroom");

  state.progress.completedWings.push("a");
  assert.equal(coachEntityFor(state).spaceId, "wing-a-chalkboard");

  state.progress.slips = state.level.objectives.requiredSlipCount;
  assert.equal(coachEntityFor(state).spaceId, "traveler-vault");

  state.progress.bossDefeated = true;
  const victoryCoach = coachEntityFor(state);
  assert.equal(victoryCoach.spaceId, "results-posted");
  assert.equal(victoryCoach.sprite, "coach-victory");
  assert.equal(victoryCoach.height, 1.8);
  assert.equal(victoryCoach.blocking, false);
});
