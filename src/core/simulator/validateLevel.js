// Structural and progression validation for authored simulator levels. The
// validator understands the slice/full manifests and validates each level
// against its own required wing/slip count rather than assuming three wings.

import {
  EPSILON,
  distancePointToSegment,
  pointInPolygon,
  pointOnSegment,
  polygonArea,
  polygonEdges,
  portalClearance,
  spaceById,
} from "./collision.js";

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function markerById(level, id) {
  return level.markers.find((entry) => entry.id === id) || null;
}

function requirementSatisfied(portal, phase, level) {
  const requirement = portal.requirement;
  if (!requirement) return portal.initialOpen !== false || portal.automatic !== false;
  if (requirement.type === "slips") return phase.slips >= level.objectives.requiredSlipCount;
  if (requirement.type === "bossDefeated") return !!phase.bossDefeated;
  if (requirement.type === "wingComplete") return phase.completedWings.has(requirement.wingId);
  return false;
}

function portalEventuallyTraversable(portal, phase, level) {
  if (portal.kind === "window" || portal.kind === "blocked") return false;
  return requirementSatisfied(portal, phase, level);
}

function reachableSpaces(level, phase = {}) {
  const normalized = {
    slips: Number.isFinite(phase.slips) ? phase.slips : 0,
    bossDefeated: !!phase.bossDefeated,
    completedWings: phase.completedWings instanceof Set
      ? phase.completedWings
      : new Set(phase.completedWings || [])
  };
  const spawn = level.markers.find((entry) => entry.type === "playerSpawn");
  if (!spawn) return new Set();
  const reached = new Set([spawn.spaceId]);
  const queue = [spawn.spaceId];
  while (queue.length) {
    const current = queue.shift();
    level.portals.forEach((portal) => {
      if (!portalEventuallyTraversable(portal, normalized, level)) return;
      const next = portal.from === current ? portal.to : portal.to === current ? portal.from : "";
      if (!next || reached.has(next)) return;
      reached.add(next);
      queue.push(next);
    });
  }
  return reached;
}

function validateSpaceGeometry(level, errors) {
  const ids = new Set();
  level.spaces.forEach((entry) => {
    if (!entry.id || ids.has(entry.id)) errors.push(`Duplicate or empty space id: ${entry.id || "(empty)"}.`);
    ids.add(entry.id);
    if (!Array.isArray(entry.polygon) || entry.polygon.length < 3) {
      errors.push(`Space ${entry.id} needs at least three polygon points.`);
      return;
    }
    if (!entry.polygon.every(finitePoint)) errors.push(`Space ${entry.id} has a non-finite polygon point.`);
    if (Math.abs(polygonArea(entry.polygon)) < 0.01) errors.push(`Space ${entry.id} has zero-area geometry.`);
    if (!Number.isFinite(entry.floor) || !Number.isFinite(entry.ceiling) || entry.ceiling <= entry.floor) {
      errors.push(`Space ${entry.id} has invalid floor/ceiling heights.`);
    } else if (entry.ceiling - entry.floor + EPSILON < level.rules.height) {
      errors.push(`Space ${entry.id} is too short for the player.`);
    }
    polygonEdges(entry.polygon).forEach((edge, index) => {
      const dx = edge.b.x - edge.a.x;
      const dz = edge.b.z - edge.a.z;
      if (dx * dx + dz * dz <= EPSILON) errors.push(`Space ${entry.id} has a zero-length edge at ${index}.`);
    });
  });
}

