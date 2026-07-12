// Deterministic fixed-step Bridge Simulator world state. Rendering, browser
// timing, input listeners, audio, and DOM overlays live outside this module.
import { createEnemyFromMarker, computeEnemyIntent, resetEnemy } from "./ai.js";
import {
  applyDamageToPlayer,
  collectPickup,
  createCombatState,
  createEnemyProjectile,
  tryThrowCard,
  updateCombatTimers,
  updateProjectiles,
} from "./combat.js";
import { distance, moveActor, positionOverlapsActors, spaceById } from "./collision.js";

const SIMULATION_SCHEMA_VERSION = 1;
const FIXED_HZ = 35;
const FIXED_DT = 1 / FIXED_HZ;
const PLAYER_SPEED = 4.8;
const INTERACT_RANGE = 1.35;

function markerById(level, id) {
  return level.markers.find((marker) => marker.id === id) || null;
}

function clonePosition(marker, fallback = { x: 4, y: 0, z: 35 }) {
  return marker && marker.position ? { ...marker.position } : { ...fallback };
}

function createPlayer(level) {
  const spawn = level.markers.find((marker) => marker.type === "playerSpawn");
  return {
    id: "player",
    kind: "player",
    position: clonePosition(spawn),
    spawnPosition: clonePosition(spawn),
    spaceId: spawn ? spawn.spaceId : level.spaces[0].id,
    spawnSpaceId: spawn ? spawn.spaceId : level.spaces[0].id,
    radius: level.rules.radius,
    height: level.rules.height,
    eyeHeight: level.rules.eyeHeight,
    maxStep: level.rules.maxStep,
    yaw: 0,
    maxComposure: 100,
    composure: 100,
    systemNotes: 0,
    honor: 0,
    alive: true,
    blocking: true,
  };
}

function createPickup(marker) {
  return {
    id: marker.id,
    kind: "pickup",
    type: "pickup",
    pickupKind: marker.pickupKind,
    amount: marker.amount,
    wingId: marker.wingId || "",
    position: { ...marker.position },
    spawnPosition: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius,
    height: 0.55,
    active: true,
    collected: false,
    blocking: false,
  };
}

function createReviewSlip(marker) {
  return {
    id: marker.id,
    kind: "review-slip",
    type: "reviewSlip",
    wingId: marker.wingId,
    label: marker.label,
    position: { ...marker.position },
    spawnPosition: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius,
    height: 0.7,
    active: true,
    collected: false,
    reopenable: true,
    blocking: false,
  };
}

function createSecret(marker) {
  return {
    id: marker.id,
    kind: "secret",
    type: marker.secretId === "biscuit-closet" ? "biscuit" : "review-slip",
    secretId: marker.secretId,
    label: marker.label,
    position: { ...marker.position },
    spawnPosition: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius,
    height: 0.6,
    active: true,
    collected: false,
    blocking: false,
  };
}

function initialPortalStates(level) {
  const states = {};
  level.portals.forEach((portal) => {
    states[portal.id] = { open: portal.initialOpen !== false, announced: false };
  });
  return states;
}

function initialLiftStates(level) {
  return Object.fromEntries(level.portals
    .filter((portal) => portal.kind === "lift")
    .map((portal) => [portal.id, { ready: false, moving: false, remaining: 0 }]));
}

function createLiftControl(marker) {
  return {
    id: marker.id,
    kind: "lift-control",
    type: "liftControl",
    label: marker.label || "Call lift",
    position: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius || 0.4,
    height: 0.8,
    active: true,
    alive: true,
    blocking: false,
  };
}

