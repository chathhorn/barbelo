// Card/shuffle combat and damage arithmetic. This module owns no timers or
// browser resources; callers advance it explicitly from the fixed simulation.

import { moveActor } from "./collision.js";
import { buildTrainingHand, normalizeThirteenCards } from "./cards.js";

const CARD_DAMAGE = 34;
const CARD_COOLDOWN = 0.18;
const SHUFFLE_DURATION = 1;
const CARD_SPEED = 24;
const CARD_LIFETIME = 1.25;
const PROJECTILE_MAX_STEP = 0.1;

function createCombatState(options = {}) {
  const provided = normalizeThirteenCards(options.cards);
  const cards = provided || buildTrainingHand(options.seed);
  return {
    cards,
    nextCardIndex: 0,
    cooldown: 0,
    shuffleRemaining: 0,
    shuffleDuration: Number.isFinite(options.shuffleDuration)
      ? Math.max(0, options.shuffleDuration)
      : SHUFFLE_DURATION,
    shotsFired: 0,
    shotsHit: 0,
    friendlyShots: 0,
    shuffles: 0
  };
}

function updateCombatTimers(combat, dt) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.shuffleRemaining > 0) combat.shuffleRemaining = Math.max(0, combat.shuffleRemaining - dt);
  return combat;
}

function tryShuffleHand(combat) {
  if (!combat || !combat.cards.length) return { started: false, reason: "empty" };
  if (combat.shuffleRemaining > 0) return { started: false, reason: "shuffling" };
  if (combat.nextCardIndex === 0) return { started: false, reason: "full" };
  combat.nextCardIndex = 0;
  combat.shuffleRemaining = combat.shuffleDuration;
  combat.shuffles += 1;
  return { started: true, reason: "", duration: combat.shuffleDuration };
}

function tryThrowCard(combat, options = {}) {
  if (!combat || combat.cooldown > 0 || combat.shuffleRemaining > 0 || !combat.cards.length) {
    return { fired: false, projectile: null, reason: combat && combat.shuffleRemaining > 0 ? "shuffling" : "cooldown" };
  }
  const card = combat.cards[combat.nextCardIndex];
  const angle = Number(options.angle) || 0;
  const origin = options.origin || { x: 0, y: 0, z: 0 };
  const projectile = {
    id: options.id || `card-${options.tick || 0}-${combat.shotsFired + 1}`,
    type: "card",
    owner: "player",
    ownerId: "player",
    card: { ...card },
    position: { x: origin.x, y: origin.y || 0, z: origin.z },
    spaceId: options.spaceId || "",
    velocity: {
      x: Math.cos(angle) * CARD_SPEED,
      y: 0,
      z: Math.sin(angle) * CARD_SPEED
    },
    radius: 0.22,
    height: 0.08,
    damage: CARD_DAMAGE,
    lifetime: CARD_LIFETIME,
    alive: true
  };
  combat.nextCardIndex += 1;
  combat.shotsFired += 1;
  combat.cooldown = CARD_COOLDOWN;
  if (combat.nextCardIndex >= combat.cards.length) {
    combat.nextCardIndex = 0;
    combat.shuffleRemaining = combat.shuffleDuration;
    combat.shuffles += 1;
  }
  return { fired: true, projectile, reason: "" };
}

function createEnemyProjectile(enemy, target, id) {
  const dx = target.position.x - enemy.position.x;
  const dz = target.position.z - enemy.position.z;
  const length = Math.hypot(dx, dz) || 1;
  const speed = enemy.archetype === "bottom-board" ? 11 : 9;
  return {
    id,
    type: "score-slip",
    owner: "enemy",
    ownerId: enemy.id,
    position: { x: enemy.position.x, y: enemy.position.y + 0.8, z: enemy.position.z },
    spaceId: enemy.spaceId,
    velocity: { x: dx / length * speed, y: 0, z: dz / length * speed },
    radius: enemy.archetype === "bottom-board" ? 0.3 : 0.22,
    height: 0.12,
    damage: enemy.damage,
    lifetime: 2.5,
    alive: true
  };
}

function applyDamageToPlayer(player, rawDamage) {
  const damage = Math.max(0, Number(rawDamage) || 0);
  const composureLost = damage;
  player.composure = Math.max(0, player.composure - composureLost);
  return {
    rawDamage: damage,
    composureLost,
    defeated: player.composure <= 0
  };
}

function applyDamageToEntity(entity, rawDamage) {
  if (!entity || entity.alive === false) return { damage: 0, defeated: false };
  const incoming = Math.max(0, Number(rawDamage) || 0);
  const shieldScale = entity.archetype === "red-x-sentinel" && entity.health > entity.maxHealth * 0.5 ? 0.7 : 1;
  const damage = Math.max(1, Math.round(incoming * shieldScale));
  entity.health = Math.max(0, entity.health - damage);
  if (entity.health <= 0) entity.alive = false;
  return { damage, defeated: !entity.alive };
}

function honorForDefeat(entity) {
  if (entity.archetype === "bottom-board") return 1000;
  return 100;
}

function collectPickup(player, pickup) {
  if (!pickup || pickup.collected) return { collected: false, kind: "", amount: 0 };
  let amount = pickup.amount || 0;
  if (["biscuit", "coffee"].includes(pickup.pickupKind)) {
    const before = player.composure;
    player.composure = Math.min(player.maxComposure, player.composure + amount);
    amount = player.composure - before;
  } else {
    return { collected: false, kind: pickup.pickupKind, amount: 0 };
  }
  if (amount <= 0) return { collected: false, kind: pickup.pickupKind, amount: 0 };
  pickup.collected = true;
  pickup.active = false;
  return { collected: true, kind: pickup.pickupKind, amount };
}