function validatePortals(level, errors, warnings) {
  const ids = new Set();
  level.portals.forEach((entry) => {
    if (!entry.id || ids.has(entry.id)) errors.push(`Duplicate or empty portal id: ${entry.id || "(empty)"}.`);
    ids.add(entry.id);
    const from = spaceById(level, entry.from);
    const to = spaceById(level, entry.to);
    if (!from || !to || from === to) {
      errors.push(`Portal ${entry.id} must join two different existing spaces.`);
      return;
    }
    if (!finitePoint(entry.segment && entry.segment.a) || !finitePoint(entry.segment && entry.segment.b)) {
      errors.push(`Portal ${entry.id} has invalid segment coordinates.`);
      return;
    }
    const length = Math.hypot(
      entry.segment.b.x - entry.segment.a.x,
      entry.segment.b.z - entry.segment.a.z
    );
    if (length + EPSILON < level.rules.radius * 2) errors.push(`Portal ${entry.id} is narrower than the player.`);
    const onBoundary = (space) => polygonEdges(space.polygon).some((edge) =>
      pointOnSegment(entry.segment.a, edge, 1e-5) && pointOnSegment(entry.segment.b, edge, 1e-5));
    if (!onBoundary(from) || !onBoundary(to)) {
      errors.push(`Portal ${entry.id} does not lie on both joined space boundaries.`);
    }
    if (portalClearance(entry, level) + EPSILON < level.rules.height) {
      errors.push(`Portal ${entry.id} has insufficient vertical clearance.`);
    }
    const rise = Math.abs(from.floor - to.floor);
    if (rise > level.rules.maxStep + EPSILON && entry.kind !== "lift") {
      errors.push(`Portal ${entry.id} rises ${rise.toFixed(2)} without a lift.`);
    }
    if (entry.kind === "lift") {
      if (!(entry.liftSpeed > 0)) errors.push(`Lift ${entry.id} needs a positive liftSpeed.`);
      const controls = level.markers.filter((marker) => marker.type === "liftControl" &&
        (marker.spaceId === entry.from || marker.spaceId === entry.to));
      const controlledSides = new Set(controls.map((marker) => marker.spaceId));
      if (!controlledSides.has(entry.from) || !controlledSides.has(entry.to)) {
        errors.push(`Lift ${entry.id} needs a control in both joined spaces.`);
      }
    }
    if (entry.automatic === false && entry.kind !== "lift") {
      const controls = level.markers.filter((marker) => marker.type === "doorControl" && marker.label === entry.id);
      if (!controls.length) errors.push(`Manual portal ${entry.id} has no door control.`);
    }
    if (entry.requirement && entry.requirement.type === "wingComplete" &&
      !level.objectives.wingIds.includes(entry.requirement.wingId)) {
      warnings.push(`Portal ${entry.id} refers to a wing outside this manifest.`);
    }
  });
}

function validateMarkers(level, errors) {
  const ids = new Set();
  level.markers.forEach((entry) => {
    if (!entry.id || ids.has(entry.id)) errors.push(`Duplicate or empty marker id: ${entry.id || "(empty)"}.`);
    ids.add(entry.id);
    const owner = spaceById(level, entry.spaceId);
    if (!owner) {
      errors.push(`Marker ${entry.id} belongs to missing space ${entry.spaceId}.`);
      return;
    }
    if (!finitePoint(entry.position) || !Number.isFinite(entry.position.y)) {
      errors.push(`Marker ${entry.id} has non-finite coordinates.`);
      return;
    }
    if (!pointInPolygon(entry.position, owner.polygon)) {
      errors.push(`Marker ${entry.id} lies outside ${owner.id}.`);
    }
    if (entry.position.y < owner.floor - EPSILON || entry.position.y > owner.ceiling + EPSILON) {
      errors.push(`Marker ${entry.id} has a height outside ${owner.id}.`);
    }
    const radius = Math.max(0, entry.radius || 0);
    if (["playerSpawn", "enemySpawn", "bossSpawn", "coach", "coachCheckpoint", "pickup", "cover"].includes(entry.type)) {
      const wallDistance = Math.min(...polygonEdges(owner.polygon)
        .map((edge) => distancePointToSegment(entry.position, edge)));
      if (wallDistance + EPSILON < radius) errors.push(`Marker ${entry.id} overlaps a wall.`);
    }
  });
  const spawns = level.markers.filter((entry) => entry.type === "playerSpawn");
  if (spawns.length !== 1) errors.push(`Level needs exactly one player spawn; found ${spawns.length}.`);
}

