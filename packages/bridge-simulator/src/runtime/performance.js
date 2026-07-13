const SLOW_FRAME_POLICY = Object.freeze({
  slowFrameSeconds: 1 / 24,
  maxTrackedFrameSeconds: 0.2,
  requiredSlowFrames: 90,
  requiredSlowSeconds: 4,
});

function createSlowFrameMonitor(policy = SLOW_FRAME_POLICY) {
  const limits = {
    slowFrameSeconds: Number(policy.slowFrameSeconds) || SLOW_FRAME_POLICY.slowFrameSeconds,
    maxTrackedFrameSeconds: Number(policy.maxTrackedFrameSeconds) || SLOW_FRAME_POLICY.maxTrackedFrameSeconds,
    requiredSlowFrames: Math.max(1, Math.floor(Number(policy.requiredSlowFrames) || SLOW_FRAME_POLICY.requiredSlowFrames)),
    requiredSlowSeconds: Math.max(0, Number(policy.requiredSlowSeconds) || SLOW_FRAME_POLICY.requiredSlowSeconds),
  };
  let slowFrames = 0;
  let slowSeconds = 0;
  let offered = false;

  function resetStreak() {
    slowFrames = 0;
    slowSeconds = 0;
  }

  function resetRun() {
    offered = false;
    resetStreak();
  }

  function sample(deltaSeconds, { active = true, visible = true } = {}) {
    if (offered) return false;
    const delta = Number(deltaSeconds);
    if (!active || !visible || !Number.isFinite(delta) ||
      delta < limits.slowFrameSeconds || delta > limits.maxTrackedFrameSeconds) {
      resetStreak();
      return false;
    }
    slowFrames += 1;
    slowSeconds += delta;
    if (slowFrames < limits.requiredSlowFrames || slowSeconds < limits.requiredSlowSeconds) return false;
    offered = true;
    resetStreak();
    return true;
  }

  function snapshot() {
    return { slowFrames, slowSeconds, offered, policy: { ...limits } };
  }

  return { sample, resetStreak, resetRun, snapshot };
}

export { SLOW_FRAME_POLICY, createSlowFrameMonitor };
