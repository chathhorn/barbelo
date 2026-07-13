const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "KeyE", "Enter", "KeyH", "KeyR", "KeyM",
]);

function editableTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, button, summary, [contenteditable]"));
}

/**
 * @param {Object} [options]
 * @param {HTMLCanvasElement} [options.canvas]
 * @param {string} [options.mode]
 * @param {number} [options.sensitivity]
 * @param {number} [options.keyboardTurnSpeed]
 * @param {(reason?: string) => void} [options.onPause]
 * @param {() => void} [options.onHelp]
 * @param {() => void} [options.onMinimapToggle]
 * @param {() => void} [options.onPointerLockUnavailable]
 */
function createInputController({
  canvas,
  mode = "mouse",
  sensitivity = 0.0025,
  keyboardTurnSpeed = 2.2,
  onPause = () => {},
  onHelp = () => {},
  onMinimapToggle = () => {},
  onPointerLockUnavailable = () => {},
} = {}) {
  if (!canvas) throw new Error("Simulator input requires a canvas.");
  const keys = new Set();
  const pressed = new Set();
  let mouseTurn = 0;
  let mouseFiring = false;
  let pointerWasAcquired = false;
  let pointerLockUnavailable = false;
  let destroyed = false;

  function markPointerLockUnavailable() {
    if (pointerLockUnavailable) return;
    pointerLockUnavailable = true;
    pointerWasAcquired = false;
    onPointerLockUnavailable();
  }

  function onKeyDown(event) {
    if (editableTarget(event.target)) return;
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === "KeyH" && !event.repeat) onHelp();
    if (event.code === "KeyM" && !event.repeat) onMinimapToggle();
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
    if (mode === "mouse" && document.pointerLockElement !== canvas && !pointerLockUnavailable) {
      requestPointerLock().then((acquired) => {
        if (!acquired && !destroyed) pressed.add("Fire");
      });
      return;
    }
    mouseFiring = true;
    pressed.add("Fire");
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseFiring = false;
  }

  function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
      pointerLockUnavailable = false;
      pointerWasAcquired = true;
      return;
    }
    if (mode === "mouse" && pointerWasAcquired && !destroyed) onPause("pointer-lock");
  }

  function onPointerLockError() {
    if (mode === "mouse" && !destroyed) markPointerLockUnavailable();
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function requestPointerLock() {
    if (mode !== "mouse" || !canvas) return Promise.resolve(false);
    if (typeof canvas.requestPointerLock !== "function") {
      markPointerLockUnavailable();
      return Promise.resolve(false);
    }
    try {
      const result = canvas.requestPointerLock({ unadjustedMovement: false });
      return result && typeof result.then === "function"
        ? result.then(() => true).catch(() => {
          markPointerLockUnavailable();
          return false;
        })
        : Promise.resolve(true);
    } catch {
      try {
        canvas.requestPointerLock();
        return Promise.resolve(true);
      } catch {
        markPointerLockUnavailable();
        return Promise.resolve(false);
      }
    }
  }

  function releasePointerLock() {
    // Modal UI must never sit behind an active pointer lock. Reset the
    // acquisition flag first so our own release is not mistaken for the user
    // pressing Escape and does not open a second pause dialog.
    pointerWasAcquired = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
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
    const hasMouseLock = mode === "mouse" && document.pointerLockElement === canvas;
    // If Pointer Lock is denied or unavailable, the advertised arrow-key
    // turning remains a complete fallback even while Mouse Lock is selected.
    const turn = hasMouseLock
      ? mouseTurn * sensitivity
      : keyboardTurn * keyboardTurnSpeed * Math.max(0, Number(deltaSeconds) || 0);
    mouseTurn = 0;
    const pressedFire = consume("Fire") || consume("Space");
    return {
      forward,
      strafe,
      turn,
      fire: keys.has("Space") || mouseFiring || pressedFire,
      interact: consume("KeyE") || consume("Enter"),
      reload: consume("KeyR"),
    };
  }

  function setMode(nextMode) {
    mode = nextMode === "keyboard" ? "keyboard" : "mouse";
    pointerWasAcquired = false;
    mouseFiring = false;
    if (mode === "keyboard" && document.pointerLockElement === canvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function setSensitivity(next) {
    sensitivity = Math.max(0.0005, Math.min(0.008, Number(next) || sensitivity));
  }

  function clear() {
    keys.clear();
    pressed.clear();
    mouseTurn = 0;
    mouseFiring = false;
  }

  function destroy() {
    destroyed = true;
    clear();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    document.removeEventListener("pointerlockerror", onPointerLockError);
    releasePointerLock();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("mouseup", onMouseUp, true);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("pointerlockerror", onPointerLockError);

  return { sample, requestPointerLock, releasePointerLock, setMode, setSensitivity, clear, destroy };
}

export { createInputController };
