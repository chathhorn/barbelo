import assert from "node:assert/strict";
import test from "node:test";
import { SLOW_FRAME_POLICY, createSlowFrameMonitor } from "../src/runtime/performance.js";

function feed(monitor, count, delta = 0.05, options) {
  let offered = false;
  for (let index = 0; index < count; index += 1) offered = monitor.sample(delta, options) || offered;
  return offered;
}

test("slow-frame offer requires the full conservative sustained threshold", () => {
  const monitor = createSlowFrameMonitor();
  assert.equal(feed(monitor, SLOW_FRAME_POLICY.requiredSlowFrames - 1), false);
  assert.equal(monitor.sample(0.05), true);
  assert.equal(monitor.snapshot().offered, true);
});

test("normal, isolated-long, and hidden frames break the slow streak", () => {
  const monitor = createSlowFrameMonitor();
  assert.equal(feed(monitor, 60), false);
  assert.equal(monitor.sample(1 / 60), false, "one normal frame resets the streak");
  assert.equal(feed(monitor, 89), false);
  assert.equal(monitor.sample(0.25), false, "a large stall is ignored instead of counted");
  assert.equal(feed(monitor, 89), false);
  assert.equal(monitor.sample(0.05, { active: true, visible: false }), false, "hidden-tab frames reset the streak");
  assert.equal(feed(monitor, 89), false);
  assert.equal(monitor.sample(0.05), true);
});

test("the offer latches once per run and resets only for a new run", () => {
  const monitor = createSlowFrameMonitor();
  assert.equal(feed(monitor, 90), true);
  assert.equal(feed(monitor, 180), false, "the same run cannot offer twice");
  monitor.resetStreak();
  assert.equal(feed(monitor, 90), false, "pause/resume streak reset does not clear the offer latch");
  monitor.resetRun();
  assert.equal(feed(monitor, 90), true, "a new run may offer once again");
});
