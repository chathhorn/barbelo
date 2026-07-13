import test from "node:test";
import assert from "node:assert/strict";
import { FULL_LEVEL, SLICE_LEVEL } from "../src/core/simulator/level.js";
import { createSimulation, getSimulationSnapshot } from "../src/core/simulator/simulation.js";
import { WALL_DEPTH, createLevelMeshes, physicalWallSegments } from "../src/simulator/levelMeshes.js";
import { snapshotEntities } from "../src/simulator/renderer.js";
import { SPRITE_PATHS, spriteKeyForEntity, spriteSizeForEntity } from "../src/simulator/sprites.js";

const SCENARIO = Object.freeze({
  seed: "renderer-exit-test",
  representativeHand: null,
  wings: [{ slot: "A" }],
  boss: { title: "The Bottom Board" },
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
  const meshes = createLevelMeshes(SLICE_LEVEL, {});
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
  });

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

test("the authored next-round exit reaches the renderer as a visible door billboard", () => {
  const state = createSimulation({ scenario: SCENARIO, level: SLICE_LEVEL, mode: "practice" });
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
