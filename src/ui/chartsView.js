// SVG charts and notable-board summaries for the overview and results
// views.
import { DENOMS, SEATS } from "../core/constants.js";
import { average, escapeHtml, formatSigned, sum } from "../core/format.js";
import { col } from "./csvExport.js";
import { renderBoardJump } from "./dom.js";
import { STATE } from "./state.js";
import {
  annotateTermTooltips,
  setTermElementText,
  term,
  termDefinition,
  th,
  tooltipAttrs,
} from "./terms.js";

function renderResultsCharts(analysis, results) {
  const section = document.getElementById("resultsCharts");
  if (!results) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  document.getElementById("pairStandings").innerHTML = renderPairStandings(results);
  annotateTermTooltips(section);
}

function resultScoreOutlierSummaries(summaries) {
  const flagged = summaries.filter((summary) => Math.abs(summary.averageVsPar || 0) >= 200 || (summary.scoreSpread || 0) >= 800);
  const chosen = flagged.length
    ? flagged
    : [...summaries]
      .sort((a, b) => Math.max(Math.abs(b.averageVsPar || 0), (b.scoreSpread || 0) / 4) - Math.max(Math.abs(a.averageVsPar || 0), (a.scoreSpread || 0) / 4))
      .slice(0, Math.min(8, summaries.length));
  return [...chosen].sort((a, b) => a.boardNo - b.boardNo);
}