function createSimulation({ scenario, level, mode = "standard" } = {}) {
  if (!scenario || !level) throw new Error("Simulator scenario and level are required.");
  const player = createPlayer(level);
  const enemies = level.markers
    .filter((marker) => marker.type === "enemySpawn" || marker.type === "bossSpawn")
    .map((marker) => createEnemyFromMarker(marker, { maxStep: level.rules.maxStep }))
    .sort((a, b) => a.id.localeCompare(b.id));
  enemies.forEach((enemy) => {
    if (enemy.archetype === "bottom-board") {
      enemy.sprite = scenario.boss && scenario.boss.encounterSkin || "bottom-board";
      enemy.title = scenario.boss && scenario.boss.title || "The Bottom Board";
      enemy.tint = scenario.mode === "defend-crown" ? 0xffd66b : 0xffffff;
      return;
    }
    if (!enemy.wingId) return;
    const wingIndex = level.objectives.wingIds.indexOf(enemy.wingId);
    const wing = scenario.wings && scenario.wings[wingIndex];
    if (wing && wing.encounterSkin) enemy.sprite = wing.encounterSkin;
  });
  const pickups = level.markers.filter((marker) => marker.type === "pickup").map(createPickup);
  const reviewSlips = level.markers.filter((marker) => marker.type === "reviewSlip").map(createReviewSlip);
  const secrets = level.markers.filter((marker) => marker.type === "secret").map(createSecret);
  const covers = level.markers.filter((marker) => marker.type === "cover").map((marker) => ({
    id: marker.id,
    kind: "cover",
    position: { ...marker.position },
    spaceId: marker.spaceId,
    radius: marker.radius,
    height: 1.15,
    alive: true,
    blocking: true,
  }));
  const liftControls = level.markers.filter((marker) => marker.type === "liftControl").map(createLiftControl);
  const state = {
    schemaVersion: SIMULATION_SCHEMA_VERSION,
    scenarioSeed: scenario.seed,
    scenario,
    level,
    levelId: level.id,
    mode: mode === "practice" ? "practice" : "standard",
    tick: 0,
    elapsed: 0,
    status: "running",
    player,
    combat: createCombatState({
      cards: scenario.representativeHand && scenario.representativeHand.cards,
      source: scenario.representativeHand && scenario.representativeHand.source,
      seed: scenario.seed,
    }),
    enemies,
    pickups,
    reviewSlips,
    secrets,
    covers,
    liftControls,
    projectiles: [],
    portalStates: initialPortalStates(level),
    lifts: initialLiftStates(level),
    progress: {
      slips: 0,
      collectedSlipIds: [],
      completedWings: [],
      bossActive: false,
      bossDefeated: false,
      exited: false,
      secrets: [],
      rapidDealRemaining: 0,
    },
    stats: {
      enemiesDefeated: 0,
      biscuits: 0,
      pickups: 0,
      secrets: 0,
      honor: 0,
      shotsFired: 0,
      shotsHit: 0,
    },
    encounter: {
      kind: "tutorial",
      wingId: "",
      honorAtEntry: 0,
      enemiesDefeatedAtEntry: 0,
      pickupsAtEntry: 0,
      biscuitsAtEntry: 0,
      rapidDealAtEntry: 0,
      defeatedEnemyIdsAtEntry: [],
      collectedPickupIdsAtEntry: [],
      enemyStatesAtEntry: [],
      pickupStatesAtEntry: [],
      liftStatesAtEntry: {},
    },
    events: [],
  };
  state.encounter = encounterCheckpoint(state, { kind: "tutorial", wingId: "" });
  updatePortalRequirements(state, []);
  return state;
}

function dynamicsFor(state) {
  return { portals: state.portalStates, lifts: state.lifts };
}

function emit(events, type, detail = {}) {
  events.push({ type, ...detail });
}

function completedWingSet(state) {
  return new Set(state.progress.completedWings);
}

function encounterCheckpoint(state, { kind = state.encounter.kind, wingId = state.encounter.wingId } = {}) {
  return {
    kind,
    wingId,
    honorAtEntry: state.player.honor,
    enemiesDefeatedAtEntry: state.stats.enemiesDefeated,
    pickupsAtEntry: state.stats.pickups,
    biscuitsAtEntry: state.stats.biscuits,
    rapidDealAtEntry: state.progress.rapidDealRemaining,
    defeatedEnemyIdsAtEntry: state.enemies.filter((enemy) => !enemy.alive).map((enemy) => enemy.id),
    collectedPickupIdsAtEntry: state.pickups.filter((pickup) => pickup.collected).map((pickup) => pickup.id),
    enemyStatesAtEntry: state.enemies.map((enemy) => ({
      id: enemy.id,
      position: { ...enemy.position },
      spaceId: enemy.spaceId,
      health: enemy.health,
      cooldown: enemy.cooldown,
      state: enemy.state,
      alerted: enemy.alerted,
      active: enemy.active,
      alive: enemy.alive,
      phase: enemy.phase,
      lastSeenTick: enemy.lastSeenTick,
    })),
    pickupStatesAtEntry: state.pickups.map((pickup) => ({
      id: pickup.id,
      position: { ...pickup.position },
      collected: pickup.collected,
      active: pickup.active,
    })),
    liftStatesAtEntry: Object.fromEntries(Object.entries(state.lifts).map(([id, lift]) => [id, { ...lift }])),
  };
}

