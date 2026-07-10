// Dashboard panels: file status, task navigation, metrics, metadata,
// data quality, results summary, and import diagnostics.
import { firstDirective, pbnHeaderDetails } from "../core/boards.js";
import {
  average,
  escapeHtml,
  formatBytes,
  formatSigned,
  plural,
} from "../core/format.js";
import { renderResultContractChart } from "./chartsView.js";
import { renderBoardJumpList } from "./dom.js";
import { STATE, availableTaskViews } from "./state.js";
import { annotateTermTooltips, term, th } from "./terms.js";

function updateDropZone(analysis, results) {
  const hasLoadedData = Boolean(analysis || results);
  document.body.classList.toggle("has-loaded-data", hasLoadedData);
  const heading = document.querySelector("#dropZone .drop-copy h2");
  const copy = document.querySelector("#dropZone .drop-copy p");
  if (!heading || !copy) return;
  if (hasLoadedData) {
    heading.textContent = "Drop another PBN, BWS, or CSV file here.";
    copy.textContent = "Loaded files stay active until you replace them or clear the session.";
  } else {
    heading.textContent = "Turn bridge deals and travelers into a readable session report.";
    copy.textContent = "Drop a PBN hand record, BWS database, or CSV results file here. Results can be opened before or after the PBN.";
  }
}

function appSubtitle(analysis, results) {
  if (!analysis) {
    return results
      ? `${results.fileName || "Results"} - ${plural(results.summary.resultCount, "result")} loaded; open a PBN to add deal and par analysis.`
      : "Open a Portable Bridge Notation hand record or a results file.";
  }
  const details = pbnHeaderDetails(analysis);
  const pieces = [];
  const event = String(details.event || "").replace(/\s+/g, " ").trim();
  const date = String(details.date || "").replace(/\s+/g, " ").trim();
  if (event) pieces.push(event);
  if (date) pieces.push(date);
  pieces.push(`${analysis.parsed.fileName} - ${plural(analysis.summary.boardCount, "board")}${results ? `, ${plural(results.summary.resultCount, "result")}` : ""}`);
  return pieces.join(" | ");
}

function updateFileStatus() {
  const pbnCard = document.getElementById("pbnStatusCard");
  const pbnTitle = document.getElementById("pbnStatusTitle");
  const pbnDetail = document.getElementById("pbnStatusDetail");
  const resultsCard = document.getElementById("resultsStatusCard");
  const resultsTitle = document.getElementById("resultsStatusTitle");
  const resultsDetail = document.getElementById("resultsStatusDetail");

  if (STATE.analysis) {
    const details = pbnHeaderDetails(STATE.analysis);
    const event = String(details.event || "").replace(/\s+/g, " ").trim();
    const date = String(details.date || "").replace(/\s+/g, " ").trim();
    pbnCard.className = "file-status-card loaded";
    pbnTitle.textContent = STATE.analysis.parsed.fileName || "PBN loaded";
    pbnDetail.textContent = [plural(STATE.analysis.summary.boardCount, "board"), event, date].filter(Boolean).join(" | ");
  } else {
    pbnCard.className = "file-status-card missing";
    pbnTitle.textContent = "No PBN opened";
    pbnDetail.textContent = STATE.results
      ? "Results are loaded; open a PBN to add deal, par, HCP, and double-dummy analysis."
      : "Open a PBN to enable deal, par, HCP, and double-dummy analysis.";
  }

  if (STATE.results) {
    resultsCard.className = "file-status-card loaded";
    resultsTitle.textContent = STATE.results.fileName || "Results loaded";
    resultsDetail.textContent = `${STATE.results.sourceType} | ${plural(STATE.results.summary.resultCount, "result")} | ${plural(STATE.results.summary.boardsCovered, "board")} | ${plural(STATE.results.summary.pairs, "pair")}`;
  } else {
    resultsCard.className = "file-status-card missing";
    resultsTitle.textContent = "No results uploaded";
    resultsDetail.textContent = "Open a BWS or CSV traveler file at any time.";
  }
}