function segmentCircleHitTime(center, radius, segment) {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const fx = segment.a.x - center.x;
  const fz = segment.a.z - center.z;
  const a = dx * dx + dz * dz;
  const combined = Math.max(0, Number(radius) || 0);
  const c = fx * fx + fz * fz - combined * combined;
  if (c <= 0) return 0;
  if (a <= 1e-12) return null;
  const b = 2 * (fx * dx + fz * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  if (first >= 0 && first <= 1) return first;
  if (second >= 0 && second <= 1) return second;
  return null;
}

function pointAlong(segment, time, y) {
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * time,
    y,
    z: segment.a.z + (segment.b.z - segment.a.z) * time,
  };
}

function updateProjectiles(options) {
  const {
    level,
    dynamics,
    projectiles,
    entities,
    player,
    obstacles = [],
    allies = [],
    dt,
    combat
  } = options;
  const events = [];
  for (const projectile of projectiles) {
    if (!projectile.alive) continue;
    projectile.lifetime -= dt;
    if (projectile.lifetime <= 0) {
      projectile.alive = false;
      continue;
    }
    const travelDistance = Math.hypot(projectile.velocity.x * dt, projectile.velocity.z * dt);
    const substeps = Math.max(1, Math.ceil(travelDistance / PROJECTILE_MAX_STEP));
    const substepDt = dt / substeps;
    for (let substep = 0; substep < substeps && projectile.alive; substep += 1) {
      const previousPosition = { ...projectile.position };
      const priorSpaceId = projectile.spaceId;
      const moved = moveActor(level, {
        position: projectile.position,
        spaceId: projectile.spaceId,
        radius: projectile.radius,
        height: projectile.height,
        maxStep: Infinity
      }, {
        x: projectile.velocity.x * substepDt,
        z: projectile.velocity.z * substepDt
      }, dynamics);
      if (moved.collided) {
        projectile.alive = false;
        events.push({ type: "projectile-wall", projectileId: projectile.id, position: { ...previousPosition } });
        break;
      }

      const nextY = previousPosition.y + (projectile.velocity.y || 0) * substepDt;
      const travel = { a: previousPosition, b: { ...moved.position, y: nextY } };
      const spaces = new Set([priorSpaceId, moved.spaceId]);
      const candidates = [];
      obstacles.forEach((entry) => {
        if (!entry || entry.blocking === false || entry.alive === false || !spaces.has(entry.spaceId)) return;
        const time = segmentCircleHitTime(entry.position, projectile.radius + (entry.radius || 0), travel);
        if (time != null) candidates.push({ kind: "obstacle", target: entry, time, priority: 0 });
      });
      if (projectile.owner === "player") {
        allies.forEach((ally) => {
          if (!ally || ally.kind !== "coach" || ally.active === false || ally.alive === false || !spaces.has(ally.spaceId)) return;
          const time = segmentCircleHitTime(ally.position, projectile.radius + (ally.radius || 0), travel);
          if (time != null) candidates.push({ kind: "ally", target: ally, time, priority: 1 });
        });
        entities.forEach((entity) => {
          if (entity.kind !== "enemy" || !entity.alive || entity.active === false || !spaces.has(entity.spaceId)) return;
          const time = segmentCircleHitTime(entity.position, projectile.radius + entity.radius, travel);
          if (time != null) candidates.push({ kind: "enemy", target: entity, time, priority: 2 });
        });
      } else if (player && spaces.has(player.spaceId)) {
        const time = segmentCircleHitTime(player.position, projectile.radius + player.radius, travel);
        if (time != null) candidates.push({ kind: "player", target: player, time, priority: 1 });
      }
      candidates.sort((a, b) => a.time - b.time || a.priority - b.priority || a.target.id.localeCompare(b.target.id));
      const impact = candidates[0];
      if (!impact) {
        projectile.position = travel.b;
        projectile.spaceId = moved.spaceId;
        continue;
      }

      projectile.position = pointAlong(travel, impact.time, previousPosition.y + (nextY - previousPosition.y) * impact.time);
      projectile.spaceId = moved.spaceId;
      projectile.alive = false;
      if (impact.kind === "obstacle") {
        events.push({
          type: "projectile-wall",
          projectileId: projectile.id,
          obstacleId: impact.target.id,
          position: { ...projectile.position },
        });
      } else if (impact.kind === "ally") {
        if (combat) combat.friendlyShots = (combat.friendlyShots || 0) + 1;
        events.push({
          type: "coach-hit",
          entityId: impact.target.id,
          friendly: true,
          position: { ...projectile.position },
        });
      } else if (impact.kind === "enemy") {
        const result = applyDamageToEntity(impact.target, projectile.damage);
        if (combat) combat.shotsHit += 1;
        events.push({ type: "enemy-hit", entityId: impact.target.id, damage: result.damage, position: { ...impact.target.position } });
        if (result.defeated) {
          const honor = honorForDefeat(impact.target);
          events.push({
            type: impact.target.archetype === "bottom-board" ? "boss-defeated" : "enemy-defeated",
            entityId: impact.target.id,
            honor,
          });
        }
      } else {
        const result = applyDamageToPlayer(player, projectile.damage);
        events.push({ type: "player-hit", sourceId: projectile.ownerId, ...result });
      }
    }
  }
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    if (!projectiles[index].alive) projectiles.splice(index, 1);
  }
  return events;
}

export {
  createCombatState,
  updateCombatTimers,
  tryShuffleHand,
  tryThrowCard,
  createEnemyProjectile,
  applyDamageToPlayer,
  collectPickup,
  updateProjectiles,
};
