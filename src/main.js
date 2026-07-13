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
import { flipBrandMark, initAppVersion } from "./ui/dom.js";

function init() {
  flipBrandMark();
  initAppVersion();
  setupTooltips();
  setupEvents();
  renderAll();
  annotateTermTooltips(document.body);
}

const publicApi = {
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

if (typeof window !== "undefined") {
  const appWindow = /** @type {Window & typeof globalThis & {
   * PBNAnalyzer: typeof publicApi,
   * BarbeloPbnParser: typeof pbnParser,
   * BarbeloBwsParser: typeof bwsParser
   * }} */ (window);
  appWindow.PBNAnalyzer = publicApi;
  // Compatibility globals for the browser console and legacy callers; new
  // code should import from src/parsers/ directly.
  appWindow.BarbeloPbnParser = pbnParser;
  appWindow.BarbeloBwsParser = bwsParser;
  appWindow.addEventListener("DOMContentLoaded", init);
}
