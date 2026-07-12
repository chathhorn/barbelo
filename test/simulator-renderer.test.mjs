import test from "node:test";
import assert from "node:assert/strict";
import { SLICE_LEVEL } from "../src/core/simulator/level.js";
import { createLevelMeshes } from "../src/simulator/levelMeshes.js";

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
