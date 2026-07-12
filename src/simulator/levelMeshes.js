import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from "../../vendor/three/three.module.js";

const MATERIAL_COLORS = {
  "coat-check-wall": 0x725846,
  "tutorial-wall": 0x315a50,
  "cardroom-wall": 0x23473e,
  "auction-wall": 0x674529,
  "trickworks-wall": 0x284a68,
  "lead-mine-wall": 0x583438,
  "chalk-wall": 0x1d5945,
  "vulnerability-wall": 0x683d3b,
  "vault-wall": 0x524a34,
  "results-wall": 0x74684d,
  "club-wall": 0x345147,
  "entry-tile": 0x897d68,
  "green-felt": 0x235b48,
  "club-carpet": 0x3b2934,
  "auction-carpet": 0x62411f,
  "blue-carpet": 0x253d60,
  "red-carpet": 0x5c2e31,
  "checker-carpet": 0x4c4741,
  "vault-floor": 0x3c392d,
  "ceiling-tile": 0x827d6c,
  "door-felt": 0x385344,
  "lift-door": 0x7b6740,
  "lift-brass": 0x8d7437,
  "review-slip-gate": 0x9b7d36,
  "victory-door": 0x486d4c,
  "next-round-door": 0x8b763f,
};

function scaledColor(hex, light = 1) {
  const color = new Color(hex == null ? 0x555555 : hex);
  color.multiplyScalar(Math.max(0.25, Math.min(1.15, light)));
  return color;
}

function textureForMaterial(textures, key, surface) {
  if (surface === "floor") return textures.carpetSuits;
  if (surface === "ceiling") return textures.paperPanel;
  if (/chalk/.test(key)) return textures.chalkboard;
  if (/vault|gate|door|lift/.test(key)) return textures.vaultDoor;
  if (/results|paper/.test(key)) return textures.paperPanel;
  return textures.feltWall;
}

function materialKey(key, light, surface) {
  return `${key}:${Math.round(light * 10)}:${surface}`;
}

function createMaterialCache(textures) {
  const cache = new Map();
  function get(key, light, surface = "wall") {
    const id = materialKey(key, light, surface);
    if (!cache.has(id)) {
      cache.set(id, new MeshBasicMaterial({
        color: scaledColor(MATERIAL_COLORS[key] || MATERIAL_COLORS["club-wall"], light),
        map: textureForMaterial(textures, key, surface),
        side: DoubleSide,
        fog: true,
      }));
    }
    return cache.get(id);
  }
  return { get, values: () => cache.values() };
}

function pointOnSegment(point, segment, tolerance = 0.02) {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const cross = (point.x - segment.a.x) * dz - (point.z - segment.a.z) * dx;
  if (Math.abs(cross) > tolerance * Math.max(1, Math.hypot(dx, dz))) return false;
  const dot = (point.x - segment.a.x) * dx + (point.z - segment.a.z) * dz;
  return dot >= -tolerance && dot <= dx * dx + dz * dz + tolerance;
}

