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

  await page.addInitScript(() => {
    const random = Math.random.bind(Math);
    let forcedOuroborosChoices = 2;
    Math.random = () => {
      if (forcedOuroborosChoices > 0) {
        forcedOuroborosChoices -= 1;
        return 0;
      }
      return random();
    };
  });
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => Boolean(window.PBNAnalyzer));
  const logoLaunch = page.locator(".brand-simulator-launch[data-simulator-open]");
  check(await page.locator("#pairReportBody [data-simulator-open]").count() === 0, "empty built report omits the simulator launch control");
  check(await logoLaunch.count() === 1 && !await logoLaunch.isDisabled(), "built ouroboros exposes the generic simulator on an empty app");
  await page.evaluate(() => document.getElementById("clearAppButton").click());
  check(!await logoLaunch.isDisabled(), "built Clear leaves the generic ouroboros launcher enabled");
  check(!await page.evaluate(() => Boolean(window.BridgeSimulator)), "simulator global is absent before the lazy bundle loads");
  check(!requests.some((url) => /bridge-simulator\.js/.test(url)), "built game bundle is absent before activation");
  await logoLaunch.click();
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => typeof window.BridgeSimulator.launch === "function"), "real built launch loads the narrow IIFE API");
  check(requests.some((url) => /assets\/bridge-simulator\.js/.test(url)), "real built launch requests the lazy game bundle");
  check(await page.evaluate(() => document.querySelector(".app-shell").inert), "real built launch makes the app shell inert");
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => document.activeElement?.matches(".brand-simulator-launch")), "real built launch restores focus to the ouroboros");

  await page.evaluate(async () => {
    const overlay = document.createElement("div");
    overlay.className = "bridge-simulator-overlay";
    const host = document.createElement("div");
    host.className = "bridge-simulator-host";
    host.style.height = "100%";
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    window.__builtSimulatorOverlay = overlay;
    window.__builtSimulator = await window.BridgeSimulator.launch(host, {
      levelId: "slice",
      assetBaseUrl: new URL("assets/simulator/", document.baseURI).href,
      version: "built-e2e",
    });
  });
  await page.waitForSelector(".simulator-preflight");
  check(await page.locator(".simulator-preflight").count() === 1, "built bundle reaches mission preflight");
  check(await page.locator(".simulator-clipboard").count() === 1, "built preflight displays the Coach's clipboard");
  const clipboardText = await page.locator(".simulator-clipboard").innerText();
  check(clipboardText.includes("Throwing hand") && clipboardText.includes("Composure"), "built preflight clipboard includes the mission hand and survival guidance");
  const preflightText = await page.locator(".simulator-preflight").innerText();
  const normalizedPreflightText = preflightText.toLowerCase();
  check(
    normalizedPreflightText.includes("bridge fundamentals · training deal") &&
      normalizedPreflightText.includes("three coaching wings, thirteen cards, and one bottom board."),
    "built preflight presents the generic bridge-fundamentals briefing"
  );
  check(!/session evidence|pair improvement report|loaded PBN|actual session/i.test(preflightText), "built preflight contains no session or report copy");
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
  check(!await page.locator(".simulator-hud-coach, [data-hud-notes]").count(), "built gameplay HUD omits the Coach portrait and System Notes meter");
  check(await page.evaluate(() =>
    !("systemNotes" in window.__builtSimulator.state.player) &&
    !window.__builtSimulator.level.markers.some((marker) => marker.pickupKind === "system-notes")
  ), "built simulation contains no System Notes armor or pickups");
  check(await page.evaluate(() =>
    !("secrets" in window.__builtSimulator.state) &&
    !("secrets" in window.__builtSimulator.state.progress) &&
    !window.__builtSimulator.level.markers.some((marker) => marker.type === "secret")
  ), "built simulation contains no secret pickups");
  check(await page.locator("[data-simulator-minimap-panel]").isVisible(), "built simulator starts with a visible minimap HUD");
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
    window.__builtSimulator.state.combat.nextCardIndex = 4;
    window.__builtSimulator.state.combat.shuffleRemaining = 0;
  });
  await page.keyboard.press("r");
  await page.waitForTimeout(80);
  check(
    await page.evaluate(() => window.__builtSimulator.state.combat.nextCardIndex === 0 && window.__builtSimulator.state.combat.shuffleRemaining > 0.75),
    "built simulator uses R for the one-second early shuffle"
  );
  check(await page.evaluate(() => {
    const hand = document.querySelector("[data-hud-hand]");
    const card = hand?.querySelector(".simulator-card");
    return hand?.dataset.shuffling === "true" &&
      getComputedStyle(card).animationName.includes("simulator-card-riffle");
  }), "built simulator animates the early shuffle");
  await page.keyboard.press("m");
  check(await page.locator("[data-simulator-minimap-panel]").isHidden(), "built simulator uses M to hide the minimap");
  await page.keyboard.press("m");
  check(await page.locator("[data-simulator-minimap-panel]").isVisible(), "built simulator uses M to show the minimap");

  await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  check(!await page.locator("[data-simulator-reset], [data-simulator-restart]").count(), "built Pause omits encounter/run reset actions");
  check(!await page.locator(".simulator-modal [data-simulator-close]").count(), "built Pause omits its redundant close action");
  await page.click("[data-simulator-resume]");

  await page.evaluate(() => { window.__builtSimulator.state.player.composure = 0; });
  await page.waitForSelector("#simulator-match-over-title");
  check(
    await page.getByRole("heading", { name: "Match over!", exact: true }).count() === 1 &&
      await page.getByRole("button", { name: "Try again?", exact: true }).count() === 1 &&
      !(await page.locator(".simulator-match-over").innerText()).includes("Coach has returned"),
    "built simulator presents the Match over retry screen at zero Composure"
  );
  await page.getByRole("button", { name: "Try again?", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-simulator-modal]").hidden);
  check(await page.evaluate(() => window.__builtSimulator.state.player.composure) === 100, "built retry resumes from a refreshed encounter checkpoint");

  await page.evaluate(() => window.__builtSimulator.finishRun());
  await page.waitForSelector("#simulator-debrief-title");
  const debriefText = await page.locator(".simulator-debrief").innerText();
  const normalizedDebriefText = debriefText.toLowerCase();
  check(
    normalizedDebriefText.includes("coach's notes") &&
      normalizedDebriefText.includes("auction: keep track of range, shape, fit, and which calls are forcing.") &&
      normalizedDebriefText.includes("next table habit"),
    "built debrief presents the generic Coach notes and next-table habit"
  );
  check(!/session evidence|pair improvement report|loaded PBN|actual session/i.test(debriefText), "built debrief contains no session or report copy");

  await page.evaluate(() => {
    window.__builtSimulator.destroy();
    window.__builtSimulatorOverlay.remove();
  });
  check(await page.evaluate(() => window.__builtSimulator.destroyed), "built simulator destroys its resources");
  check(requests.every((url) => new URL(url).origin === origin), "built run makes same-origin requests only");
  check(
    !requests.some((url) => /[?&](?:pair|session|report|board|hand)=/i.test(decodeURIComponent(url))),
    "built generic run puts no session or report inputs in request URLs"
  );
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
