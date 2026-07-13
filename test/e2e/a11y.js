import {
  REPO,
  closeServer,
  createCheckReporter,
  forceRandomChoices,
  loadPlaywright,
  originFor,
  serveStatic,
} from "./simulator-harness.js";
import { appBwsInput, appPbnInput } from "../fixtures/app-session.mjs";
const playwright = loadPlaywright();
if (!playwright) process.exit(0);
const { check, failures: problems } = createCheckReporter();
(async () => {
  const server = await serveStatic(REPO);
  const browser = await playwright.browserType.launch(playwright.launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await forceRandomChoices(page, [0]);
  await page.goto(originFor(server));
  check(
    await page.locator(".brand-simulator-launch").count() === 1 &&
      !await page.locator(".brand-simulator-launch").isDisabled() &&
      await page.locator("#pairReportBody [data-simulator-open]").count() === 0,
    "blank app exposes the generic simulator only through the semantic ouroboros"
  );
  await page.click(".brand-simulator-launch");
  await page.waitForSelector(".simulator-preflight");
  const blankSimulator = await page.evaluate(() => ({
    appInert: document.querySelector(".app-shell").inert,
    focusInside: document.querySelector(".bridge-simulator-overlay")?.contains(document.activeElement),
    generic: !/Pair\s+\d|session percentage|MP versus average|loaded PBN/i.test(
      document.querySelector(".simulator-preflight")?.textContent || ""
    ),
  }));
  check(
    blankSimulator.appInert && blankSimulator.focusInside && blankSimulator.generic,
    `blank-app generic simulator owns focus without report data (${JSON.stringify(blankSimulator)})`
  );
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(
    await page.evaluate(() => !document.querySelector(".app-shell").inert && document.activeElement?.matches(".brand-simulator-launch")),
    "blank-app simulator exit restores app interactivity and launch focus"
  );
  await page.setInputFiles("#resultsFile", appBwsInput());
  await page.waitForTimeout(400);
  await page.setInputFiles("#pbnFile", appPbnInput());
  await page.waitForTimeout(2200);

  // toast live region
  const toastAttrs = await page.evaluate(() => {
    const toast = document.getElementById("toast");
    return { live: toast.getAttribute("aria-live"), role: toast.getAttribute("role") };
  });
  check(toastAttrs.live === "polite" && toastAttrs.role === "status", `toast live region (${JSON.stringify(toastAttrs)})`);

  // overlay inert + focus containment
  await page.click('[data-task-view="overview"]');
  await page.waitForTimeout(300);
  await page.locator("[data-board-jump]:visible").first().click();
  await page.waitForTimeout(400);
  const inertOn = await page.evaluate(() => document.querySelector(".app-shell").inert === true);
  check(inertOn, "app shell inert while overlay open");
  let escaped = false;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    const inOverlay = await page.evaluate(() => document.getElementById("boardOverlay").contains(document.activeElement) || document.activeElement === document.body);
    if (!inOverlay) { escaped = true; break; }
  }
  check(!escaped, "tab stays inside overlay");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const inertOff = await page.evaluate(() => document.querySelector(".app-shell").inert === false);
  check(inertOff, "inert removed after close");

  // file label focus indicator
  await page.evaluate(() => document.getElementById("pbnFile").focus());
  const labelOutline = await page.evaluate(() => {
    const label = document.querySelector('label[for="pbnFile"]');
    return getComputedStyle(label).outlineStyle;
  });
  check(labelOutline !== "none", `file label shows focus outline (${labelOutline})`);

  // chart mark keyboard activation
  const markCount = await page.evaluate(() => document.querySelectorAll('.chart-board-mark[tabindex="0"], .chart-board-label[tabindex="0"]').length);
  check(markCount > 0, `chart marks focusable (${markCount})`);
  await page.evaluate(() => document.querySelector('#scoreChart .chart-board-mark[tabindex="0"], .chart-board-mark[tabindex="0"]').focus());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const overlayOpen = await page.evaluate(() => !document.getElementById("boardOverlay").classList.contains("hidden"));
  check(overlayOpen, "Enter on chart mark opens board overlay");
  await page.keyboard.press("Escape");

  // header controls live outside <summary> and are visible
  const controls = await page.evaluate(() => {
    const select = document.getElementById("reportPairSelect");
    const button = document.getElementById("downloadCsvButton");
    return {
      selectInSummary: !!select.closest("summary"),
      buttonInSummary: !!button.closest("summary"),
      selectVisible: select.getBoundingClientRect().height > 0
    };
  });
  check(!controls.selectInSummary && !controls.buttonInSummary, "controls moved out of <summary>");
  await page.click('[data-task-view="improve"]');
  await page.waitForTimeout(200);
  const selVisible = await page.evaluate(() => document.getElementById("reportPairSelect").getBoundingClientRect().height > 0);
  check(selVisible, "pair select still visible in header");

  // The generic Bridge Simulator remains independent of the report after app
  // data loads: the ouroboros is semantic and the compass stays static.
  check(await page.locator("#pairReportBody [data-simulator-open]").count() === 0, "loaded pair report still has no simulator launch control");
  await page.locator(".brand-simulator-launch").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const simulatorLaunch = await page.evaluate(() => {
    const button = document.querySelector(".brand-simulator-launch");
    const style = getComputedStyle(button);
    return {
      present: Boolean(button),
      tag: button?.tagName,
      type: button?.getAttribute("type"),
      disabled: button?.disabled,
      focused: document.activeElement === button,
      name: button?.getAttribute("aria-label"),
      outline: style.outlineStyle,
      ouroboros: document.body.classList.contains("mark-ouro"),
    };
  });
  check(
    simulatorLaunch.present && simulatorLaunch.tag === "BUTTON" && simulatorLaunch.type === "button" &&
      !simulatorLaunch.disabled && simulatorLaunch.focused && simulatorLaunch.name === "Open Bridge Simulator" &&
      simulatorLaunch.outline !== "none" && simulatorLaunch.ouroboros,
    `ouroboros simulator launch is semantic and focus-visible (${JSON.stringify(simulatorLaunch)})`
  );
  const compassState = await page.evaluate(async () => {
    const { setBrandMarkVariant } = await import("/src/ui/dom.js");
    setBrandMarkVariant(false);
    const button = document.querySelector(".brand-simulator-launch");
    button.click();
    return {
      compassVisible: getComputedStyle(document.querySelector(".mark-opt-pleroma")).display !== "none",
      buttonVisible: getComputedStyle(button).display !== "none",
      buttonDisabled: button.disabled,
      buttonHidden: button.getAttribute("aria-hidden"),
      overlay: Boolean(document.querySelector(".bridge-simulator-overlay")),
    };
  });
  check(
    compassState.compassVisible && !compassState.buttonVisible && compassState.buttonDisabled &&
      compassState.buttonHidden === "true" && !compassState.overlay,
    `compass mark is non-interactive and cannot launch (${JSON.stringify(compassState)})`
  );
  await page.evaluate(async () => {
    const { setBrandMarkVariant } = await import("/src/ui/dom.js");
    setBrandMarkVariant(true);
  });
  await page.click(".brand-simulator-launch");
  await page.waitForSelector(".simulator-preflight");
  const simulatorModal = await page.evaluate(() => ({
    visibleModals: [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter((element) => element.getClientRects().length).length,
    appInert: document.querySelector(".app-shell").inert,
    focusInside: document.querySelector(".bridge-simulator-overlay").contains(document.activeElement),
  }));
  check(
    simulatorModal.visibleModals === 1 && simulatorModal.appInert && simulatorModal.focusInside,
    `simulator launch owns one modal and focus (${JSON.stringify(simulatorModal)})`
  );
  const simulatorPreflight = await page.evaluate(() => ({
    startCount: document.querySelectorAll("[data-simulator-start]").length,
    startName: document.querySelector("[data-simulator-start]")?.textContent?.trim(),
    clipboardHeading: document.querySelector(".simulator-clipboard h3")?.textContent?.trim(),
    inlineSettings: document.querySelectorAll(".simulator-preflight [data-simulator-setting]").length,
  }));
  check(
    simulatorPreflight.startCount === 1 && simulatorPreflight.startName === "Start!" &&
      simulatorPreflight.clipboardHeading === "Coach's clipboard" && simulatorPreflight.inlineSettings === 0,
    `simulator preflight has one Start and semantic clipboard (${JSON.stringify(simulatorPreflight)})`
  );
  await page.click("[data-simulator-settings]");
  await page.waitForSelector("#simulator-settings-title");
  check(
    await page.evaluate(() => document.querySelector(".bridge-simulator-overlay").contains(document.activeElement)),
    "initial Settings keeps focus inside the simulator"
  );
  await page.click("[data-simulator-settings-close]");
  await page.waitForSelector(".simulator-preflight");
  check(await page.evaluate(() => document.activeElement?.matches("[data-simulator-settings]")), "Settings returns focus to its preflight button");
  let simulatorFocusEscaped = false;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    if (!await page.evaluate(() => document.querySelector(".bridge-simulator-overlay").contains(document.activeElement))) {
      simulatorFocusEscaped = true;
      break;
    }
  }
  check(!simulatorFocusEscaped, "tab stays inside the simulator overlay");
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(
    await page.evaluate(() => !document.querySelector(".app-shell").inert && document.activeElement?.matches(".brand-simulator-launch")),
    "simulator exit restores app interactivity and ouroboros focus"
  );

  // report headings descend both semantically and visually
  const headingHierarchy = await page.evaluate(() => {
    const report = document.querySelector("#pairReportDisclosure > summary h2");
    const section = document.querySelector("#rs-declared > summary h3");
    const nested = document.querySelector("#rs-declared .overtrick-meter h4");
    const summary = document.getElementById("rs-summary-title");
    const thisWeek = document.getElementById("rs-this-week-title");
    const size = (element) => element ? parseFloat(getComputedStyle(element).fontSize) : 0;
    const summaryStyle = summary ? getComputedStyle(summary) : null;
    return {
      tags: [report, section, nested, thisWeek].map((element) => element && element.tagName),
      sizes: [size(report), size(section), size(nested)],
      summaryExposed: Boolean(summaryStyle && summaryStyle.display !== "none" && summaryStyle.visibility !== "hidden")
    };
  });
  const [reportSize, sectionSize, nestedSize] = headingHierarchy.sizes;
  check(
    headingHierarchy.tags.join(",") === "H2,H3,H4,H3" &&
      reportSize > sectionSize && sectionSize > nestedSize && headingHierarchy.summaryExposed,
    `report heading hierarchy (${JSON.stringify(headingHierarchy)})`
  );
  const nestedSummaryControls = await page.evaluate(() =>
    document.querySelectorAll(".report-subsection > summary [tabindex], .report-subsection > summary a, .report-subsection > summary button, .report-subsection > summary input, .report-subsection > summary select, .report-subsection > summary textarea").length
  );
  check(nestedSummaryControls === 0, `report section headings contain no nested controls (${nestedSummaryControls})`);

  // tooltip escape dismissal
  await page.evaluate(() => {
    const tip = document.querySelector("[data-tooltip]");
    tip.focus();
  });
  await page.waitForTimeout(200);
  const tipShown = await page.evaluate(() => !document.getElementById("termTooltip").classList.contains("hidden"));
  await page.keyboard.press("Escape");
  const tipHidden = await page.evaluate(() => document.getElementById("termTooltip").classList.contains("hidden"));
  check(tipShown && tipHidden, `tooltip shows on focus and hides on Escape (${tipShown}/${tipHidden})`);

  // th scope coverage
  const scopes = await page.evaluate(() => {
    const all = document.querySelectorAll("th").length;
    const scoped = document.querySelectorAll("th[scope]").length;
    return { all, scoped };
  });
  check(scopes.scoped / scopes.all > 0.8, `th scope coverage ${scopes.scoped}/${scopes.all}`);

  await browser.close();
  await closeServer(server);
  console.log(problems.length ? `\nA11Y CHECK FAILED (${problems.length})` : "\nA11Y CHECK PASSED");
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e); process.exit(2); });