function updatePortalRequirements(state, events) {
  const completed = completedWingSet(state);
  state.level.portals.forEach((portal) => {
    let shouldOpen = portal.initialOpen !== false;
    const requirement = portal.requirement;
    if (requirement) {
      if (requirement.type === "wingComplete") shouldOpen = completed.has(requirement.wingId);
      else if (requirement.type === "slips") shouldOpen = state.progress.slips >= state.level.objectives.requiredSlipCount;
      else if (requirement.type === "bossDefeated") shouldOpen = state.progress.bossDefeated;
    }
    if (portal.kind === "lift" && shouldOpen) shouldOpen = Boolean(state.lifts[portal.id] && state.lifts[portal.id].ready);
    const runtime = state.portalStates[portal.id] || (state.portalStates[portal.id] = { open: false, announced: false });
    if (shouldOpen && !runtime.open) {
      runtime.open = true;
      if (!runtime.announced) emit(events, "portal-opened", { portalId: portal.id, kind: portal.kind });
      runtime.announced = true;
    } else if (!shouldOpen && requirement) {
      runtime.open = false;
    }
  });
}

function wingIdForSpace(level, spaceId) {
  const space = spaceById(level, spaceId);
  return space && space.wingId || "";
}

function beginEncounterForPosition(state, priorSpaceId) {
  const wingId = wingIdForSpace(state.level, state.player.spaceId);
  const priorWingId = wingIdForSpace(state.level, priorSpaceId);
  const enteringUnfinishedWing = wingId && wingId !== priorWingId && !state.progress.completedWings.includes(wingId);
  const sameEncounter = state.encounter.kind === "wing" && state.encounter.wingId === wingId;
  if (enteringUnfinishedWing && !sameEncounter) {
    state.encounter = encounterCheckpoint(state, { kind: "wing", wingId });
  }
  if (!wingId && priorWingId && state.progress.completedWings.includes(priorWingId) &&
    state.player.spaceId !== "traveler-vault" && state.player.spaceId !== "results-posted") {
    state.encounter = encounterCheckpoint(state, { kind: "hub", wingId: "" });
  }
  if (state.player.spaceId === "traveler-vault" && !state.progress.bossDefeated && state.encounter.kind !== "boss") {
    state.encounter = encounterCheckpoint(state, { kind: "boss", wingId: "" });
  }
}

function movePlayer(state, input, dt) {
  state.player.yaw = (state.player.yaw + (Number(input.turn) || 0)) % (Math.PI * 2);
  const forward = Math.max(-1, Math.min(1, Number(input.forward) || 0));
  const strafe = Math.max(-1, Math.min(1, Number(input.strafe) || 0));
  const magnitude = Math.hypot(forward, strafe) || 1;
  const forwardScale = forward / magnitude;
  const strafeScale = strafe / magnitude;
  const cos = Math.cos(state.player.yaw);
  const sin = Math.sin(state.player.yaw);
  const delta = {
    x: (cos * forwardScale - sin * strafeScale) * PLAYER_SPEED * dt,
    z: (sin * forwardScale + cos * strafeScale) * PLAYER_SPEED * dt,
  };
  if (Math.abs(delta.x) + Math.abs(delta.z) < 1e-8) return;
  const priorSpaceId = state.player.spaceId;
  const moved = moveActor(state.level, state.player, delta, dynamicsFor(state));
  const blockers = [...state.enemies.filter((enemy) => enemy.alive && enemy.active !== false), ...state.covers];
  if (!positionOverlapsActors(moved.position, state.player.radius, blockers)) {
    state.player.position = moved.position;
    state.player.spaceId = moved.spaceId;
  }
  beginEncounterForPosition(state, priorSpaceId);
}

function activeWingEnemies(state, wingId) {
  return state.enemies.filter((enemy) => enemy.wingId === wingId && enemy.alive);
}