function validateManifest(level, errors, warnings) {
  const manifest = level.manifest || {};
  const primarySpaces = level.spaces.filter((entry) => entry.primary !== false).length;
  if (manifest.expectedPrimarySpaces != null && primarySpaces !== manifest.expectedPrimarySpaces) {
    errors.push(`Manifest expects ${manifest.expectedPrimarySpaces} primary spaces; found ${primarySpaces}.`);
  }
  const ordinaryEnemies = level.markers.filter((entry) => entry.type === "enemySpawn").length;
  if (manifest.expectedOrdinaryEnemies != null && ordinaryEnemies !== manifest.expectedOrdinaryEnemies) {
    errors.push(`Manifest expects ${manifest.expectedOrdinaryEnemies} ordinary enemies; found ${ordinaryEnemies}.`);
  }
  if (level.objectives.requiredSlipCount !== level.objectives.requiredSlipIds.length) {
    errors.push("Required slip count and required slip ids disagree.");
  }
  level.objectives.requiredSlipIds.forEach((id) => {
    const item = markerById(level, id);
    if (!item || item.type !== "reviewSlip") errors.push(`Required review slip ${id} is missing.`);
  });
  level.objectives.requiredSecretIds.forEach((id) => {
    const item = markerById(level, id);
    if (!item || item.type !== "secret") errors.push(`Required secret ${id} is missing.`);
  });
  [
    [level.objectives.bossMarkerId, "bossSpawn"],
    [level.objectives.vaultMarkerId, "vault"],
    [level.objectives.exitMarkerId, "exit"]
  ].forEach(([id, type]) => {
    const item = markerById(level, id);
    if (!item || item.type !== type) errors.push(`Required ${type} marker ${id} is missing.`);
  });

  const completeWings = new Set(level.objectives.wingIds);
  const beforeVault = reachableSpaces(level, { slips: 0, completedWings: completeWings });
  level.objectives.requiredSlipIds.forEach((id) => {
    const slip = markerById(level, id);
    if (slip && !beforeVault.has(slip.spaceId)) errors.push(`Review slip ${id} is unreachable before the vault gate.`);
  });
  level.objectives.requiredSecretIds.forEach((id) => {
    const secret = markerById(level, id);
    if (secret && !beforeVault.has(secret.spaceId)) warnings.push(`Secret ${id} is not reachable before the boss.`);
  });
  const atVault = reachableSpaces(level, {
    slips: level.objectives.requiredSlipCount,
    completedWings: completeWings
  });
  const vault = markerById(level, level.objectives.vaultMarkerId);
  const boss = markerById(level, level.objectives.bossMarkerId);
  if (vault && !atVault.has(vault.spaceId)) errors.push("Traveler Vault is unreachable after collecting review slips.");
  if (boss && !atVault.has(boss.spaceId)) errors.push("Boss is unreachable after collecting review slips.");
  const afterBoss = reachableSpaces(level, {
    slips: level.objectives.requiredSlipCount,
    completedWings: completeWings,
    bossDefeated: true
  });
  const exit = markerById(level, level.objectives.exitMarkerId);
  if (exit && !afterBoss.has(exit.spaceId)) errors.push("Exit is unreachable after boss defeat.");
}

function validateLevel(level) {
  const errors = [];
  const warnings = [];
  if (!level || typeof level !== "object") {
    return { valid: false, errors: ["Level must be an object."], warnings, metrics: {} };
  }
  if (!Array.isArray(level.spaces) || !Array.isArray(level.portals) || !Array.isArray(level.markers)) {
    return { valid: false, errors: ["Level must provide spaces, portals, and markers arrays."], warnings, metrics: {} };
  }
  if (!level.rules || !(level.rules.radius > 0) || !(level.rules.height > 0) || !(level.rules.maxStep >= 0)) {
    errors.push("Level player rules are invalid.");
  } else {
    validateSpaceGeometry(level, errors);
    validatePortals(level, errors, warnings);
    validateMarkers(level, errors);
    validateManifest(level, errors, warnings);
  }
  const reachable = reachableSpaces(level, {
    slips: level.objectives ? level.objectives.requiredSlipCount : 0,
    completedWings: new Set(level.objectives ? level.objectives.wingIds : []),
    bossDefeated: true
  });
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    reachableSpaceIds: [...reachable].sort(),
    metrics: {
      spaces: level.spaces.length,
      primarySpaces: level.spaces.filter((entry) => entry.primary !== false).length,
      portals: level.portals.length,
      markers: level.markers.length,
      ordinaryEnemies: level.markers.filter((entry) => entry.type === "enemySpawn").length,
      secrets: level.markers.filter((entry) => entry.type === "secret").length,
      reachableSpaces: reachable.size
    }
  };
}

function assertValidLevel(level) {
  const result = validateLevel(level);
  if (!result.valid) throw new Error(`Invalid Bridge Simulator level:\n${result.errors.join("\n")}`);
  return result;
}

export {
  markerById,
  reachableSpaces,
  validateLevel,
  assertValidLevel,
};
