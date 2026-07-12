const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "KeyE", "Enter", "KeyR", "KeyH", "KeyM",
]);

function editableTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, button, summary, [contenteditable]"));
}

function createInputController({
  canvas,
  mode = "mouse",
  sensitivity = 0.0025,
  keyboardTurnSpeed = 2.2,
  onPause = () => {},
  onHelp = () => {},
  onMute = () => {},
} = {}) {
  const keys = new Set();
  const pressed = new Set();
  let mouseTurn = 0;
  let pointerWasAcquired = false;
  let destroyed = false;

  function onKeyDown(event) {
    if (editableTarget(event.target)) return;
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === "KeyH") onHelp();
    if (event.code === "KeyM") onMute();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (mode !== "mouse" || document.pointerLockElement !== canvas) return;
    mouseTurn += Number(event.movementX) || 0;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    if (mode === "mouse" && document.pointerLockElement !== canvas) {
      requestPointerLock();
      return;
    }
    pressed.add("Fire");
  }

  function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
      pointerWasAcquired = true;
      return;
    }
    if (mode === "mouse" && pointerWasAcquired && !destroyed) onPause("pointer-lock");
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function requestPointerLock() {
    if (mode !== "mouse" || !canvas || typeof canvas.requestPointerLock !== "function") return Promise.resolve(false);
    try {
      const result = canvas.requestPointerLock({ unadjustedMovement: false });
      return result && typeof result.then === "function"
        ? result.then(() => true).catch(() => false)
        : Promise.resolve(true);
    } catch (error) {
      try {
        canvas.requestPointerLock();
        return Promise.resolve(true);
      } catch (fallbackError) {
        return Promise.resolve(false);
      }
    }
  }

  function consume(code) {
    const had = pressed.has(code);
    pressed.delete(code);
    return had;
  }

  function sample(deltaSeconds) {
    const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
    const strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const keyboardTurn = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    const turn = mode === "mouse"
      ? mouseTurn * sensitivity
      : keyboardTurn * keyboardTurnSpeed * Math.max(0, Number(deltaSeconds) || 0);
    mouseTurn = 0;
    return {
      forward,
      strafe,
      turn,
      fire: consume("Fire") || consume("Space"),
      interact: consume("KeyE") || consume("Enter"),
      restart: consume("KeyR"),
    };
  }

  function setMode(nextMode) {
    mode = nextMode === "keyboard" ? "keyboard" : "mouse";
    pointerWasAcquired = false;
    if (mode === "keyboard" && document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function setSensitivity(next) {
    sensitivity = Math.max(0.0005, Math.min(0.008, Number(next) || sensitivity));
  }

  function destroy() {
    destroyed = true;
    keys.clear();
    pressed.clear();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("mousemove", onMouseMove, true);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove, true);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerlockchange", onPointerLockChange);

  return { sample, requestPointerLock, setMode, setSensitivity, destroy };
}

export { createInputController };