function renderTaskNav(analysis, results) {
  const nav = document.getElementById("taskNav");
  if (!nav) return;
  const hasLoadedData = Boolean(analysis || results);
  nav.classList.toggle("hidden", !hasLoadedData);
  if (!hasLoadedData) return;

  const available = availableTaskViews(analysis, results);
  nav.querySelectorAll("[data-task-view]").forEach((button) => {
    const view = button.getAttribute("data-task-view");
    const enabled = Boolean(available[view]);
    button.classList.toggle("active", view === STATE.activeView);
    button.disabled = !enabled;
    button.setAttribute("aria-current", view === STATE.activeView ? "page" : "false");
  });
}

function applyActiveView() {
  document.querySelectorAll("#dashboard [data-views]").forEach((element) => {
    const views = String(element.getAttribute("data-views") || "").split(/\s+/).filter(Boolean);
    element.classList.toggle("view-hidden", !views.includes(STATE.activeView));
  });
}

function renderMetrics(analysis) {
  const summary = analysis.summary;
  const results = STATE.results;
  const edgeNS = summary.parEdges.NS || 0;
  const edgeEW = summary.parEdges.EW || 0;
  const slamCount = summary.slamLevelBoards.length;
  const gameCount = summary.classes["Game-level"] || 0;
  const partCount = summary.classes.Partscore || 0;
  const avgVsPar = results && results.summary.averageVsPar != null
    ? formatSigned(Math.round(results.summary.averageVsPar))
    : null;

  const metrics = [
    { label: "Boards", value: summary.boardCount, note: `${summary.validDeals} valid deals` },
    {
      label: "Results",
      value: results ? results.summary.resultCount : summary.boardsWithActualResults,
      note: results
        ? `${results.summary.boardsCovered} boards, ${results.summary.pairs} pairs`
        : "Played contracts found"
    },
    results
      ? { label: "Avg Vs Par", value: avgVsPar, note: "NS average result" }
      : { label: "Par Edge", value: `${edgeNS}/${edgeEW}`, note: "NS / EW boards" },
    { label: "Shape Of Set", value: `${gameCount}/${slamCount}`, note: `${partCount} partscores; games / slams` }
  ];

  document.getElementById("metricGrid").innerHTML = metrics.map((metric) => `
    <div class="metric">
      <div class="label">${escapeHtml(metric.label)}</div>
      <div class="value">${escapeHtml(metric.value)}</div>
      <div class="note">${escapeHtml(metric.note)}</div>
    </div>
  `).join("");
}

function renderMetadata(analysis) {
  const parsed = analysis.parsed;
  const firstBoard = analysis.boards[0] || { tags: {} };
  const title = firstDirective(analysis, ["HRTitleEvent"]) || firstBoard.tags.Event || "";
  const date = firstDirective(analysis, ["HRTitleDate"]) || firstBoard.tags.Date || "";
  const items = [
    ["File", parsed.fileName],
    ["PBN", firstDirective(analysis, ["PBN"]) || "Unspecified"],
    ["Content Type", firstDirective(analysis, ["Content-type"]) || "Unspecified"],
    ["Creator", firstDirective(analysis, ["Creator"]) || firstDirective(analysis, ["Generator"]) || firstBoard.tags.Generator || "Unspecified"],
    ["Created", firstDirective(analysis, ["Created"]) || "Unspecified"],
    ["Event", title || "Blank in records"],
    ["Date", date || "Blank in records"],
    ["Set ID", firstDirective(analysis, ["HRTitleSetID"]) || "Unspecified"],
    ["Tag Types", analysis.tagKeys.length],
    ["Directives", parsed.directives.length]
  ];

  document.getElementById("headerCaption").textContent = `${plural(parsed.directives.length, "directive")} and ${plural(analysis.tagKeys.length, "tag type")}.`;
  document.getElementById("metadataGrid").innerHTML = items.map(([key, value]) => `
    <div class="metadata-item">
      <div class="key">${escapeHtml(key)}</div>
      <div class="val">${escapeHtml(value)}</div>
    </div>
  `).join("");
}