function renderResultScoreChart(results, outliersOnly = false) {
  let summaries = results.boardSummaries.filter((summary) => summary.averageNsScore != null);
  if (outliersOnly) summaries = resultScoreOutlierSummaries(summaries);
  if (!summaries.length) return `<div class="empty-state">No scored results to chart.</div>`;
  const width = Math.max(860, summaries.length * 28 + 92);
  const height = 310;
  const left = 48;
  const right = 22;
  const top = 20;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxAbs = Math.max(100, ...summaries.flatMap((summary) => [Math.abs(summary.averageNsScore || 0), Math.abs(summary.parNS || 0)]));
  const zeroY = top + plotHeight / 2;
  const step = plotWidth / summaries.length;
  const barWidth = Math.max(7, step - 6);
  const yFor = (value) => zeroY - (value / maxAbs) * (plotHeight / 2);
  const gridValues = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  const grid = gridValues.map((value) => {
    const y = yFor(value);
    return `
      <line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" stroke="${value === 0 ? "#607083" : "#e1e7ed"}" stroke-width="${value === 0 ? 1.4 : 1}" />
      <text x="${left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#607083" font-size="11">${escapeHtml(Math.round(value))}</text>
    `;
  }).join("");
  const bars = summaries.map((summary, index) => {
    const value = summary.averageNsScore || 0;
    const x = left + index * step + (step - barWidth) / 2;
    const y = Math.min(zeroY, yFor(value));
    const h = Math.abs(yFor(value) - zeroY);
    const parY = summary.parNS == null ? null : yFor(summary.parNS);
    const color = value >= 0 ? "#0f7b6c" : "#bb3f45";
    return `
      <g class="chart-board-mark" data-board-jump="${escapeHtml(summary.boardNo)}" tabindex="0" role="button" aria-label="Open board ${escapeHtml(summary.boardNo)}">
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" rx="2" fill="${color}">
          <title>Board ${escapeHtml(summary.boardNo)}: average NS ${escapeHtml(Math.round(value))}${summary.parNS == null ? "" : `, par ${escapeHtml(summary.parNS)}`}</title>
        </rect>
        ${parY == null ? "" : `<line x1="${(x - 2).toFixed(2)}" x2="${(x + barWidth + 2).toFixed(2)}" y1="${parY.toFixed(2)}" y2="${parY.toFixed(2)}" stroke="#17212b" stroke-width="2"><title>Par ${escapeHtml(summary.parNS)}</title></line>`}
      </g>
    `;
  }).join("");
  const labels = summaries.map((summary, index) => {
    if (index % Math.ceil(summaries.length / 12) !== 0 && index !== summaries.length - 1) return "";
    const x = left + index * step + step / 2;
    return `<text class="chart-board-label" data-board-jump="${escapeHtml(summary.boardNo)}" tabindex="0" role="button" aria-label="Open board ${escapeHtml(summary.boardNo)}" x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" fill="#607083" font-size="11">${escapeHtml(summary.boardNo)}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Actual average scores versus par by board">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      ${grid}
      ${bars}
      ${labels}
      <text x="${left}" y="${height - 4}" fill="#607083" font-size="11">Board</text>
    </svg>
    <div class="legend">
      <span class="legend-item"><span class="swatch" style="background:#0f7b6c"></span>Avg NS plus</span>
      <span class="legend-item"><span class="swatch" style="background:#bb3f45"></span>Avg NS minus</span>
      <span class="legend-item"><span class="swatch" style="background:#17212b"></span>PBN par</span>
    </div>
  `;
}

function renderContractClassLabel(label) {
  const definition = termDefinition(label);
  const classes = definition ? "contract-type-label term-tip" : "contract-type-label";
  return `<div class="${classes}"${tooltipAttrs(definition)}>${escapeHtml(label)}</div>`;
}

function renderResultContractChart(results) {
  const counts = results.summary.contractClasses;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-state">No contracts were found.</div>`;
  return `
    <div class="count-grid">
      ${entries.map(([key, value]) => `
        <div class="count-tile">
          <strong>${escapeHtml(value)}</strong>
          ${renderContractClassLabel(key)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderPairStandings(results) {
  const standings = results.pairStandings;
  if (!standings.length) return `<div class="empty-state">No pair standings could be calculated.</div>`;
  return `
    <table class="standings-table">
      <thead><tr><th scope="col">Rank</th><th scope="col">Pair</th><th scope="col">Players</th><th scope="col" class="numeric">MP</th><th scope="col" class="numeric">Pct</th><th scope="col">Form</th></tr></thead>
      <tbody>
        ${standings.map((standing) => `
          <tr>
            <td>${escapeHtml(standing.rank)}</td>
            <td>${escapeHtml(standing.pairNo)}</td>
            <td>${escapeHtml(standing.players || "")}</td>
            <td class="numeric">${escapeHtml(standing.matchpoints.toFixed(1))}</td>
            <td class="numeric">${escapeHtml(standing.percent == null ? "" : `${standing.percent.toFixed(1)}%`)}</td>
            <td><div class="mp-meter"><div class="mp-meter-fill" style="width:${Math.max(0, Math.min(100, standing.percent || 0)).toFixed(1)}%"></div></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function visualBoards(analysis, results) {
  if (!results) return analysis.boards;
  return analysis.boards.filter((board) => results.boardsByNumber.has(String(board.boardNo)));
}

function renderCharts(analysis, results) {
  const boards = visualBoards(analysis, results);
  const scoreTitle = document.getElementById("scoreChartTitle");
  const scoreCaption = document.getElementById("scoreChartCaption");
  if (results) {
    setTermElementText(scoreTitle, "Actual Scores Vs Par");
    scoreCaption.textContent = STATE.scoreOutliersOnly
      ? "Outlier played boards where field average or score spread most diverged from PBN par."
      : "Average table result by played board, scored from the NS perspective. The black tick is theoretical PBN par, not a cap on actual results.";
    document.getElementById("scoreChart").innerHTML = renderResultScoreChart(results, STATE.scoreOutliersOnly);
  } else {
    setTermElementText(scoreTitle, "Par Score By Board");
    scoreCaption.textContent = STATE.scoreOutliersOnly
      ? "Largest theoretical par swings and slam-level boards."
      : "Positive bars favor NS, negative bars favor EW.";
    document.getElementById("scoreChart").innerHTML = renderScoreChart(boards, STATE.scoreOutliersOnly);
  }
  document.getElementById("strainChart").innerHTML = renderStrainChart(boards);
  document.getElementById("hcpChart").innerHTML = renderHcpChart(boards);
  document.getElementById("heatMap").innerHTML = renderHeatMap(boards);
}

function scoreOutlierBoards(boards) {
  const flagged = boards
    .filter((board) => Math.abs(board.optimum.nsPerspective || 0) >= 500 || board.parContracts.some((contract) => contract.level >= 6));
  const chosen = flagged.length
    ? flagged
    : [...boards]
      .sort((a, b) => Math.abs(b.optimum.nsPerspective || 0) - Math.abs(a.optimum.nsPerspective || 0))
      .slice(0, Math.min(8, boards.length));
  return [...chosen].sort((a, b) => a.boardNo - b.boardNo);
}

function renderScoreChart(boards, outliersOnly = false) {
  if (outliersOnly) boards = scoreOutlierBoards(boards);
  if (!boards.length) return `<div class="empty-state">No boards to chart.</div>`;
  const width = Math.max(860, boards.length * 23 + 90);
  const height = 300;
  const left = 46;
  const right = 20;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxAbs = Math.max(100, ...boards.map((board) => Math.abs(board.optimum.nsPerspective || 0)));
  const zeroY = top + plotHeight / 2;
  const barGap = 3;
  const step = plotWidth / boards.length;
  const barWidth = Math.max(5, step - barGap);
  const yFor = (value) => zeroY - (value / maxAbs) * (plotHeight / 2);
  const gridValues = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  const grid = gridValues.map((value) => {
    const y = yFor(value);
    return `
      <line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" stroke="${value === 0 ? "#607083" : "#e1e7ed"}" stroke-width="${value === 0 ? 1.4 : 1}" />
      <text x="${left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#607083" font-size="11">${escapeHtml(Math.round(value))}</text>
    `;
  }).join("");

  const bars = boards.map((board, index) => {
    const value = board.optimum.nsPerspective || 0;
    const x = left + index * step + barGap / 2;
    const y = Math.min(zeroY, yFor(value));
    const h = Math.abs(yFor(value) - zeroY);
    const color = value >= 0 ? "#0f7b6c" : "#bb3f45";
    return `
      <g class="chart-board-mark" data-board-jump="${escapeHtml(board.boardNo)}" tabindex="0" role="button" aria-label="Open board ${escapeHtml(board.boardNo)}">
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" rx="2" fill="${color}">
          <title>Board ${escapeHtml(board.boardNo)}: NS ${escapeHtml(formatSigned(value))}; ${escapeHtml(board.tags.ParContract || "No par contract")}</title>
        </rect>
      </g>
    `;
  }).join("");

  const labels = boards.map((board, index) => {
    if (index % Math.ceil(boards.length / 12) !== 0 && index !== boards.length - 1) return "";
    const x = left + index * step + barWidth / 2;
    return `<text class="chart-board-label" data-board-jump="${escapeHtml(board.boardNo)}" tabindex="0" role="button" aria-label="Open board ${escapeHtml(board.boardNo)}" x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" fill="#607083" font-size="11">${escapeHtml(board.boardNo)}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Par score by board">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      ${grid}
      ${bars}
      ${labels}
      <text x="${left}" y="${height - 4}" fill="#607083" font-size="11">Board</text>
    </svg>
    <div class="legend">
      <span class="legend-item"><span class="swatch" style="background:#0f7b6c"></span>NS score</span>
      <span class="legend-item"><span class="swatch" style="background:#bb3f45"></span>EW score</span>
    </div>
  `;
}

function renderStrainChart(boards) {
  const parContracts = boards.flatMap((board) => board.parContracts || []);
  const counts = DENOMS.map((denom) => ({
    ...denom,
    count: parContracts.filter((contract) => contract.strain === denom.key).length
  })).filter((entry) => entry.count > 0);
  const total = sum(counts.map((entry) => entry.count));
  if (!total) return `<div class="empty-state">No par strains found for the current board set.</div>`;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const gapSize = counts.length > 1 ? 3 : 0;
  const circles = counts.map((entry) => {
    const length = (entry.count / total) * circumference;
    const visible = Math.max(1.5, length - gapSize);
    const circle = `
      <circle cx="88" cy="88" r="${radius}" fill="none" stroke="${entry.color}" stroke-width="30"
        stroke-dasharray="${visible.toFixed(2)} ${(circumference - visible).toFixed(2)}"
        stroke-dashoffset="${(-(offset + gapSize / 2)).toFixed(2)}" transform="rotate(-90 88 88)">
        <title>${escapeHtml(entry.label)}: ${entry.count}</title>
      </circle>`;
    offset += length;
    return circle;
  }).join("");

  const legend = counts.map((entry) => `
    <span class="legend-item">
      <span class="swatch" style="background:${entry.color}"></span>${term(entry.label)} ${escapeHtml(entry.count)}
    </span>
  `).join("");

  return `
    <svg viewBox="0 0 176 176" role="img" aria-label="Par strain distribution" style="margin:auto">
      <circle cx="88" cy="88" r="${radius}" fill="none" stroke="#edf1f5" stroke-width="30"></circle>
      ${circles}
      <text x="88" y="83" text-anchor="middle" font-size="24" font-weight="800" fill="#17212b">${total}</text>
      <text x="88" y="104" text-anchor="middle" font-size="12" fill="#607083">contracts</text>
    </svg>
    <div class="legend">${legend}</div>
  `;
}

function renderHcpChart(boards) {
  if (!boards.length) return `<div class="empty-state">No boards to summarize.</div>`;
  const entries = [
    ...SEATS.map((seat) => ({ label: seat, value: average(boards.map((board) => board.hands[seat].hcp)), max: 20 })),
    { label: "NS", value: average(boards.map((board) => board.pairs.NS.hcp)), max: 40 },
    { label: "EW", value: average(boards.map((board) => board.pairs.EW.hcp)), max: 40 }
  ];

  return `
    <div class="hcp-bars">
      ${entries.map((entry) => `
        <div class="hcp-bar">
          <strong>${escapeHtml(entry.label)}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (entry.value / entry.max) * 100).toFixed(1)}%"></div></div>
          <span>${entry.value.toFixed(1)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function hcpColor(hcp) {
  const t = Math.max(0, Math.min(1, hcp / 22));
  const low = [237, 242, 247];
  const high = [15, 123, 108];
  const rgb = low.map((component, index) => Math.round(component + (high[index] - component) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function renderHeatMap(boards) {
  if (!boards.length) return `<div class="empty-state">No boards to map.</div>`;
  const cellW = 22;
  const cellH = 23;
  const left = 34;
  const top = 16;
  const width = left + boards.length * cellW + 18;
  const height = top + SEATS.length * cellH + 36;
  const cells = [];
  SEATS.forEach((seat, row) => {
    cells.push(`<text x="8" y="${top + row * cellH + 16}" fill="#607083" font-size="12" font-weight="700">${seat}</text>`);
    boards.forEach((board, col) => {
      const hcp = board.hands[seat].hcp;
      const x = left + col * cellW;
      const y = top + row * cellH;
      cells.push(`
        <rect class="chart-board-mark" data-board-jump="${escapeHtml(board.boardNo)}" tabindex="0" role="button" aria-label="Board ${escapeHtml(board.boardNo)} ${escapeHtml(seat)}: ${escapeHtml(hcp)} HCP" x="${x}" y="${y}" width="18" height="18" rx="3" fill="${hcpColor(hcp)}" stroke="#ffffff">
          <title>Board ${escapeHtml(board.boardNo)} ${seat}: ${hcp} HCP</title>
        </rect>
      `);
    });
  });

  boards.forEach((board, index) => {
    if (index % Math.ceil(boards.length / 12) !== 0 && index !== boards.length - 1) return;
    const x = left + index * cellW + 9;
    cells.push(`<text class="chart-board-label" data-board-jump="${escapeHtml(board.boardNo)}" tabindex="0" role="button" aria-label="Open board ${escapeHtml(board.boardNo)}" x="${x}" y="${height - 8}" fill="#607083" font-size="10" text-anchor="middle">${escapeHtml(board.boardNo)}</text>`);
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="HCP heat map by board and seat">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      ${cells.join("")}
    </svg>
  `;
}

function renderNotables(analysis, boards) {
  const currentBoards = boards || analysis.boards;
  const groups = [];
  const boardByNo = new Map(currentBoards.map((board) => [String(board.boardNo), board]));
  const row = (boardNo, detail) => `
    <li>
      ${renderBoardJump(boardNo)}
      <span>${detail}</span>
    </li>
  `;
  const addGroup = (title, summary, rows, tone = "") => {
    const visibleRows = rows.filter(Boolean).slice(0, 6);
    if (!visibleRows.length) return;
    groups.push({ title, summary, rows: visibleRows, tone });
  };

  const largestScores = [...currentBoards]
    .filter((board) => board.optimum.nsPerspective != null)
    .sort((a, b) => Math.abs(b.optimum.nsPerspective || 0) - Math.abs(a.optimum.nsPerspective || 0))
    .slice(0, 5);
  const parSwingRows = largestScores.map((board) => {
    const edge = board.optimum.edge === "NS" ? "NS" : board.optimum.edge === "EW" ? "EW" : "flat";
    return row(
      board.boardNo,
      `High theoretical swing: ${escapeHtml(edge)} ${escapeHtml(Math.abs(board.optimum.nsPerspective || 0))}, ${escapeHtml(board.tags.ParContract || "no par")}.`
    );
  });

  const slamBoards = currentBoards
    .filter((board) => board.parContracts.some((contract) => contract.level >= 6))
    .slice(0, 6)
    .map((board) => row(board.boardNo, `Slam-level par: ${escapeHtml(board.tags.ParContract || "no par")}. Check whether the field bid enough.`));

  const resultOutliers = STATE.results
    ? [...STATE.results.boardSummaries]
      .filter((summary) => summary.averageVsPar != null && boardByNo.has(String(summary.boardNo)))
      .sort((a, b) => Math.abs(b.averageVsPar || 0) - Math.abs(a.averageVsPar || 0))
      .slice(0, 6)
      .map((summary) => row(
        summary.boardNo,
        `Field average was ${escapeHtml(formatSigned(Math.round(summary.averageVsPar)))} from PBN par; spread ${escapeHtml(summary.scoreSpread == null ? "n/a" : summary.scoreSpread)}.`
      ))
    : [];

  addGroup(
    "Review Bidding Choices",
    "Boards where contract level, strain, or field-vs-par divergence is likely to matter.",
    [...resultOutliers, ...slamBoards, ...parSwingRows],
    "gold"
  );

  const voidBoards = currentBoards
    .filter((board) => board.voids.length)
    .slice(0, 6)
    .map((board) => row(board.boardNo, `Voids: ${escapeHtml(board.voids.join(", "))}. Expect unusual auction and play choices.`));

  const longSuitBoards = currentBoards
    .filter((board) => board.longSuits.length)
    .slice(0, 6)
    .map((board) => row(board.boardNo, `Seven-card or longer suit: ${escapeHtml(board.longSuits.join(", "))}. Check preempts, competition, and suit establishment.`));

  const imbalances = [...currentBoards]
    .sort((a, b) => Math.abs(b.hcpDeltaNS) - Math.abs(a.hcpDeltaNS))
    .filter((board) => Math.abs(board.hcpDeltaNS) >= 12)
    .slice(0, 5)
    .map((board) => row(board.boardNo, `Large HCP imbalance: NS-EW ${escapeHtml(`${board.hcpNS}-${board.hcpEW}`)}.`));

  addGroup(
    "Inspect Play And Defense",
    "Distributional boards where opening lead, timing, and safety plays can create large swings.",
    [...voidBoards, ...longSuitBoards, ...imbalances]
  );

  const dataIssueRows = currentBoards
    .filter((board) => board.issues.length)
    .slice(0, 6)
    .map((board) => row(board.boardNo, `Data issue: ${escapeHtml(board.issues.join("; "))}.`));
  addGroup(
    "Check Data Quality",
    "Boards where missing PBN fields may affect downstream analysis.",
    dataIssueRows,
    "red"
  );

  if (!groups.length) {
    document.getElementById("notableList").innerHTML = `<div class="empty-state">${escapeHtml(currentBoards.length ? "No notable outliers found in the current board set." : "No played PBN boards are available for this view.")}</div>`;
    return;
  }

  document.getElementById("notableList").innerHTML = groups.map((group) => `
    <article class="notable-group ${escapeHtml(group.tone)}">
      <div class="notable-group-head">
        <span class="dot ${escapeHtml(group.tone)}"></span>
        <div>
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(group.summary)}</p>
        </div>
      </div>
      <ul>${group.rows.join("")}</ul>
    </article>
  `).join("");
}

export {
  renderResultsCharts,
  resultScoreOutlierSummaries,
  renderResultScoreChart,
  renderContractClassLabel,
  renderResultContractChart,
  renderPairStandings,
  visualBoards,
  renderCharts,
  scoreOutlierBoards,
  renderScoreChart,
  renderStrainChart,
  renderHcpChart,
  hcpColor,
  renderHeatMap,
  renderNotables,
};
