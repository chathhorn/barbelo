"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const BROWSER_NAME = String(process.env.PLAYWRIGHT_BROWSER || "chromium").toLowerCase();
const SUPPORTED_BROWSERS = new Set(["chromium", "firefox", "webkit"]);
let browserType;
try {
  const playwright = require(path.join(REPO, "node_modules", "playwright"));
  browserType = playwright[BROWSER_NAME];
} catch (error) {
  console.log("SKIP: playwright not installed (npm install playwright)");
  process.exit(0);
}
if (!SUPPORTED_BROWSERS.has(BROWSER_NAME) || !browserType) {
  throw new Error(`Unsupported PLAYWRIGHT_BROWSER ${JSON.stringify(BROWSER_NAME)}; use chromium, firefox, or webkit.`);
}
const BROWSER_LAUNCH_OPTIONS = BROWSER_NAME === "firefox"
  ? { firefoxUserPrefs: { "webgl.force-enabled": true } }
  : {};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const file = path.join(REPO, pathname === "/" ? "index.html" : pathname);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404); response.end("not found"); return;
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      response.end(fs.readFileSync(file));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const CSV = `Board,PairNS,PairEW,NS/EW,Contract,Result
1,1,2,N,3 NT,=
1,3,4,N,3 NT,+1
1,5,6,N,3 NT,+1
2,1,2,N,2 S,+1
2,3,4,N,4 S,=
2,5,6,N,4 S,=`;

const failures = [];
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
}

const COMPACT_CAPABILITY_REASON = "below the 960 × 540 CSS-pixel FPS minimum";

async function capabilitySnapshot(page) {
  return page.evaluate(() => {
    const app = window.__responsiveSimulator;
    const standard = document.querySelector('[data-simulator-start="standard"]');
    const status = document.querySelector(".simulator-preflight [role=status]");
    return {
      available: app?.capability?.available ?? null,
      reason: app?.capability?.reason || "",
      standardDisabled: standard ? standard.disabled : null,
      status: status?.textContent?.trim() || "",
    };
  });
}

function logCapability(label, state) {
  console.log(`CAPABILITY (${label}): ${JSON.stringify(state)}`);
}

async function waitForCapability(page, {
  available,
  reasonIncludes = "",
  expectPreflight = true,
  label,
}) {
  await page.waitForFunction(({ available, reasonIncludes, expectPreflight }) => {
    const app = window.__responsiveSimulator;
    if (!app || app.capability?.available !== available) return false;
    if (reasonIncludes && !String(app.capability.reason || "").includes(reasonIncludes)) return false;
    if (!expectPreflight) return true;

    const standard = document.querySelector('[data-simulator-start="standard"]');
    if (!standard || standard.disabled !== !available) return false;
    if (reasonIncludes) {
      const status = document.querySelector(".simulator-preflight [role=status]");
      if (!status?.textContent?.includes(reasonIncludes)) return false;
    }
    return true;
  }, { available, reasonIncludes, expectPreflight });
  const state = await capabilitySnapshot(page);
  logCapability(label, state);
  return state;
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const browser = await browserType.launch(BROWSER_LAUNCH_OPTIONS);
  console.log(`BROWSER: ${BROWSER_NAME} ${browser.version()} (Playwright 1.61.1)`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const requests = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto(`${origin}/`);
  await page.setInputFiles("#resultsFile", {
    name: "responsive-simulator.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await page.waitForFunction(() => document.querySelectorAll(".priority-card").length > 0);
  check(await page.locator("#pairReportBody [data-simulator-open]").count() === 0 &&
    await page.locator(".brand-simulator-launch").count() === 1,
  "responsive harness retains only the logo-based simulator route");
  await page.locator("#clearAppButton").focus();
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__responsiveSimulator = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await page.waitForSelector(".simulator-preflight");

  const standard = page.locator('[data-simulator-start="standard"]');
  const initialCapability = await capabilitySnapshot(page);
  logCapability("initial desktop", initialCapability);
  const initialFpsReady = initialCapability.available === true
    && initialCapability.standardDisabled === false;
  check(initialFpsReady, `desktop preflight enables the Start! launcher (reason: ${initialCapability.reason || "none"})`);
  if (!initialFpsReady) {
    console.error(`RESPONSIVE CAPABILITY REQUIREMENT FAILED: desktop FPS capability and Start! must be available; ${initialCapability.reason || "no capability reason was reported"}`);
    await browser.close();
    server.close();
    process.exit(1);
  }
  check(await page.getByRole("button", { name: "Start!", exact: true }).count() === 1, "preflight exposes one Start! action");
  check(await page.locator(".simulator-clipboard").count() === 1, "preflight displays the Coach's clipboard");
  await standard.focus();

  await page.setViewportSize({ width: 640, height: 400 });
  const compactCapability = await waitForCapability(page, {
    available: false,
    reasonIncludes: COMPACT_CAPABILITY_REASON,
    label: "compact preflight",
  });
  check(await standard.isDisabled(), "shrinking below 960 × 540 disables Start!");
  check(await page.evaluate(() => document.activeElement?.hasAttribute("data-simulator-settings")), "threshold change moves focus from disabled Start! to Settings");
  check(compactCapability.status.includes(COMPACT_CAPABILITY_REASON), "compact preflight explains the post-zoom minimum");

  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForCapability(page, {
    available: true,
    label: "restored desktop preflight",
  });
  check(!await standard.isDisabled(), "growing back above the threshold reenables Start!");

  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  await standard.click();
  await page.waitForSelector("canvas.simulator-canvas");
  await page.evaluate(() => { window.__responsiveOriginalState = window.__responsiveSimulator.state; });

  await page.setViewportSize({ width: 640, height: 400 });
  await waitForCapability(page, {
    available: false,
    reasonIncludes: COMPACT_CAPABILITY_REASON,
    expectPreflight: false,
    label: "compact active run",
  });
  check(await page.evaluate(() => {
    const app = window.__responsiveSimulator;
    return !app.destroyed && app.state === window.__responsiveOriginalState && Boolean(app.renderer && app.elements?.canvas);
  }), "an active run survives a later compact resize with state and renderer intact");

  const startX = await page.evaluate(() => window.__responsiveSimulator.state.player.position.x);
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(220);
  await page.keyboard.up("w");
  const endX = await page.evaluate(() => window.__responsiveSimulator.state.player.position.x);
  check(endX > startX, "the preserved active run remains playable below the later threshold");

  if (!await page.evaluate(() => window.__responsiveSimulator.paused)) await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  await page.click("[data-simulator-back-preflight]");
  await waitForCapability(page, {
    available: false,
    reasonIncludes: COMPACT_CAPABILITY_REASON,
    label: "compact return to preflight",
  });
  check(await standard.isDisabled(), "returning from the run applies the current compact capability to Start!");

  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForCapability(page, {
    available: true,
    label: "second restored desktop preflight",
  });
  check(!await standard.isDisabled(), "the same preflight responds to a second threshold crossing");

  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => window.__responsiveSimulator.destroyed), "responsive test exit destroys the controller cleanly");
  check(requests.every((url) => new URL(url).origin === origin), "responsive run makes same-origin requests only");
  check(errors.length === 0, `responsive run has no console/page errors (${errors.join("; ")})`);

  await browser.close();
  server.close();
  console.log(failures.length
    ? `\nSIMULATOR RESPONSIVE E2E FAILED (${BROWSER_NAME}; ${failures.length})`
    : `\nSIMULATOR RESPONSIVE E2E PASSED (${BROWSER_NAME})`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("SIMULATOR RESPONSIVE E2E CRASHED:", error);
  process.exit(2);
});
