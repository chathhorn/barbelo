"use strict";

// Optional production-bundle performance diagnostic. This is intentionally
// separate from the correctness E2E gates: headless/software-WebGL numbers are
// useful for regressions, but never count as the real-device acceptance run.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const SERVE_ROOT = path.resolve(process.env.SERVE_ROOT || path.join(REPO, "_site"));
const BROWSER_NAME = String(process.env.PLAYWRIGHT_BROWSER || "chromium").toLowerCase();
const SUPPORTED_BROWSERS = new Set(["chromium", "firefox", "webkit"]);
const HEADED = process.env.SIMULATOR_HEADED === "1";
const ENFORCE = process.env.SIMULATOR_ENFORCE_PERF === "1";
const BASELINE_SCENE = String(process.env.SIMULATOR_BASELINE_SCENE || "ordinary").toLowerCase();
const SUPPORTED_SCENES = new Set(["ordinary", "boss"]);
const SAMPLE_MS = boundedNumber(process.env.SIMULATOR_SAMPLE_MS, 5000, 2000, 120000);
const THRESHOLDS = Object.freeze({
  coldStartMs: boundedNumber(process.env.SIMULATOR_MAX_COLD_MS, 2000, 100, 60000),
  minimumFps: boundedNumber(process.env.SIMULATOR_MIN_FPS, 55, 1, 240),
  p95FrameMs: boundedNumber(process.env.SIMULATOR_MAX_P95_MS, 33.4, 4, 1000),
  drawCalls: boundedNumber(process.env.SIMULATOR_MAX_DRAW_CALLS, 99, 1, 10000),
});

let playwright;
let browserType;
try {
  playwright = require(path.join(REPO, "node_modules", "playwright"));
  browserType = playwright[BROWSER_NAME];
} catch (error) {
  console.log("SKIP: playwright not installed (npm install playwright)");
  process.exit(0);
}
if (!SUPPORTED_BROWSERS.has(BROWSER_NAME) || !browserType) {
  throw new Error(`Unsupported PLAYWRIGHT_BROWSER ${JSON.stringify(BROWSER_NAME)}; use chromium, firefox, or webkit.`);
}
if (!SUPPORTED_SCENES.has(BASELINE_SCENE)) {
  throw new Error(`Unsupported SIMULATOR_BASELINE_SCENE ${JSON.stringify(BASELINE_SCENE)}; use ordinary or boss.`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};

const CSV = `Board,PairNS,PairEW,NS/EW,Contract,Result
1,1,2,N,3 NT,=
1,3,4,N,3 NT,+1
1,5,6,N,3 NT,+1
2,1,2,N,2 S,+1
2,3,4,N,4 S,=
2,5,6,N,4 S,=
3,1,2,N,3 H X,-2
3,3,4,N,2 S,=
3,5,6,N,2 S,+1`;
const DEAL = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";
const PBN = [1, 2, 3].map((board) => `[Board "${board}"]\n[Deal "${DEAL}"]`).join("\n\n");

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function fileForRequest(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://local").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(SERVE_ROOT, relative);
  if (file !== SERVE_ROOT && !file.startsWith(`${SERVE_ROOT}${path.sep}`)) return null;
  return file;
}

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const file = fileForRequest(request.url);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      const body = fs.readFileSync(file);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.length,
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      });
      response.end(body);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarizeIntervals(intervals) {
  const valid = intervals.filter((value) => Number.isFinite(value) && value > 0);
  const sorted = [...valid].sort((a, b) => a - b);
  const total = valid.reduce((sum, value) => sum + value, 0);
  const mean = valid.length ? total / valid.length : null;
  return {
    samples: valid.length,
    durationMs: total,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    meanMs: mean,
    fps: mean ? 1000 / mean : null,
    over25ms: valid.filter((value) => value > 25).length,
    over50ms: valid.filter((value) => value > 50).length,
  };
}