function nearestActive(items, player, range = INTERACT_RANGE, { includeCollected = false } = {}) {
  return (items || [])
    .filter((item) => item.active !== false && (includeCollected || !item.collected) && item.spaceId === player.spaceId)
    .map((item) => ({ item, distance: distance(item.position, player.position) }))
    .filter((entry) => entry.distance <= range)
    .sort((a, b) => a.distance - b.distance || a.item.id.localeCompare(b.item.id))[0]?.item || null;
}

function collectNearbyPickups(state, events) {
  state.pickups.forEach((pickup) => {
    if (!pickup.active || pickup.spaceId !== state.player.spaceId || distance(pickup.position, state.player.position) > 0.8) return;
    const result = collectPickup(state.player, pickup);
    if (!result.collected) return;
    state.stats.pickups += 1;
    if (result.kind === "biscuit") state.stats.biscuits += 1;
    emit(events, "pickup-collected", { pickupId: pickup.id, kind: result.kind, amount: result.amount });
  });
}

function collectReviewSlip(state, slip, events) {
  if (!slip || slip.collected) return false;
  if (activeWingEnemies(state, slip.wingId).length) {
    emit(events, "interaction-blocked", { reason: "wing-enemies", wingId: slip.wingId });
    return false;
  }
  slip.collected = true;
  slip.active = true;
  state.progress.collectedSlipIds.push(slip.id);
  state.progress.slips = state.progress.collectedSlipIds.length;
  if (!state.progress.completedWings.includes(slip.wingId)) state.progress.completedWings.push(slip.wingId);
  state.player.honor += 500;
  state.stats.honor = state.player.honor;
  state.encounter = encounterCheckpoint(state);
  emit(events, "review-slip", { slipId: slip.id, wingId: slip.wingId, slips: state.progress.slips, honor: 500 });
  updatePortalRequirements(state, events);
  return true;
}

function collectSecret(state, secret, events) {
  secret.collected = true;
  secret.active = false;
  state.progress.secrets.push(secret.secretId);
  state.stats.secrets = state.progress.secrets.length;
  state.player.honor += 250;
  state.stats.honor = state.player.honor;
  state.encounter.honorAtEntry = state.player.honor;
  if (secret.secretId === "biscuit-closet") {
    state.player.composure = Math.min(100, state.player.composure + 35);
    state.stats.biscuits += 1;
  }
  if (secret.secretId === "seven-nt-room") state.progress.rapidDealRemaining = 20;
  // Secrets persist through an encounter reset. Capture the rest of the
  // encounter at the same instant so previously defeated actors and consumed
  // pickups cannot respawn while their Honor/stat awards remain banked.
  state.encounter = encounterCheckpoint(state);
  emit(events, "secret-found", { secretId: secret.secretId, label: secret.label, honor: 250 });
}

function callLift(state, control, events) {
  const portal = state.level.portals.find((entry) => entry.kind === "lift" &&
    (entry.from === control.spaceId || entry.to === control.spaceId));
  if (!portal) return false;
  const requirement = portal.requirement;
  if (requirement && requirement.type === "wingComplete" && !state.progress.completedWings.includes(requirement.wingId)) {
    emit(events, "interaction-blocked", { reason: "lift-locked", portalId: portal.id });
    return true;
  }
  const runtime = state.lifts[portal.id] || (state.lifts[portal.id] = { ready: false, moving: false, remaining: 0 });
  if (runtime.ready) {
    emit(events, "lift-ready", { portalId: portal.id, alreadyReady: true });
    return true;
  }
  if (!runtime.moving) {
    const from = spaceById(state.level, portal.from);
    const to = spaceById(state.level, portal.to);
    const distance = Math.abs((from && from.floor || 0) - (to && to.floor || 0));
    runtime.moving = true;
    runtime.remaining = Math.max(0.35, distance / Math.max(0.1, portal.liftSpeed || 1));
    emit(events, "lift-called", { portalId: portal.id, duration: runtime.remaining });
  }
  return true;
}

function updateLifts(state, dt, events) {
  Object.entries(state.lifts).forEach(([portalId, lift]) => {
    if (!lift.moving || lift.ready) return;
    lift.remaining = Math.max(0, lift.remaining - dt);
    if (lift.remaining > 0) return;
    lift.moving = false;
    lift.ready = true;
    emit(events, "lift-ready", { portalId, alreadyReady: false });
    updatePortalRequirements(state, events);
  });
}