function renderQuality(analysis) {
  const summary = analysis.summary;
  const results = STATE.results;
  const parseWarnings = analysis.parsed.warnings.length;
  const boardsMissingActualTags = analysis.boards
    .filter((board) => !(board.tags.Contract || board.tags.Declarer || board.tags.Result))
    .map((board) => board.boardNo);
  const issueBoardNos = analysis.boards.filter((board) => board.issues.length).map((board) => board.boardNo);
  const issueBoards = issueBoardNos.length;
  const quality = [
    {
      tone: summary.invalidDeals ? "red" : "",
      text: `${summary.validDeals} of ${summary.boardCount} deals have 52 unique cards.`
    },
    {
      tone: summary.boardsMissingActualResults ? "gold" : "",
      text: "Played contract and result fields are present.",
      html: boardsMissingActualTags.length
        ? `${escapeHtml(summary.boardsMissingActualResults)} PBN records do not contain played contract, declarer, or result tags (${renderBoardJumpList(boardsMissingActualTags)}).`
        : ""
    },
    {
      tone: parseWarnings ? "gold" : "",
      text: parseWarnings ? `${parseWarnings} preamble or parse warnings were recorded.` : "No parser warnings."
    },
    {
      tone: issueBoards ? "gold" : "",
      text: "Every board has deal, par, and optimum score fields.",
      html: issueBoards ? `${escapeHtml(issueBoards)} boards have missing par, score, or deal analysis fields (${renderBoardJumpList(issueBoardNos)}).` : ""
    }
  ];

  if (results) {
    const compatibility = results.summary.compatibility;
    const compatibilityTone = compatibility.status === "mismatch" ? "red" : compatibility.status === "warning" || compatibility.status === "partial" || compatibility.status === "unknown" ? "gold" : "";
    quality.push({
      tone: compatibilityTone,
      text: `${compatibility.label}.`,
      html: `${escapeHtml(compatibility.label)}${compatibility.score == null ? "" : ` (${escapeHtml(compatibility.score)}/100)`}: ${escapeHtml(compatibility.primaryConcern || compatibility.details[0] || "No compatibility details available.")}`
    });
    quality.push({
      tone: results.summary.extraResultBoards.length ? "gold" : "",
      text: results.summary.extraResultBoards.length
        ? `${results.summary.extraResultBoards.length} result boards do not appear in the PBN.`
        : "Every result board maps to a PBN board."
    });
    quality.push({
      tone: results.summary.missingResultBoards.length ? "gold" : "",
      text: "Every PBN board has uploaded results.",
      html: results.summary.missingResultBoards.length
        ? `${escapeHtml(results.summary.missingResultBoards.length)} PBN boards have no uploaded result (${renderBoardJumpList(results.summary.missingResultBoards)}).`
        : ""
    });
    quality.push({
      tone: results.warnings.length ? "gold" : "",
      text: results.warnings.length ? `${results.warnings.length} result import or scoring warnings.` : "No result import warnings."
    });
  }

  document.getElementById("qualityCaption").textContent = results
    ? `${results.summary.resultCount} uploaded traveler rows are joined to the hand record.`
    : summary.boardsWithActualResults
      ? `${summary.boardsWithActualResults} boards include played-result fields.`
      : "This looks like a hand record rather than a result file.";
  document.getElementById("qualityList").innerHTML = quality.map((item) => `
    <li><span class="dot ${escapeHtml(item.tone)}"></span><span>${item.html || escapeHtml(item.text)}</span></li>
  `).join("");
}

