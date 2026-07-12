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

(async () => {
  const server = await serve();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const browser = await browserType.launch();
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
  check(await page.locator("[data-simulator-open]").count() === 1, "responsive harness retains the report launch control");
  await page.locator("#clearAppButton").focus();
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__responsiveSimulator = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await page.waitForSelector(".simulator-preflight");

  const standard = page.locator('[data-simulator-start="standard"]');
  const practice = page.locator('[data-simulator-start="practice"]');
  check(!await standard.isDisabled() && !await practice.isDisabled(), "desktop preflight enables Standard and Practice launchers");
  await standard.focus();

  await page.setViewportSize({ width: 640, height: 400 });
  await page.waitForFunction(() => {
    const standardButton = document.querySelector('[data-simulator-start="standard"]');
    const practiceButton = document.querySelector('[data-simulator-start="practice"]');
    return Boolean(standardButton?.disabled && practiceButton?.disabled);
  });
  check(await standard.isDisabled() && await practice.isDisabled(), "shrinking below 960 × 540 disables both FPS launchers");
  check(await page.evaluate(() => document.activeElement?.dataset.simulatorStart === "coach"), "threshold change moves focus from a disabled launcher to Coach-only");
  check((await page.locator(".simulator-preflight").innerText()).includes("below the 960 × 540"), "compact preflight explains the post-zoom minimum");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => {
    const standardButton = document.querySelector('[data-simulator-start="standard"]');
    const practiceButton = document.querySelector('[data-simulator-start="practice"]');
    return Boolean(standardButton && practiceButton && !standardButton.disabled && !practiceButton.disabled);
  });
  check(!await standard.isDisabled() && !await practice.isDisabled(), "growing back above the threshold reenables both FPS launchers");

  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.check('[data-simulator-setting="skipTutorial"]');
  await practice.click();
  await page.waitForSelector("canvas.simulator-canvas");
  await page.evaluate(() => { window.__responsiveOriginalState = window.__responsiveSimulator.state; });

  await page.setViewportSize({ width: 640, height: 400 });
  await page.waitForFunction(() => window.__responsiveSimulator.capability.available === false);
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
  await page.waitForFunction(() => document.querySelector('[data-simulator-start="standard"]')?.disabled);
  check(await standard.isDisabled() && await practice.isDisabled(), "returning from the run applies the current compact capability to preflight");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => !document.querySelector('[data-simulator-start="standard"]')?.disabled);
  check(!await standard.isDisabled() && !await practice.isDisabled(), "the same preflight responds to a second threshold crossing");

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
