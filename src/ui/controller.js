// Actions that change what is loaded, and the top-level render pass
// that repaints every panel from STATE.
import { parsePbn } from "../parsers/pbn.js";
import { buildAnalysis } from "../core/boards.js";
import { plural } from "../core/format.js";
import { buildResultsAnalysis, defaultReportPair } from "../core/results.js";
import { renderBoards, syncBoardFilterControls } from "./boardsView.js";
import { renderCharts, renderNotables, renderResultsCharts, visualBoards } from "./chartsView.js";
import { defaultColumnKeys, isResultRowMode, renderCsvControls } from "./csvExport.js";
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
import { flipBrandMark, setElementHidden, showToast } from "./dom.js";
import { renderPairImprovementReport } from "./reportView.js";
import { STATE, defaultFilters, ensureActiveView } from "./state.js";
import { annotateTermTooltips } from "./terms.js";

const PBN_PANEL_IDS = ["pbnInfoGrid", "pbnCharts", "pbnSupplementGrid", "boardExplorerPanel"];
const SHARED_PANEL_IDS = ["resultsPanel", "importDiagnosticsPanel", "csvPanel"];

function setDashboardPanelVisibility(hasPbn) {
  PBN_PANEL_IDS.forEach((id) => setElementHidden(id, !hasPbn));
  SHARED_PANEL_IDS.forEach((id) => setElementHidden(id, false));
  document.getElementById("metricGrid").setAttribute("data-views", hasPbn ? "overview" : "overview results improve");
}

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
  flipBrandMark();
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
  setDashboardPanelVisibility(false);

  if (!isResultRowMode(STATE.rowMode)) {
    STATE.rowMode = "results";
    STATE.selectedColumns = new Set(defaultColumnKeys("results", null));
  }

  renderResultOnlyMetrics(results);
  renderResultsPanel(results);
  renderImportDiagnosticsPanel(results);
  renderResultsCharts(results);
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
    renderPairImprovementReport(null);
    return;
  }

  dashboard.classList.remove("hidden");
  if (!analysis) {
    renderResultsOnlyDashboard(results);
    annotateTermTooltips(dashboard);
    return;
  }

  setDashboardPanelVisibility(true);
  syncBoardFilterControls();
  /** @type {HTMLSelectElement} */ (document.getElementById("rowMode")).value = STATE.rowMode;
  /** @type {HTMLInputElement} */ (document.getElementById("scoreOutlierToggle")).checked = STATE.scoreOutliersOnly;

  renderMetrics(analysis);
  renderMetadata(analysis);
  renderQuality(analysis);
  renderResultsPanel(STATE.results);
  renderImportDiagnosticsPanel(STATE.results);
  renderCharts(analysis, STATE.results);
  renderResultsCharts(STATE.results);
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
