// Small deterministic enemy behavior layer. It emits intents; simulation.js
// applies movement, attacks, and state changes in stable entity-id order.

import {
  canTraversePortal,
  distance,
  hasLineOfSight,
  otherPortalSpace,
  portalsForSpace,
} from "./collision.js";

const ARCHETYPE_STATS = Object.freeze({
  kibitzer: Object.freeze({
    maxHealth: 68,
    speed: 2.25,
    damage: 9,
    attackRange: 9,
    preferredRange: 5.5,
    attackCooldown: 1.15,
    wakeRange: 14,
    melee: false,
    radius: 0.34
  }),
  "overtrick-imp": Object.freeze({
    maxHealth: 60,
    speed: 3.35,
    damage: 11,
    attackRange: 1.05,
    preferredRange: 0.7,
    attackCooldown: 0.8,
    wakeRange: 13,
    melee: true,
    radius: 0.3
  }),
  "red-x-sentinel": Object.freeze({
    maxHealth: 112,
    speed: 1.65,
    damage: 15,
    attackRange: 10,
    preferredRange: 6.5,
    attackCooldown: 1.5,
    wakeRange: 15,
    melee: false,
    radius: 0.38
  }),
  "bottom-board": Object.freeze({
    maxHealth: 6500,
    speed: 1.5,
    damage: 18,
    attackRange: 14,
    preferredRange: 7,
    attackCooldown: 0.72,
    wakeRange: 30,
    melee: false,
    radius: 1
  })
});

function enemyStatsFor(archetype) {
  return ARCHETYPE_STATS[archetype] || ARCHETYPE_STATS.kibitzer;
}

function createEnemyFromMarker(marker, options = {}) {
  const stats = enemyStatsFor(marker.archetype);
  const isBoss = marker.type === "bossSpawn" || marker.archetype === "bottom-board";
  return {
    id: marker.id,
    kind: "enemy",
    archetype: marker.archetype || "kibitzer",
    wingId: marker.wingId || "",
    position: { ...marker.position },
    spawnPosition: { ...marker.position },
    spaceId: marker.spaceId,
    spawnSpaceId: marker.spaceId,
    radius: marker.radius || stats.radius,
    height: isBoss ? 2.4 : 1.35,
    maxStep: options.maxStep == null ? 0.5 : options.maxStep,
    maxHealth: stats.maxHealth,
    health: stats.maxHealth,
    speed: stats.speed,
    damage: stats.damage,
    attackRange: stats.attackRange,
    preferredRange: stats.preferredRange,
    attackCooldown: stats.attackCooldown,
    cooldown: 0,
    wakeRange: stats.wakeRange,
    melee: stats.melee,
    state: "idle",
    alerted: false,
    active: !isBoss,
    alive: true,
    blocking: true,
    phase: 1,
    lastSeenTick: -1
  };
}

function portalMidpoint(portal) {
  return {
    x: (portal.segment.a.x + portal.segment.b.x) / 2,
    z: (portal.segment.a.z + portal.segment.b.z) / 2
  };
}

function findSpacePath(level, startId, goalId, dynamics, actor) {
  if (!startId || !goalId) return [];
  if (startId === goalId) return [startId];
  const previous = new Map([[startId, ""]]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    for (const portal of portalsForSpace(level, current)) {
      if (!canTraversePortal(level, portal, actor, dynamics, current)) continue;
      const next = otherPortalSpace(portal, current);
      if (!next || previous.has(next)) continue;
      previous.set(next, current);
      if (next === goalId) {
        const path = [goalId];
        let cursor = current;
        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}

function nextPathWaypoint(enemy, player, level, dynamics) {
  const path = findSpacePath(level, enemy.spaceId, player.spaceId, dynamics, enemy);
  if (path.length < 2) return null;
  const nextSpace = path[1];
  const portal = portalsForSpace(level, enemy.spaceId).find((entry) =>
    otherPortalSpace(entry, enemy.spaceId) === nextSpace &&
    canTraversePortal(level, entry, enemy, dynamics, enemy.spaceId));
  return portal ? portalMidpoint(portal) : null;
}

function normalizedDirection(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function bossPhase(enemy) {
  if (enemy.archetype !== "bottom-board") return 1;
  const ratio = enemy.maxHealth ? enemy.health / enemy.maxHealth : 0;
  return ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
}

function computeEnemyIntent(enemy, player, level, dynamics, dt, tick) {
  if (!enemy || !enemy.alive || enemy.active === false) return { kind: "idle", move: { x: 0, z: 0 }, attack: false };
  enemy.phase = bossPhase(enemy);
  const playerDistance = distance(enemy.position, player.position);
  const seesPlayer = hasLineOfSight(level, enemy, player, dynamics, {
    y: Math.max(enemy.position.y + 0.65, player.position.y + 0.65)
  });
  if (seesPlayer && playerDistance <= enemy.wakeRange) {
    enemy.alerted = true;
    enemy.lastSeenTick = tick;
  }
  if (!enemy.alerted) return { kind: "idle", move: { x: 0, z: 0 }, attack: false };

  const canAttack = seesPlayer && playerDistance <= enemy.attackRange && enemy.cooldown <= 0;
  if (canAttack) {
    return {
      kind: "attack",
      move: { x: 0, z: 0 },
      attack: true,
      melee: enemy.melee,
      targetDistance: playerDistance
    };
  }

  let target = seesPlayer ? player.position : nextPathWaypoint(enemy, player, level, dynamics);
  if (!target) return { kind: "idle", move: { x: 0, z: 0 }, attack: false };
  let direction = normalizedDirection(enemy.position, target);
  // Ranged enemies hold a little space instead of dog-piling the player.
  if (seesPlayer && !enemy.melee && playerDistance < enemy.preferredRange * 0.7) {
    direction = { x: -direction.x, z: -direction.z };
  }
  const phaseScale = enemy.archetype === "bottom-board" ? 1 + (enemy.phase - 1) * 0.12 : 1;
  return {
    kind: "move",
    move: {
      x: direction.x * enemy.speed * phaseScale * dt,
      z: direction.z * enemy.speed * phaseScale * dt
    },
    attack: false,
    targetDistance: playerDistance
  };
}

function resetEnemy(enemy) {
  enemy.position = { ...enemy.spawnPosition };
  enemy.spaceId = enemy.spawnSpaceId;
  enemy.health = enemy.maxHealth;
  enemy.cooldown = 0;
  enemy.state = "idle";
  enemy.alerted = false;
  enemy.alive = true;
  enemy.phase = 1;
  enemy.lastSeenTick = -1;
  return enemy;
}

export {
  ARCHETYPE_STATS,
  enemyStatsFor,
  createEnemyFromMarker,
  portalMidpoint,
  findSpacePath,
  nextPathWaypoint,
  normalizedDirection,
  bossPhase,
  computeEnemyIntent,
  resetEnemy,
};
