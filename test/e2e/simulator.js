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
  const browser = await browserType.launch(BROWSER_LAUNCH_OPTIONS);
  console.log(`BROWSER: ${BROWSER_NAME} ${browser.version()} (Playwright 1.61.1)`);
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
  const reportLaunch = page.locator("[data-simulator-open]");
  check(await reportLaunch.count() === 1, "Pair Improvement Report exposes one Bridge Simulator launch control");
  check(await reportLaunch.evaluate((button) => button.previousElementSibling?.matches("[data-quiz-open]")), "Bridge Simulator launch sits directly below Table Time");
  check(!requests.some((url) => /src\/simulator\/index\.js|vendor\/three\//.test(url)), "game engine remains unloaded before report activation");
  check(!await page.locator('link[href*="assets/simulator.css"]').count(), "simulator stylesheet remains unloaded before report activation");
  await reportLaunch.click();
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => document.querySelector(".app-shell").inert), "real report launch makes the app shell inert");
  check(requests.some((url) => /src\/simulator\/index\.js/.test(url)), "real report launch lazy-loads the simulator module");
  check(await page.locator('link[href*="assets/simulator.css"]').count() === 1, "real report launch lazy-loads simulator styles");
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => document.activeElement?.matches("[data-simulator-open]")), "real report launch restores focus to its control");

  const originalPair = await page.inputValue("#reportPairSelect");
  const selectedPair = await page.evaluate(() => {
    const select = document.getElementById("reportPairSelect");
    const next = [...select.options].find((option) => option.value !== select.value);
    return next ? { value: next.value, pairNo: next.textContent.match(/^Pair\s+([^\s(]+)/)?.[1] || "" } : null;
  });
  if (selectedPair) {
    await page.selectOption("#reportPairSelect", selectedPair.value);
    await page.click("[data-simulator-open]");
    await page.waitForSelector(".simulator-preflight");
    const missionChip = await page.locator(".simulator-mission-chip").textContent();
    check(missionChip.includes(`Pair ${selectedPair.pairNo}`), `pair change refreshes the real launch scenario (${missionChip})`);
    await page.click(".bridge-simulator-exit");
    await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
    await page.selectOption("#reportPairSelect", originalPair);
  }
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
  check(await page.locator('[data-simulator-start="standard"]').count() === 1, "preflight exposes one gameplay mode");
  check((await page.locator('[data-simulator-start="standard"]').textContent()).trim() === "Start!", "single gameplay button is labeled Start!");
  check(!await page.locator('[data-simulator-start="practice"], [data-simulator-start="coach"]').count(), "Practice and Coach-only launch modes are absent");
  const clipboardText = await page.locator(".simulator-clipboard").textContent();
  check(clipboardText.includes("Coach's clipboard") && clipboardText.includes("Throwing hand") && clipboardText.includes("WASD"), "Mission preflight displays the Coach's clipboard");
  const preflightText = await page.locator(".simulator-preflight-panel").innerText();
  check(!preflightText.includes("this greeting stays local") && !/Using .*hand from loaded PBN Board/i.test(preflightText), "Mission preflight omits internal greeting and hand-provenance copy");
  check(!await page.locator(".simulator-preflight [data-simulator-setting]").count(), "Mission preflight does not expose inline settings");

  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  check(await page.locator('[data-simulator-setting="inputMode"]').count() === 1, "initial Settings exposes input configuration");
  await page.check('[data-simulator-setting="highContrast"]');
  check(await page.locator(".bridge-simulator-overlay").evaluate((element) => element.classList.contains("high-contrast")), "high contrast applies to the full simulator shell");
  await page.uncheck('[data-simulator-setting="highContrast"]');
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => document.activeElement?.matches("[data-simulator-settings]")), "closing initial Settings restores Settings-button focus");

  await page.click('[data-simulator-start="standard"]');
  await page.waitForSelector("canvas.simulator-canvas");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.state.mode === "standard"), "Start! launches Standard rules");
  check(await page.locator("[data-simulator-minimap-panel]").isVisible(), "gameplay starts with a visible minimap HUD");
  const initialMinimapTransform = await page.locator("[data-minimap-player]").getAttribute("transform");
  check(initialMinimapTransform, "minimap exposes the player's position and facing");
  check(await page.locator("[data-minimap-hostiles] .simulator-minimap-hostile").count() > 0, "minimap plots active opponents");
  const renderInfo = await page.evaluate(() => window.__bridgeSimulatorTest.renderer.resourceInfo());
  check(renderInfo.calls < 100, `retro renderer stays below 100 draw calls (${renderInfo.calls})`);
  const startX = await page.evaluate(() => window.__bridgeSimulatorTest.state.player.position.x);
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(350);
  await page.keyboard.up("w");
  const movedX = await page.evaluate(() => window.__bridgeSimulatorTest.state.player.position.x);
  check(movedX > startX + 0.5, `keyboard-only movement advances the player (${startX.toFixed(2)} -> ${movedX.toFixed(2)})`);
  check(await page.locator("[data-minimap-player]").getAttribute("transform") !== initialMinimapTransform, "minimap player marker follows movement");
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
  check(!await page.locator("[data-simulator-damage]").evaluate((element) => element.classList.contains("active")), "zero-damage events suppress false damage feedback");
  await page.evaluate(() => window.__bridgeSimulatorTest.processEvents([
    { type: "coach-hit", entityId: "border-collie-coach", friendly: true },
  ]));
  check((await page.locator("[data-simulator-caption]").innerText()).includes("Partner! I’m on your side."), "friendly Coach impact has a concise caption");
  await page.evaluate(() => window.__bridgeSimulatorTest.processEvents([
    { type: "player-hit", composureLost: 7, absorbed: 3, practice: false },
  ]));
  check((await page.locator("[data-simulator-caption]").innerText()).includes("Composure -7"), "damage has a captioned non-color cue");

  await page.evaluate(() => { window.__bridgeSimulatorTest.state.player.composure = 0; });
  await page.waitForSelector("#simulator-match-over-title");
  check((await page.locator("#simulator-match-over-title").innerText()).toLowerCase() === "match over!", "zero Composure presents the Match over screen");
  check(await page.locator("[data-simulator-try-again]").textContent() === "Try again?", "Match over offers an explicit retry action");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "Match over stops the simulation loop");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.state.player.composure) === 100, "defeat prepares the encounter checkpoint for retry");
  await page.keyboard.press("Escape");
  check(await page.locator("#simulator-match-over-title").isVisible(), "Escape cannot bypass the Match over decision");
  await page.click("[data-simulator-try-again]");
  await page.waitForFunction(() => document.querySelector("[data-simulator-modal]").hidden);
  check(!await page.evaluate(() => window.__bridgeSimulatorTest.paused), "Try again resumes the reset encounter");

  const shortcutBaseline = await page.evaluate(() => {
    const app = window.__bridgeSimulatorTest;
    app.state.player.position.x += 0.75;
    app.state.combat.nextCardIndex = 4;
    app.state.combat.cooldown = 0;
    app.state.combat.shuffleRemaining = 0;
    return { x: app.state.player.position.x, muted: app.settings.muted };
  });
  await page.locator("canvas.simulator-canvas").focus();
  await page.keyboard.press("r");
  await page.keyboard.press("m");
  await page.waitForTimeout(80);
  const shortcutAfter = await page.evaluate(() => ({
    x: window.__bridgeSimulatorTest.state.player.position.x,
    muted: window.__bridgeSimulatorTest.settings.muted,
    cardIndex: window.__bridgeSimulatorTest.state.combat.nextCardIndex,
    shuffleRemaining: window.__bridgeSimulatorTest.state.combat.shuffleRemaining,
  }));
  check(Math.abs(shortcutAfter.x - shortcutBaseline.x) < 0.001 && shortcutAfter.cardIndex === 0, "R shuffles early without resetting the encounter");
  check(shortcutAfter.shuffleRemaining > 0.75, "R starts the one-second shuffle lockout");
  check(shortcutAfter.muted === shortcutBaseline.muted, "M is not bound to mute effects");
  check(await page.locator("[data-simulator-minimap-panel]").isHidden(), "M hides the minimap without muting effects");
  check(await page.locator("[data-simulator-minimap-toggle]").getAttribute("aria-pressed") === "false", "minimap toggle exposes its hidden state");
  await page.keyboard.press("m");
  check(await page.locator("[data-simulator-minimap-panel]").isVisible(), "M shows the minimap again");

  await page.keyboard.press("h");
  await page.waitForSelector("#simulator-help-title");
  const helpText = await page.locator(".simulator-modal").innerText();
  check(helpText.includes("Throwing hand"), "Help keeps the throwing hand readable");
  check(helpText.includes("R shuffles early"), "Coach's clipboard advertises the early-shuffle control");
  check(!helpText.includes("R resets") && !helpText.includes("M mutes"), "Coach's clipboard does not advertise removed shortcuts");
  check(await page.locator('[role="dialog"][aria-modal="true"]:visible').count() === 1, "Help keeps one unambiguous modal root");
  await page.locator("[data-simulator-help-close]").focus();
  await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.activeElement?.matches(".bridge-simulator-exit")), "Tab wraps from Help to the outer dialog's Exit control");
  await page.keyboard.press("Shift+Tab");
  check(await page.evaluate(() => document.activeElement?.matches("[data-simulator-help-close]")), "Shift-Tab wraps back into Help");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-simulator-modal]").hidden);

  await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "paused simulation stops scheduling render frames");
  check(!await page.locator("[data-simulator-reset], [data-simulator-restart]").count(), "Pause omits Reset encounter and Restart run actions");
  check(!await page.locator("[data-simulator-mute]").count(), "Pause no longer exposes a separate mute action");
  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  await page.check('[data-simulator-setting="muted"]');
  check(await page.evaluate(() => window.__bridgeSimulatorTest.settings.muted), "pause Settings applies mute without a keyboard binding");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector("#simulator-pause-title");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.raf === 0), "Settings opened from Pause returns to the idle pause menu");
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
  check(!await page.locator('[data-simulator-start="coach"]').count(), "context-loss pause does not restore the removed Coach-only mode");
  check(await page.locator("[data-simulator-settings]").count() === 1, "context-loss pause retains Settings access");
  await page.click("[data-simulator-back-preflight]");
  await page.waitForSelector(".simulator-preflight");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(!await page.evaluate(() => document.querySelector(".app-shell").inert), "exit restores app inert state");
  check(await page.evaluate(() => document.activeElement === window.__bridgeSimulatorReturnFocus), "exit restores focus to the launch origin");
  check(await page.evaluate(() => window.__bridgeSimulatorTest.destroyed), "exit destroys the simulator controller");
  const storedPreferences = await page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .map((key) => [key, localStorage.getItem(key)])
  ));
  check(Object.keys(storedPreferences).every((key) => key === "barbelo.bridgeSimulator.settings.v1"), "local storage contains preferences only");
  check(!/AKQJ|PairNS|simulator\.csv/.test(JSON.stringify(storedPreferences)), "uploaded session and hand data are never persisted");
  check(requests.every((url) => new URL(url).origin === `http://127.0.0.1:${port}`), "all requests remain same-origin");
  check(errors.length === 0, `browser run has no console/page errors (${errors.join("; ")})`);

  await page.locator("#clearAppButton").focus();
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__bridgeSimulatorFull = await simulator.openBridgeSimulator();
  });
  await page.waitForSelector(".simulator-preflight");
  await page.click("[data-simulator-settings]");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.click('[data-simulator-start="standard"]');
  await page.waitForSelector("canvas.simulator-canvas");
  const fullRenderInfo = await page.evaluate(() => window.__bridgeSimulatorFull.renderer.resourceInfo());
  check(fullRenderInfo.calls < 100, `full level stays below 100 draw calls (${fullRenderInfo.calls})`);
  const leadMinesBarrier = await page.evaluate(() => {
    let mesh = null;
    window.__bridgeSimulatorFull.renderer.scene.traverse((object) => {
      if (object.userData?.portalId === "wing-c-shortcut") mesh = object;
    });
    return { present: Boolean(mesh), visible: Boolean(mesh?.visible), textured: Boolean(mesh?.material?.map) };
  });
  check(
    leadMinesBarrier.present && leadMinesBarrier.visible && leadMinesBarrier.textured,
    `Lead Mines shortcut starts with a visible textured barrier (${JSON.stringify(leadMinesBarrier)})`
  );
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
  check(await page.evaluate(() => {
    let mesh = null;
    window.__bridgeSimulatorFull.renderer.scene.traverse((object) => {
      if (object.userData?.portalId === "wing-c-shortcut") mesh = object;
    });
    return window.__bridgeSimulatorFull.state.portalStates["wing-c-shortcut"].open && mesh && !mesh.visible;
  }), "Lead Mines slip opens the shortcut and removes its rendered barrier");
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
  check(await page.evaluate(() => {
    const app = window.__bridgeSimulatorFull;
    const exitId = app.state.level.objectives.exitMarkerId;
    return app.renderSnapshot().entities.some((entity) => entity.id === exitId && entity.kind === "exit");
  }), "Move for the Next Round is a visible rendered exit entity");
  await page.keyboard.down("w");
  await page.waitForFunction(() => {
    const player = window.__bridgeSimulatorFull.state.player;
    return player.spaceId === "results-posted" && player.position.x >= 79;
  }, null, { timeout: 6000 });
  await page.keyboard.up("w");
  await page.waitForFunction(() => document.querySelector("#simulator-objective")?.textContent.includes("Press Interact"));
  check((await page.locator("#simulator-objective").innerText()).toLowerCase().includes("press interact"), "exit proximity gives a visible Interact cue");
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

  // A 1280×800 desktop viewport at 200% zoom is approximately 640×400 CSS
  // pixels, so this exercises the post-zoom capability route directly.
  const compactPage = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const compactErrors = [];
  compactPage.on("console", (message) => { if (message.type() === "error") compactErrors.push(message.text()); });
  compactPage.on("pageerror", (error) => compactErrors.push(error.message));
  await compactPage.goto(`http://127.0.0.1:${port}/`);
  await compactPage.setInputFiles("#resultsFile", { name: "simulator.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await compactPage.waitForFunction(() => document.querySelectorAll(".priority-card").length > 0);
  await compactPage.locator("#clearAppButton").focus();
  await compactPage.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__compactReturnFocus = document.activeElement;
    window.__compactSimulator = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await compactPage.waitForSelector(".simulator-preflight");
  check(await compactPage.locator('[data-simulator-start="standard"]').isDisabled(), "post-zoom viewport below 960×540 disables Standard FPS");
  check(!await compactPage.locator('[data-simulator-start="practice"], [data-simulator-start="coach"]').count(), "compact viewport does not restore removed modes");
  check(!await compactPage.locator("[data-simulator-settings]").isDisabled(), "compact viewport retains Settings access");
  const compactPreflight = (await compactPage.locator(".simulator-preflight").innerText()).toLowerCase();
  check(compactPreflight.includes("below the 960 × 540"), "compact results-only preflight explains why Start is disabled");
  check(!compactPreflight.includes("practice deck") && !compactPreflight.includes("this greeting stays local"), "compact preflight omits internal provenance copy");
  check(compactPreflight.includes("coach's clipboard") && compactPreflight.includes("throwing hand"), "compact preflight retains the Coach's clipboard");
  await compactPage.click("[data-simulator-settings]");
  await compactPage.waitForSelector("#simulator-settings-title");
  check(await compactPage.locator(".bridge-simulator-overlay").evaluate((element) => element.scrollWidth <= element.clientWidth), "compact Settings remains horizontally readable at a 200% zoom-equivalent viewport");
  await compactPage.click("[data-simulator-settings-close]");
  await compactPage.waitForSelector(".simulator-preflight");
  await compactPage.keyboard.press("Escape");
  await compactPage.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await compactPage.evaluate(() => document.activeElement === window.__compactReturnFocus), "compact preflight exit restores focus");
  check(compactErrors.length === 0, `compact preflight run has no console/page errors (${compactErrors.join("; ")})`);
  await compactPage.close();

  await browser.close();
  server.close();
  console.log(failures.length
    ? `\nSIMULATOR E2E FAILED (${BROWSER_NAME}; ${failures.length})`
    : `\nSIMULATOR E2E PASSED (${BROWSER_NAME})`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("SIMULATOR E2E CRASHED:", error);
  process.exit(2);
});
