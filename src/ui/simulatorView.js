// Lazy lifecycle bridge for the unlinked Bridge Simulator. This module is
// intentionally small enough to live in Barbelo's main bundle: the scenario
// builder, Three.js renderer, simulation, and assets load only when opened.
import { deployedVersion } from "./dom.js";

let preparedInputs = null;
let activeController = null;
let activeOverlay = null;
let loadPromise = null;
let stylesheetPromise = null;
let returnFocus = null;

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
      else {
        existing.addEventListener("load", () => resolve(existing), { once: true });
        existing.addEventListener("error", () => reject(new Error("Simulator styles failed to load.")), { once: true });
      }
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.bridgeSimulatorStyles = "1";
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener("error", () => {
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
      if (script) script.remove();
      reject(new Error("Simulator code failed to load."));
    };
    const loaded = () => {
      if (globalThis.BridgeSimulator && typeof globalThis.BridgeSimulator.launch === "function") {
        resolve(globalThis.BridgeSimulator);
      } else {
        failed();
      }
    };
    if (script) {
      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", failed, { once: true });
      return;
    }
    script = document.createElement("script");
    script.defer = true;
    script.src = src;
    script.dataset.bridgeSimulatorBundle = "1";
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

async function openBridgeSimulator(options = {}) {
  if (!preparedInputs) throw new Error("Bridge Simulator needs a selected pair report.");
  if (bridgeSimulatorIsOpen()) return activeController;

  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeOverlay = createOverlay();
  document.body.appendChild(activeOverlay);
  document.body.classList.add("modal-open");
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = true;
  const exit = activeOverlay.querySelector("[data-simulator-exit]");
  if (exit) exit.focus();

  const frozenInputs = preparedInputs;
  const status = activeOverlay.querySelector(".bridge-simulator-global-status");
  const host = activeOverlay.querySelector("[data-simulator-host]");
  try {
    const [, simulator] = await Promise.all([ensureStylesheet(), loadSimulatorModule()]);
    if (!bridgeSimulatorIsOpen()) return null;
    const launch = simulator.launch || (globalThis.BridgeSimulator && globalThis.BridgeSimulator.launch);
    if (typeof launch !== "function") throw new Error("Simulator launch API is unavailable.");
    activeController = await launch(host, frozenInputs, {
      ...options,
      version: deployedVersion(),
      assetBaseUrl: new URL("assets/simulator/", document.baseURI).href,
      onStatus(message) {
        if (status) status.textContent = message;
      },
      onRequestClose: closeBridgeSimulator,
    });
    if (status) status.textContent = "Ready";
    return activeController;
  } catch (error) {
    if (!bridgeSimulatorIsOpen()) return null;
    if (status) status.textContent = "Simulator unavailable";
    host.innerHTML = `
      <section class="bridge-simulator-error" role="alert">
        <h2>The traveler vault jammed.</h2>
        <p>${escapeForMarkup(error && error.message ? error.message : "The simulator could not start.")}</p>
        <button type="button" data-simulator-retry>Try again</button>
      </section>
    `;
    const retry = host.querySelector("[data-simulator-retry]");
    if (retry) {
      retry.addEventListener("click", () => {
        closeBridgeSimulator({ restoreFocus: false });
        openBridgeSimulator(options);
      }, { once: true });
      retry.focus();
    }
    return null;
  }
}

function escapeForMarkup(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function closeBridgeSimulator({ restoreFocus = true } = {}) {
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
  if (appShell) appShell.inert = false;
  document.body.classList.remove("modal-open");
  if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
}

export {
  prepareBridgeSimulator,
  openBridgeSimulator,
  closeBridgeSimulator,
  bridgeSimulatorIsOpen,
};
