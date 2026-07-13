import test from "node:test";
import assert from "node:assert/strict";
import { FULL_LEVEL, SLICE_LEVEL } from "../src/core/level.js";
import { createSimulation, getSimulationSnapshot } from "../src/core/simulation.js";
import {
  WALL_DEPTH,
  WALL_TILE_SIZE,
  createLevelMeshes,
  physicalWallSegments,
} from "../src/runtime/levelMeshes.js";
import { snapshotEntities } from "../src/runtime/renderer.js";
import {
  SPRITE_PATHS,
  TILED_TEXTURE_KEYS,
  spriteKeyForEntity,
  spriteSizeForEntity,
} from "../src/runtime/sprites.js";
import { createTestScenario } from "./fixtures.mjs";

const SCENARIO = createTestScenario({
  seed: "renderer-exit-test",
});

function worldBounds(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox.clone();
  mesh.updateWorldMatrix(true, false);
  box.applyMatrix4(mesh.matrixWorld);
  return box;
}

function materialLuminance(material) {
  const { r, g, b } = material.color;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("floor and ceiling meshes occupy the same authored X/Z rooms", () => {
  const floorTexture = { id: "quiet-floor" };
  const ceilingTexture = { id: "quiet-ceiling" };
  const meshes = createLevelMeshes(SLICE_LEVEL, {
    carpetSuits: floorTexture,
    ceilingTile: ceilingTexture,
  });
  const floors = meshes.root.children.filter((child) => child.userData.kind === "floor");
  const ceilings = meshes.root.children.filter((child) => child.userData.kind === "ceiling");
  const wallBatches = meshes.root.children.filter((child) => child.userData.kind === "wall-batch");
  assert.equal(floors.length, SLICE_LEVEL.spaces.length);
  assert.equal(ceilings.length, floors.length);
  assert.equal(wallBatches.length, 1, "static walls share one grouped batch");

  floors.forEach((floor, index) => {
    const floorBounds = worldBounds(floor);
    const ceilingBounds = worldBounds(ceilings[index]);
    assert.ok(Math.abs(floorBounds.min.x - ceilingBounds.min.x) < 1e-6);
    assert.ok(Math.abs(floorBounds.max.x - ceilingBounds.max.x) < 1e-6);
    assert.ok(Math.abs(floorBounds.min.z - ceilingBounds.min.z) < 1e-6);
    assert.ok(Math.abs(floorBounds.max.z - ceilingBounds.max.z) < 1e-6);
    assert.equal(floor.material.map, floorTexture);
    assert.equal(ceilings[index].material.map, ceilingTexture);
  });

  assert.equal(SPRITE_PATHS.ceilingTile, "textures/ceiling-tile.svg");

  meshes.destroy();
});

test("shared room boundaries become one thick physical wall without covering portals", () => {
  const physical = physicalWallSegments(FULL_LEVEL);
  const byLine = new Map();
  physical.forEach((wall) => {
    const { a, b } = wall.segment;
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
    const coordinate = horizontal ? (a.z + b.z) / 2 : (a.x + b.x) / 2;
    const start = horizontal ? Math.min(a.x, b.x) : Math.min(a.z, b.z);
    const end = horizontal ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
    const key = `${horizontal ? "h" : "v"}:${coordinate.toFixed(5)}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push({ start, end });
  });
  byLine.forEach((segments, key) => {
    segments.sort((a, b) => a.start - b.start);
    for (let index = 1; index < segments.length; index += 1) {
      assert.ok(
        segments[index].start >= segments[index - 1].end - 1e-6,
        `${key} should not contain overlapping physical wall spans`
      );
    }
  });

  assert.ok(
    physical.some((wall) => wall.contributors.length > 1),
    "at least one shared boundary should be consolidated rather than drawn twice"
  );
  FULL_LEVEL.portals.forEach((portal) => {
    const midpoint = {
      x: (portal.segment.a.x + portal.segment.b.x) / 2,
      z: (portal.segment.a.z + portal.segment.b.z) / 2,
    };
    const covered = physical.some((wall) => {
      const { a, b } = wall.segment;
      const cross = (midpoint.x - a.x) * (b.z - a.z) - (midpoint.z - a.z) * (b.x - a.x);
      const dot = (midpoint.x - a.x) * (b.x - a.x) + (midpoint.z - a.z) * (b.z - a.z);
      const lengthSquared = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      return Math.abs(cross) < 1e-6 && dot > 1e-6 && dot < lengthSquared - 1e-6;
    });
    assert.equal(covered, false, `${portal.id} should remain cut out of the physical wall batch`);
  });

  const meshes = createLevelMeshes(FULL_LEVEL, {});
  const wallBatch = meshes.root.children.find((child) => child.userData.kind === "wall-batch");
  assert.equal(wallBatch.userData.depth, WALL_DEPTH);
  assert.equal(wallBatch.userData.physicalWallCount, physical.length);
  assert.equal(wallBatch.geometry.index.count, physical.length * 36, "each physical wall renders all six box faces");
  meshes.destroy();
});

test("long wall textures tile at a stable world scale instead of stretching per span", () => {
  const physical = physicalWallSegments(FULL_LEVEL);
  const longestIndex = physical.reduce((bestIndex, wall, index) => {
    const length = Math.hypot(wall.segment.b.x - wall.segment.a.x, wall.segment.b.z - wall.segment.a.z);
    const best = physical[bestIndex];
    const bestLength = Math.hypot(best.segment.b.x - best.segment.a.x, best.segment.b.z - best.segment.a.z);
    return length > bestLength ? index : bestIndex;
  }, 0);
  const longest = physical[longestIndex];
  const length = Math.hypot(
    longest.segment.b.x - longest.segment.a.x,
    longest.segment.b.z - longest.segment.a.z
  );
  const height = longest.top - longest.bottom;
  const ux = (longest.segment.b.x - longest.segment.a.x) / length;
  const uz = (longest.segment.b.z - longest.segment.a.z) / length;
  const expectedStart = (longest.segment.a.x * ux + longest.segment.a.z * uz) / WALL_TILE_SIZE;
  assert.ok(length > WALL_TILE_SIZE * 2, "fixture should exercise a wall spanning several texture tiles");

  const meshes = createLevelMeshes(FULL_LEVEL, {});
  const wallBatch = meshes.root.children.find((child) => child.userData.kind === "wall-batch");
  const uv = wallBatch.geometry.attributes.uv;
  // BoxGeometry allocates 24 vertices per wall; the final 8 are its two long,
  // room-facing surfaces. Both faces share the same world-scaled UV range.
  const faceStart = longestIndex * 24 + 16;
  for (let side = 0; side < 2; side += 1) {
    const values = Array.from({ length: 4 }, (_, offset) => ({
      u: uv.getX(faceStart + side * 4 + offset),
      v: uv.getY(faceStart + side * 4 + offset),
    }));
    const uSpan = Math.max(...values.map((value) => value.u)) - Math.min(...values.map((value) => value.u));
    const vSpan = Math.max(...values.map((value) => value.v)) - Math.min(...values.map((value) => value.v));
    assert.ok(Math.abs(Math.min(...values.map((value) => value.u)) - expectedStart) < 1e-5);
    assert.ok(Math.abs(uSpan - length / WALL_TILE_SIZE) < 1e-5);
    assert.ok(Math.abs(vSpan - height / WALL_TILE_SIZE) < 1e-5);
    assert.ok(uSpan > 2, "the wall should repeat its texture rather than stretch one copy");
  }
  [
    "feltWall",
    "auctionWall",
    "trickworksWall",
    "leadMineWall",
    "paperPanel",
    "chalkboard",
    "vaultDoor",
  ].forEach((key) => assert.ok(TILED_TEXTURE_KEYS.has(key), `${key} should use repeat wrapping`));
  meshes.destroy();
});

test("closed stair shortcuts render a barrier until their requirement opens", () => {
  const gateTexture = {};
  const meshes = createLevelMeshes(FULL_LEVEL, { vaultDoor: gateTexture });
  const shortcut = meshes.portalMeshes.get("wing-c-shortcut");

  assert.ok(shortcut, "the Lead Mines shortcut should have a rendered portal mesh");
  assert.equal(shortcut.visible, true, "the closed Lead Mines shortcut barrier should be visible");
  assert.equal(shortcut.material.map, gateTexture, "the closed shortcut should use the door texture");
  assert.equal(meshes.portalMeshes.has("hub-to-wing-c"), false, "permanently open stairs should not allocate a hidden barrier");

  meshes.updatePortals({ "wing-c-shortcut": { open: true } });
  assert.equal(shortcut.visible, false, "collecting the slip should remove the shortcut barrier");
  meshes.destroy();
});

test("wall and floor tints preserve readable ambient brightness", () => {
  const meshes = createLevelMeshes(SLICE_LEVEL, {});
  const walls = meshes.root.children.filter((child) => child.userData.kind === "wall-batch");
  const floors = meshes.root.children.filter((child) => child.userData.kind === "floor");
  const wallMaterials = walls.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
  const darkestWall = Math.min(...wallMaterials.map(materialLuminance));
  const darkestFloor = Math.min(...floors.map((mesh) => materialLuminance(mesh.material)));

  assert.ok(darkestWall > 0.45, `darkest wall tint should stay readable (${darkestWall.toFixed(3)})`);
  assert.ok(darkestFloor > 0.55, `darkest floor tint should stay readable (${darkestFloor.toFixed(3)})`);
  meshes.destroy();
});

test("coaching wings have distinct surface palettes and batched architectural silhouettes", () => {
  const wingSpaces = ["a", "b", "c"].map((wingId) =>
    FULL_LEVEL.spaces.filter((space) => space.wingId === wingId));
  const wallMaterials = wingSpaces.map((spaces) => new Set(spaces.map((space) => space.material)));
  const floorMaterials = wingSpaces.map((spaces) => new Set(spaces.map((space) => space.floorMaterial)));
  const ceilingMaterials = wingSpaces.map((spaces) => new Set(spaces.map((space) => space.ceilingMaterial)));

  assert.deepEqual(wallMaterials.map((materials) => [...materials]), [
    ["auction-wall"],
    ["trickworks-wall"],
    ["lead-mine-wall"],
  ]);
  assert.deepEqual(floorMaterials.map((materials) => [...materials]), [
    ["auction-carpet"],
    ["blue-carpet"],
    ["red-carpet"],
  ]);
  assert.deepEqual(ceilingMaterials.map((materials) => [...materials]), [
    ["auction-ceiling"],
    ["trickworks-ceiling"],
    ["lead-mine-ceiling"],
  ]);

  assert.equal(SPRITE_PATHS.auctionWall, "textures/auction-wall.svg");
  assert.equal(SPRITE_PATHS.trickworksWall, "textures/trickworks-wall.svg");
  assert.equal(SPRITE_PATHS.leadMineWall, "textures/lead-mine-wall.svg");

  const wingTextures = {
    a: { id: "auction-texture" },
    b: { id: "trickworks-texture" },
    c: { id: "lead-mine-texture" },
  };
  const meshes = createLevelMeshes(FULL_LEVEL, {
    auctionWall: wingTextures.a,
    trickworksWall: wingTextures.b,
    leadMineWall: wingTextures.c,
  });
  const decorations = meshes.root.children.filter((child) => child.userData.kind === "wing-decoration");
  assert.deepEqual(decorations.map((mesh) => mesh.userData.wingId), ["a", "b", "c"]);
  assert.deepEqual(decorations.map((mesh) => mesh.userData.decorationCount), [4, 3, 12]);
  decorations.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    assert.equal(materials.length, 1, `${mesh.userData.wingId} decorations should remain one draw-call group`);
    assert.equal(materials[0].map, wingTextures[mesh.userData.wingId]);
  });
  meshes.destroy();

  const sliceMeshes = createLevelMeshes(SLICE_LEVEL, {});
  const sliceDecorations = sliceMeshes.root.children.filter((child) => child.userData.kind === "wing-decoration");
  assert.deepEqual(sliceDecorations.map((mesh) => mesh.userData.wingId), ["a"]);
  sliceMeshes.destroy();
});

test("the authored next-round exit reaches the renderer as a visible door billboard", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL });
  const snapshot = getSimulationSnapshot(state);
  const marker = SLICE_LEVEL.markers.find((entry) => entry.id === SLICE_LEVEL.objectives.exitMarkerId);
  const exit = snapshotEntities(snapshot).find((entity) => entity.id === marker.id);

  assert.ok(exit, "the simulation snapshot should expose the authored exit marker");
  assert.equal(exit.kind, "exit");
  assert.equal(exit.label, "Move for the Next Round");
  assert.deepEqual(exit.position, marker.position);
  assert.equal(exit.active, true);
  assert.equal(exit.blocking, false);
  assert.equal(spriteKeyForEntity(exit), "vaultDoor");
  assert.deepEqual(spriteSizeForEntity(exit), { width: 1.6, height: 2.4 });
});

test("Coach poses render as upright human-scale billboards", () => {
  const idle = { kind: "coach", sprite: "coach-idle" };
  const point = { kind: "coach", sprite: "coach-point" };
  const victory = { kind: "coach", sprite: "coach-victory" };

  assert.equal(spriteKeyForEntity(idle), "coachIdle");
  assert.equal(spriteKeyForEntity(point), "coachPoint");
  assert.equal(spriteKeyForEntity(victory), "coachVictory");
  assert.deepEqual(spriteSizeForEntity(idle), { width: 1.15, height: 1.8 });
  assert.deepEqual(spriteSizeForEntity(point), { width: 1.35, height: 1.8 });
  assert.deepEqual(spriteSizeForEntity(victory), { width: 1.35, height: 1.8 });
});

test("hostile score slips use a larger warning-bordered projectile sprite", () => {
  const hostile = { kind: "score-slip", type: "score-slip", owner: "enemy" };
  const friendly = { kind: "card", type: "card", owner: "player" };

  assert.equal(SPRITE_PATHS.enemyProjectile, "cards/enemy-score-slip.svg");
  assert.equal(spriteKeyForEntity(hostile), "enemyProjectile");
  assert.deepEqual(spriteSizeForEntity(hostile), { width: 0.38, height: 0.48 });
  assert.notEqual(spriteKeyForEntity(hostile), spriteKeyForEntity(friendly));
});