function renderResultsPanel(analysis, results) {
  const caption = document.getElementById("resultsCaption");
  const body = document.getElementById("resultsSummary");
  if (!results) {
    caption.textContent = "Optional Bridgemate BWS or CSV traveler import.";
    body.innerHTML = `<div class="empty-state">Use Open Results at the top of the page, or drag in a BWS database or CSV export with Board, PairNS, PairEW, NS/EW, Contract, and Result columns.</div>`;
    return;
  }

  const avgVsPar = results.summary.averageVsPar == null ? "n/a" : formatSigned(Math.round(results.summary.averageVsPar));
  const avgAbsVsPar = results.summary.averageAbsVsPar == null ? "n/a" : Math.round(results.summary.averageAbsVsPar);
  const ddText = results.summary.ddCompared ? `${results.summary.ddExact}/${results.summary.ddCompared}` : "n/a";
  const compatibility = results.summary.compatibility;
  const compatibilityScore = compatibility.score == null ? "n/a" : `${compatibility.score}/100`;
  caption.textContent = `${results.fileName || "Results"} - ${results.sourceType}${results.metadata && results.metadata.pageSize ? `, ${results.metadata.pageSize} byte pages` : ""}${results.summary.namedPlayers ? `, ${results.summary.namedPlayers} named players` : ""}${results.hasPbn ? "" : ", not yet joined to a PBN"}.`;
  body.innerHTML = `
    <div class="result-summary-grid">
      <div class="result-summary-card"><strong>${escapeHtml(results.summary.resultCount)}</strong><span>Result Rows</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(results.summary.boardsCovered)}</strong><span>Boards</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(results.summary.pairs)}</strong><span>Pairs</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(results.summary.namedPlayers || 0)}</strong><span>Named Players</span></div>
      <div class="result-summary-card compatibility ${escapeHtml(compatibility.status)}"><strong>${escapeHtml(compatibilityScore)}</strong><span>PBN Match</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(avgVsPar)}</strong><span>Avg Vs Par</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(avgAbsVsPar)}</strong><span>Avg Abs Par</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(ddText)}</strong><span>DD Exact</span></div>
    </div>
    ${renderCompatibilityPanel(compatibility)}
    <section class="results-subsection">
      <div>
        <h3>Result Contracts</h3>
        <p>Traveler contracts grouped by contract class.</p>
      </div>
      <div id="resultContractChart">${renderResultContractChart(results)}</div>
    </section>
  `;
}

