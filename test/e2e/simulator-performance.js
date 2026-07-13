import {
  REPO,
  capturePageDiagnostics,
  closeServer,
  createCheckReporter,
  loadPlaywright,
  logBrowser,
  originFor,
  serveStatic,
} from "./simulator-harness.js";

const playwrightHarness = loadPlaywright();
if (!playwrightHarness) process.exit(0);
const {
  browserName: BROWSER_NAME,
  browserType,
  launchOptions: BROWSER_LAUNCH_OPTIONS,
} = playwrightHarness;
const { check, failures } = createCheckReporter();

async function feedSlowFrames(page, count) {
  await page.evaluate((samples) => {
    for (let index = 0; index < samples; index += 1) window.__performanceSimulator.recordFramePerformance(0.05);
  }, count);
}

async function stopAnimationLoopForSamples(page) {
  await page.evaluate(() => {
    const app = window.__performanceSimulator;
    if (app.raf) cancelAnimationFrame(app.raf);
    app.raf = 0;
    app.slowFrameMonitor.resetStreak();
  });
}

(async () => {
  const server = await serveStatic(REPO);
  const origin = originFor(server);
  const browser = await browserType.launch(BROWSER_LAUNCH_OPTIONS);
  logBrowser(browser, playwrightHarness);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const { errors, requests } = capturePageDiagnostics(page);

  await page.goto(`${origin}/`);
  await page.evaluate(async () => {
    const { setBrandMarkVariant } = await import("/src/ui/dom.js");
    setBrandMarkVariant(true);
  });
  check(await page.locator("#pairReportBody [data-simulator-open]").count() === 0 &&
    await page.locator(".brand-simulator-launch").count() === 1 &&
    !await page.locator(".brand-simulator-launch").isDisabled(),
  "blank app exposes the generic simulator only through the ouroboros");
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__performanceSimulator = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await page.waitForSelector(".simulator-preflight");
  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  await page.click("[data-simulator-start]");
  await page.waitForSelector("canvas.simulator-canvas");
  await page.evaluate(() => { window.__performanceRunOne = window.__performanceSimulator.state; });

  await stopAnimationLoopForSamples(page);
  await feedSlowFrames(page, 89);
  check(await page.locator("#simulator-reduced-effects-title").count() === 0, "89 slow frames do not trigger the conservative offer");
  await feedSlowFrames(page, 1);
  await page.waitForSelector("#simulator-reduced-effects-title");
  check(await page.locator('[aria-modal="true"]:visible').count() === 1, "offer keeps the existing outer aria-modal as the single visible modal root");
  const offerText = await page.locator(".simulator-modal").innerText();
  check(offerText.includes("all game rules stay exactly the same") && offerText.includes("about four seconds"), "offer explains its threshold and unchanged rules");
  check(await page.getByRole("button", { name: "Enable Reduced Effects", exact: true }).count() === 1, "offer exposes the explicit enable action");
  check(await page.getByRole("button", { name: "Keep Current Effects", exact: true }).count() === 1, "offer exposes the explicit keep action");
  check((await page.locator("[data-simulator-live]").innerText()).includes("game rules are unchanged"), "offer is announced through the live status");
  await page.keyboard.press("Escape");
  check(await page.locator("#simulator-reduced-effects-title").count() === 1, "Escape cannot silently choose or dismiss the explicit offer");

  await page.getByRole("button", { name: "Keep Current Effects", exact: true }).click();
  await page.waitForFunction(() => !window.__performanceSimulator.paused);
  check(await page.evaluate(() => window.__performanceSimulator.state === window.__performanceRunOne && !window.__performanceSimulator.settings.reducedEffects), "Keep Current Effects resumes the unchanged run without changing the preference");
  check((await page.locator("[data-simulator-live]").innerText()).includes("Current effects kept"), "keep action announces the clean resume");
  await feedSlowFrames(page, 180);
  check(await page.locator("#simulator-reduced-effects-title").count() === 0, "the same run never receives a second offer");

  await page.keyboard.press("Escape");
  await page.waitForSelector("#simulator-pause-title");
  await page.click("[data-simulator-back-preflight]");
  await page.click("[data-simulator-start]");
  await page.waitForSelector("canvas.simulator-canvas");
  await page.evaluate(() => { window.__performanceRunTwo = window.__performanceSimulator.state; });
  await stopAnimationLoopForSamples(page);
  await feedSlowFrames(page, 90);
  await page.waitForSelector("#simulator-reduced-effects-title");
  check(await page.evaluate(() => window.__performanceSimulator.state === window.__performanceRunTwo), "a new run can offer without replacing simulation state");

  await page.getByRole("button", { name: "Enable Reduced Effects", exact: true }).click();
  await page.waitForFunction(() => !window.__performanceSimulator.paused);
  check(await page.evaluate(() => {
    const app = window.__performanceSimulator;
    return app.settings.reducedEffects && app.state === window.__performanceRunTwo &&
      app.host.classList.contains("reduced-effects") &&
      Math.abs(app.renderer.scene.fog.density - 0.009) < 0.0001;
  }), "enable action changes presentation in place and resumes the same run");
  check((await page.locator("[data-simulator-live]").innerText()).includes("combat and game rules are unchanged"), "enable action announces unchanged rules and resume");
  check(await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    if (keys.length !== 1 || keys[0] !== "bridgeSimulator.settings.v1") return false;
    const settings = JSON.parse(localStorage.getItem(keys[0]));
    return settings.reducedEffects === true && !Object.keys(settings).some((key) => /frame|slow|offer|performance/i.test(key));
  }), "only the existing Reduced Effects preference is persisted; no performance history is stored");

  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => window.__performanceSimulator.destroyed), "performance offer run destroys cleanly");
  check(requests.every((url) => new URL(url).origin === origin), "performance run makes same-origin requests only");
  check(errors.length === 0, `performance run has no console/page errors (${errors.join("; ")})`);

  await browser.close();
  await closeServer(server);
  console.log(failures.length
    ? `\nSIMULATOR PERFORMANCE E2E FAILED (${BROWSER_NAME}; ${failures.length})`
    : `\nSIMULATOR PERFORMANCE E2E PASSED (${BROWSER_NAME})`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("SIMULATOR PERFORMANCE E2E CRASHED:", error);
  process.exit(2);
});
