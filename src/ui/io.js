// File input: reading and decoding uploads, drag-and-drop, and all
// event wiring.
import { parseBwsBuffer } from "../parsers/bws.js";
import { plural } from "../core/format.js";
import { parseResultsCsv } from "../parsers/csv.js";
import {
  closeBoardOverlay,
  renderBoards,
  revealBoardInExplorer,
  selectBoardInExplorer,
  showBoardOverlay,
} from "./boardsView.js";
import { renderCharts } from "./chartsView.js";
import { clearLoadedData, setCurrentPbn, setCurrentResults } from "./controller.js";
import {
  defaultColumnKeys,
  downloadCsv,
  getColumnDefs,
  renderCsvControls,
  renderCsvPreview,
} from "./csvExport.js";
import { applyActiveView, renderTaskNav } from "./dashboard.js";
import { showToast } from "./dom.js";
import { renderPairImprovementReport } from "./reportView.js";
import { STATE } from "./state.js";

function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    setCurrentPbn(decodeTextBuffer(reader.result), file.name);
  };
  reader.onerror = () => {
    showToast("Could not read the selected file.", "error");
  };
  reader.readAsArrayBuffer(file);
}

function readResultsFile(file) {
  if (!file) return;
  const lowerName = file.name.toLowerCase();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = lowerName.endsWith(".bws")
        ? parseBwsBuffer(reader.result, file.name)
        : parseResultsCsv(decodeTextBuffer(reader.result), file.name, file.size);
      setCurrentResults(raw);
    } catch (error) {
      showToast(`Could not import results: ${error.message}`, "error");
    }
  };
  reader.onerror = () => {
    showToast("Could not read the selected results file.", "error");
  };
  reader.readAsArrayBuffer(file);
}

function droppedFileKind(file) {
  const name = String(file && file.name || "").toLowerCase();
  if (name.endsWith(".bws") || name.endsWith(".csv")) return "results";
  if (name.endsWith(".pbn") || name.endsWith(".txt")) return "pbn";
  if (file && file.type === "text/csv") return "results";
  if (file && /^text\//i.test(file.type)) return "pbn";
  return "";
}

function readDroppedFiles(files) {
  const dropped = Array.from(files || []).filter(Boolean);
  if (!dropped.length) return;
  let pbnFile = null;
  let resultsFile = null;
  const ignored = [];
  dropped.forEach((file) => {
    const kind = droppedFileKind(file);
    if (kind === "pbn" && !pbnFile) pbnFile = file;
    else if (kind === "results" && !resultsFile) resultsFile = file;
    else ignored.push(file.name);
  });
  if (!pbnFile && !resultsFile) {
    showToast("Drop a PBN hand record or a BWS/CSV results file.", "error");
    return;
  }
  if (pbnFile) readFile(pbnFile);
  if (resultsFile) readResultsFile(resultsFile);
  if (ignored.length) {
    showToast(`Ignored ${plural(ignored.length, "extra file")}: ${ignored.join(", ")}`, "error");
  }
}

function setupEvents() {
  const fileInputs = [document.getElementById("pbnFile")];
  fileInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      readFile(event.target.files[0]);
      event.target.value = "";
    });
  });

  const resultInputs = [document.getElementById("resultsFile")];
  resultInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      readResultsFile(event.target.files[0]);
      event.target.value = "";
    });
  });

  const dropZone = document.getElementById("dropZone");
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => {
    readDroppedFiles(event.dataTransfer.files);
  });

  document.getElementById("clearAppButton").addEventListener("click", clearLoadedData);
  document.getElementById("boardOverlayClose").addEventListener("click", () => closeBoardOverlay());
  document.getElementById("boardOverlay").addEventListener("click", (event) => {
    if (event.target.closest("[data-board-overlay-close]")) closeBoardOverlay();
  });
  document.getElementById("boardOverlayOpenExplorer").addEventListener("click", () => {
    const boardNo = document.getElementById("boardOverlay").getAttribute("data-board-no");
    closeBoardOverlay({ restoreFocus: false });
    if (boardNo) revealBoardInExplorer(boardNo);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeBoardOverlay();
    if ((event.key === "Enter" || event.key === " ") && event.target instanceof Element) {
      const jump = event.target.closest("[data-board-jump], [data-board-select]");
      if (jump && jump.tagName !== "BUTTON" && jump.tagName !== "A") {
        event.preventDefault();
        jump.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    }
  });
  document.getElementById("taskNav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-view]");
    if (!button || button.disabled) return;
    STATE.activeView = button.getAttribute("data-task-view");
    renderTaskNav(STATE.analysis, STATE.results);
    applyActiveView();
  });

  document.getElementById("boardSearch").addEventListener("input", (event) => {
    STATE.filters.search = event.target.value;
    renderBoards();
  });
  document.getElementById("sideFilter").addEventListener("change", (event) => {
    STATE.filters.side = event.target.value;
    renderBoards();
  });
  document.getElementById("classFilter").addEventListener("change", (event) => {
    STATE.filters.className = event.target.value;
    renderBoards();
  });
  document.getElementById("vulFilter").addEventListener("change", (event) => {
    STATE.filters.vulnerability = event.target.value;
    renderBoards();
  });
  document.getElementById("playedFilter").addEventListener("change", (event) => {
    STATE.filters.played = event.target.value;
    renderBoards();
  });
  document.getElementById("scoreOutlierToggle").addEventListener("change", (event) => {
    STATE.scoreOutliersOnly = event.target.checked;
    if (STATE.analysis) renderCharts(STATE.analysis, STATE.results);
  });
  document.getElementById("boardGrid").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-board-select]");
    if (!trigger) return;
    event.preventDefault();
    selectBoardInExplorer(trigger.getAttribute("data-board-select"));
  });
  document.getElementById("reportPairSelect").addEventListener("change", (event) => {
    STATE.reportPair = event.target.value;
    renderPairImprovementReport(STATE.results);
  });
  document.getElementById("dashboard").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-board-jump]");
    if (!trigger) return;
    event.preventDefault();
    const boardNo = trigger.getAttribute("data-board-jump");
    if (trigger.closest("#boardExplorerPanel")) revealBoardInExplorer(boardNo);
    else showBoardOverlay(boardNo);
  });

  document.getElementById("rowMode").addEventListener("change", (event) => {
    STATE.rowMode = event.target.value;
    STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, STATE.analysis));
    renderCsvControls();
  });

  document.getElementById("columnList").addEventListener("change", (event) => {
    const key = event.target.getAttribute("data-column-key");
    if (!key) return;
    if (event.target.checked) STATE.selectedColumns.add(key);
    else STATE.selectedColumns.delete(key);
    renderCsvPreview();
  });

  document.getElementById("selectDefaultColumns").addEventListener("click", () => {
    STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, STATE.analysis));
    renderCsvControls();
  });
  document.getElementById("selectAllColumns").addEventListener("click", () => {
    STATE.selectedColumns = new Set(getColumnDefs(STATE.rowMode, STATE.analysis, STATE.results).map((entry) => entry.key));
    renderCsvControls();
  });
  document.getElementById("clearColumns").addEventListener("click", () => {
    STATE.selectedColumns = new Set();
    renderCsvControls();
  });
  document.getElementById("downloadCsvButton").addEventListener("click", downloadCsv);
}

export {
  decodeTextBuffer,
  readFile,
  readResultsFile,
  droppedFileKind,
  readDroppedFiles,
  setupEvents,
};