function roundMetrics(value) {
  if (Array.isArray(value)) return value.map(roundMetrics);
  if (!value || typeof value !== "object") {
    return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(3)) : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, roundMetrics(entry)]));
}

function requiredBuildFilesExist() {
  return [
    "index.html",
    "assets/barbelo.js",
    "assets/bridge-simulator.js",
    "assets/simulator.css",
    "assets/simulator/coach/coach-idle-talk.svg",
  ].every((file) => fs.existsSync(path.join(SERVE_ROOT, file)));
}

async function measureFrames(page, durationMs, scene) {
  return page.evaluate(({ duration, sceneName }) => new Promise((resolve) => {
    const intervals = [];
    const canvas = document.querySelector("canvas.simulator-canvas");
    if (canvas) canvas.focus();
    const keyEvent = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      code,
      key,
    }));
    const activeKeys = sceneName === "boss"
      ? [["KeyW", "w"], ["ArrowLeft", "ArrowLeft"]]
      : [["KeyW", "w"], ["Space", " "]];
    activeKeys.forEach(([code, key]) => keyEvent("keydown", code, key));
    let started = null;
    let previous = null;
    const sample = (now) => {
      if (started == null) started = now;
      if (previous != null) intervals.push(now - previous);
      previous = now;
      if (now - started < duration) {
        requestAnimationFrame(sample);
        return;
      }
      activeKeys.forEach(([code, key]) => keyEvent("keyup", code, key));
      resolve({ intervals, wallTimeMs: now - started });
    };
    requestAnimationFrame(sample);
  }), { duration: durationMs, sceneName: scene });
}

let server = null;
let browser = null;
let context = null;
let page = null;
let exitCode = 0;
const failures = [];
const errors = [];
const requests = [];

function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
}