function handleInteraction(state, events) {
  const slip = nearestActive(state.reviewSlips, state.player, INTERACT_RANGE, { includeCollected: true });
  if (slip) {
    if (slip.collected) {
      emit(events, "review-slip-reopened", { slipId: slip.id, wingId: slip.wingId });
      return;
    }
    collectReviewSlip(state, slip, events);
    return;
  }
  const secret = nearestActive(state.secrets, state.player);
  if (secret) {
    collectSecret(state, secret, events);
    return;
  }
  const liftControl = nearestActive(state.liftControls, state.player);
  if (liftControl && callLift(state, liftControl, events)) return;
  const exit = markerById(state.level, state.level.objectives.exitMarkerId);
  if (exit && state.progress.bossDefeated && exit.spaceId === state.player.spaceId && distance(exit.position, state.player.position) <= 1.5) {
    state.progress.exited = true;
    state.status = "complete";
    emit(events, "run-complete", { honor: state.player.honor });
    return;
  }
  emit(events, "interaction-empty", {});
}

function activateBossIfNeeded(state, events) {
  if (state.progress.bossActive || state.progress.bossDefeated) return;
  if (state.progress.slips < state.level.objectives.requiredSlipCount || state.player.spaceId !== "traveler-vault") return;
  const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
  if (!boss) return;
  boss.active = true;
  boss.alerted = true;
  state.progress.bossActive = true;
  emit(events, "boss-activated", { entityId: boss.id });
}

function throwIfRequested(state, input, events) {
  if (!input.fire) return;
  const result = tryThrowCard(state.combat, {
    angle: state.player.yaw,
    origin: {
      x: state.player.position.x + Math.cos(state.player.yaw) * 0.45,
      y: state.player.position.y + 1.05,
      z: state.player.position.z + Math.sin(state.player.yaw) * 0.45,
    },
    spaceId: state.player.spaceId,
    tick: state.tick,
  });
  if (!result.fired) return;
  if (state.progress.rapidDealRemaining > 0) state.combat.cooldown = Math.min(state.combat.cooldown, 0.1);
  state.projectiles.push(result.projectile);
  state.stats.shotsFired = state.combat.shotsFired;
  emit(events, "card-thrown", { card: result.projectile.card, projectileId: result.projectile.id });
  if (state.combat.shuffleRemaining > 0) emit(events, "shuffle-started", { duration: state.combat.shuffleDuration });
}

function updateEnemies(state, dt, events) {
  const dynamics = dynamicsFor(state);
  const living = state.enemies.filter((enemy) => enemy.alive).sort((a, b) => a.id.localeCompare(b.id));
  for (const enemy of living) {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    const intent = computeEnemyIntent(enemy, state.player, state.level, dynamics, dt, state.tick);
    enemy.state = intent.kind;
    if (intent.kind === "move") {
      const moved = moveActor(state.level, enemy, intent.move, dynamics);
      const blockers = [state.player, ...living, ...state.covers];
      const destinationWing = wingIdForSpace(state.level, moved.spaceId);
      const staysInEncounter = enemy.archetype === "bottom-board"
        ? moved.spaceId === enemy.spawnSpaceId
        : !enemy.wingId || destinationWing === enemy.wingId;
      if (staysInEncounter && !positionOverlapsActors(moved.position, enemy.radius, blockers, enemy.id)) {
        enemy.position = moved.position;
        enemy.spaceId = moved.spaceId;
      }
    }
    if (!intent.attack) continue;
    enemy.cooldown = enemy.attackCooldown / (enemy.archetype === "bottom-board" ? 1 + (enemy.phase - 1) * 0.12 : 1);
    if (intent.melee) {
      const result = applyDamageToPlayer(state.player, enemy.damage, state.mode);
      emit(events, "player-hit", { sourceId: enemy.id, ...result });
    } else {
      const projectile = createEnemyProjectile(enemy, state.player, `enemy-card-${state.tick}-${enemy.id}`);
      state.projectiles.push(projectile);
      emit(events, "enemy-fired", { entityId: enemy.id, projectileId: projectile.id });
    }
  }
}

