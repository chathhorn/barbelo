"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const SERVE_ROOT = path.resolve(process.env.SERVE_ROOT || path.join(REPO, "_site"));
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
  ".md": "text/markdown; charset=utf-8",
};

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const file = path.join(SERVE_ROOT, pathname === "/" ? "index.html" : pathname);
      if (!file.startsWith(SERVE_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
2,5,6,N,4 S,=
3,1,2,N,3 H X,-2
3,3,4,N,2 S,=
3,5,6,N,2 S,+1`;
const DEAL = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";
const PBN = [1, 2, 3].map((board) => `[Board "${board}"]\n[Deal "${DEAL}"]`).join("\n\n");

const failures = [];
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
}

(async () => {
  if (!fs.existsSync(path.join(SERVE_ROOT, "assets", "barbelo.js")) ||
    !fs.existsSync(path.join(SERVE_ROOT, "assets", "bridge-simulator.js"))) {
    if (!process.env.SERVE_ROOT) {
      console.log("SKIP: built site not prepared (set SERVE_ROOT to require this gate)");
      process.exit(0);
    }
    throw new Error(`Built site not found at ${SERVE_ROOT}`);
  }
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
  await page.waitForFunction(() => Boolean(window.PBNAnalyzer));
  await page.setInputFiles("#resultsFile", { name: "built-simulator.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.setInputFiles("#pbnFile", { name: "built-simulator.pbn", mimeType: "text/plain", buffer: Buffer.from(PBN) });
  await page.waitForFunction(() => document.querySelectorAll(".priority-card").length > 0);
  const reportLaunch = page.locator("[data-simulator-open]");
  check(await reportLaunch.count() === 1, "built report exposes the simulator launch control");
  check(!await page.evaluate(() => Boolean(window.BridgeSimulator)), "simulator global is absent before the lazy bundle loads");
  check(!requests.some((url) => /bridge-simulator\.js/.test(url)), "built game bundle is absent before report activation");
  await reportLaunch.click();
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => typeof window.BridgeSimulator.launch === "function"), "real built launch loads the narrow IIFE API");
  check(requests.some((url) => /assets\/bridge-simulator\.js/.test(url)), "real built launch requests the lazy game bundle");
  check(await page.evaluate(() => document.querySelector(".app-shell").inert), "real built launch makes the app shell inert");
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => document.activeElement?.matches("[data-simulator-open]")), "real built launch restores focus to the report control");

  await page.evaluate(async ({ csv, pbn }) => {
    const api = window.PBNAnalyzer;
    const analysis = api.buildAnalysis(api.parsePbn(pbn, "built-simulator.pbn"));
    const results = api.buildResultsAnalysis(api.parseResultsCsv(csv, "built-simulator.csv", csv.length), analysis);
    const report = api.buildPairImprovementReport(results, "1");
    const overlay = document.createElement("div");
    overlay.className = "bridge-simulator-overlay";
    const host = document.createElement("div");
    host.className = "bridge-simulator-host";
    host.style.height = "100%";
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    window.__builtSimulatorOverlay = overlay;
    window.__builtSimulator = await window.BridgeSimulator.launch(host, { analysis, results, report }, {
      levelId: "slice",
      assetBaseUrl: new URL("assets/simulator/", document.baseURI).href,
      version: "built-e2e",
    });
  }, { csv: CSV, pbn: PBN });
  await page.waitForSelector(".simulator-preflight");
  check(await page.locator(".simulator-preflight").count() === 1, "built bundle reaches mission preflight");
  check(await page.locator(".simulator-clipboard").count() === 1, "built preflight displays the Coach's clipboard");
  const clipboardText = await page.locator(".simulator-clipboard").innerText();
  check(clipboardText.includes("Throwing hand") && clipboardText.includes("Composure"), "built preflight clipboard includes the mission hand and survival guidance");
  check(
    await page.locator("[data-simulator-start]").count() === 1 &&
      await page.getByRole("button", { name: "Start!", exact: true }).count() === 1,
    "built preflight exposes one Start! launcher"
  );
  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  await page.getByRole("button", { name: "Start!", exact: true }).click();
  await page.locator("canvas.simulator-canvas").focus();
  const startX = await page.evaluate(() => window.__builtSimulator.state.player.position.x);
  await page.keyboard.down("w");
  await page.waitForTimeout(250);
  await page.keyboard.up("w");
  const endX = await page.evaluate(() => window.__builtSimulator.state.player.position.x);
  check(endX > startX, "built simulator runs the fixed-step keyboard game loop");
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  check(await page.evaluate(() => window.__builtSimulator.state.combat.shotsFired) === 1, "built simulator throws a card");

  await page.evaluate(() => {
    window.__builtSimulator.destroy();
    window.__builtSimulatorOverlay.remove();
  });
  check(await page.evaluate(() => window.__builtSimulator.destroyed), "built simulator destroys its resources");
  check(requests.every((url) => new URL(url).origin === origin), "built run makes same-origin requests only");
  check(!requests.some((url) => /PairNS|AKQJ|built-simulator\.csv/.test(decodeURIComponent(url))), "built run puts no session data in request URLs");
  check(errors.length === 0, `built run has no console/page errors (${errors.join("; ")})`);

  await browser.close();
  server.close();
  console.log(failures.length
    ? `\nBUILT SIMULATOR E2E FAILED (${BROWSER_NAME}; ${failures.length})`
    : `\nBUILT SIMULATOR E2E PASSED (${BROWSER_NAME})`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("BUILT SIMULATOR E2E CRASHED:", error);
  process.exit(2);
});
