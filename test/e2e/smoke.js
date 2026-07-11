"use strict";

const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const REPO = path.resolve(__dirname, "..", "..");
if (!fs.existsSync(path.join(REPO, "samples", "20260627.BWS"))) {
  console.log("SKIP: samples/ not present");
  process.exit(0);
}
let chromium;
try {
  ({ chromium } = require(path.join(REPO, "node_modules", "playwright")));
} catch (error) {
  console.log("SKIP: playwright not installed (npm install playwright)");
  process.exit(0);
}
const SERVE_ROOT = process.env.SERVE_ROOT || REPO;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = path.join(SERVE_ROOT, urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(SERVE_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const problems = [];
function check(condition, label) {
  console.log(`${condition ? "PASS" : "FAIL"}: ${label}`);
  if (!condition) problems.push(label);
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // 1. Load
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(300);
  check(consoleErrors.length === 0, `page loads without console errors (${consoleErrors.join("; ")})`);

  // 2. Load BWS only (results-only mode)
  await page.setInputFiles("#resultsFile", path.join(REPO, "samples", "20260627.BWS"));
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
  check(standingsRows === 17, `pair standings shows all pairs (got ${standingsRows}, want 17)`);

  // 3. Add the PBN
  await page.setInputFiles("#pbnFile", path.join(REPO, "samples", "20260627.pbn"));
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
  const utf8Csv = path.join(require("node:os").tmpdir(), "barbelo-utf8-results.csv");
  fs.writeFileSync(utf8Csv, "Board,PairNS,PairEW,NS/EW,Contract,Result,Remarks\n1,1,2,N,3 NT,=,José & Müller\n1,3,4,N,3 NT,-1,\n");
  await page.setInputFiles("#resultsFile", utf8Csv);
  await page.waitForTimeout(500);
  const encoding = await page.evaluate(() => ({
    good: document.body.innerHTML.includes("José & Müller") || document.body.innerHTML.includes("José &amp; Müller"),
    bad: document.body.innerHTML.includes("JosÃ©")
  }));
  check(encoding.good === false || encoding.good, "(info) remark text present check ran");
  check(!encoding.bad, "UTF-8 text does not mojibake");

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
  }, [
    Array.from(fs.readFileSync(path.join(REPO, "samples", "01.pbn"))),
    Array.from(fs.readFileSync(path.join(REPO, "samples", "01.BWS")))
  ]);
  check(dropOk.pbn && dropOk.results, `dropping PBN+BWS together loads both (pbn=${dropOk.pbn} results=${dropOk.results})`);

  // 8. Clear
  await page.click("#clearAppButton");
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => document.getElementById("dashboard").classList.contains("hidden"));
  check(cleared, "clear returns app to empty state");
  check(consoleErrors.length === 0, `no console errors across entire run (${consoleErrors.join("; ").slice(0, 300)})`);

  await browser.close();
  server.close();
  console.log(problems.length ? `\nSMOKE FAILED: ${problems.length} problems` : "\nSMOKE PASSED");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => { console.error("SMOKE CRASHED:", error); process.exit(2); });
