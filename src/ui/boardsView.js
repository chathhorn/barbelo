// The board explorer: list, filters, the board card (deal diagram,
// traveler, double dummy, tags), and the board preview overlay.
import { getDoubleDummyTricks, vulLabel, vulSides } from "../core/boards.js";
import { DENOMS, SUITS, seatName, suitMeta } from "../core/constants.js";
import {
  contractGlyphHtml,
  countBy,
  escapeHtml,
  formatMp,
  formatSigned,
  plural,
} from "../core/format.js";
import { applyActiveView, renderTaskNav } from "./dashboard.js";
import { setElementHidden, showToast } from "./dom.js";
import { STATE } from "./state.js";
import { annotateTermTooltips, th } from "./terms.js";

function boardSearchText(board) {
  const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
  return [
    board.boardNo,
    board.dealer,
    board.vulnerable,
    board.tags.ParContract,
    board.tags.OptimumScore,
    board.deal.raw,
    board.voids.join(" "),
    board.longSuits.join(" "),
    resultSummary ? resultSummary.rows.map((row) => `${row.contract} ${row.result} ${row.pairNS} ${row.pairEW} ${row.scoreNS} ${row.nsPlayers} ${row.ewPlayers} ${row.declarerName}`).join(" ") : ""
  ].join(" ").toLowerCase();
}

function renderBoards() {
  const analysis = STATE.analysis;
  if (!analysis) return;

  const search = STATE.filters.search.trim().toLowerCase();
  const filtered = analysis.boards.filter((board) => {
    const hasResult = Boolean(STATE.results && STATE.results.boardsByNumber.has(String(board.boardNo)));
    if (search && !boardSearchText(board).includes(search)) return false;
    if (STATE.filters.side !== "all" && board.optimum.edge !== STATE.filters.side) return false;
    if (STATE.filters.className !== "all" && board.className !== STATE.filters.className) return false;
    if (STATE.filters.vulnerability !== "all" && board.vulnerable !== STATE.filters.vulnerability) return false;
    if (STATE.filters.played === "played" && !hasResult) return false;
    if (STATE.filters.played === "unplayed" && hasResult) return false;
    return true;
  });

  document.getElementById("boardCountCaption").textContent = `${plural(filtered.length, "board")} shown from ${analysis.summary.boardCount}.`;
  const selected = filtered.find((board) => String(board.boardNo) === String(STATE.selectedBoardNo)) || filtered[0] || null;
  STATE.selectedBoardNo = selected ? String(selected.boardNo) : "";
  document.getElementById("boardGrid").innerHTML = filtered.length
    ? `
      <div class="board-workspace">
        <div class="board-list-panel">
          ${renderBoardList(filtered, selected)}
        </div>
        <div class="board-detail-panel">
          ${selected ? renderBoardCard(selected) : `<div class="empty-state">Select a board to inspect.</div>`}
        </div>
      </div>
    `
    : `<div class="empty-state">No boards match the current filters.</div>`;
  annotateTermTooltips(document.getElementById("boardGrid"));
}

