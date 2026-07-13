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

const COMPACT_CAPABILITY_REASON = "below the 960 × 540 CSS-pixel FPS minimum";

async function capabilitySnapshot(page) {
  return page.evaluate(() => {
    const app = window.__responsiveSimulator;
    const start = document.querySelector("[data-simulator-start]");
    const status = document.querySelector(".simulator-preflight [role=status]");
    return {
      available: app?.capability?.available ?? null,
      reason: app?.capability?.reason || "",
      startDisabled: start ? start.disabled : null,
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

    const start = document.querySelector("[data-simulator-start]");
    if (!start || start.disabled !== !available) return false;
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
  await page.locator("#clearAppButton").focus();
  await page.evaluate(async () => {
    const simulator = await import("/src/ui/simulatorView.js");
    window.__responsiveSimulator = await simulator.openBridgeSimulator({ levelId: "slice" });
  });
  await page.waitForSelector(".simulator-preflight");

  const start = page.locator("[data-simulator-start]");
  const initialCapability = await capabilitySnapshot(page);
  logCapability("initial desktop", initialCapability);
  const initialFpsReady = initialCapability.available === true
    && initialCapability.startDisabled === false;
  check(initialFpsReady, `desktop preflight enables the Start! launcher (reason: ${initialCapability.reason || "none"})`);
  if (!initialFpsReady) {
    console.error(`RESPONSIVE CAPABILITY REQUIREMENT FAILED: desktop FPS capability and Start! must be available; ${initialCapability.reason || "no capability reason was reported"}`);
    await browser.close();
    await closeServer(server);
    process.exit(1);
  }
  check(await page.getByRole("button", { name: "Start!", exact: true }).count() === 1, "preflight exposes one Start! action");
  check(await page.locator(".simulator-clipboard").count() === 1, "preflight displays the Coach's clipboard");
  await start.focus();

  await page.setViewportSize({ width: 640, height: 400 });
  const compactCapability = await waitForCapability(page, {
    available: false,
    reasonIncludes: COMPACT_CAPABILITY_REASON,
    label: "compact preflight",
  });
  check(await start.isDisabled(), "shrinking below 960 × 540 disables Start!");
  check(await page.evaluate(() => document.activeElement?.hasAttribute("data-simulator-settings")), "threshold change moves focus from disabled Start! to Settings");
  check(compactCapability.status.includes(COMPACT_CAPABILITY_REASON), "compact preflight explains the post-zoom minimum");

  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForCapability(page, {
    available: true,
    label: "restored desktop preflight",
  });
  check(!await start.isDisabled(), "growing back above the threshold reenables Start!");

  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  await page.selectOption('[data-simulator-setting="inputMode"]', "keyboard");
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  await start.click();
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
  check(await start.isDisabled(), "returning from the run applies the current compact capability to Start!");

  await page.setViewportSize({ width: 1280, height: 800 });
  await waitForCapability(page, {
    available: true,
    label: "second restored desktop preflight",
  });
  check(!await start.isDisabled(), "the same preflight responds to a second threshold crossing");

  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(await page.evaluate(() => window.__responsiveSimulator.destroyed), "responsive test exit destroys the controller cleanly");
  check(requests.every((url) => new URL(url).origin === origin), "responsive run makes same-origin requests only");
  check(errors.length === 0, `responsive run has no console/page errors (${errors.join("; ")})`);

  await browser.close();
  await closeServer(server);
  console.log(failures.length
    ? `\nSIMULATOR RESPONSIVE E2E FAILED (${BROWSER_NAME}; ${failures.length})`
    : `\nSIMULATOR RESPONSIVE E2E PASSED (${BROWSER_NAME})`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error("SIMULATOR RESPONSIVE E2E CRASHED:", error);
  process.exit(2);
});
