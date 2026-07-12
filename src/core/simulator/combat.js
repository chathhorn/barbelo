// Card/shuffle combat and damage arithmetic. This module owns no timers or
// browser resources; callers advance it explicitly from the fixed simulation.

import { distancePointToSegment, moveActor } from "./collision.js";

const SUIT_ORDER = ["S", "H", "D", "C"];
const RANK_ORDER = "AKQJT98765432";
const CARD_DAMAGE = 34;
const CARD_COOLDOWN = 0.18;
const SHUFFLE_DURATION = 0.5;
const CARD_SPEED = 24;
const CARD_LIFETIME = 1.25;

function canonicalCardKey(card) {
  return `${card && card.suit || ""}${card && card.rank || ""}`;
}

function isValidCard(card) {
  return !!card && SUIT_ORDER.includes(card.suit) && RANK_ORDER.includes(card.rank);
}

function canonicalCardSort(a, b) {
  return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
    RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
}

function normalizeThirteenCards(cards) {
  const normalized = (cards || []).map((card) => ({
    suit: String(card && card.suit || "").toUpperCase(),
    rank: String(card && card.rank || "").toUpperCase()
  }));
  if (normalized.length !== 13 || normalized.some((card) => !isValidCard(card))) return null;
  if (new Set(normalized.map(canonicalCardKey)).size !== 13) return null;
  return normalized.sort(canonicalCardSort);
}

function hashSeed(seed) {
  const text = String(seed == null ? "bridge-simulator" : seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function nextRandom(state) {
  let next = state.value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  state.value = next >>> 0;
  return state.value / 4294967296;
}

function buildPracticeDeck(seed) {
  const deck = SUIT_ORDER.flatMap((suit) => [...RANK_ORDER].map((rank) => ({ suit, rank })));
  const random = { value: hashSeed(seed) };
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(nextRandom(random) * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck.slice(0, 13).sort(canonicalCardSort);
}

function createCombatState(options = {}) {
  const provided = normalizeThirteenCards(options.cards);
  const cards = provided || buildPracticeDeck(options.seed);
  return {
    cards,
    source: provided && options.source === "pbn" ? "pbn" : "practice",
    nextCardIndex: 0,
    cooldown: 0,
    shuffleRemaining: 0,
    shuffleDuration: Number.isFinite(options.shuffleDuration)
      ? Math.max(0, options.shuffleDuration)
      : SHUFFLE_DURATION,
    shotsFired: 0,
    shotsHit: 0,
    shuffles: 0
  };
}

function updateCombatTimers(combat, dt) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.shuffleRemaining > 0) combat.shuffleRemaining = Math.max(0, combat.shuffleRemaining - dt);
  return combat;
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

function applyDamageToPlayer(player, rawDamage, mode = "standard") {
  const damage = Math.max(0, Number(rawDamage) || 0);
  if (mode === "practice" || damage === 0) {
    return { rawDamage: damage, absorbed: damage, composureLost: 0, defeated: false, practice: mode === "practice" };
  }
  const desiredAbsorption = Math.ceil(damage * 0.5);
  const absorbed = Math.min(player.systemNotes || 0, desiredAbsorption);
  player.systemNotes = Math.max(0, (player.systemNotes || 0) - absorbed);
  const composureLost = damage - absorbed;
  player.composure = Math.max(0, player.composure - composureLost);
  return {
    rawDamage: damage,
    absorbed,
    composureLost,
    defeated: player.composure <= 0,
    practice: false
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
  if (pickup.pickupKind === "system-notes") {
    const before = player.systemNotes;
    player.systemNotes = Math.min(100, player.systemNotes + amount);
    amount = player.systemNotes - before;
  } else if (["biscuit", "coffee"].includes(pickup.pickupKind)) {
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

function updateProjectiles(options) {
  const {
    level,
    dynamics,
    projectiles,
    entities,
    player,
    obstacles = [],
    dt,
    mode = "standard",
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
    const previousPosition = { ...projectile.position };
    const moved = moveActor(level, {
      position: projectile.position,
      spaceId: projectile.spaceId,
      radius: projectile.radius,
      height: projectile.height,
      maxStep: Infinity
    }, {
      x: projectile.velocity.x * dt,
      z: projectile.velocity.z * dt
    }, dynamics);
    if (moved.collided) {
      projectile.alive = false;
      events.push({ type: "projectile-wall", projectileId: projectile.id, position: { ...moved.position } });
      continue;
    }
    projectile.position = { ...moved.position, y: previousPosition.y + (projectile.velocity.y || 0) * dt };
    projectile.spaceId = moved.spaceId;
    const obstacle = obstacles.find((entry) => entry && entry.blocking !== false &&
      distancePointToSegment(entry.position, { a: previousPosition, b: projectile.position }) <= projectile.radius + (entry.radius || 0));
    if (obstacle) {
      projectile.alive = false;
      events.push({ type: "projectile-wall", projectileId: projectile.id, obstacleId: obstacle.id, position: { ...projectile.position } });
      continue;
    }
    if (projectile.owner === "player") {
      const travel = { a: previousPosition, b: projectile.position };
      const hit = entities.find((entity) => entity.kind === "enemy" && entity.alive && entity.active !== false &&
        distancePointToSegment(entity.position, travel) <= projectile.radius + entity.radius);
      if (!hit) continue;
      projectile.alive = false;
      const result = applyDamageToEntity(hit, projectile.damage);
      if (combat) combat.shotsHit += 1;
      events.push({ type: "enemy-hit", entityId: hit.id, damage: result.damage, position: { ...hit.position } });
      if (result.defeated) {
        const honor = honorForDefeat(hit);
        events.push({ type: hit.archetype === "bottom-board" ? "boss-defeated" : "enemy-defeated", entityId: hit.id, honor });
      }
    } else if (player && distancePointToSegment(player.position, { a: previousPosition, b: projectile.position }) <=
      projectile.radius + player.radius) {
      projectile.alive = false;
      const result = applyDamageToPlayer(player, projectile.damage, mode);
      events.push({ type: "player-hit", sourceId: projectile.ownerId, ...result });
    }
  }
  for (let index = projectiles.length - 1; index >= 0; index -= 1) {
    if (!projectiles[index].alive) projectiles.splice(index, 1);
  }
  return events;
}

export {
  SUIT_ORDER,
  RANK_ORDER,
  CARD_DAMAGE,
  CARD_COOLDOWN,
  SHUFFLE_DURATION,
  CARD_SPEED,
  CARD_LIFETIME,
  canonicalCardKey,
  isValidCard,
  canonicalCardSort,
  normalizeThirteenCards,
  buildPracticeDeck,
  createCombatState,
  updateCombatTimers,
  tryThrowCard,
  createEnemyProjectile,
  applyDamageToPlayer,
  applyDamageToEntity,
  honorForDefeat,
  collectPickup,
  updateProjectiles,
};
