// Dependency-free 2.5-D collision helpers. Actors move in X/Z while each
// space supplies a floor and ceiling; portals decide whether a boundary may
// be crossed and whether the height transition is traversable.

const EPSILON = 1e-7;

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function distance(a, b) {
  return Math.sqrt(squaredDistance(a, b));
}

function segmentLength(segment) {
  return distance(segment.a, segment.b);
}

function projectionOnSegment(point, segment) {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) {
    return { t: 0, point: { ...segment.a }, distance: distance(point, segment.a) };
  }
  const raw = ((point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  const projected = { x: segment.a.x + dx * t, z: segment.a.z + dz * t };
  return { t, point: projected, distance: distance(point, projected) };
}

function distancePointToSegment(point, segment) {
  return projectionOnSegment(point, segment).distance;
}

function pointOnSegment(point, segment, tolerance = 1e-6) {
  return distancePointToSegment(point, segment) <= tolerance;
}

function polygonEdges(polygon) {
  return polygon.map((point, index) => ({
    a: point,
    b: polygon[(index + 1) % polygon.length]
  }));
}

function pointInPolygon(point, polygon, includeBoundary = true) {
  if (!point || !polygon || polygon.length < 3) return false;
  if (includeBoundary && polygonEdges(polygon).some((edge) => pointOnSegment(point, edge))) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.z > point.z) !== (b.z > point.z)) &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon) {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  return twiceArea / 2;
}

function segmentIntersection(first, second) {
  const rx = first.b.x - first.a.x;
  const rz = first.b.z - first.a.z;
  const sx = second.b.x - second.a.x;
  const sz = second.b.z - second.a.z;
  const denominator = rx * sz - rz * sx;
  const qpx = second.a.x - first.a.x;
  const qpz = second.a.z - first.a.z;
  if (Math.abs(denominator) <= EPSILON) return null;
  const t = (qpx * sz - qpz * sx) / denominator;
  const u = (qpx * rz - qpz * rx) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return {
    x: first.a.x + rx * t,
    z: first.a.z + rz * t,
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u))
  };
}

function spaceById(level, id) {
  return level.spaces.find((entry) => entry.id === id) || null;
}

function portalsForSpace(level, spaceId) {
  return level.portals.filter((entry) => entry.from === spaceId || entry.to === spaceId);
}

function otherPortalSpace(portal, spaceId) {
  if (portal.from === spaceId) return portal.to;
  if (portal.to === spaceId) return portal.from;
  return "";
}

function spaceAtPoint(level, point, options = {}) {
  const preferred = options.preferredId ? spaceById(level, options.preferredId) : null;
  const y = options.y;
  const height = options.height || 0;
  const acceptsHeight = (entry) => y == null ||
    (y >= entry.floor - EPSILON && y + height <= entry.ceiling + EPSILON);
  if (preferred && acceptsHeight(preferred) && pointInPolygon(point, preferred.polygon)) return preferred;
  return level.spaces.find((entry) => acceptsHeight(entry) && pointInPolygon(point, entry.polygon)) || null;
}

function portalIsOpen(portal, dynamics = {}) {
  const runtime = dynamics.portals && dynamics.portals[portal.id];
  return runtime && typeof runtime.open === "boolean" ? runtime.open : portal.initialOpen !== false;
}

function liftIsReady(portal, dynamics = {}) {
  if (portal.kind !== "lift") return true;
  const runtime = dynamics.lifts && dynamics.lifts[portal.id];
  return !runtime || runtime.ready !== false;
}

function portalClearance(portal, level) {
  const from = spaceById(level, portal.from);
  const to = spaceById(level, portal.to);
  if (!from || !to) return 0;
  return Math.min(from.ceiling, to.ceiling) - Math.max(from.floor, to.floor);
}

function canTraversePortal(level, portal, actor, dynamics = {}, fromSpaceId = actor.spaceId) {
  if (!portal || !portalIsOpen(portal, dynamics) || !liftIsReady(portal, dynamics)) return false;
  const from = spaceById(level, fromSpaceId);
  const to = spaceById(level, otherPortalSpace(portal, fromSpaceId));
  if (!from || !to) return false;
  const height = actor.height == null ? level.rules.height : actor.height;
  if (portalClearance(portal, level) + EPSILON < height) return false;
  const rise = Math.abs(to.floor - from.floor);
  const maxStep = actor.maxStep == null ? level.rules.maxStep : actor.maxStep;
  if (rise <= maxStep + EPSILON) return true;
  return portal.kind === "lift" && liftIsReady(portal, dynamics);
}

function portalContainsCircleCenter(portal, point, radius) {
  const projected = projectionOnSegment(point, portal.segment);
  const length = segmentLength(portal.segment);
  if (length <= EPSILON || projected.distance > radius + 1e-5) return false;
  const margin = Math.min(0.49, radius / length);
  return projected.t >= margin - EPSILON && projected.t <= 1 - margin + EPSILON;
}

function edgeHasOpenPortal(level, spaceId, edge, point, radius, actor, dynamics) {
  return portalsForSpace(level, spaceId).some((portal) => {
    if (!canTraversePortal(level, portal, actor, dynamics, spaceId)) return false;
    if (!pointOnSegment(portal.segment.a, edge, 1e-5) || !pointOnSegment(portal.segment.b, edge, 1e-5)) return false;
    return portalContainsCircleCenter(portal, point, radius);
  });
}

