// File input: reading and decoding uploads, drag-and-drop, and all
// event wiring.
import { parseBwsBuffer } from "../parsers/bws.js";
import { plural } from "../core/format.js";
import { parseResultsCsv } from "../parsers/csv.js";
import {
  BOARD_FILTER_CONTROLS,
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
import { showToast, trapFocusWithin } from "./dom.js";
import { renderPairImprovementReport } from "./reportView.js";
import { handleQuizClick, handleQuizKeydown } from "./quizView.js";
import { handleBridgeSimulatorClick } from "./simulatorView.js";
import { STATE } from "./state.js";

/** @param {ArrayBuffer | Uint8Array} buffer */
function decodeTextBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function loadedArrayBuffer(reader) {
  if (!(reader.result instanceof ArrayBuffer)) {
    throw new Error("The browser did not return binary file data.");
  }
  return reader.result;
}

function closestEventTarget(event, selector) {
  return event.target instanceof Element ? event.target.closest(selector) : null;
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setCurrentPbn(decodeTextBuffer(loadedArrayBuffer(reader)), file.name);
    } catch (error) {
      const message = error && error.message ? error.message : "The hand record could not be parsed.";
      showToast(`Could not import PBN: ${message}`, "error");
    }
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
        ? parseBwsBuffer(loadedArrayBuffer(reader), file.name)
        : parseResultsCsv(decodeTextBuffer(loadedArrayBuffer(reader)), file.name, file.size);
      setCurrentResults(raw);
    } catch (error) {
      const message = error && error.message ? error.message : "The results file could not be parsed.";
      showToast(`Could not import results: ${message}`, "error");
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

/** @param {(file?: File) => void} reader */
function bindFileInput(id, reader) {
  const element = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (!element) throw new Error(`Missing file input #${id}.`);
  element.addEventListener("change", (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    reader(input.files?.[0]);
    input.value = "";
  });
}

function setupEvents() {
  bindFileInput("pbnFile", readFile);
  bindFileInput("resultsFile", readResultsFile);

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
  document.querySelector(".brand-simulator-launch[data-simulator-open]").addEventListener("click", handleBridgeSimulatorClick);
  const boardOverlay = document.getElementById("boardOverlay");
  boardOverlay.addEventListener("click", (event) => {
    if (closestEventTarget(event, "[data-board-overlay-close]")) closeBoardOverlay();
  });
  boardOverlay.addEventListener("keydown", (event) => trapFocusWithin(event, boardOverlay));
  document.getElementById("boardOverlayOpenExplorer").addEventListener("click", () => {
    const boardNo = document.getElementById("boardOverlay").getAttribute("data-board-no");
    closeBoardOverlay({ restoreFocus: false });
    if (boardNo) revealBoardInExplorer(boardNo);
  });
  document.addEventListener("keydown", (event) => {
    if (handleQuizKeydown(event)) return;
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
    const button = /** @type {HTMLButtonElement | null} */ (closestEventTarget(event, "[data-task-view]"));
    if (!button || button.disabled) return;
    STATE.activeView = button.getAttribute("data-task-view");
    renderTaskNav(STATE.analysis, STATE.results);
    applyActiveView();
  });

  BOARD_FILTER_CONTROLS.forEach(({ id, eventName, key }) => {
    document.getElementById(id).addEventListener(eventName, (event) => {
      const control = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.currentTarget);
      STATE.filters[key] = control.value;
      renderBoards();
    });
  });
  document.getElementById("scoreOutlierToggle").addEventListener("change", (event) => {
    STATE.scoreOutliersOnly = /** @type {HTMLInputElement} */ (event.currentTarget).checked;
    if (STATE.analysis) renderCharts(STATE.analysis, STATE.results);
  });
  document.getElementById("boardGrid").addEventListener("click", (event) => {
    const trigger = closestEventTarget(event, "[data-board-select]");
    if (!trigger) return;
    event.preventDefault();
    selectBoardInExplorer(trigger.getAttribute("data-board-select"));
  });
  document.getElementById("reportPairSelect").addEventListener("change", (event) => {
    STATE.reportPair = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
    renderPairImprovementReport(STATE.results);
  });
  document.getElementById("pairReportBody").addEventListener("click", (event) => {
    handleQuizClick(event);
  });
  const quizOverlay = document.getElementById("quizOverlay");
  quizOverlay.addEventListener("click", (event) => {
    if (handleQuizClick(event)) return;
    // Board jumps inside the quiz reveal open the board preview on top.
    const jump = closestEventTarget(event, "[data-board-jump]");
    if (jump) {
      event.preventDefault();
      showBoardOverlay(jump.getAttribute("data-board-jump"));
    }
  });
  quizOverlay.addEventListener("keydown", (event) => trapFocusWithin(event, quizOverlay));
  document.getElementById("dashboard").addEventListener("click", (event) => {
    const trigger = closestEventTarget(event, "[data-board-jump]");
    if (!trigger) return;
    event.preventDefault();
    const boardNo = trigger.getAttribute("data-board-jump");
    if (trigger.closest("#boardExplorerPanel")) revealBoardInExplorer(boardNo);
    else showBoardOverlay(boardNo);
  });

  document.getElementById("rowMode").addEventListener("change", (event) => {
    STATE.rowMode = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
    STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, STATE.analysis));
    renderCsvControls();
  });

  document.getElementById("columnList").addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const key = input?.getAttribute("data-column-key");
    if (!key) return;
    if (input.checked) STATE.selectedColumns.add(key);
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
