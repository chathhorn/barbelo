import test from "node:test";
import assert from "node:assert/strict";
import { SLICE_LEVEL } from "../src/core/simulator/level.js";
import { createSimulation, getSimulationSnapshot } from "../src/core/simulator/simulation.js";
import { createLevelMeshes } from "../src/simulator/levelMeshes.js";
import { snapshotEntities } from "../src/simulator/renderer.js";
import { spriteKeyForEntity, spriteSizeForEntity } from "../src/simulator/sprites.js";

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
  assert.ok(wallBatches.length < SLICE_LEVEL.walls.length, "static walls are batched by material");

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

test("wall and floor tints preserve readable ambient brightness", () => {
  const meshes = createLevelMeshes(SLICE_LEVEL, {});
  const walls = meshes.root.children.filter((child) => child.userData.kind === "wall-batch");
  const floors = meshes.root.children.filter((child) => child.userData.kind === "floor");
  const darkestWall = Math.min(...walls.map((mesh) => materialLuminance(mesh.material)));
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
