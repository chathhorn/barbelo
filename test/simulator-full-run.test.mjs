import test from "node:test";
import assert from "node:assert/strict";

import { findSpacePath } from "../src/core/simulator/ai.js";
import {
  distance,
  hasLineOfSight,
  otherPortalSpace,
  pointInPolygon,
} from "../src/core/simulator/collision.js";
import { FULL_LEVEL } from "../src/core/simulator/level.js";
import {
  FIXED_DT,
  createSimulation,
  drainSimulationEvents,
  simulationStats,
  stepSimulation,
} from "../src/core/simulator/simulation.js";

const CARDS = ["SA", "SK", "SQ", "SJ", "ST", "S9", "H8", "H7", "D6", "D5", "C4", "C3", "C2"]
  .map((value) => ({ suit: value[0], rank: value[1] }));

const SCENARIO = Object.freeze({
  seed: "deterministic-full-run",
  mode: "restore-honor",
  representativeHand: { source: "pbn", cards: CARDS },
  wings: [
    { slot: "A", encounterSkin: "auction-gremlin" },
    { slot: "B", encounterSkin: "overtrick-imp" },
    { slot: "C", encounterSkin: "lead-goblin" },
  ],
  boss: { title: "The Bottom Board", encounterSkin: "bottom-board" },
});

function normalizeAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function inputToward(state, target, options = {}) {
  const dx = target.x - state.player.position.x;
  const dz = target.z - state.player.position.z;
  const yaw = Math.atan2(dz, dx);
  return {
    turn: normalizeAngle(yaw - state.player.yaw),
    forward: options.forward == null ? 1 : options.forward,
    strafe: options.strafe || 0,
    fire: !!options.fire,
  };
}

function createTrace(state) {
  return {
    ticks: 0,
    events: [],
    visitedSpaces: new Set([state.player.spaceId]),
    transitions: [],
  };
}

function advance(state, input, trace) {
  const priorSpaceId = state.player.spaceId;
  const events = stepSimulation(state, input, FIXED_DT);
  const queued = drainSimulationEvents(state);
  assert.deepEqual(queued, events, "returned and queued simulation events should stay in lockstep");
  trace.ticks += 1;
  trace.events.push(...events);
  trace.visitedSpaces.add(state.player.spaceId);
  if (state.player.spaceId !== priorSpaceId) {
    trace.transitions.push(`${priorSpaceId}->${state.player.spaceId}`);
  }
  return events;
}

function moveTo(state, target, expectedSpaceId, trace, options = {}) {
  const tolerance = options.tolerance == null ? 0.45 : options.tolerance;
  const maxTicks = options.maxTicks || 2400;
  let bestDistance = Infinity;
  let stagnantTicks = 0;

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const remaining = distance(state.player.position, target);
    if (remaining <= tolerance && (!expectedSpaceId || state.player.spaceId === expectedSpaceId)) return;

    if (remaining < bestDistance - 0.015) {
      bestDistance = remaining;
      stagnantTicks = 0;
    } else {
      stagnantTicks += 1;
    }

    const detouring = stagnantTicks > 55;
    const detourPhase = Math.floor(stagnantTicks / 45) % 2 ? 1 : -1;
    advance(state, inputToward(state, target, {
      forward: detouring ? 0.45 : 1,
      strafe: detouring ? detourPhase : 0,
    }), trace);
  }

  assert.fail(
    `bot could not reach ${expectedSpaceId || "target"} at ${target.x},${target.z}; ` +
    `stopped in ${state.player.spaceId} at ${state.player.position.x.toFixed(2)},${state.player.position.z.toFixed(2)}`
  );
}

function portalInteriorPoint(level, portal, nextSpaceId, depth = 1.1) {
  const midpoint = {
    x: (portal.segment.a.x + portal.segment.b.x) / 2,
    z: (portal.segment.a.z + portal.segment.b.z) / 2,
  };
  const dx = portal.segment.b.x - portal.segment.a.x;
  const dz = portal.segment.b.z - portal.segment.a.z;
  const length = Math.hypot(dx, dz) || 1;
  const candidates = [
    { x: midpoint.x - dz / length * depth, z: midpoint.z + dx / length * depth },
    { x: midpoint.x + dz / length * depth, z: midpoint.z - dx / length * depth },
  ];
  const nextSpace = level.spaces.find((space) => space.id === nextSpaceId);
  const target = candidates.find((candidate) => pointInPolygon(candidate, nextSpace.polygon));
  assert.ok(target, `portal ${portal.id} should have an interior point in ${nextSpaceId}`);
  return target;
}

function nextPortalTarget(state, goalSpaceId) {
  const dynamics = { portals: state.portalStates, lifts: state.lifts };
  const path = findSpacePath(
    state.level,
    state.player.spaceId,
    goalSpaceId,
    dynamics,
    state.player
  );
  assert.ok(path.length >= 2, `no open route from ${state.player.spaceId} to ${goalSpaceId}`);
  const nextSpaceId = path[1];
  const portal = state.level.portals.find((entry) =>
    (entry.from === state.player.spaceId || entry.to === state.player.spaceId) &&
    otherPortalSpace(entry, state.player.spaceId) === nextSpaceId);
  assert.ok(portal, `missing portal from ${state.player.spaceId} to ${nextSpaceId}`);
  return portalInteriorPoint(state.level, portal, nextSpaceId);
}