(async () => {
  if (!requiredBuildFilesExist()) {
    if (!process.env.SERVE_ROOT) {
      console.log("SKIP: built site not prepared (set SERVE_ROOT to a production build)");
      return;
    }
    throw new Error(`Built Bridge Simulator site not found at ${SERVE_ROOT}`);
  }

  server = await serve();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  browser = await browserType.launch({ headless: !HEADED });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.PBNAnalyzer));
  check(!await page.evaluate(() => Boolean(window.BridgeSimulator)), "simulator production global is cold before measurement");

  await page.evaluate(({ csv, pbn }) => {
    const api = window.PBNAnalyzer;
    const analysis = api.buildAnalysis(api.parsePbn(pbn, "performance-baseline.pbn"));
    const results = api.buildResultsAnalysis(api.parseResultsCsv(csv, "performance-baseline.csv", csv.length), analysis);
    const report = api.buildPairImprovementReport(results, "1");
    window.__simulatorPerformanceInputs = { analysis, results, report };
  }, { csv: CSV, pbn: PBN });

  const version = `performance-${Date.now()}`;
  const startup = await page.evaluate(async ({ cacheVersion }) => {
    const load = (element) => new Promise((resolve, reject) => {
      element.addEventListener("load", () => resolve(), { once: true });
      element.addEventListener("error", () => reject(new Error(`Failed to load ${element.href || element.src}`)), { once: true });
      document.head.appendChild(element);
    });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `assets/simulator.css?v=${encodeURIComponent(cacheVersion)}`;
    const script = document.createElement("script");
    script.src = `assets/bridge-simulator.js?v=${encodeURIComponent(cacheVersion)}`;
    const startedAt = performance.now();
    window.__simulatorPerformanceStartedAt = startedAt;
    await Promise.all([load(stylesheet), load(script)]);
    if (!window.BridgeSimulator || typeof window.BridgeSimulator.launch !== "function") {
      throw new Error("Production BridgeSimulator.launch was not installed by the built IIFE.");
    }
    const overlay = document.createElement("div");
    overlay.className = "bridge-simulator-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Bridge Simulator performance baseline");
    const host = document.createElement("div");
    host.className = "bridge-simulator-host";
    host.style.height = "100%";
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    window.__simulatorPerformanceOverlay = overlay;
    window.__simulatorPerformanceController = await window.BridgeSimulator.launch(
      host,
      window.__simulatorPerformanceInputs,
      {
        levelId: "full",
        assetBaseUrl: new URL("assets/simulator/", document.baseURI).href,
        version: cacheVersion,
      }
    );
    const preflightAt = performance.now();
    const resources = performance.getEntriesByType("resource")
      .filter((entry) => entry.startTime >= startedAt && /assets\/(?:bridge-simulator\.js|simulator\.css|simulator\/)/.test(entry.name))
      .map((entry) => ({
        name: new URL(entry.name).pathname,
        durationMs: entry.duration,
        transferSize: entry.transferSize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
      }));
    return {
      startedAt,
      preflightAt,
      coldStartMs: preflightAt - startedAt,
      resourceCount: resources.length,
      transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
      decodedBytes: resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      resources,
    };
  }, { cacheVersion: version });
  await page.waitForSelector(".simulator-preflight");

  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.check('[data-simulator-setting="skipTutorial"]');
  await page.click('[data-simulator-start="practice"]');
  await page.waitForSelector("canvas.simulator-canvas");
  const sceneSetup = await page.evaluate(async (scene) => {
    if (scene === "ordinary") {
      return {
        name: scene,
        performanceOnly: false,
        label: "Ordinary active gameplay start",
      };
    }

    // Performance-only deterministic setup: this deliberately bypasses
    // authored progression so the production renderer/simulation can be
    // sampled in the authored full-level boss arena. It is not a gameplay,
    // progression, combat-balance, or boss-correctness assertion.
    const app = window.__simulatorPerformanceController;
    const state = app.state;
    const objectives = state.level.objectives;
    const marker = (id) => state.level.markers.find((entry) => entry.id === id);
    const vault = marker(objectives.vaultMarkerId);
    const bossMarker = marker(objectives.bossMarkerId);
    const boss = state.enemies.find((enemy) => enemy.id === objectives.bossMarkerId);
    if (!boss || !vault || !bossMarker || state.levelId !== "bridge-simulator-full") {
      throw new Error("The performance-only boss scene requires the authored full level and bottom-board boss.");
    }
    const requiredSlipIds = [...objectives.requiredSlipIds];
    const requiredSlipSet = new Set(requiredSlipIds);
    state.progress.slips = objectives.requiredSlipCount;
    state.progress.collectedSlipIds = requiredSlipIds;
    state.progress.completedWings = [...objectives.wingIds];
    state.progress.bossActive = false;
    state.progress.bossDefeated = false;
    state.reviewSlips.forEach((slip) => {
      if (requiredSlipSet.has(slip.id)) {
        slip.collected = true;
        slip.active = true;
      }
    });
    const ordinaryEnemies = state.enemies.filter((enemy) => enemy.id !== boss.id);
    ordinaryEnemies.forEach((enemy) => {
      enemy.health = 0;
      enemy.alive = false;
      enemy.active = false;
    });
    state.player.position = { ...vault.position };
    state.player.spaceId = vault.spaceId;
    state.player.yaw = Math.atan2(
      bossMarker.position.z - vault.position.z,
      bossMarker.position.x - vault.position.x
    );
    state.player.composure = 100;
    state.projectiles.length = 0;
    boss.position = { ...boss.spawnPosition };
    boss.spaceId = boss.spawnSpaceId;
    boss.health = boss.maxHealth;
    boss.cooldown = 0;
    boss.state = "idle";
    boss.alerted = false;
    boss.active = false;
    boss.alive = true;
    boss.phase = 1;
    boss.lastSeenTick = -1;

    // A normal fixed simulation tick records the boss encounter checkpoint,
    // opens the slip-gated portal, and activates the boss. This verifies only
    // that the requested performance scene is live, not that progression is
    // achievable or correct.
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyW",
      key: "w",
    }));
    await new Promise((resolve, reject) => {
      let frames = 0;
      const waitForActivation = () => {
        frames += 1;
        if (state.progress.bossActive && state.encounter.kind === "boss" && boss.active && boss.alerted) {
          requestAnimationFrame(resolve);
          return;
        }
        if (frames >= 120) {
          reject(new Error("Timed out activating the performance-only authored boss scene."));
          return;
        }
        requestAnimationFrame(waitForActivation);
      };
      requestAnimationFrame(waitForActivation);
    }).finally(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "KeyW",
        key: "w",
      }));
    });
    return {
      name: scene,
      performanceOnly: true,
      label: "Performance-only deterministic authored boss-arena setup; not gameplay correctness",
      levelId: state.levelId,
      playerSpace: state.player.spaceId,
      bossId: boss.id,
      bossActive: state.progress.bossActive && boss.active && boss.alive,
      bossHudVisible: !document.querySelector("[data-hud-boss]")?.hidden,
      defeatedOrdinaryEnemies: ordinaryEnemies.length,
    };
  }, BASELINE_SCENE);
  if (BASELINE_SCENE === "boss") {
    check(sceneSetup.performanceOnly && sceneSetup.levelId === "bridge-simulator-full" && sceneSetup.playerSpace === "traveler-vault" && sceneSetup.bossActive && sceneSetup.bossHudVisible,
      "performance-only boss scene is placed and active before sampling (not gameplay correctness)");
  }
  await page.waitForTimeout(1000);
  const frameSamples = await measureFrames(page, SAMPLE_MS, BASELINE_SCENE);
  const frameMetrics = summarizeIntervals(frameSamples.intervals);

  const runtime = await page.evaluate(() => {
    const app = window.__simulatorPerformanceController;
    const boss = app.state.enemies.find((enemy) => enemy.archetype === "bottom-board");
    const canvas = document.querySelector("canvas.simulator-canvas");
    const gl = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    const debug = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const parameter = (key) => {
      try { return gl && key != null ? gl.getParameter(key) : null; } catch (error) { return null; }
    };
    return {
      renderer: app.renderer.resourceInfo(),
      simulation: {
        elapsedSeconds: app.state.elapsed,
        tick: app.state.tick,
        shotsFired: app.state.combat.shotsFired,
        playerSpace: app.state.player.spaceId,
        paused: app.paused,
        slowFrameOfferShown: Boolean(document.querySelector("#simulator-reduced-effects-title")),
        bossActive: Boolean(app.state.progress.bossActive && boss && boss.active && boss.alive),
        bossHealth: boss ? boss.health : null,
        bossPhase: boss ? boss.phase : null,
      },
      webgl: gl ? {
        context: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext
          ? "webgl2"
          : "webgl",
        vendor: parameter(debug && debug.UNMASKED_VENDOR_WEBGL) || parameter(gl.VENDOR),
        renderer: parameter(debug && debug.UNMASKED_RENDERER_WEBGL) || parameter(gl.RENDERER),
        version: parameter(gl.VERSION),
        shadingLanguageVersion: parameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: parameter(gl.MAX_TEXTURE_SIZE),
      } : null,
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemoryGb: navigator.deviceMemory || null,
        devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
      },
    };
  });

  const storedData = await page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .map((key) => [key, localStorage.getItem(key)])
  ));
  check(Object.keys(storedData).every((key) => key === "barbelo.bridgeSimulator.settings.v1"), "baseline persists preferences only");
  check(!/PairNS|AKQJ|performance-baseline/i.test(JSON.stringify(storedData)), "baseline never persists synthetic session data");
  check(requests.every((url) => new URL(url).origin === origin), "baseline requests remain same-origin");
  check(!requests.some((url) => /PairNS|AKQJ|performance-baseline/i.test(decodeURIComponent(url))), "baseline puts no session data in request URLs");

  const thresholdResults = {
    coldStart: startup.coldStartMs <= THRESHOLDS.coldStartMs,
    sustainedFps: frameMetrics.fps != null && frameMetrics.fps >= THRESHOLDS.minimumFps,
    p95Frame: frameMetrics.p95Ms != null && frameMetrics.p95Ms <= THRESHOLDS.p95FrameMs,
    drawCalls: runtime.renderer.calls <= THRESHOLDS.drawCalls,
  };
  if (ENFORCE) {
    Object.entries(thresholdResults).forEach(([name, passed]) => check(passed, `enforced performance threshold: ${name}`));
  }

  const destroyed = await page.evaluate(async () => {
    const app = window.__simulatorPerformanceController;
    const overlay = window.__simulatorPerformanceOverlay;
    if (app && typeof app.destroy === "function") app.destroy();
    if (overlay) overlay.remove();
    delete window.__simulatorPerformanceController;
    delete window.__simulatorPerformanceOverlay;
    delete window.__simulatorPerformanceInputs;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      controllerDestroyed: Boolean(app && app.destroyed),
      overlayCount: document.querySelectorAll(".bridge-simulator-overlay").length,
      pointerLocked: Boolean(document.pointerLockElement),
      controllerRaf: app ? app.raf : null,
    };
  });
  check(destroyed.controllerDestroyed && destroyed.overlayCount === 0 && !destroyed.pointerLocked && destroyed.controllerRaf === 0,
    "baseline destroys controller, animation loop, overlay, and Pointer Lock");
  check(errors.length === 0, `baseline has no console/page errors (${errors.join("; ")})`);

  const playwrightVersion = require(path.join(REPO, "node_modules", "playwright", "package.json")).version;
  const result = roundMetrics({
    classification: HEADED ? "headed-local-baseline" : "diagnostic-headless",
    realDeviceAcceptanceEligible: HEADED,
    note: HEADED
      ? "Headed output is acceptance-eligible only when the hardware/OS baseline and slower-device spot check are recorded."
      : "Diagnostic only: headless timing and software WebGL do not count as real-device performance acceptance.",
    scene: sceneSetup,
    serveRoot: SERVE_ROOT,
    browser: {
      name: BROWSER_NAME,
      version: browser.version(),
      playwrightVersion,
      headed: HEADED,
    },
    startup,
    gameplayFrames: {
      requestedSampleMs: SAMPLE_MS,
      observedWallTimeMs: frameSamples.wallTimeMs,
      ...frameMetrics,
    },
    renderer: runtime.renderer,
    simulation: runtime.simulation,
    webgl: runtime.webgl,
    environment: runtime.environment,
    thresholds: {
      enforced: ENFORCE,
      limits: THRESHOLDS,
      results: thresholdResults,
    },
    requestCount: requests.length,
    cleanup: destroyed,
  });

  console.log("\nBRIDGE SIMULATOR PRODUCTION PERFORMANCE BASELINE");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nSUMMARY: scene=${result.scene.name} cold=${result.startup.coldStartMs}ms median=${result.gameplayFrames.medianMs}ms p95=${result.gameplayFrames.p95Ms}ms fps=${result.gameplayFrames.fps} calls=${result.renderer.calls}`);
  if (!HEADED) console.log("DIAGNOSTIC ONLY: headless results are not real-device acceptance evidence.");
  if (!ENFORCE) console.log("THRESHOLDS NOT ENFORCED: set SIMULATOR_ENFORCE_PERF=1 to turn measured budget misses into failures.");

  if (failures.length) exitCode = 1;
})().catch((error) => {
  exitCode = 2;
  console.error("SIMULATOR PRODUCTION PERFORMANCE BASELINE CRASHED:", error);
}).finally(async () => {
  if (page && !page.isClosed()) {
    try {
      await page.evaluate(() => {
        const app = window.__simulatorPerformanceController;
        if (app && typeof app.destroy === "function") app.destroy();
        window.__simulatorPerformanceOverlay?.remove();
      });
    } catch (error) {
      // Best-effort cleanup continues with context/browser shutdown.
    }
  }
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await closeServer(server);
  process.exitCode = exitCode;
});