function renderBoardList(boards, selected) {
  return `
    <div class="board-list-wrap">
      <table class="board-list-table">
        <thead>
          <tr>
            <th scope="col">Board</th>
            <th scope="col">D &middot; Vul</th>
            <th scope="col">Par</th>
            <th scope="col" class="numeric">NS</th>
            <th scope="col" class="numeric">#</th>
            <th scope="col" class="numeric">Avg</th>
          </tr>
        </thead>
        <tbody>
          ${boards.map((board) => renderBoardListRow(board, selected)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBoardListRow(board, selected) {
  const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
  const selectedClass = selected && String(selected.boardNo) === String(board.boardNo) ? " selected" : "";
  const vulShort = { None: "-", NS: "NS", EW: "EW", All: "Both" }[board.vulnerable] || "?";
  const vul = vulSides(board.vulnerable);
  return `
    <tr class="${selectedClass}">
      <td><button type="button" class="board-row-button" data-board-select="${escapeHtml(board.boardNo)}">Board ${escapeHtml(board.boardNo)}</button></td>
      <td class="board-dv">${escapeHtml(board.dealer || "?")} &middot; <span class="${vul.ns || vul.ew ? "vul-text" : ""}">${escapeHtml(vulShort)}</span></td>
      <td class="contract">${contractGlyphHtml((board.tags.ParContract || "No par").replace(/\b(NS|EW|[NSEW])\s+(?=[1-7])/gi, ""))}</td>
      <td class="numeric">${escapeHtml(board.optimum.nsPerspective == null ? "" : formatSigned(board.optimum.nsPerspective))}</td>
      <td class="numeric">${escapeHtml(resultSummary ? resultSummary.resultCount : "")}</td>
      <td class="numeric">${escapeHtml(resultSummary && resultSummary.averageNsScore != null ? formatSigned(Math.round(resultSummary.averageNsScore)) : "")}</td>
    </tr>
  `;
}

function boardElementId(boardNo) {
  const safe = String(boardNo == null ? "" : boardNo).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `board-explorer-${safe || "unknown"}`;
}

function makeableSummary(board, pair) {
  if (!board.optimumRows.length) return "";
  const best = new Map();
  board.optimumRows.forEach((row) => {
    if (row.pair !== pair || row.makeableLevel < 1) return;
    const current = best.get(row.denomination) || 0;
    if (row.makeableLevel > current) best.set(row.denomination, row.makeableLevel);
  });
  if (!best.size) return "nothing";
  const denomOrder = ["N", "S", "H", "D", "C"];
  return Array.from(best.entries())
    .sort((a, b) => b[1] - a[1] || denomOrder.indexOf(a[0]) - denomOrder.indexOf(b[0]))
    .slice(0, 4)
    .map(([denom, level]) => contractGlyphHtml(`${level} ${denom === "N" ? "NT" : denom}`))
    .join(", ");
}

function mostPlayedSummary(resultSummary) {
  if (!resultSummary) return "";
  const played = resultSummary.rows.filter((row) => row.contract && row.contract !== "PASS");
  if (!played.length) return "";
  const counts = countBy(played.map((row) => `${row.contract} by ${row.declarerSide || "?"}`));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return `${contractGlyphHtml(top[0])} (${escapeHtml(top[1])}&times;)`;
}

function parChipHtml(board) {
  const parText = String(board.tags.ParContract || "").trim();
  const score = board.optimum.nsPerspective;
  if (score == null && !parText) return "";
  const scorePart = score == null ? "" : `Par NS ${formatSigned(score)}`;
  const contractPart = parText ? contractGlyphHtml(parText.replace(/\b(NS|EW|[NSEW])\s+(?=[1-7])/gi, "")) : "";
  return `<span class="contract-chip">${[scorePart, contractPart].filter(Boolean).join(" &middot; ")}</span>`;
}

function renderBoardCard(board, options = {}) {
  const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
  const cardId = options.id || boardElementId(board.boardNo);
  const className = options.className ? ` ${options.className}` : "";
  const vul = vulSides(board.vulnerable);
  const boardTop = resultSummary ? Math.max(0, ...resultSummary.rows.map((row) => row.boardTop || 0)) : 0;
  const travelerLabel = resultSummary
    ? `Traveler - ${plural(resultSummary.resultCount, "result")}${boardTop ? `, top ${formatMp(boardTop)}` : ""}`
    : "";
  return `
    <article class="board-card${escapeHtml(className)}" id="${escapeHtml(cardId)}" data-board-no="${escapeHtml(board.boardNo)}" tabindex="-1">
      <div class="board-card-header">
        <div class="board-placard">
          <strong class="board-no">Board ${escapeHtml(board.boardNo)}</strong>
          <span class="board-dealer">Dealer <b>${escapeHtml(seatName(board.dealer) || "?")}</b></span>
          <span class="vul-chip${vul.ns || vul.ew ? " vul" : ""}"><span class="dot" aria-hidden="true"></span>${escapeHtml(vulLabel(board.vulnerable))}</span>
        </div>
        ${parChipHtml(board)}
      </div>
      <div class="board-card-body">
        ${renderDealDiagram(board, resultSummary)}
        ${resultSummary ? `
        <div class="board-section">
          <div class="board-section-label">${escapeHtml(travelerLabel)}</div>
          ${renderBoardTraveler(board)}
        </div>` : ""}
        ${board.optimumRows.length ? `
        <div class="board-section">
          <div class="board-section-label">Double dummy - tricks by declarer</div>
          ${renderDoubleDummyTable(board)}
        </div>` : ""}
        <details class="board-details">
          <summary>Raw PBN tags</summary>
          ${renderBoardTagTable(board)}
        </details>
      </div>
    </article>
  `;
}

function syncBoardFilterControls() {
  const controls = [
    ["boardSearch", "search"],
    ["sideFilter", "side"],
    ["classFilter", "className"],
    ["vulFilter", "vulnerability"],
    ["playedFilter", "played"]
  ];
  controls.forEach(([id, key]) => {
    const element = document.getElementById(id);
    if (element) element.value = STATE.filters[key];
  });
}

function selectBoardInExplorer(boardNo, options = {}) {
  STATE.selectedBoardNo = String(boardNo);
  renderBoards();
  const target = document.getElementById(boardElementId(boardNo));
  if (!target) {
    if (options.showError) showToast(`Board ${boardNo} could not be shown in the explorer.`, "error");
    return null;
  }
  document.querySelectorAll(".board-card.board-card-target").forEach((card) => {
    card.classList.remove("board-card-target");
  });
  target.classList.add("board-card-target");
  if (options.scroll !== false) target.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
  return target;
}

function boardByNumber(boardNo) {
  if (!STATE.analysis) return null;
  const key = String(boardNo);
  return STATE.analysis.boards.find((board) => String(board.boardNo) === key) || null;
}

function showBoardOverlay(boardNo) {
  const board = boardByNumber(boardNo);
  if (!board) {
    showToast(STATE.analysis ? `Board ${boardNo} is not in the loaded PBN.` : "Open a PBN to preview a board.", "error");
    return;
  }
  const overlay = document.getElementById("boardOverlay");
  const body = document.getElementById("boardOverlayBody");
  const title = document.getElementById("boardOverlayTitle");
  const closeButton = document.getElementById("boardOverlayClose");
  if (!overlay || !body || !title || !closeButton) return;

  showBoardOverlay.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.setAttribute("data-board-no", String(board.boardNo));
  title.textContent = "Board Preview";
  body.innerHTML = renderBoardCard(board, {
    id: `board-overlay-${String(board.boardNo).replace(/[^A-Za-z0-9_-]+/g, "-") || "unknown"}`,
    className: "overlay-board-card"
  });
  overlay.classList.remove("hidden");
  document.body.classList.add("modal-open");
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = true;
  annotateTermTooltips(body);
  closeButton.focus();
}

function closeBoardOverlay({ restoreFocus = true } = {}) {
  const overlay = document.getElementById("boardOverlay");
  const body = document.getElementById("boardOverlayBody");
  if (!overlay || overlay.classList.contains("hidden")) return;
  overlay.classList.add("hidden");
  overlay.removeAttribute("data-board-no");
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = false;
  if (body) body.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (restoreFocus && showBoardOverlay.returnFocus && document.contains(showBoardOverlay.returnFocus)) {
    showBoardOverlay.returnFocus.focus();
  }
  showBoardOverlay.returnFocus = null;
}

function revealBoardInExplorer(boardNo) {
  if (!STATE.analysis) {
    showToast("Open a PBN to jump to a board in the explorer.", "error");
    return;
  }

  const boardKey = String(boardNo);
  const boardExists = STATE.analysis.boards.some((board) => String(board.boardNo) === boardKey);
  if (!boardExists) {
    showToast(`Board ${boardKey} is not in the loaded PBN.`, "error");
    return;
  }

  setElementHidden("boardExplorerPanel", false);
  const disclosure = document.getElementById("boardExplorerDisclosure");
  if (disclosure) disclosure.open = true;
  STATE.activeView = "boards";
  renderTaskNav(STATE.analysis, STATE.results);
  applyActiveView();

  STATE.filters.search = "";
  STATE.filters.side = "all";
  STATE.filters.className = "all";
  STATE.filters.vulnerability = "all";
  STATE.filters.played = "all";
  syncBoardFilterControls();
  selectBoardInExplorer(boardNo, { showError: true });
}

function renderBoardTraveler(board) {
  const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
  if (!resultSummary) return `<div class="empty-state">No uploaded traveler rows for this board.</div>`;
  const rows = [...resultSummary.rows].sort((a, b) =>
    (b.scoreNS == null ? -1e9 : b.scoreNS) - (a.scoreNS == null ? -1e9 : a.scoreNS) ||
    (a.tableNo || 0) - (b.tableNo || 0));
  const scored = rows.filter((row) => row.scoreNS != null);
  const rankByScore = new Map();
  scored.forEach((row, index) => {
    if (!rankByScore.has(row.scoreNS)) rankByScore.set(row.scoreNS, index + 1);
  });
  const tieCounts = countBy(scored.map((row) => String(row.scoreNS)));
  const hasPar = rows.some((row) => row.vsParNS != null);
  const reportKey = STATE.reportPair == null ? "" : String(STATE.reportPair);
  return `
    <div class="traveler-wrap">
      <table class="traveler-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Contract</th>
            <th scope="col">By</th>
            <th scope="col">Result</th>
            <th scope="col" class="numeric">NS Score</th>
            <th scope="col" class="numeric">NS MP</th>
            ${hasPar ? `<th scope="col" class="numeric">Vs Par</th>` : ""}
            <th scope="col">Pairs</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const rank = row.scoreNS == null
              ? ""
              : `${rankByScore.get(row.scoreNS)}${tieCounts[String(row.scoreNS)] > 1 ? "=" : ""}`;
            const isTop = row.scoreNS != null && rankByScore.get(row.scoreNS) === 1;
            const isReport = reportKey && (String(row.nsParticipantKey) === reportKey || String(row.ewParticipantKey) === reportKey);
            const mpPct = row.boardTop && row.nsMatchpoints != null ? (row.nsMatchpoints / row.boardTop) * 100 : null;
            const contractCell = row.adjustment && row.scoreNS == null
              ? escapeHtml(`Adjusted ${row.adjustment.nsPercent}%/${row.adjustment.ewPercent}%`)
              : contractGlyphHtml(row.contract || "-");
            const names = [row.nsPlayers, row.ewPlayers].filter(Boolean).join(" vs ");
            return `
            <tr class="${[isTop ? "traveler-top" : "", isReport ? "traveler-selected" : ""].filter(Boolean).join(" ")}">
              <td class="numeric">${escapeHtml(rank)}</td>
              <td class="contract">${contractCell}</td>
              <td>${escapeHtml(row.declarerSide || "")}${row.declarerName ? `<span class="cell-note">${escapeHtml(row.declarerName)}</span>` : ""}</td>
              <td>${escapeHtml(row.result || "")}</td>
              <td class="numeric score ${row.scoreNS > 0 ? "pos" : row.scoreNS < 0 ? "neg" : ""}">${escapeHtml(row.scoreNS == null ? "" : formatSigned(row.scoreNS))}</td>
              <td class="numeric">${row.nsMatchpoints == null ? "" : `${escapeHtml(formatMp(row.nsMatchpoints))}${mpPct == null ? "" : `<span class="mp-bar" aria-hidden="true"><i style="width:${mpPct.toFixed(0)}%"></i></span>`}`}</td>
              ${hasPar ? `<td class="numeric">${escapeHtml(row.vsParNS == null ? "" : formatSigned(row.vsParNS))}</td>` : ""}
              <td class="traveler-pairs">${escapeHtml(row.pairNS == null ? "" : row.pairNS)} v ${escapeHtml(row.pairEW == null ? "" : row.pairEW)}${isReport ? `<span class="cell-note">Selected pair</span>` : ""}${names ? `<span class="cell-note pair-names" title="${escapeHtml(names)}">${escapeHtml(names)}</span>` : ""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDealDiagram(board, resultSummary) {
  if (!board.deal || !board.deal.raw) {
    return `<div class="deal-missing">No deal recorded for this board.</div>`;
  }
  const vul = vulSides(board.vulnerable);
  const dealerClass = { N: "n", E: "e", S: "s", W: "w" }[board.dealer] || "";
  const nsMakeable = makeableSummary(board, "NS");
  const ewMakeable = makeableSummary(board, "EW");
  const hcpTotal = (board.hcpNS + board.hcpEW) || 1;
  const makeableCorner = nsMakeable || ewMakeable
    ? `<div class="deal-corner corner-nw"><b>Makeable</b><br>NS: ${nsMakeable || "?"} &middot; EW: ${ewMakeable || "?"}</div>`
    : `<div class="deal-corner corner-nw"></div>`;
  const mostPlayed = mostPlayedSummary(resultSummary);
  return `
    <div class="deal-diagram">
      ${makeableCorner}
      <div class="deal-corner corner-ne">
        <b>HCP</b> <span class="num">NS ${escapeHtml(board.hcpNS)} &middot; EW ${escapeHtml(board.hcpEW)}</span>
        <div class="hcp-split-bar" role="img" aria-label="High-card points: NS ${escapeHtml(board.hcpNS)}, EW ${escapeHtml(board.hcpEW)}"><span class="ns" style="width:${((board.hcpNS / hcpTotal) * 100).toFixed(1)}%"></span><span class="ew" style="width:${((board.hcpEW / hcpTotal) * 100).toFixed(1)}%"></span></div>
      </div>
      ${renderHandBlock(board, "N")}
      ${renderHandBlock(board, "W")}
      <div class="deal-table" role="img" aria-label="Board ${escapeHtml(board.boardNo)}, dealer ${escapeHtml(seatName(board.dealer) || "unknown")}, ${escapeHtml(vulLabel(board.vulnerable))}">
        <span class="band ns top${vul.ns ? " vul" : ""}"></span>
        <span class="band ns bottom${vul.ns ? " vul" : ""}"></span>
        <span class="band ew left${vul.ew ? " vul" : ""}"></span>
        <span class="band ew right${vul.ew ? " vul" : ""}"></span>
        ${dealerClass ? `<span class="dealer-pip ${dealerClass}" aria-hidden="true">D</span>` : ""}
        <span class="deal-table-center"><b>${escapeHtml(board.boardNo)}</b>${escapeHtml(vulLabel(board.vulnerable))}</span>
      </div>
      ${renderHandBlock(board, "E")}
      ${renderHandBlock(board, "S")}
      <div class="deal-corner corner-sw">${resultSummary ? `<b>Field</b><br>${escapeHtml(plural(resultSummary.resultCount, "table"))}${resultSummary.averageNsScore == null ? "" : ` &middot; avg NS <span class="num">${escapeHtml(formatSigned(Math.round(resultSummary.averageNsScore)))}</span>`}` : ""}</div>
      <div class="deal-corner corner-se">${mostPlayed ? `<b>Most played</b><br>${mostPlayed}` : ""}</div>
    </div>
  `;
}

function renderHandBlock(board, seat) {
  const hand = board.hands[seat];
  const player = board.tags[seatName(seat)] || "";
  const shapeText = hand.shape ? hand.shape.replace(/-/g, "=") : "";
  return `
    <div class="hand-block seat-${seat.toLowerCase()}">
      <div class="hand-head">
        <span class="hand-seat">${escapeHtml(seatName(seat).toUpperCase())}${player ? ` &middot; ${escapeHtml(player)}` : ""}</span>
        <span class="hand-hcp">${escapeHtml(hand.hcp)} <span>HCP</span></span>
      </div>
      ${SUITS.map((suit) => `
        <div class="hand-suit">
          <span class="suit-glyph ${suit.className}">${suit.html}</span>
          ${hand.cards[suit.key]
            ? `<span class="hand-cards">${escapeHtml(hand.cards[suit.key])}</span>`
            : `<span class="hand-void">void</span>`}
        </div>
      `).join("")}
      <div class="hand-shape">${shapeText ? `${escapeHtml(shapeText)} &middot; ` : ""}${escapeHtml(plural(hand.controls, "control"))}</div>
    </div>
  `;
}

function renderDoubleDummyTable(board) {
  if (!board.optimumRows.length) return `<div class="empty-state">No double-dummy table found for this board.</div>`;
  const gameTricks = { N: 9, S: 10, H: 10, D: 11, C: 11 };
  const ddSeats = ["N", "S", "E", "W"];
  return `
    <div class="dd-wrap">
      <table class="dd-table">
        <thead>
          <tr>
            <th scope="col">Declarer</th>
            ${DENOMS.map((denom) => `<th scope="col">${denom.key === "N" ? "NT" : `<span class="suit-glyph ${suitMeta(denom.key).className}">${suitMeta(denom.key).html}</span>`}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${ddSeats.map((seat) => `
            <tr>
              <th scope="row">${seat}</th>
              ${DENOMS.map((denom) => {
                const tricks = getDoubleDummyTricks(board, seat, denom.key);
                const value = tricks === "" ? null : Number(tricks);
                const cellClass = value == null ? "" : value >= gameTricks[denom.key] ? " class=\"dd-game\"" : value >= 7 ? " class=\"dd-part\"" : "";
                return `<td${cellClass}>${escapeHtml(tricks)}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="dd-note">Shaded cells make a contract; gold marks a game or slam. Faded cells go down.</div>
  `;
}

function renderBoardTagTable(board) {
  const visibleKeys = ["Event", "Site", "Date", "Dealer", "Vulnerable", "Deal", "Declarer", "Contract", "Result", "ParContract", "OptimumScore"];
  const rows = visibleKeys
    .map((key) => [key, board.tags[key]])
    .filter(([, value]) => value != null && String(value).trim() !== "");
  if (board.issues.length) rows.push(["Issues", board.issues.join("; ")]);
  if (!rows.length) return `<div class="empty-state">No PBN tags recorded for this board.</div>`;
  return `
    <table>
      <thead><tr><th scope="col">Tag</th><th scope="col">Value</th></tr></thead>
      <tbody>
        ${rows.map(([key, value]) => `
          <tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export {
  boardSearchText,
  renderBoards,
  renderBoardList,
  renderBoardListRow,
  boardElementId,
  makeableSummary,
  mostPlayedSummary,
  parChipHtml,
  renderBoardCard,
  syncBoardFilterControls,
  selectBoardInExplorer,
  boardByNumber,
  showBoardOverlay,
  closeBoardOverlay,
  revealBoardInExplorer,
  renderBoardTraveler,
  renderDealDiagram,
  renderHandBlock,
  renderDoubleDummyTable,
  renderBoardTagTable,
};