function circleFitsInSpace(level, space, point, radius, actor, dynamics = {}) {
  if (!space || !pointInPolygon(point, space.polygon)) return false;
  return polygonEdges(space.polygon).every((edge) => {
    if (distancePointToSegment(point, edge) + EPSILON >= radius) return true;
    return edgeHasOpenPortal(level, space.id, edge, point, radius, actor, dynamics);
  });
}

function portalCrossed(level, fromSpace, movement, actor, dynamics) {
  return portalsForSpace(level, fromSpace.id)
    .map((portal) => ({ portal, hit: segmentIntersection(movement, portal.segment) }))
    .filter((entry) => entry.hit && canTraversePortal(level, entry.portal, actor, dynamics, fromSpace.id))
    .sort((a, b) => a.hit.t - b.hit.t)[0] || null;
}

function attemptMove(level, actor, target, dynamics) {
  const radius = actor.radius == null ? level.rules.radius : actor.radius;
  const current = spaceById(level, actor.spaceId) || spaceAtPoint(level, actor.position, {
    y: actor.position.y,
    height: actor.height
  });
  if (!current) return null;
  const candidateInCurrent = pointInPolygon(target, current.polygon);
  if (candidateInCurrent && circleFitsInSpace(level, current, target, radius, actor, dynamics)) {
    return { position: { x: target.x, y: current.floor, z: target.z }, spaceId: current.id, portalId: "" };
  }

  const movement = { a: actor.position, b: target };
  const crossed = portalCrossed(level, current, movement, actor, dynamics);
  if (!crossed) return null;
  const nextSpace = spaceById(level, otherPortalSpace(crossed.portal, current.id));
  if (!nextSpace || !pointInPolygon(target, nextSpace.polygon)) return null;
  const movedActor = { ...actor, spaceId: nextSpace.id };
  if (!circleFitsInSpace(level, nextSpace, target, radius, movedActor, dynamics)) return null;
  return {
    position: { x: target.x, y: nextSpace.floor, z: target.z },
    spaceId: nextSpace.id,
    portalId: crossed.portal.id
  };
}

function moveActor(level, actor, delta, dynamics = {}) {
  const start = { ...actor.position };
  const target = { x: start.x + (delta.x || 0), z: start.z + (delta.z || 0) };
  const direct = attemptMove(level, actor, target, dynamics);
  if (direct) return { ...direct, collided: false, slid: false };

  const xOnly = Math.abs(delta.x || 0) > EPSILON
    ? attemptMove(level, actor, { x: target.x, z: start.z }, dynamics)
    : null;
  const zOnly = Math.abs(delta.z || 0) > EPSILON
    ? attemptMove(level, actor, { x: start.x, z: target.z }, dynamics)
    : null;
  const slide = xOnly && zOnly
    ? (Math.abs(delta.x) >= Math.abs(delta.z) ? xOnly : zOnly)
    : xOnly || zOnly;
  if (slide) return { ...slide, collided: true, slid: true };
  return { position: start, spaceId: actor.spaceId, portalId: "", collided: true, slid: false };
}

function hasLineOfSight(level, from, to, dynamics = {}, options = {}) {
  const total = distance(from.position || from, to.position || to);
  if (total <= EPSILON) return true;
  const sampleSize = Math.max(0.08, options.sampleSize || 0.2);
  const steps = Math.max(1, Math.ceil(total / sampleSize));
  const fromPoint = from.position || from;
  const toPoint = to.position || to;
  const y = options.y == null ? Math.max(fromPoint.y || 0, toPoint.y || 0) : options.y;
  let previous = spaceAtPoint(level, fromPoint, { preferredId: from.spaceId, y });
  if (!previous) return false;
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
      z: fromPoint.z + (toPoint.z - fromPoint.z) * ratio
    };
    const next = spaceAtPoint(level, point, { preferredId: previous.id, y });
    if (!next) return false;
    if (next.id !== previous.id) {
      const connecting = level.portals.find((portal) =>
        ((portal.from === previous.id && portal.to === next.id) ||
          (portal.to === previous.id && portal.from === next.id)) &&
        pointOnSegment(point, portal.segment, sampleSize * 1.5));
      const sightActor = { spaceId: previous.id, height: 0.05, maxStep: Infinity };
      if (!connecting || !canTraversePortal(level, connecting, sightActor, dynamics, previous.id)) return false;
      previous = next;
    }
  }
  return true;
}

function positionOverlapsActors(position, radius, actors, ignoreId = "") {
  return (actors || []).some((actor) => {
    if (!actor || actor.id === ignoreId || actor.alive === false || actor.blocking === false) return false;
    const otherRadius = actor.radius || 0;
    return squaredDistance(position, actor.position) < (radius + otherRadius) ** 2 - EPSILON;
  });
}

export {
  EPSILON,
  squaredDistance,
  distance,
  segmentLength,
  projectionOnSegment,
  distancePointToSegment,
  pointOnSegment,
  polygonEdges,
  pointInPolygon,
  polygonArea,
  segmentIntersection,
  spaceById,
  portalsForSpace,
  otherPortalSpace,
  spaceAtPoint,
  portalIsOpen,
  portalClearance,
  canTraversePortal,
  circleFitsInSpace,
  moveActor,
  hasLineOfSight,
  positionOverlapsActors,
};