function applyCombatEvents(state, projectileEvents, events) {
  projectileEvents.forEach((event) => {
    events.push(event);
    if (event.type === "enemy-defeated" || event.type === "boss-defeated") {
      state.player.honor += event.honor || 0;
      state.stats.honor = state.player.honor;
      state.stats.enemiesDefeated += 1;
      if (event.type === "boss-defeated") {
        state.progress.bossActive = false;
        state.progress.bossDefeated = true;
        updatePortalRequirements(state, events);
        state.encounter = encounterCheckpoint(state);
      }
    }
    if (event.type === "enemy-hit") state.stats.shotsHit = state.combat.shotsHit;
  });
}

function restoreEncounterEntities(state) {
  const enemyStates = new Map((state.encounter.enemyStatesAtEntry || []).map((entry) => [entry.id, entry]));
  const pickupStates = new Map((state.encounter.pickupStatesAtEntry || []).map((entry) => [entry.id, entry]));
  const defeatedAtEntry = new Set(state.encounter.defeatedEnemyIdsAtEntry || []);
  const collectedAtEntry = new Set(state.encounter.collectedPickupIdsAtEntry || []);
  state.enemies.forEach((enemy) => {
    const saved = enemyStates.get(enemy.id);
    if (saved) {
      Object.assign(enemy, saved, { position: { ...saved.position } });
      return;
    }
    resetEnemy(enemy);
    if (defeatedAtEntry.has(enemy.id)) {
      enemy.health = 0;
      enemy.alive = false;
    }
  });
  state.pickups.forEach((pickup) => {
    const saved = pickupStates.get(pickup.id);
    if (saved) {
      Object.assign(pickup, saved, { position: { ...saved.position } });
      return;
    }
    pickup.position = { ...pickup.spawnPosition };
    pickup.collected = collectedAtEntry.has(pickup.id);
    pickup.active = !pickup.collected;
  });
}

function positionPlayerAtHub(state, boss = false) {
  const position = boss ? { x: 52, y: 0, z: 28 } : { x: 35, y: 0, z: 35 };
  state.player.position = position;
  state.player.spaceId = "main-cardroom";
  state.player.yaw = boss ? 0 : Math.PI;
  state.player.composure = 100;
  state.player.systemNotes = 0;
  state.player.alive = true;
  state.combat.nextCardIndex = 0;
  state.combat.cooldown = 0;
  state.combat.shuffleRemaining = 0;
  state.projectiles.length = 0;
}

function resetEncounter(state, reason = "manual", { queue = true } = {}) {
  const events = [];
  const encounter = state.encounter;
  state.player.honor = encounter.honorAtEntry;
  state.stats.honor = state.player.honor;
  state.stats.enemiesDefeated = encounter.enemiesDefeatedAtEntry;
  state.stats.pickups = encounter.pickupsAtEntry || 0;
  state.stats.biscuits = encounter.biscuitsAtEntry || 0;
  state.progress.rapidDealRemaining = encounter.rapidDealAtEntry || 0;
  state.lifts = {
    ...initialLiftStates(state.level),
    ...Object.fromEntries(Object.entries(encounter.liftStatesAtEntry || {}).map(([id, lift]) => [id, { ...lift }])),
  };
  restoreEncounterEntities(state);
  if (encounter.kind === "boss") {
    const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
    if (boss) boss.active = false;
    state.progress.bossActive = false;
    positionPlayerAtHub(state, true);
  } else if (encounter.kind === "wing" && encounter.wingId) {
    positionPlayerAtHub(state, false);
  } else {
    positionPlayerAtHub(state, false);
  }
  state.encounter = encounterCheckpoint(state, {
    kind: encounter.kind === "boss" ? "boss" : "hub",
    wingId: encounter.wingId || "",
  });
  emit(events, "encounter-reset", { reason, kind: encounter.kind, wingId: encounter.wingId || "" });
  if (queue) state.events.push(...events);
  return events;
}

function restartRun(state) {
  const fresh = createSimulation({ scenario: state.scenario, level: state.level, mode: state.mode });
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  const event = { type: "run-restarted" };
  state.events.push(event);
  return [event];
}

function objectiveText(state) {
  if (state.status === "complete") return "Move for the next round complete.";
  if (state.progress.bossDefeated) return "Exit through Move for the Next Round.";
  if (state.progress.bossActive) return `Reseat ${state.scenario.boss && state.scenario.boss.title || "The Bottom Board"}.`;
  const required = state.level.objectives.requiredSlipCount;
  if (state.progress.slips < required) return `Recover Review Slips (${state.progress.slips}/${required}).`;
  return "Enter the Traveler Vault.";
}

