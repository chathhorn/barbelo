"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
let chromium;
try {
  ({ chromium } = require(path.join(REPO, "node_modules", "playwright")));
} catch (error) {
  console.log("SKIP: playwright not installed (npm install playwright)");
  process.exit(0);
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
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const file = path.join(REPO, pathname === "/" ? "index.html" : pathname);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404); response.end("not found"); return;
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      response.end(fs.readFileSync(file));
    });
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
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const requests = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.setInputFiles("#resultsFile", { name: "simulator.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.setInputFiles("#pbnFile", { name: "simulator.pbn", mimeType: "text/plain", buffer: Buffer.from(PBN) });
  await page.waitForFunction(() => document.querySelectorAll(".priority-card").length > 0);
  check(!await page.locator("[data-simulator-open]").count(), "Pair Improvement Report still has no simulator launch control");
  await page.locator("#clearAppButton").focus();

  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__bridgeSimulatorReturnFocus = document.activeElement;
    const [first, second] = await Promise.all([
      simulator.openBridgeSimulator({ levelId: "slice" }),
      simulator.openBridgeSimulator({ levelId: "slice" }),
    ]);
    window.__bridgeSimulatorTest = first;
    window.__bridgeSimulatorConcurrentController = first === second;
  });
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => window.__bridgeSimulatorConcurrentController), "concurrent opens share one controller");
  check(await page.locator(".bridge-simulator-overlay").getAttribute("role") === "dialog", "simulator opens as a modal dialog");
  check(await page.evaluate(() => document.querySelector(".app-shell").inert), "app shell is inert while simulator is open");

  await page.check('[data-simulator-setting="highContrast"]');
  check(await page.locator(".bridge-simulator-overlay").evaluate((element) => element.classList.contains("high-contrast")), "high contrast applies to the full simulator shell");
  await page.uncheck('[data-simulator-setting="highContrast"]');

  await page.click('[data-simulator-start="coach"]');
  check(await page.locator(".simulator-coaching-card").count() >= 4, "Coach-only path exposes all checkpoints and practice action");
  await page.click("[data-simulator-back-preflight]");

  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.check('[data-simulator-setting="skipTutorial"]');
  await page.click('[data-simulator-start="practice"]');
  await page.waitForSelector("canvas.simulator-canvas");
  const renderInfo = await page.evaluate(() => window.__bridgeSimulatorTest.renderer.resourceInfo());
  check(renderInfo.calls < 100, `retro renderer stays below 100 draw calls (${renderInfo.calls})`);
  const startX = await page.evaluate(() => window.__bridgeSimulatorTest.state.player.position.x);
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");
  const movedX = await page.evaluate(() => window.__bridgeSimulatorTest.state.player.position.x);
  check(movedX > startX + 0.5, `keyboard-only movement advances the player (${startX.toFixed(2)} -> ${movedX.toFixed(2)})`);
  const startYaw = await page.evaluate(() => {
    window.__bridgeSimulatorTest.input.setMode("mouse");
    return window.__bridgeSimulatorTest.state.player.yaw;
  });
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(180);
  await page.keyboard.up("ArrowRight");
  const fallbackYaw = await page.evaluate(() => {
    const yaw = window.__bridgeSimulatorTest.state.player.yaw;
    window.__bridgeSimulatorTest.input.setMode("keyboard");
    return yaw;
  });
  check(fallbackYaw > startYaw + 0.1, "arrow turning remains available when Mouse Lock is not acquired");
  if (process.env.SIMULATOR_SCREENSHOT) {
    await page.screenshot({ path: process.env.SIMULATOR_SCREENSHOT });
  }

  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  check(await page.evaluate(() => window.__bridgeSimulatorTest.state.combat.shotsFired) === 1, "Space throws one card");
  check((await page.locator("[data-hud-hand]").getAttribute("aria-label") || "").includes("♠"), "HUD exposes the hand values semantically");
  await page.waitForTimeout(120);
  const heldStart = await page.evaluate(() => window.__bridgeSimulatorTest.state.combat.shotsFired);
  await page.keyboard.down("Space");
  await page.waitForTimeout(700);
  await page.keyboard.up("Space");
  const heldEnd = await page.evaluate(() => window.__bridgeSimulatorTest.state.combat.shotsFired);
  check(heldEnd >= heldStart + 3, "held Space auto-throws at the combat cadence");

  await page.evaluate(() => {
    const app = window.__bridgeSimulatorTest;
    app.input.setMode("mouse");
    document.dispatchEvent(new Event("pointerlockerror"));
  });
  await page.waitForTimeout(220);
  const clickStart = await page.evaluate(() => window.__bridgeSimulatorTest.state.combat.shotsFired);
  await page.locator("canvas.simulator-canvas").click();
  await page.waitForTimeout(120);
  const clickEnd = await page.evaluate(() => {
    const count = window.__bridgeSimulatorTest.state.combat.shotsFired;
    window.__bridgeSimulatorTest.input.setMode("keyboard");
    return count;
  });
  check(clickEnd === clickStart + 1, "click still throws after Pointer Lock is denied");
  check((await page.locator("[data-simulator-caption]").innerText()).includes("Mouse Lock unavailable"), "Pointer Lock denial explains the fallback controls");

  await page.evaluate(() => { window.__bridgeSimulatorTest.state.combat.shuffleRemaining = 0.4; });
  await page.waitForTimeout(60);
  check(!await page.locator("[data-hud-shuffle]").evaluate((element) => element.hidden), "Shuffle lockout is visible in the HUD");
  check((await page.locator("[data-hud-hand]").getAttribute("aria-label") || "").includes("Shuffling"), "Shuffle state is announced semantically");
  await page.evaluate(() => { window.__bridgeSimulatorTest.state.combat.shuffleRemaining = 0; });

  await page.evaluate(() => {
    const state = window.__bridgeSimulatorTest.state;
    const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
    state.progress.bossActive = true;
    boss.active = true;
    boss.health = boss.maxHealth / 2;
    boss.phase = 2;
  });
  await page.waitForTimeout(60);
  check(!await page.locator("[data-hud-boss]").evaluate((element) => element.hidden), "active boss has a visible health meter");
  check((await page.locator("[data-hud-boss]").innerText()).toLowerCase().includes("phase 2"), "boss phase is visible without audio or effects");
  await page.evaluate(() => {
    const state = window.__bridgeSimulatorTest.state;
    state.progress.bossActive = false;
    state.enemies.find((enemy) => enemy.archetype === "bottom-board").active = false;
  });

  await page.evaluate(() => window.__bridgeSimulatorTest.processEvents([
    { type: "player-hit", composureLost: 0, practice: true },
  ]));
  check(!await page.locator("[data-simulator-damage]").evaluate((element) => element.classList.contains("active")), "Practice Mode suppresses false damage feedback");
  await page.evaluate(() => window.__bridgeSimulatorTest.processEvents([
    { type: "player-hit", composureLost: 7, absorbed: 3, practice: false },
  ]));
  check((await page.locator("[data-simulator-caption]").innerText()).includes("Composure -7"), "damage has a captioned non-color cue");

  await page.keyboard.press("h");
  await page.waitForSelector("#simulator-help-title");
  check((await page.locator(".simulator-modal").innerText()).includes("Throwing hand"), "Help keeps the throwing hand readable");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-simulator-modal]").hidden);

  await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "paused simulation stops scheduling render frames");
  await page.click("[data-simulator-help]");
  await page.waitForSelector("#simulator-help-title");
  await page.click("[data-simulator-help-close]");
  await page.waitForSelector("#simulator-pause-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "Help opened from Pause returns to the idle pause menu");
  await page.click("[data-simulator-help]");
  await page.waitForSelector("#simulator-help-title");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "Escape from paused Help also returns to Pause");
  await page.click("[data-simulator-resume]");

  await page.evaluate(() => {
    const state = window.__bridgeSimulatorTest.state;
    state.enemies.filter((enemy) => enemy.wingId === "a").forEach((enemy) => { enemy.alive = false; });
    const slip = state.reviewSlips[0];
    state.player.position = { ...slip.position };
    state.player.spaceId = slip.spaceId;
  });
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.press("e");
  await page.waitForSelector("#simulator-chalkboard-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.state.progress.slips) === 1, "chalkboard interaction immediately awards its Review Slip");
  check((await page.locator(".simulator-chalkboard").innerText()).includes("Session evidence"), "chalkboard exposes semantic session evidence");
  await page.click("[data-simulator-chalkboard-close]");
  const checkpointHonor = await page.evaluate(() => window.__bridgeSimulatorTest.state.player.honor);
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.press("e");
  await page.waitForSelector("#simulator-chalkboard-title");
  check((await page.locator("[data-simulator-chalkboard-close]").innerText()).toLowerCase().includes("return to mission"), "collected chalkboard evidence can be reopened");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.state.player.honor) === checkpointHonor, "reopening coaching cannot duplicate Honor");
  await page.click("[data-simulator-chalkboard-close]");

  await page.locator("canvas.simulator-canvas").evaluate((canvas) => {
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  await page.waitForSelector("#simulator-pause-title");
  check((await page.locator(".simulator-modal").innerText()).includes("fresh renderer"), "context loss exposes a real preflight recovery path");
  check(await page.locator('[data-simulator-start="coach"]').count() === 1, "context-loss pause offers Coach-only mode");
  await page.click("[data-simulator-back-preflight]");
  await page.waitForSelector(".simulator-preflight");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(!await page.evaluate(() => document.querySelector(".app-shell").inert), "exit restores app inert state");
  check(await page.evaluate(() => document.activeElement === window.__bridgeSimulatorReturnFocus), "exit restores focus to the launch origin");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.destroyed), "exit destroys the simulator controller");
  check(requests.every((url) => new URL(url).origin === `http://127.0.0.1:${port}`), "all requests remain same-origin");
  check(errors.length === 0, `browser run has no console/page errors (${errors.join("; ")})`);

  await page.locator("#clearAppButton").focus();
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__bridgeSimulatorFull = await simulator.openBridgeSimulator();
  });
  await page.waitForSelector(".simulator-preflight");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.check('[data-simulator-setting="skipTutorial"]');
  await page.click('[data-simulator-start="practice"]');
  await page.waitForSelector("canvas.simulator-canvas");
  const fullRenderInfo = await page.evaluate(() => window.__bridgeSimulatorFull.renderer.resourceInfo());
  check(fullRenderInfo.calls < 100, `full level stays below 100 draw calls (${fullRenderInfo.calls})`);
  for (const wingId of ["a", "b", "c"]) {
    await page.evaluate((wing) => {
      const state = window.__bridgeSimulatorFull.state;
      state.enemies.filter((enemy) => enemy.wingId === wing).forEach((enemy) => {
        enemy.alive = false;
        enemy.health = 0;
      });
      const slip = state.reviewSlips.find((entry) => entry.wingId === wing);
      state.player.position = { ...slip.position };
      state.player.spaceId = slip.spaceId;
    }, wingId);
    await page.locator("canvas.simulator-canvas").focus();
    await page.keyboard.press("e");
    await page.waitForSelector("#simulator-chalkboard-title");
    await page.click("[data-simulator-chalkboard-close]");
  }
  check(await page.evaluate(() => window.__bridgeSimulatorFull.state.progress.slips) === 3, "full level awards all three distinct Review Slips");
  await page.evaluate(() => {
    const state = window.__bridgeSimulatorFull.state;
    const boss = state.enemies.find((enemy) => enemy.archetype === "bottom-board");
    state.player.position = { x: 62, y: -0.2, z: 28 };
    state.player.spaceId = "traveler-vault";
    state.player.yaw = 0;
    boss.health = 1;
  });
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__bridgeSimulatorFull.state.progress.bossDefeated);
  check(await page.evaluate(() => window.__bridgeSimulatorFull.state.portalStates["vault-to-results"].open), "full level boss unlocks Move for the Next Round");
  await page.evaluate(() => {
    const state = window.__bridgeSimulatorFull.state;
    const exit = state.level.markers.find((marker) => marker.id === state.level.objectives.exitMarkerId);
    state.player.position = { ...exit.position };
    state.player.spaceId = exit.spaceId;
  });
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.press("e");
  await page.waitForSelector("#simulator-debrief-title");
  check(await page.locator(".simulator-debrief-panel").count() === 2, "debrief separates fictional simulation stats from the actual session");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => window.__bridgeSimulatorFull.destroyed), "full-level completion tears down cleanly");

  const failurePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await failurePage.goto(`http://127.0.0.1:${port}/`);
  await failurePage.setInputFiles("#resultsFile", { name: "simulator.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await failurePage.setInputFiles("#pbnFile", { name: "simulator.pbn", mimeType: "text/plain", buffer: Buffer.from(PBN) });
  await failurePage.waitForFunction(() => document.querySelectorAll(".priority-card").length > 0);
  await failurePage.locator("#clearAppButton").focus();
  await failurePage.route("**/assets/simulator.css*", (route) => route.abort());
  await failurePage.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__failureReturnFocus = document.activeElement;
    window.__failureController = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await failurePage.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(!await failurePage.evaluate(() => document.querySelector(".app-shell").inert), "lazy-load failure automatically restores report interactivity");
  check(await failurePage.evaluate(() => document.activeElement === window.__failureReturnFocus), "lazy-load failure restores launch focus");
  await failurePage.waitForFunction(() => document.querySelector("#toast").textContent.includes("could not start"));
  check((await failurePage.locator("#toast").innerText()).includes("could not start"), "lazy-load failure explains itself in the report toast");
  check(await failurePage.evaluate(() => window.__failureController === null), "lazy-load failure does not leak a controller");
  await failurePage.close();

  await browser.close();
  server.close();
  console.log(failures.length ? `\nSIMULATOR E2E FAILED (${failures.length})` : "\nSIMULATOR E2E PASSED");
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("SIMULATOR E2E CRASHED:", error);
  process.exit(2);
});
