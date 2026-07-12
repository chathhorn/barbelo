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
