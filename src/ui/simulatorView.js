// Lazy lifecycle bridge for the unlinked Bridge Simulator. This module is
// intentionally small enough to live in Barbelo's main bundle: the scenario
// builder, Three.js renderer, simulation, and assets load only when opened.
import { deployedVersion, showToast } from "./dom.js";

let preparedInputs = null;
let activeController = null;
let activeOverlay = null;
let activeOpenPromise = null;
let loadPromise = null;
let stylesheetPromise = null;
let returnFocus = null;
let openGeneration = 0;
let appShellPriorInert = null;
let bodyHadModalOpen = false;

function versionedUrl(path) {
  const url = new URL(path, document.baseURI);
  const version = deployedVersion();
  if (version) url.searchParams.set("v", version);
  return url.href;
}

function isBuiltSite() {
  return Boolean(document.querySelector('script[src*="assets/barbelo.js"]'));
}

function ensureStylesheet() {
  if (stylesheetPromise) return stylesheetPromise;
  stylesheetPromise = new Promise((resolve, reject) => {
    const href = versionedUrl("assets/simulator.css");
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find((link) => link.href === href);
    if (existing) {
      if (existing.sheet) resolve(existing);
      else if (existing.dataset.bridgeSimulatorState === "loading") {
        existing.addEventListener("load", () => resolve(existing), { once: true });
        existing.addEventListener("error", () => {
          stylesheetPromise = null;
          existing.remove();
          reject(new Error("Simulator styles failed to load."));
        }, { once: true });
      } else {
        existing.remove();
        stylesheetPromise = null;
        ensureStylesheet().then(resolve, reject);
      }
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.bridgeSimulatorStyles = "1";
    link.dataset.bridgeSimulatorState = "loading";
    link.addEventListener("load", () => {
      link.dataset.bridgeSimulatorState = "loaded";
      resolve(link);
    }, { once: true });
    link.addEventListener("error", () => {
      link.dataset.bridgeSimulatorState = "error";
      stylesheetPromise = null;
      link.remove();
      reject(new Error("Simulator styles failed to load."));
    }, { once: true });
    document.head.appendChild(link);
  });
  return stylesheetPromise;
}

async function loadSourceModule() {
  // Keeping the specifier in a variable prevents the main esbuild entry from
  // absorbing the simulator into Barbelo's eagerly loaded bundle.
  const moduleUrl = versionedUrl("src/simulator/index.js");
  return import(moduleUrl);
}

function loadBuiltBundle() {
  if (globalThis.BridgeSimulator && typeof globalThis.BridgeSimulator.launch === "function") {
    return Promise.resolve(globalThis.BridgeSimulator);
  }
  return new Promise((resolve, reject) => {
    const src = versionedUrl("assets/bridge-simulator.js");
    let script = [...document.scripts].find((entry) => entry.src === src);
    const failed = () => {
      if (script) script.dataset.bridgeSimulatorState = "error";
      if (script) script.remove();
      reject(new Error("Simulator code failed to load."));
    };
    const loaded = () => {
      if (script) script.dataset.bridgeSimulatorState = "loaded";
      if (globalThis.BridgeSimulator && typeof globalThis.BridgeSimulator.launch === "function") {
        resolve(globalThis.BridgeSimulator);
      } else {
        failed();
      }
    };
    if (script) {
      if (script.dataset.bridgeSimulatorState === "loading") {
        script.addEventListener("load", loaded, { once: true });
        script.addEventListener("error", failed, { once: true });
        return;
      }
      script.remove();
    }
    script = document.createElement("script");
    script.defer = true;
    script.src = src;
    script.dataset.bridgeSimulatorBundle = "1";
    script.dataset.bridgeSimulatorState = "loading";
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.appendChild(script);
  });
}

function loadSimulatorModule() {
  if (loadPromise) return loadPromise;
  loadPromise = (isBuiltSite() ? loadBuiltBundle() : loadSourceModule())
    .catch((error) => {
      loadPromise = null;
      throw error;
    });
  return loadPromise;
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "bridge-simulator-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Bridge Simulator");
  overlay.innerHTML = `
    <div class="bridge-simulator-frame">
      <header class="bridge-simulator-framebar">
        <div>
          <span class="bridge-simulator-eyebrow">Barbelo field training</span>
          <strong>Bridge Simulator: The Lost Matchpoints</strong>
        </div>
        <span class="bridge-simulator-global-status" role="status" aria-live="polite">Loading simulator...</span>
        <button type="button" class="bridge-simulator-exit" data-simulator-exit>Exit to report</button>
      </header>
      <div class="bridge-simulator-host" data-simulator-host>
        <div class="bridge-simulator-loading" role="status">
          <span class="bridge-simulator-loading-mark" aria-hidden="true">♠</span>
          <p>Shuffling the corridors...</p>
        </div>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-simulator-exit]")) closeBridgeSimulator();
  });
  overlay.addEventListener("keydown", trapOverlayFocus);
  return overlay;
}

function trapOverlayFocus(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeBridgeSimulator();
    return;
  }
  if (event.key !== "Tab" || !activeOverlay) return;
  const focusable = [...activeOverlay.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.closest("[hidden]") && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function prepareBridgeSimulator(analysis, results, report) {
  preparedInputs = results && report ? { analysis: analysis || null, results, report } : null;
  return Boolean(preparedInputs);
}

function bridgeSimulatorIsOpen() {
  return Boolean(activeOverlay && document.body.contains(activeOverlay));
}

async function openBridgeSimulatorOnce(options) {
  const generation = ++openGeneration;
  const quizOverlay = document.getElementById("quizOverlay");
  if (quizOverlay && !quizOverlay.classList.contains("hidden")) document.getElementById("quizOverlayClose")?.click();
  const boardOverlay = document.getElementById("boardOverlay");
  if (boardOverlay && !boardOverlay.classList.contains("hidden")) document.getElementById("boardOverlayClose")?.click();
  if (!returnFocus) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeOverlay = createOverlay();
  document.body.appendChild(activeOverlay);
  bodyHadModalOpen = document.body.classList.contains("modal-open");
  document.body.classList.add("modal-open");
  const appShell = document.querySelector(".app-shell");
  if (appShell) {
    appShellPriorInert = appShell.inert;
    appShell.inert = true;
  }
  const exit = activeOverlay.querySelector("[data-simulator-exit]");
  if (exit) exit.focus();

  const frozenInputs = preparedInputs;
  const status = activeOverlay.querySelector(".bridge-simulator-global-status");
  const host = activeOverlay.querySelector("[data-simulator-host]");
  try {
    const [, simulator] = await Promise.all([ensureStylesheet(), loadSimulatorModule()]);
    if (!bridgeSimulatorIsOpen() || generation !== openGeneration) return null;
    const launch = simulator.launch || (globalThis.BridgeSimulator && globalThis.BridgeSimulator.launch);
    if (typeof launch !== "function") throw new Error("Simulator launch API is unavailable.");
    const controller = await launch(host, frozenInputs, {
      ...options,
      version: deployedVersion(),
      assetBaseUrl: new URL("assets/simulator/", document.baseURI).href,
      onStatus(message) {
        if (status) status.textContent = message;
      },
      onRequestClose: closeBridgeSimulator,
    });
    if (!bridgeSimulatorIsOpen() || generation !== openGeneration) {
      if (controller && typeof controller.destroy === "function") controller.destroy();
      return null;
    }
    activeController = controller;
    if (status) status.textContent = "Ready";
    return activeController;
  } catch (error) {
    if (!bridgeSimulatorIsOpen() || generation !== openGeneration) return null;
    const message = error && error.message ? error.message : "The simulator could not start.";
    options.onError?.(error);
    closeBridgeSimulator();
    showToast(`Bridge Simulator could not start: ${message}`, "error");
    return null;
  }
}

async function openBridgeSimulator(options = {}) {
  if (!preparedInputs) throw new Error("Bridge Simulator needs a selected pair report.");
  if (bridgeSimulatorIsOpen()) return activeController || activeOpenPromise;
  const pending = openBridgeSimulatorOnce(options);
  activeOpenPromise = pending;
  try {
    return await pending;
  } finally {
    if (activeOpenPromise === pending) activeOpenPromise = null;
  }
}

function closeBridgeSimulator({ restoreFocus = true, preserveReturnFocus = false } = {}) {
  openGeneration += 1;
  if (activeController && typeof activeController.destroy === "function") {
    try {
      activeController.destroy();
    } catch (error) {
      // Cleanup remains best-effort; the overlay and inert state must always
      // be restored even if a renderer teardown hook fails.
    }
  }
  activeController = null;
  if (activeOverlay) activeOverlay.remove();
  activeOverlay = null;
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = Boolean(appShellPriorInert);
  appShellPriorInert = null;
  if (!bodyHadModalOpen) document.body.classList.remove("modal-open");
  bodyHadModalOpen = false;
  if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
  if (!preserveReturnFocus) returnFocus = null;
}

export {
  prepareBridgeSimulator,
  openBridgeSimulator,
  closeBridgeSimulator,
  bridgeSimulatorIsOpen,
};