function renderCompatibilityPanel(compatibility) {
  const tone = compatibility.status === "mismatch" ? "red" : compatibility.status === "match" ? "" : "gold";
  return `
    <section class="compatibility-panel ${escapeHtml(tone)}">
      <div>
        <h3>PBN / Results Compatibility</h3>
        <p>${escapeHtml(compatibility.label)}${compatibility.score == null ? "" : ` - ${escapeHtml(compatibility.score)}/100`}</p>
      </div>
      <ul>
        ${compatibility.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderImportDiagnostics(results) {
  const diagnostics = results && results.metadata ? results.metadata.diagnostics : null;
  if (!diagnostics) return "";
  if (diagnostics.sourceType === "BWS") return renderBwsDiagnostics(diagnostics, results);
  if (diagnostics.sourceType === "CSV") return renderCsvDiagnostics(diagnostics, results);
  return "";
}

function renderImportDiagnosticsPanel(results) {
  const panel = document.getElementById("importDiagnosticsPanel");
  const title = document.getElementById("importDiagnosticsTitle");
  const caption = document.getElementById("importDiagnosticsCaption");
  const body = document.getElementById("importDiagnosticsSummary");
  const diagnostics = results && results.metadata ? results.metadata.diagnostics : null;
  if (!panel || !title || !caption || !body) return;
  if (!diagnostics) {
    panel.classList.add("hidden");
    title.textContent = "BWS Import Diagnostics";
    caption.textContent = "";
    body.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  const sourceType = diagnostics.sourceType || results.sourceType || "Import";
  title.textContent = sourceType === "BWS" ? "BWS Import Diagnostics" : `${sourceType} Import Diagnostics`;
  caption.textContent = `${results.fileName || "Results"} - ${sourceType} scan details.`;
  body.innerHTML = renderImportDiagnostics(results);
  annotateTermTooltips(panel);
}

function renderCsvDiagnostics(diagnostics, results) {
  const headerText = diagnostics.headers && diagnostics.headers.length
    ? diagnostics.headers.slice(0, 12).join(", ")
    : "No headers";
  const warningText = results && results.warnings && results.warnings.length
    ? `<ul class="rejection-list">${results.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : `<div class="diagnostics-note">No import warnings.</div>`;
  return `
    <div class="diagnostics-panel">
      <div class="diagnostics-grid">
        <div class="metadata-item"><div class="key">Source</div><div class="val">CSV</div></div>
        <div class="metadata-item"><div class="key">File Size</div><div class="val">${escapeHtml(formatBytes(diagnostics.fileSize))}</div></div>
        <div class="metadata-item"><div class="key">CSV Rows</div><div class="val">${escapeHtml(diagnostics.csvRows)}</div></div>
        <div class="metadata-item"><div class="key">Recognized Results</div><div class="val">${escapeHtml(diagnostics.recognizedRows)}</div></div>
      </div>
      <div class="diagnostics-note">Headers: ${escapeHtml(headerText)}</div>
      ${warningText}
    </div>
  `;
}

function rejectionSummary(rejections) {
  const entries = Object.entries(rejections || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${term(key)}: ${escapeHtml(value)}`).join("; ");
}

function formatPageTypes(pageTypes) {
  const entries = Object.entries(pageTypes || {})
    .sort((a, b) => Number.parseInt(a[0], 16) - Number.parseInt(b[0], 16));
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function renderBwsDiagnostics(diagnostics, results) {
  const selected = diagnostics.candidates.find((candidate) => candidate.pageSize === diagnostics.selectedPageSize) || diagnostics.candidates[0];
  const received = selected ? selected.received : {};
  const pageProfile = diagnostics.pageProfile || {};
  const erasedRuns = pageProfile.allFfRuns && pageProfile.allFfRuns.length ? pageProfile.allFfRuns.join(", ") : "none";
  const candidateRows = diagnostics.candidates.map((candidate) => `
    <tr>
      <td>${escapeHtml(candidate.pageSize)}</td>
      <td class="numeric">${escapeHtml(candidate.received.filePages)}</td>
      <td class="numeric">${escapeHtml(formatBytes(candidate.received.trailingBytes))}</td>
      <td class="numeric">${escapeHtml(candidate.received.dataPages)}</td>
      <td class="numeric">${escapeHtml(candidate.received.rowSlots)}</td>
      <td class="numeric">${escapeHtml(candidate.received.rowSlices)}</td>
      <td class="numeric">${escapeHtml(candidate.received.acceptedRows)}</td>
      <td class="numeric">${escapeHtml(candidate.players.acceptedRows)}</td>
      <td>${rejectionSummary(candidate.received.rejections)}</td>
    </tr>
  `).join("");
  const warningText = results.warnings.length
    ? `<ul class="rejection-list">${results.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : `<div class="diagnostics-note">No import warnings.</div>`;
  const summaryText = `${diagnostics.acceptedReceivedRows} results, ${diagnostics.acceptedPlayerRows} player rows, ${diagnostics.selectedPageSize} byte pages`;
  return `
    <div class="diagnostics-panel">
      <div class="diagnostics-summary">${escapeHtml(summaryText)}</div>
      <div class="diagnostics-grid bws-diagnostics-grid">
        <div class="metadata-item"><div class="key">${term("File Size")}</div><div class="val">${escapeHtml(formatBytes(diagnostics.fileSize))}</div></div>
        <div class="metadata-item"><div class="key">${term("Jet Signature")}</div><div class="val">${escapeHtml(diagnostics.signature || "Missing")}</div></div>
        <div class="metadata-item"><div class="key">${term("Recognized Jet")}</div><div class="val">${escapeHtml(diagnostics.recognizedJet ? "yes" : "no")}</div></div>
        <div class="metadata-item"><div class="key">${term("Selected Page Size")}</div><div class="val">${escapeHtml(diagnostics.selectedPageSize)}</div></div>
        <div class="metadata-item"><div class="key">${term("Accepted Results")}</div><div class="val">${escapeHtml(diagnostics.acceptedReceivedRows)}</div></div>
        <div class="metadata-item"><div class="key">${term("Player Rows")}</div><div class="val">${escapeHtml(diagnostics.acceptedPlayerRows)}</div></div>
        <div class="metadata-item"><div class="key">${term("Duplicate Results")}</div><div class="val">${escapeHtml(diagnostics.duplicateReceivedRows)}</div></div>
        <div class="metadata-item"><div class="key">${term("Erased Results")}</div><div class="val">${escapeHtml(diagnostics.erasedRows || 0)}</div></div>
        <div class="metadata-item"><div class="key">${term("Deleted Row Slots")}</div><div class="val">${escapeHtml(diagnostics.deletedRowSlots || 0)}</div></div>
        <div class="metadata-item"><div class="key">${term("Rejected Row Slices")}</div><div class="val">${escapeHtml(received.rejectedRows || 0)}</div></div>
        <div class="metadata-item"><div class="key">${term("All-FF Pages")}</div><div class="val">${escapeHtml(pageProfile.allFfPageCount || 0)}</div></div>
      </div>
      <div class="preview-wrap">
        <table>
          <thead>
            <tr>
              ${th("Page Size")}
              ${th("Pages", "numeric")}
              ${th("Tail", "numeric")}
              ${th("Data Pages", "numeric")}
              ${th("Row Slots", "numeric")}
              ${th("Row Slices", "numeric")}
              ${th("Results", "numeric")}
              ${th("Players", "numeric")}
              ${th("Top ReceivedData Rejections")}
            </tr>
          </thead>
          <tbody>${candidateRows}</tbody>
        </table>
      </div>
      <div class="diagnostics-note">Selected-page profile: ${escapeHtml(formatPageTypes(pageProfile.pageTypes))}.</div>
      <div class="diagnostics-note">All-FF page runs: ${escapeHtml(erasedRuns)}.</div>
      <div class="diagnostics-note">Rejected row slices include non-result rows from other Jet tables and deleted row slots, so nonzero rejection counts are expected.</div>
      ${warningText}
    </div>
  `;
}

function renderResultOnlyMetrics(results) {
  const metrics = [
    { label: "Result Rows", value: results.summary.resultCount, note: `${results.summary.scoredCount} scored` },
    { label: "Boards", value: results.summary.boardsCovered, note: "covered by results" },
    { label: "Pairs", value: results.summary.pairs, note: results.participantMode === "side" ? "side partnerships" : "pair numbers" },
    { label: "Named Players", value: results.summary.namedPlayers || 0, note: `${results.summary.playerRecords} player rows` }
  ];

  document.getElementById("metricGrid").innerHTML = metrics.map((metric) => `
    <div class="metric">
      <div class="label">${escapeHtml(metric.label)}</div>
      <div class="value">${escapeHtml(metric.value)}</div>
      <div class="note">${escapeHtml(metric.note)}</div>
    </div>
  `).join("");
}

export {
  updateDropZone,
  appSubtitle,
  updateFileStatus,
  renderTaskNav,
  applyActiveView,
  renderMetrics,
  renderMetadata,
  renderQuality,
  renderResultsPanel,
  renderCompatibilityPanel,
  renderImportDiagnostics,
  renderImportDiagnosticsPanel,
  renderCsvDiagnostics,
  rejectionSummary,
  formatPageTypes,
  renderBwsDiagnostics,
  renderResultOnlyMetrics,
};