function huntEnemies(state, predicate, trace, label, maxTicks = 30000) {
  let bestRemaining = Infinity;
  let stagnantTicks = 0;

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const remaining = state.enemies.filter((enemy) => enemy.alive && predicate(enemy));
    if (!remaining.length) return;

    if (remaining.length < bestRemaining) {
      bestRemaining = remaining.length;
      stagnantTicks = 0;
    } else {
      stagnantTicks += 1;
    }

    const sameSpace = remaining
      .filter((enemy) => enemy.spaceId === state.player.spaceId)
      .sort((a, b) => distance(a.position, state.player.position) - distance(b.position, state.player.position));
    let target = sameSpace[0] || null;
    if (!target) {
      target = remaining
        .map((enemy) => ({
          enemy,
          path: findSpacePath(
            state.level,
            state.player.spaceId,
            enemy.spaceId,
            { portals: state.portalStates, lifts: state.lifts },
            state.player
          ),
        }))
        .filter((entry) => entry.path.length)
        .sort((a, b) => a.path.length - b.path.length || a.enemy.id.localeCompare(b.enemy.id))[0]?.enemy || null;
    }
    assert.ok(target, `no reachable target remained while clearing ${label}`);

    if (target.spaceId !== state.player.spaceId) {
      advance(state, inputToward(state, nextPortalTarget(state, target.spaceId)), trace);
      continue;
    }

    const targetDistance = distance(target.position, state.player.position);
    const visible = hasLineOfSight(
      state.level,
      state.player,
      target,
      { portals: state.portalStates, lifts: state.lifts },
      { y: state.player.position.y + 0.8 }
    );
    const detouring = stagnantTicks > 280;
    advance(state, inputToward(state, target.position, {
      forward: targetDistance > 2.25 ? (detouring ? 0.45 : 1) : 0,
      strafe: detouring ? (Math.floor(stagnantTicks / 70) % 2 ? 1 : -1) : 0,
      fire: visible,
    }), trace);
  }

  const survivors = state.enemies.filter((enemy) => enemy.alive && predicate(enemy)).map((enemy) => enemy.id);
  assert.fail(`bot could not clear ${label}; survivors: ${survivors.join(", ")}`);
}

function interactWithMarker(state, markerId, eventType, trace) {
  const marker = state.level.markers.find((entry) => entry.id === markerId);
  assert.ok(marker, `missing authored marker ${markerId}`);
  moveTo(state, marker.position, marker.spaceId, trace, { tolerance: 0.65 });
  const events = advance(state, { interact: true }, trace);
  assert.ok(events.some((event) => event.type === eventType), `${markerId} should emit ${eventType}`);
}

function waitForEvent(state, eventType, trace, maxTicks = 200) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    const events = advance(state, {}, trace);
    if (events.some((event) => event.type === eventType)) return;
  }
  assert.fail(`simulation did not emit ${eventType} within ${maxTicks} ticks`);
}

