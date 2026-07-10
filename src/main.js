// Application entry: wires startup and exposes the public console API.
import * as pbnParser from "./parsers/pbn.js";
import * as bwsParser from "./parsers/bws.js";
import { parsePbn, parseDeal } from "./parsers/pbn.js";
import { parseBwsBuffer } from "./parsers/bws.js";
import { parseResultsCsv } from "./parsers/csv.js";
import { buildAnalysis } from "./core/boards.js";
import { buildResultsAnalysis } from "./core/results.js";
import { buildPairImprovementReport } from "./core/report.js";
import { scoreDuplicateContract } from "./core/scoring.js";
import { csvCell, contractGlyphHtml } from "./core/format.js";
import { getColumnDefs, getCsvContexts } from "./ui/csvExport.js";
import { decodeTextBuffer, setupEvents } from "./ui/io.js";
import { setupTooltips, annotateTermTooltips } from "./ui/terms.js";
import { renderAll } from "./ui/controller.js";
import { initAppVersion } from "./ui/dom.js";

function init() {
  if (Math.random() < 0.5) document.body.classList.add("mark-ouro");
  initAppVersion();
  setupTooltips();
  setupEvents();
  renderAll();
  annotateTermTooltips(document.body);
}

if (typeof window !== "undefined") {
  window.PBNAnalyzer = {
    parsePbn,
    buildAnalysis,
    parseBwsBuffer,
    parseResultsCsv,
    buildResultsAnalysis,
    buildPairImprovementReport,
    scoreDuplicateContract,
    parseDeal,
    getColumnDefs,
    getCsvContexts,
    csvCell,
    decodeTextBuffer,
    contractGlyphHtml
  };
  // Compatibility globals for the browser console and legacy callers; new
  // code should import from src/parsers/ directly.
  window.BarbeloPbnParser = pbnParser;
  window.BarbeloBwsParser = bwsParser;
  window.addEventListener("DOMContentLoaded", init);
}