function stepSimulation(state, input = {}, dt = FIXED_DT) {
  if (!state || state.status !== "running") return [];
  if (input.restart) return resetEncounter(state, "manual");
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  if (!step) return [];
  const events = [];
  state.tick += 1;
  state.elapsed += step;
  if (state.progress.rapidDealRemaining > 0) state.progress.rapidDealRemaining = Math.max(0, state.progress.rapidDealRemaining - step);
  updateCombatTimers(state.combat, step);
  updateLifts(state, step, events);
  movePlayer(state, input, step);
  collectNearbyPickups(state, events);
  if (input.interact) handleInteraction(state, events);
  activateBossIfNeeded(state, events);
  throwIfRequested(state, input, events);
  updateEnemies(state, step, events);
  const projectileEvents = updateProjectiles({
    level: state.level,
    dynamics: dynamicsFor(state),
    projectiles: state.projectiles,
    entities: state.enemies,
    player: state.player,
    obstacles: state.covers,
    dt: step,
    mode: state.mode,
    combat: state.combat,
  });
  applyCombatEvents(state, projectileEvents, events);
  state.stats.shotsFired = state.combat.shotsFired;
  state.stats.shotsHit = state.combat.shotsHit;
  state.stats.honor = state.player.honor;
  if (state.player.composure <= 0) {
    emit(events, "player-defeated", { encounter: state.encounter.kind, wingId: state.encounter.wingId || "" });
    events.push(...resetEncounter(state, "defeat", { queue: false }));
  }
  updatePortalRequirements(state, events);
  state.events.push(...events);
  return events;
}

function renderEntities(state) {
  return [
    ...state.enemies,
    ...state.pickups,
    ...state.reviewSlips,
    ...state.secrets,
    ...state.liftControls,
    ...state.projectiles.map((projectile) => ({ ...projectile, kind: projectile.type })),
  ].map((entity) => ({
    ...entity,
    position: entity.position ? { ...entity.position } : undefined,
    velocity: entity.velocity ? { ...entity.velocity } : undefined,
    card: entity.card ? { ...entity.card } : undefined,
  }));
}

function getSimulationSnapshot(state) {
  return {
    tick: state.tick,
    elapsed: state.elapsed,
    status: state.status,
    player: { ...state.player, position: { ...state.player.position }, spawnPosition: { ...state.player.spawnPosition } },
    weapon: {
      cardIndex: state.combat.nextCardIndex,
      shuffling: state.combat.shuffleRemaining > 0,
      shuffleRemaining: state.combat.shuffleRemaining,
    },
    entities: renderEntities(state),
    portalStates: Object.fromEntries(Object.entries(state.portalStates).map(([id, portal]) => [id, { ...portal }])),
    progress: {
      ...state.progress,
      collectedSlipIds: [...state.progress.collectedSlipIds],
      completedWings: [...state.progress.completedWings],
      secrets: [...state.progress.secrets],
    },
    objectives: { slips: state.progress.slips },
    stats: { ...state.stats },
    objectiveText: objectiveText(state),
  };
}

function drainSimulationEvents(state) {
  const events = state.events.splice(0, state.events.length);
  return events;
}

function simulationStats(state) {
  const elapsed = Math.max(0, state.elapsed);
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  const accuracy = state.combat.shotsFired ? state.combat.shotsHit / state.combat.shotsFired * 100 : 0;
  return {
    timeSeconds: elapsed,
    timeLabel: `${minutes}:${String(seconds).padStart(2, "0")}`,
    accuracy,
    accuracyLabel: `${accuracy.toFixed(0)}%`,
    enemiesDefeated: state.stats.enemiesDefeated,
    biscuits: state.stats.biscuits,
    secrets: state.stats.secrets,
    honor: state.player.honor,
    shotsFired: state.combat.shotsFired,
    shotsHit: state.combat.shotsHit,
  };
}

export {
  SIMULATION_SCHEMA_VERSION,
  FIXED_HZ,
  FIXED_DT,
  PLAYER_SPEED,
  INTERACT_RANGE,
  createSimulation,
  stepSimulation,
  resetEncounter,
  restartRun,
  getSimulationSnapshot,
  drainSimulationEvents,
  simulationStats,
  objectiveText,
};