test("deterministic bot completes the authored full level through real movement and combat", () => {
  const state = createSimulation({ scenario: SCENARIO, level: FULL_LEVEL, mode: "practice" });
  const trace = createTrace(state);
  assert.equal(state.portalStates["wing-a-lift-shortcut"].open, false);
  assert.equal(state.portalStates["hub-to-vault"].open, false);
  assert.equal(state.portalStates["vault-to-results"].open, false);

  // Club entrance and tutorial hall.
  moveTo(state, { x: 12.6, z: 35 }, "club-entrance", trace);
  moveTo(state, { x: 16.2, z: 35 }, "movement-hall", trace);
  huntEnemies(state, (enemy) => enemy.id.startsWith("tutorial-"), trace, "tutorial hall");
  interactWithMarker(state, "secret-biscuit", "secret-found", trace);
  moveTo(state, { x: 31, z: 35 }, "main-cardroom", trace);

  // Wing A, including the post-slip lift shortcut back to the hub.
  moveTo(state, { x: 35, z: 50.2 }, "wing-a-entry", trace);
  huntEnemies(state, (enemy) => enemy.wingId === "a", trace, "wing A");
  interactWithMarker(state, "review-slip-a", "review-slip", trace);
  interactWithMarker(state, "secret-dummy", "secret-found", trace);
  assert.equal(state.portalStates["wing-a-lift-shortcut"].open, false, "the lift must be called after wing completion");
  interactWithMarker(state, "lift-control-wing-a", "lift-called", trace);
  waitForEvent(state, "lift-ready", trace);
  assert.equal(state.portalStates["wing-a-lift-shortcut"].open, true);
  const beforeLift = trace.transitions.length;
  moveTo(state, { x: 50, z: 49.1 }, "wing-a-chalkboard", trace);
  moveTo(state, { x: 50, z: 46.3 }, "main-cardroom", trace);
  assert.ok(
    trace.transitions.slice(beforeLift).includes("wing-a-chalkboard->main-cardroom"),
    "the run should traverse the authored wing A lift"
  );

  // Wing B, then return through its ordinary doors.
  moveTo(state, { x: 58, z: 41 }, "wing-b-entry", trace);
  huntEnemies(state, (enemy) => enemy.wingId === "b", trace, "wing B");
  interactWithMarker(state, "review-slip-b", "review-slip", trace);
  moveTo(state, { x: 68.5, z: 41 }, "wing-b-entry", trace);
  moveTo(state, { x: 54, z: 41 }, "main-cardroom", trace);

  // Wing C and its shortcut into the vulnerability passage.
  moveTo(state, { x: 35, z: 20 }, "wing-c-entry", trace);
  huntEnemies(state, (enemy) => enemy.wingId === "c", trace, "wing C");
  interactWithMarker(state, "review-slip-c", "review-slip", trace);
  moveTo(state, { x: 54.4, z: 16 }, "wing-c-chalkboard", trace);
  moveTo(state, { x: 58, z: 16 }, "vulnerability-passage", trace);

  // Clear both arms of the concave passage without shortcutting through its wall.
  huntEnemies(
    state,
    (enemy) => ["passage-enemy-1", "passage-enemy-2"].includes(enemy.id),
    trace,
    "lower vulnerability passage"
  );
  moveTo(state, { x: 86, z: 18 }, "vulnerability-passage", trace);
  moveTo(state, { x: 86, z: 28 }, "vulnerability-passage", trace);
  huntEnemies(state, (enemy) => enemy.id === "passage-enemy-3", trace, "upper vulnerability passage");
  moveTo(state, { x: 86, z: 18 }, "vulnerability-passage", trace);
  interactWithMarker(state, "secret-seven-nt", "secret-found", trace);

  // Leave through wing B's opened shortcut and return to the hub.
  moveTo(state, { x: 86, z: 41 }, "vulnerability-passage", trace);
  moveTo(state, { x: 82, z: 41 }, "wing-b-chalkboard", trace);
  moveTo(state, { x: 68.5, z: 41 }, "wing-b-entry", trace);
  moveTo(state, { x: 54, z: 41 }, "main-cardroom", trace);

  assert.equal(state.progress.slips, 3);
  assert.equal(state.progress.secrets.length, 3);
  assert.equal(state.portalStates["hub-to-vault"].open, true);
  assert.ok(state.enemies.filter((enemy) => enemy.archetype !== "bottom-board").every((enemy) => !enemy.alive));
  assert.equal(state.stats.enemiesDefeated, 20);

  // The three slips open the vault gate. Defeat the live boss with card throws.
  const beforeVault = trace.transitions.length;
  moveTo(state, { x: 54, z: 28 }, "main-cardroom", trace);
  moveTo(state, { x: 59, z: 28 }, "traveler-vault", trace);
  assert.ok(
    trace.transitions.slice(beforeVault).includes("main-cardroom->traveler-vault"),
    "the run should cross the three-slip vault gate"
  );
  assert.equal(state.progress.bossActive, true);
  assert.equal(state.portalStates["vault-to-results"].open, false);
  const bossFightStartedAt = state.elapsed;
  huntEnemies(state, (enemy) => enemy.archetype === "bottom-board", trace, "Traveler Vault boss", 45000);
  const bossFightSeconds = state.elapsed - bossFightStartedAt;
  assert.equal(state.progress.bossDefeated, true);
  assert.equal(state.portalStates["vault-to-results"].open, true);
  assert.ok(
    bossFightSeconds <= 75,
    `secret-assisted perfect-bot boss fight exceeded 75 seconds; observed ${bossFightSeconds.toFixed(1)} seconds`
  );

  // Cross the victory gate and interact with the authored exit marker.
  moveTo(state, { x: 70.5, z: 28 }, "traveler-vault", trace);
  moveTo(state, { x: 74, z: 28 }, "results-posted", trace);
  interactWithMarker(state, "next-round-exit", "run-complete", trace);

  assert.equal(state.status, "complete");
  assert.equal(state.progress.exited, true);
  assert.equal(state.stats.enemiesDefeated, 21);
  assert.equal(simulationStats(state).honor, 5250);
  assert.equal(
    trace.events.filter((event) => event.type === "enemy-defeated" || event.type === "boss-defeated").length,
    21,
    "every enemy should be defeated by combat events rather than test-state mutation"
  );
  assert.deepEqual(
    [...trace.visitedSpaces].sort(),
    state.level.spaces.map((space) => space.id).sort(),
    "the deterministic run should visit every authored full-level space"
  );
  assert.ok(trace.events.some((event) => event.type === "boss-defeated"));
  assert.ok(trace.events.some((event) => event.type === "run-complete"));
});