function portalIntervalsForWall(level, wall) {
  const dx = wall.segment.b.x - wall.segment.a.x;
  const dz = wall.segment.b.z - wall.segment.a.z;
  const length = Math.hypot(dx, dz);
  if (!length) return [];
  return level.portals
    .filter((portal) => (portal.from === wall.spaceId || portal.to === wall.spaceId)
      && pointOnSegment(portal.segment.a, wall.segment)
      && pointOnSegment(portal.segment.b, wall.segment))
    .map((portal) => {
      const project = (point) => ((point.x - wall.segment.a.x) * dx + (point.z - wall.segment.a.z) * dz) / length;
      const a = project(portal.segment.a);
      const b = project(portal.segment.b);
      return { start: Math.max(0, Math.min(a, b)), end: Math.min(length, Math.max(a, b)) };
    })
    .filter((interval) => interval.end - interval.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

function solidWallSegments(level, wall) {
  const dx = wall.segment.b.x - wall.segment.a.x;
  const dz = wall.segment.b.z - wall.segment.a.z;
  const length = Math.hypot(dx, dz);
  if (!length) return [];
  const ux = dx / length;
  const uz = dz / length;
  const intervals = portalIntervalsForWall(level, wall);
  const solids = [];
  let cursor = 0;
  intervals.forEach(({ start, end }) => {
    if (start > cursor + 0.02) solids.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  });
  if (cursor < length - 0.02) solids.push({ start: cursor, end: length });
  return solids.map(({ start, end }) => ({
    a: { x: wall.segment.a.x + ux * start, z: wall.segment.a.z + uz * start },
    b: { x: wall.segment.a.x + ux * end, z: wall.segment.a.z + uz * end },
  }));
}

function wallMesh(segment, bottom, top, material) {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const length = Math.hypot(dx, dz);
  const height = Math.max(0.1, top - bottom);
  const mesh = new Mesh(new BoxGeometry(length, height, 0.12), material);
  mesh.position.set((segment.a.x + segment.b.x) / 2, bottom + height / 2, (segment.a.z + segment.b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.userData.kind = "wall";
  return mesh;
}

function horizontalMesh(space, height, material, ceiling = false) {
  const shape = new Shape();
  space.polygon.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.z);
    else shape.lineTo(point.x, point.z);
  });
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = ceiling ? -Math.PI / 2 : Math.PI / 2;
  mesh.position.y = height;
  mesh.userData.kind = ceiling ? "ceiling" : "floor";
  return mesh;
}

function portalFloor(level, portal) {
  const from = level.spaces.find((space) => space.id === portal.from);
  const to = level.spaces.find((space) => space.id === portal.to);
  return Math.max(from ? from.floor : 0, to ? to.floor : 0);
}

function portalDoorMesh(level, portal, material) {
  const dx = portal.segment.b.x - portal.segment.a.x;
  const dz = portal.segment.b.z - portal.segment.a.z;
  const height = portal.kind === "gate" ? 3.25 : 2.75;
  const mesh = new Mesh(new BoxGeometry(Math.max(0.2, portal.width), height, 0.18), material);
  mesh.position.set(
    (portal.segment.a.x + portal.segment.b.x) / 2,
    portalFloor(level, portal) + height / 2,
    (portal.segment.a.z + portal.segment.b.z) / 2
  );
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.userData.kind = "portal";
  mesh.userData.portalId = portal.id;
  return mesh;
}

function createLevelMeshes(level, textures) {
  const root = new Group();
  root.name = "bridge-level";
  const materials = createMaterialCache(textures);
  const portalMeshes = new Map();

  level.spaces.forEach((space) => {
    root.add(horizontalMesh(space, space.floor, materials.get(space.floorMaterial, space.light, "floor")));
    root.add(horizontalMesh(space, space.ceiling, materials.get(space.ceilingMaterial, Math.min(1, space.light + 0.12), "ceiling"), true));
  });

  level.walls.forEach((wall) => {
    const space = level.spaces.find((entry) => entry.id === wall.spaceId);
    const light = space ? space.light : 0.75;
    solidWallSegments(level, wall).forEach((segment) => {
      root.add(wallMesh(segment, wall.bottom, wall.top, materials.get(wall.material, light, "wall")));
    });
  });

  level.portals.forEach((portal) => {
    if (portal.kind === "open" || portal.kind === "stairs") return;
    const mesh = portalDoorMesh(level, portal, materials.get(portal.material, 0.82, "wall"));
    mesh.visible = !portal.initialOpen;
    portalMeshes.set(portal.id, mesh);
    root.add(mesh);
  });

  level.markers.filter((marker) => marker.type === "cover").forEach((marker) => {
    const mesh = new Mesh(
      new BoxGeometry(marker.radius * 2, 1.15, marker.radius * 2),
      materials.get("vault-wall", 0.66, "wall")
    );
    mesh.position.set(marker.position.x, marker.position.y + 0.575, marker.position.z);
    mesh.userData.kind = "cover";
    root.add(mesh);
  });

  function updatePortals(portalStates) {
    portalMeshes.forEach((mesh, id) => {
      const state = portalStates instanceof Map ? portalStates.get(id) : portalStates && portalStates[id];
      const open = typeof state === "boolean" ? state : Boolean(state && (state.open || state.isOpen));
      mesh.visible = !open;
    });
  }

  function destroy() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    for (const material of materials.values()) material.dispose();
    root.clear();
    portalMeshes.clear();
  }

  return { root, portalMeshes, updatePortals, destroy };
}

export { createLevelMeshes, solidWallSegments };
