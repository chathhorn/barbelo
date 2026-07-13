import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REPO,
  capturePageDiagnostics,
  closeServer,
  createCheckReporter,
  forceRandomChoices,
  loadPlaywright,
  originFor,
  serveStatic,
} from "./simulator-harness.js";
import {
  APP_BWS_BYTES,
  APP_EXPECTED_PAIR_COUNT,
  APP_PBN_TEXT,
  appBwsInput,
  appPbnInput,
} from "../fixtures/app-session.mjs";
const playwright = loadPlaywright();
if (!playwright) process.exit(0);
const SERVE_ROOT = process.env.SERVE_ROOT || REPO;

const { check, failures: problems } = createCheckReporter();

(async () => {
  const server = await serveStatic(SERVE_ROOT);
  const browser = await playwright.browserType.launch(playwright.launchOptions);
  const page = await browser.newPage();
  const { errors: consoleErrors, requests } = capturePageDiagnostics(page);

  // 1. Load
  await forceRandomChoices(page, [0]);
  await page.goto(originFor(server));
  await page.waitForTimeout(300);
  check(consoleErrors.length === 0, `page loads without console errors (${consoleErrors.join("; ")})`);

  // The generic simulator is a blank-app easter egg. It must not depend on a
  // loaded report, even though the rest of this smoke continues with samples.
  const simulatorBefore = requests.filter((url) => /bridge-simulator\.js|packages\/bridge-simulator\/src\/index\.js/.test(url)).length;
  check(
    await page.locator("#pairReportBody [data-simulator-open]").count() === 0 &&
      !await page.locator(".brand-simulator-launch").isDisabled(),
    "blank app exposes the generic simulator only through the ouroboros"
  );
  await page.click(".brand-simulator-launch");
  await page.waitForSelector(".simulator-preflight");
  const simulatorLaunchCheck = await page.evaluate(() => ({
    overlay: Boolean(document.querySelector(".bridge-simulator-overlay")),
    inert: document.querySelector(".app-shell").inert,
    focused: document.querySelector(".bridge-simulator-overlay").contains(document.activeElement),
    starts: document.querySelectorAll("[data-simulator-start]").length,
    startName: document.querySelector("[data-simulator-start]")?.textContent?.trim(),
    clipboard: Boolean(document.querySelector(".simulator-clipboard")),
    generic: !/Pair\s+\d|session percentage|MP versus average|loaded PBN/i.test(
      document.querySelector(".simulator-preflight")?.textContent || ""
    ),
  }));
  const simulatorAfter = requests.filter((url) => /bridge-simulator\.js|packages\/bridge-simulator\/src\/index\.js/.test(url)).length;
  check(
    simulatorBefore === 0 && simulatorAfter > simulatorBefore && simulatorLaunchCheck.overlay && simulatorLaunchCheck.inert &&
      simulatorLaunchCheck.focused && simulatorLaunchCheck.starts === 1 && simulatorLaunchCheck.startName === "Start!" &&
      simulatorLaunchCheck.clipboard && simulatorLaunchCheck.generic,
    `blank-app simulator launch is lazy, generic, and modal (${JSON.stringify(simulatorLaunchCheck)})`
  );
  await page.click(".bridge-simulator-exit");
  await page.waitForFunction(() => !document.querySelector(".bridge-simulator-overlay"));
  check(
    await page.evaluate(() => document.activeElement?.matches(".brand-simulator-launch") && !document.querySelector(".app-shell").inert),
    "blank-app simulator exit restores ouroboros launch focus"
  );

  // 2. Load BWS only (results-only mode)
  await page.setInputFiles("#resultsFile", appBwsInput());
  await page.waitForTimeout(600);
  const metricVisible = await page.evaluate(() => {
    const grid = document.getElementById("metricGrid");
    return grid.children.length > 0 && grid.getBoundingClientRect().height > 0 && !grid.classList.contains("view-hidden");
  });
  check(metricVisible, "results-only summary metrics are visible");
  const pairOptions = await page.evaluate(() => document.getElementById("reportPairSelect").options.length);
  check(pairOptions > 0, `improvement report pair select populated (${pairOptions} options)`);
  const reportVisible = await page.evaluate(() => document.getElementById("pairReportBody").innerHTML.length > 500);
  check(reportVisible, "pair improvement report renders");
  await page.click('[data-task-view="results"]');
  await page.waitForTimeout(200);
  const standingsRows = await page.evaluate(() => document.querySelectorAll("#pairStandings .standings-table tbody tr").length);
  check(
    standingsRows === APP_EXPECTED_PAIR_COUNT,
    `pair standings shows all pairs (got ${standingsRows}, want ${APP_EXPECTED_PAIR_COUNT})`,
  );

  // 3. Add the PBN
  await page.setInputFiles("#pbnFile", appPbnInput());
  await page.waitForTimeout(600);
  const overviewOk = await page.evaluate(() => document.getElementById("metricGrid").children.length > 0);
  check(overviewOk, "overview metrics render with PBN loaded");
  const priorityCheck = await page.evaluate(() => {
    const card = document.querySelector(".priority-card");
    if (!card) return { ok: false, why: "no priority card" };
    const diffRows = card.querySelectorAll(".swing-diff-row");
    const hasDiff = diffRows.length === 2;
    const youScore = hasDiff ? diffRows[0].querySelector("b").textContent : "";
    const stats = card.querySelector(".priority-mini-stats");
    const mpMatch = stats && stats.textContent.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    return {
      ok: hasDiff && /^[+-]?\d+$/.test(youScore) && Boolean(mpMatch) && Number(mpMatch[1]) <= Number(mpMatch[2]),
      why: `diffRows=${diffRows.length} you=${youScore}`
    };
  });
  check(priorityCheck.ok, `priority card carries inline peer diff and sane MP (${priorityCheck.why || "ok"})`);
  const newSections = await page.evaluate(() =>
    ["rs-bidding", "rs-declared", "rs-defended", "rs-field", "rs-more"].filter((id) => !document.getElementById(id)));
  check(newSections.length === 0, `all report sections present (missing: ${newSections.join(",") || "none"})`);
  const thisWeekOk = await page.evaluate(() => {
    const card = document.querySelector(".this-week-card");
    return Boolean(card && card.querySelector(".loss-advice"));
  });
  check(thisWeekOk, "this-week card leads the report");
  const quizCheck = await page.evaluate(() => {
    const launch = document.querySelector("[data-quiz-open]");
    if (!launch) return { ok: false, why: "no launch button in This Week" };
    launch.click();
    const overlay = document.getElementById("quizOverlay");
    if (overlay.classList.contains("hidden")) return { ok: false, why: "overlay did not open" };
    const card = overlay.querySelector("[data-quiz-card]");
    if (!card) return { ok: false, why: "no card in overlay" };
    card.querySelector("[data-quiz-option]").click();
    const revealed = !overlay.querySelector(".quiz-reveal").classList.contains("hidden");
    const earned = overlay.querySelectorAll(".biscuit.earned").length;
    const boardJump = overlay.querySelector(".quiz-reveal [data-board-jump]");
    if (boardJump) boardJump.click();
    const boardOverlay = document.getElementById("boardOverlay");
    const boardStacked = Boolean(boardJump) && !boardOverlay.classList.contains("hidden") &&
      overlay.inert && !boardOverlay.inert && document.querySelector(".app-shell").inert;
    if (boardStacked) document.getElementById("boardOverlayClose").click();
    const quizRemainsModal = boardStacked && boardOverlay.classList.contains("hidden") &&
      !overlay.classList.contains("hidden") && !overlay.inert && document.querySelector(".app-shell").inert;
    const label1 = document.getElementById("quizOverlayCount").textContent;
    document.getElementById("quizNextButton").click();
    const label2 = document.getElementById("quizOverlayCount").textContent;
    const freshCard = overlay.querySelector("[data-quiz-card]");
    const secondUnanswered = freshCard && !freshCard.classList.contains("answered");
    document.getElementById("quizPrevButton").click();
    const backAnswered = overlay.querySelector("[data-quiz-card]").classList.contains("answered");
    document.getElementById("quizOverlayClose").click();
    const closed = overlay.classList.contains("hidden");
    const appRestored = !document.querySelector(".app-shell").inert;
    return {
      ok: revealed && earned === 1 && quizRemainsModal && label1 !== label2 && secondUnanswered && backAnswered && closed && appRestored,
      why: `revealed=${revealed} earned=${earned} stacked=${quizRemainsModal} nav=${label1}->${label2} second=${secondUnanswered} back=${backAnswered} closed=${closed} restored=${appRestored}`
    };
  });
  check(quizCheck.ok, `quiz overlay: answer, navigate, persist, close (${quizCheck.why})`);

  // 4. All views
  for (const view of ["overview", "improve", "boards", "results", "export", "diagnostics"]) {
    await page.click(`[data-task-view="${view}"]`);
    await page.waitForTimeout(150);
  }
  check(consoleErrors.length === 0, `view switching produces no errors (${consoleErrors.join("; ")})`);

  // 5. CSV preview
  await page.click('[data-task-view="export"]');
  await page.selectOption("#rowMode", "results");
  await page.waitForTimeout(300);
  const csvCheck = await page.evaluate(() => {
    const text = document.getElementById("csvPreview").textContent;
    return { hasContent: text.length > 100, undef: text.includes("undefined"), nan: /\bNaN\b/.test(text) };
  });
  check(csvCheck.hasContent && !csvCheck.undef && !csvCheck.nan,
    `CSV preview clean (content=${csvCheck.hasContent} undefined=${csvCheck.undef} NaN=${csvCheck.nan})`);

  // 6. Encoding: UTF-8 CSV without BOM
  const utf8Csv = path.join(os.tmpdir(), "barbelo-utf8-results.csv");
  fs.writeFileSync(utf8Csv, "Board,PairNS,PairEW,NS/EW,Contract,Result,Remarks\n1,1,2,N,3 NT,=,José & Müller\n1,3,4,N,3 NT,-1,\n");
  await page.setInputFiles("#resultsFile", utf8Csv);
  await page.waitForTimeout(500);
  const hasMojibake = await page.evaluate(() => document.body.innerHTML.includes("JosÃ©"));
  fs.unlinkSync(utf8Csv);
  check(!hasMojibake, "UTF-8 text does not mojibake");

  // 7. Multi-file drop
  await page.evaluate(() => window.PBNAnalyzer && document.getElementById("clearAppButton").click());
  await page.waitForTimeout(300);
  const dropOk = await page.evaluate(async ([pbnBytes, bwsBytes]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(pbnBytes)], "01.pbn", { type: "text/plain" }));
    dt.items.add(new File([new Uint8Array(bwsBytes)], "01.BWS", { type: "application/octet-stream" }));
    const zone = document.getElementById("dropZone");
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      pbn: document.getElementById("pbnStatusCard").className.includes("loaded"),
      results: document.getElementById("resultsStatusCard").className.includes("loaded")
    };
  }, [Array.from(Buffer.from(APP_PBN_TEXT, "utf8")), Array.from(APP_BWS_BYTES)]);
  check(dropOk.pbn && dropOk.results, `dropping PBN+BWS together loads both (pbn=${dropOk.pbn} results=${dropOk.results})`);

  // 8. Clear
  await page.click("#clearAppButton");
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => document.getElementById("dashboard").classList.contains("hidden"));
  check(cleared, "clear returns app to empty state");
  check(consoleErrors.length === 0, `no console errors across entire run (${consoleErrors.join("; ").slice(0, 300)})`);

  await browser.close();
  await closeServer(server);
  console.log(problems.length ? `\nSMOKE FAILED: ${problems.length} problems` : "\nSMOKE PASSED");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => { console.error("SMOKE CRASHED:", error); process.exit(2); });
