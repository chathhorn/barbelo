// Actions that change what is loaded, and the top-level render pass
// that repaints every panel from STATE.
import { parsePbn } from "../parsers/pbn.js";
import { buildAnalysis } from "../core/boards.js";
import { plural } from "../core/format.js";
import { buildResultsAnalysis, defaultReportPair } from "../core/results.js";
import { renderBoards } from "./boardsView.js";
import { renderCharts, renderNotables, renderResultsCharts, visualBoards } from "./chartsView.js";
import { defaultColumnKeys, renderCsvControls } from "./csvExport.js";
import {
  appSubtitle,
  applyActiveView,
  renderImportDiagnosticsPanel,
  renderMetadata,
  renderMetrics,
  renderQuality,
  renderResultOnlyMetrics,
  renderResultsPanel,
  renderTaskNav,
  updateDropZone,
  updateFileStatus,
} from "./dashboard.js";
import { setElementHidden, showToast } from "./dom.js";
import { renderPairImprovementReport } from "./reportView.js";
import { STATE, defaultFilters, ensureActiveView } from "./state.js";
import { annotateTermTooltips } from "./terms.js";

function setCurrentPbn(text, fileName) {
  const parsed = parsePbn(text, fileName);
  const analysis = buildAnalysis(parsed);
  STATE.parsed = parsed;
  STATE.analysis = analysis;
  STATE.results = STATE.rawResults ? buildResultsAnalysis(STATE.rawResults, analysis) : null;
  STATE.reportPair = STATE.results ? defaultReportPair(STATE.results) : "";
  STATE.activeView = STATE.results ? "improve" : "overview";
  STATE.selectedBoardNo = analysis.boards[0] ? String(analysis.boards[0].boardNo) : "";
  STATE.rowMode = STATE.results ? "results" : "boards";
  STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, analysis));
  STATE.filters = defaultFilters();
  if (STATE.results) STATE.filters.played = "played";
  renderAll();
  showToast(`Loaded ${plural(analysis.summary.boardCount, "board")}${STATE.results ? ` and joined ${plural(STATE.results.summary.resultCount, "result")}` : ""}.`);
}

function clearLoadedData() {
  const hadData = Boolean(STATE.analysis || STATE.rawResults || STATE.results);
  STATE.parsed = null;
  STATE.analysis = null;
  STATE.rawResults = null;
  STATE.results = null;
  STATE.reportPair = "";
  STATE.activeView = "overview";
  STATE.selectedBoardNo = "";
  STATE.scoreOutliersOnly = false;
  STATE.rowMode = "boards";
  STATE.selectedColumns = new Set();
  STATE.filters = defaultFilters();
  document.getElementById("fileSubtitle").textContent = "Open a Portable Bridge Notation hand record.";
  renderAll();
  showToast(hadData ? "Cleared loaded files." : "No loaded files to clear.");
}

function setCurrentResults(rawResults) {
  const results = buildResultsAnalysis(rawResults, STATE.analysis);
  STATE.rawResults = rawResults;
  STATE.results = results;
  STATE.reportPair = defaultReportPair(results);
  STATE.activeView = "improve";
  STATE.rowMode = "results";
  STATE.selectedColumns = new Set(defaultColumnKeys("results", STATE.analysis));
  if (STATE.analysis) STATE.filters.played = "played";
  renderAll();
  showToast(`Loaded ${plural(results.summary.resultCount, "result")} from ${rawResults.sourceType}${STATE.analysis ? "" : "; open a PBN to add deal analysis"}.`);
}

function renderResultsOnlyDashboard(results) {
  setElementHidden("pbnInfoGrid", true);
  setElementHidden("pbnCharts", true);
  setElementHidden("pbnSupplementGrid", true);
  setElementHidden("boardExplorerPanel", true);
  setElementHidden("resultsPanel", false);
  setElementHidden("importDiagnosticsPanel", false);
  setElementHidden("csvPanel", false);
  document.getElementById("metricGrid").setAttribute("data-views", "overview results improve");

  if (!["results", "boardResults", "pairResults"].includes(STATE.rowMode)) {
    STATE.rowMode = "results";
    STATE.selectedColumns = new Set(defaultColumnKeys("results", null));
  }

  renderResultOnlyMetrics(results);
  renderResultsPanel(null, results);
  renderImportDiagnosticsPanel(results);
  renderResultsCharts(null, results);
  renderPairImprovementReport(results);
  renderCsvControls();
  applyActiveView();
}

function renderAll() {
  const analysis = STATE.analysis;
  const results = STATE.results;
  const dashboard = document.getElementById("dashboard");
  updateDropZone(analysis, results);
  ensureActiveView(analysis, results);
  updateFileStatus();
  renderTaskNav(analysis, results);
  document.getElementById("fileSubtitle").textContent = appSubtitle(analysis, results);
  if (!analysis && !results) {
    dashboard.classList.add("hidden");
    renderTaskNav(null, null);
    return;
  }

  dashboard.classList.remove("hidden");
  if (!analysis) {
    renderResultsOnlyDashboard(results);
    annotateTermTooltips(dashboard);
    return;
  }

  setElementHidden("pbnInfoGrid", false);
  setElementHidden("pbnCharts", false);
  setElementHidden("pbnSupplementGrid", false);
  setElementHidden("boardExplorerPanel", false);
  setElementHidden("resultsPanel", false);
  setElementHidden("importDiagnosticsPanel", false);
  setElementHidden("csvPanel", false);
  document.getElementById("metricGrid").setAttribute("data-views", "overview");

  document.getElementById("boardSearch").value = STATE.filters.search;
  document.getElementById("sideFilter").value = STATE.filters.side;
  document.getElementById("classFilter").value = STATE.filters.className;
  document.getElementById("vulFilter").value = STATE.filters.vulnerability;
  document.getElementById("playedFilter").value = STATE.filters.played;
  document.getElementById("rowMode").value = STATE.rowMode;
  document.getElementById("scoreOutlierToggle").checked = STATE.scoreOutliersOnly;

  renderMetrics(analysis);
  renderMetadata(analysis);
  renderQuality(analysis);
  renderResultsPanel(analysis, STATE.results);
  renderImportDiagnosticsPanel(STATE.results);
  renderCharts(analysis, STATE.results);
  renderResultsCharts(analysis, STATE.results);
  renderPairImprovementReport(STATE.results);
  renderNotables(analysis, visualBoards(analysis, STATE.results));
  renderBoards();
  renderCsvControls();
  applyActiveView();
  annotateTermTooltips(dashboard);
}

export {
  setCurrentPbn,
  clearLoadedData,
  setCurrentResults,
  renderResultsOnlyDashboard,
  renderAll,
};
