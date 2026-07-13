import test from "node:test";
import assert from "node:assert/strict";
import { FULL_LEVEL, SLICE_LEVEL } from "../src/core/simulator/level.js";
import { moveActor, spaceAtPoint } from "../src/core/simulator/collision.js";
import { validateLevel } from "../src/core/simulator/validateLevel.js";

test("full and slice level manifests validate their declared scopes", () => {
  const slice = validateLevel(SLICE_LEVEL);
  const full = validateLevel(FULL_LEVEL);
  assert.equal(slice.valid, true, slice.errors.join("\n"));
  assert.equal(full.valid, true, full.errors.join("\n"));
  assert.deepEqual(slice.metrics, {
    spaces: 7,
    primarySpaces: 7,
    portals: 7,
    markers: 23,
    ordinaryEnemies: 7,
    reachableSpaces: 7,
  });
  assert.equal(full.metrics.spaces, 12);
  assert.equal(full.metrics.ordinaryEnemies, 20);
  assert.equal(full.metrics.reachableSpaces, 12);
  [SLICE_LEVEL, FULL_LEVEL].forEach((level) => {
    assert.equal(
      level.markers.some((marker) => marker.type === "secret"),
      false,
      `${level.id} must not contain secret pickups`
    );
    assert.equal(
      level.markers.some((marker) => marker.pickupKind === "system-notes"),
      false,
      `${level.id} must not contain System Notes pickups`
    );
  });
});

test("validation catches a missing required slip and unreachable exit", () => {
  const broken = structuredClone(SLICE_LEVEL);
  broken.markers = broken.markers.filter((marker) => marker.id !== "review-slip-a");
  broken.portals = broken.portals.filter((portal) => portal.id !== "vault-to-results");
  const result = validateLevel(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("review slip")));
  assert.ok(result.errors.some((error) => error.includes("Exit is unreachable")));
});

test("2.5-D movement crosses an open doorway and respects a closed gate", () => {
  const actor = {
    position: { x: 13.4, y: 0, z: 35 },
    spaceId: "club-entrance",
    radius: FULL_LEVEL.rules.radius,
    height: FULL_LEVEL.rules.height,
    maxStep: FULL_LEVEL.rules.maxStep,
  };
  const throughDoor = moveActor(FULL_LEVEL, actor, { x: 1.2, z: 0 }, { portals: {} });
  assert.equal(throughDoor.spaceId, "movement-hall");
  assert.equal(throughDoor.collided, false);

  const gateActor = { ...actor, position: { x: 55.4, y: 0, z: 28 }, spaceId: "main-cardroom" };
  const blocked = moveActor(FULL_LEVEL, gateActor, { x: 1.2, z: 0 }, {
    portals: { "hub-to-vault": { open: false } },
  });
  assert.equal(blocked.spaceId, "main-cardroom");
  assert.equal(blocked.collided, true);
  const opened = moveActor(FULL_LEVEL, gateActor, { x: 1.2, z: 0 }, {
    portals: { "hub-to-vault": { open: true } },
  });
  assert.equal(opened.spaceId, "traveler-vault");
});

test("space lookup enforces floor and ceiling height", () => {
  assert.equal(spaceAtPoint(FULL_LEVEL, { x: 35, z: 54 }, { y: 0.35, height: 1.7 }).id, "wing-a-entry");
  assert.equal(spaceAtPoint(FULL_LEVEL, { x: 35, z: 54 }, { y: 4, height: 1.7 }), null);
});
