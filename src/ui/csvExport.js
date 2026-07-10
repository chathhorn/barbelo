// The CSV builder: column definitions per row mode, preview, and
// download.
import { firstDirective, getDoubleDummyTricks } from "../core/boards.js";
import {
  DENOMS,
  PAIRS,
  SEATS,
  denomMeta,
  seatName,
} from "../core/constants.js";
import { csvCell, escapeHtml, plural } from "../core/format.js";
import { showToast } from "./dom.js";
import { STATE } from "./state.js";
import { annotateTermTooltips, term, termDefinition, th } from "./terms.js";

function pbnFileName(analysis) {
  return analysis && analysis.parsed ? analysis.parsed.fileName || "" : "";
}

function defaultColumnKeys(mode, analysis) {
  const defaults = {
    boards: ["board", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score", "par_class", "hcp_ns", "hcp_ew", "hcp_delta_ns", "shape_n", "shape_e", "shape_s", "shape_w", "valid_deal"],
    hands: ["board", "dealer", "vulnerable", "seat", "pair", "hand", "hcp", "shape", "spades", "hearts", "diamonds", "clubs", "voids", "longest_suit"],
    pairs: ["board", "dealer", "vulnerable", "pair", "hcp", "hcp_delta_ns", "spades", "hearts", "diamonds", "clubs", "best_fit", "major_fit", "minor_fit", "par_contract", "ns_score"],
    doubleDummy: ["board", "dealer", "vulnerable", "declarer", "pair", "denomination", "tricks", "makeable_level"],
    tags: ["record_index", "board", ...((analysis && analysis.tagKeys) || []).slice(0, 12).map((key) => `tag_${key}`)],
    results: ["board", "round", "table", "pair_ns", "ns_players", "pair_ew", "ew_players", "declarer_side", "declarer_name", "contract", "result", "score_ns", "par_ns", "vs_par_ns", "ns_matchpoints", "ns_percent", "dd_delta"],
    boardResults: ["board", "result_count", "par_ns", "average_ns_score", "average_vs_par", "score_spread", "contract_summary", "top_ns", "top_ew"],
    pairResults: ["rank", "pair", "players", "matchpoints", "top", "percent", "boards", "ns_boards", "ew_boards", "average_score"]
  };
  return defaults[mode] || defaults.boards;
}

function getColumnDefs(mode, analysis, results) {
  const boardCols = [
    col("file_name", "File Name", (ctx) => pbnFileName(analysis)),
    col("record_index", "Record Index", (ctx) => ctx.board.index + 1),
    col("board", "Board", (ctx) => ctx.board.boardNo),
    col("event", "Event", (ctx) => ctx.board.tags.Event || ""),
    col("site", "Site", (ctx) => ctx.board.tags.Site || ""),
    col("date", "Date", (ctx) => ctx.board.tags.Date || firstDirective(analysis, ["HRTitleDate"])),
    col("dealer", "Dealer", (ctx) => ctx.board.dealer),
    col("vulnerable", "Vulnerable", (ctx) => ctx.board.vulnerable),
    col("deal", "Deal", (ctx) => ctx.board.deal.raw),
    col("par_contract", "Par Contract", (ctx) => ctx.board.tags.ParContract || ""),
    col("par_side", "Par Side", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.pair || ctx.board.primaryPar.side : ""),
    col("par_level", "Par Level", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.level : ""),
    col("par_strain", "Par Strain", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.strain : ""),
    col("par_class", "Par Class", (ctx) => ctx.board.className),
    col("optimum_score", "Optimum Score", (ctx) => ctx.board.tags.OptimumScore || ""),
    col("optimum_side", "Optimum Side", (ctx) => ctx.board.optimum.pair || ctx.board.optimum.side),
    col("ns_score", "NS Perspective Score", (ctx) => ctx.board.optimum.nsPerspective),
    col("par_edge", "Par Edge", (ctx) => ctx.board.optimum.edge),
    col("actual_contract", "Actual Contract", (ctx) => ctx.board.tags.Contract || ""),
    col("actual_declarer", "Actual Declarer", (ctx) => ctx.board.tags.Declarer || ""),
    col("actual_result", "Actual Result", (ctx) => ctx.board.tags.Result || ""),
    col("hcp_n", "HCP N", (ctx) => ctx.board.hands.N.hcp),
    col("hcp_e", "HCP E", (ctx) => ctx.board.hands.E.hcp),
    col("hcp_s", "HCP S", (ctx) => ctx.board.hands.S.hcp),
    col("hcp_w", "HCP W", (ctx) => ctx.board.hands.W.hcp),
    col("hcp_ns", "HCP NS", (ctx) => ctx.board.hcpNS),
    col("hcp_ew", "HCP EW", (ctx) => ctx.board.hcpEW),
    col("hcp_delta_ns", "HCP Delta NS", (ctx) => ctx.board.hcpDeltaNS),
    col("shape_n", "Shape N", (ctx) => ctx.board.hands.N.shape),
    col("shape_e", "Shape E", (ctx) => ctx.board.hands.E.shape),
    col("shape_s", "Shape S", (ctx) => ctx.board.hands.S.shape),
    col("shape_w", "Shape W", (ctx) => ctx.board.hands.W.shape),
    col("voids", "Voids", (ctx) => ctx.board.voids.join("; ")),
    col("long_suits", "Long Suits", (ctx) => ctx.board.longSuits.join("; ")),
    col("valid_deal", "Valid Deal", (ctx) => ctx.board.validDeal ? "yes" : "no"),
    col("issues", "Issues", (ctx) => ctx.board.issues.join("; "))
  ];

  DENOMS.forEach((denom) => {
    SEATS.forEach((seat) => {
      boardCols.push(col(`dd_${seat}_${denom.key}`, `DD ${seat} ${denom.label}`, (ctx) => getDoubleDummyTricks(ctx.board, seat, denom.key)));
    });
  });

  if (mode === "boards") return boardCols;

  if (mode === "hands") {
    return [
      ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score"].includes(entry.key)),
      col("seat", "Seat", (ctx) => ctx.seat),
      col("pair", "Pair", (ctx) => PAIRS[ctx.seat]),
      col("player", "Player", (ctx) => ctx.board.tags[seatName(ctx.seat)] || ""),
      col("is_dealer", "Is Dealer", (ctx) => ctx.board.dealer === ctx.seat ? "yes" : "no"),
      col("hand", "Hand", (ctx) => ctx.hand.display),
      col("spades", "Spades", (ctx) => ctx.hand.cards.S),
      col("hearts", "Hearts", (ctx) => ctx.hand.cards.H),
      col("diamonds", "Diamonds", (ctx) => ctx.hand.cards.D),
      col("clubs", "Clubs", (ctx) => ctx.hand.cards.C),
      col("hcp", "HCP", (ctx) => ctx.hand.hcp),
      col("controls", "Controls", (ctx) => ctx.hand.controls),
      col("distribution_points", "Distribution Points", (ctx) => ctx.hand.distributionPoints),
      col("shape", "Shape", (ctx) => ctx.hand.shape),
      col("length_spades", "Length Spades", (ctx) => ctx.hand.lengths.S),
      col("length_hearts", "Length Hearts", (ctx) => ctx.hand.lengths.H),
      col("length_diamonds", "Length Diamonds", (ctx) => ctx.hand.lengths.D),
      col("length_clubs", "Length Clubs", (ctx) => ctx.hand.lengths.C),
      col("voids", "Voids", (ctx) => ctx.hand.voids.join("; ")),
      col("singletons", "Singletons", (ctx) => ctx.hand.singletons.join("; ")),
      col("longest_suit", "Longest Suit", (ctx) => `${ctx.hand.longestLength}${ctx.hand.longestSuit}`)
    ];
  }

  if (mode === "pairs") {
    return [
      ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score", "par_edge"].includes(entry.key)),
      col("pair", "Pair", (ctx) => ctx.pair),
      col("hcp", "Pair HCP", (ctx) => ctx.pairStats.hcp),
      col("hcp_delta_ns", "HCP Delta NS", (ctx) => ctx.board.hcpDeltaNS),
      col("spades", "Spades", (ctx) => ctx.pairStats.lengths.S),
      col("hearts", "Hearts", (ctx) => ctx.pairStats.lengths.H),
      col("diamonds", "Diamonds", (ctx) => ctx.pairStats.lengths.D),
      col("clubs", "Clubs", (ctx) => ctx.pairStats.lengths.C),
      col("best_fit", "Best Fit", (ctx) => `${ctx.pairStats.bestFitLength}${ctx.pairStats.bestFitSuit}`),
      col("major_fit", "Major Fit", (ctx) => ctx.pairStats.majorFit),
      col("minor_fit", "Minor Fit", (ctx) => ctx.pairStats.minorFit),
      col("combined_spades", "Combined Spades", (ctx) => ctx.pairStats.holdings.S),
      col("combined_hearts", "Combined Hearts", (ctx) => ctx.pairStats.holdings.H),
      col("combined_diamonds", "Combined Diamonds", (ctx) => ctx.pairStats.holdings.D),
      col("combined_clubs", "Combined Clubs", (ctx) => ctx.pairStats.holdings.C)
    ];
  }

  if (mode === "doubleDummy") {
    return [
      ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score"].includes(entry.key)),
      col("declarer", "Declarer", (ctx) => ctx.dd.declarer),
      col("pair", "Pair", (ctx) => ctx.dd.pair),
      col("denomination", "Denomination", (ctx) => denomMeta(ctx.dd.denomination).label),
      col("denomination_code", "Denomination Code", (ctx) => ctx.dd.denomination),
      col("tricks", "Tricks", (ctx) => ctx.dd.tricks),
      col("makeable_level", "Makeable Level", (ctx) => ctx.dd.makeableLevel),
      col("game_available", "Game Available", (ctx) => isGameAvailable(ctx.dd) ? "yes" : "no")
    ];
  }

  if (mode === "tags") {
    if (!analysis) return [];
    return [
      col("file_name", "File Name", () => pbnFileName(analysis)),
      col("record_index", "Record Index", (ctx) => ctx.board.index + 1),
      col("board", "Board", (ctx) => ctx.board.boardNo),
      ...analysis.tagKeys.map((key) => col(`tag_${key}`, key, (ctx) => ctx.board.tags[key] || ""))
    ];
  }

  if (mode === "results") {
    return [
      col("pbn_file", "PBN File", () => pbnFileName(analysis)),
      col("result_file", "Result File", () => results ? results.fileName : ""),
      col("result_source", "Result Source", () => results ? results.sourceType : ""),
      col("row_id", "Row ID", (ctx) => ctx.result.id),
      col("board", "Board", (ctx) => ctx.result.boardNo),
      col("section", "Section", (ctx) => ctx.result.section),
      col("round", "Round", (ctx) => ctx.result.round),
      col("table", "Table", (ctx) => ctx.result.tableNo),
      col("pair_ns", "Pair NS", (ctx) => ctx.result.pairNS),
      col("ns_partnership", "NS Partnership", (ctx) => ctx.result.nsParticipantNo),
      col("ns_players", "NS Players", (ctx) => ctx.result.nsPlayers),
      col("ns_known_players", "NS Known Players", (ctx) => ctx.result.nsKnownPlayers),
      col("pair_ew", "Pair EW", (ctx) => ctx.result.pairEW),
      col("ew_partnership", "EW Partnership", (ctx) => ctx.result.ewParticipantNo),
      col("ew_players", "EW Players", (ctx) => ctx.result.ewPlayers),
      col("ew_known_players", "EW Known Players", (ctx) => ctx.result.ewKnownPlayers),
      col("declarer_number", "Declarer Number", (ctx) => ctx.result.declarerNumber),
      col("declarer_side", "Declarer Side", (ctx) => ctx.result.declarerSide),
      col("declarer_name", "Declarer Name", (ctx) => ctx.result.declarerName),
      col("declarer_pair", "Declarer Pair", (ctx) => ctx.result.declarerPair),
      col("contract", "Contract", (ctx) => ctx.result.contract),
      col("result", "Result", (ctx) => ctx.result.result),
      col("contract_class", "Contract Class", (ctx) => ctx.result.contractClass),
      col("tricks", "Tricks Taken", (ctx) => ctx.result.tricks),
      col("score_declarer", "Declarer Score", (ctx) => ctx.result.scoreDeclarer),
      col("score_ns", "NS Score", (ctx) => ctx.result.scoreNS),
      col("par_contract", "PBN Par Contract", (ctx) => ctx.board ? ctx.board.tags.ParContract || "" : ""),
      col("par_ns", "PBN Par NS Score", (ctx) => ctx.result.parNS),
      col("vs_par_ns", "NS Score Vs Par", (ctx) => ctx.result.vsParNS),
      col("dd_tricks", "Double Dummy Tricks", (ctx) => ctx.result.ddTricks),
      col("dd_delta", "Tricks Vs Double Dummy", (ctx) => ctx.result.ddDelta),
      col("ns_matchpoints", "NS Matchpoints", (ctx) => ctx.result.nsMatchpoints == null ? "" : ctx.result.nsMatchpoints.toFixed(1)),
      col("ns_percent", "NS Percent", (ctx) => ctx.result.nsPercent == null ? "" : ctx.result.nsPercent.toFixed(1)),
      col("ew_matchpoints", "EW Matchpoints", (ctx) => ctx.result.ewMatchpoints == null ? "" : ctx.result.ewMatchpoints.toFixed(1)),
      col("ew_percent", "EW Percent", (ctx) => ctx.result.ewPercent == null ? "" : ctx.result.ewPercent.toFixed(1)),
      col("date_log", "Date Log", (ctx) => ctx.result.dateLog),
      col("time_log", "Time Log", (ctx) => ctx.result.timeLog),
      col("lead_card", "Lead Card", (ctx) => ctx.result.leadCard),
      col("remarks", "Remarks", (ctx) => ctx.result.remarks)
    ];
  }

  if (mode === "boardResults") {
    return [
      col("pbn_file", "PBN File", () => pbnFileName(analysis)),
      col("result_file", "Result File", () => results ? results.fileName : ""),
      col("board", "Board", (ctx) => ctx.boardSummary.boardNo),
      col("dealer", "Dealer", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.dealer : ""),
      col("vulnerable", "Vulnerable", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.vulnerable : ""),
      col("result_count", "Result Count", (ctx) => ctx.boardSummary.resultCount),
      col("scored_count", "Scored Count", (ctx) => ctx.boardSummary.scoredCount),
      col("par_contract", "PBN Par Contract", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.tags.ParContract || "" : ""),
      col("par_ns", "PBN Par NS Score", (ctx) => ctx.boardSummary.parNS),
      col("average_ns_score", "Average NS Score", (ctx) => ctx.boardSummary.averageNsScore == null ? "" : Math.round(ctx.boardSummary.averageNsScore)),
      col("average_vs_par", "Average NS Vs Par", (ctx) => ctx.boardSummary.averageVsPar == null ? "" : Math.round(ctx.boardSummary.averageVsPar)),
      col("min_ns_score", "Min NS Score", (ctx) => ctx.boardSummary.minNsScore),
      col("max_ns_score", "Max NS Score", (ctx) => ctx.boardSummary.maxNsScore),
      col("score_spread", "Score Spread", (ctx) => ctx.boardSummary.scoreSpread),
      col("average_dd_delta", "Average DD Delta", (ctx) => ctx.boardSummary.averageDdDelta == null ? "" : ctx.boardSummary.averageDdDelta.toFixed(2)),
      col("contract_summary", "Contract Summary", (ctx) => ctx.boardSummary.contractSummary),
      col("top_ns", "Top NS Pairs", (ctx) => ctx.boardSummary.topNs.join("; ")),
      col("top_ew", "Top EW Pairs", (ctx) => ctx.boardSummary.topEw.join("; "))
    ];
  }

  if (mode === "pairResults") {
    return [
      col("pbn_file", "PBN File", () => pbnFileName(analysis)),
      col("result_file", "Result File", () => results ? results.fileName : ""),
      col("rank", "Rank", (ctx) => ctx.pairStanding.rank),
      col("pair", "Pair", (ctx) => ctx.pairStanding.pairNo),
      col("players", "Players", (ctx) => ctx.pairStanding.players || ""),
      col("known_players", "Known Players", (ctx) => ctx.pairStanding.knownPlayers),
      col("matchpoints", "Matchpoints", (ctx) => ctx.pairStanding.matchpoints.toFixed(1)),
      col("top", "Top", (ctx) => ctx.pairStanding.top.toFixed(1)),
      col("percent", "Percent", (ctx) => ctx.pairStanding.percent == null ? "" : ctx.pairStanding.percent.toFixed(2)),
      col("boards", "Boards", (ctx) => ctx.pairStanding.boards),
      col("ns_boards", "NS Boards", (ctx) => ctx.pairStanding.nsBoards),
      col("ew_boards", "EW Boards", (ctx) => ctx.pairStanding.ewBoards),
      col("average_score", "Average Score", (ctx) => ctx.pairStanding.averageScore.toFixed(1))
    ];
  }

  return boardCols;
}

function col(key, label, value) {
  return { key, label, value, description: termDefinition(label) };
}

function isGameAvailable(dd) {
  if (!dd || dd.tricks == null) return false;
  if (dd.denomination === "N") return dd.tricks >= 9;
  if (dd.denomination === "S" || dd.denomination === "H") return dd.tricks >= 10;
  return dd.tricks >= 11;
}

function getCsvContexts(mode, analysis, results) {
  if (mode === "results") {
    return results ? results.rows.map((result) => ({ result, board: result.board })) : [];
  }
  if (mode === "boardResults") {
    return results ? results.boardSummaries.map((boardSummary) => ({ boardSummary, board: boardSummary.board })) : [];
  }
  if (mode === "pairResults") {
    return results ? results.pairStandings.map((pairStanding) => ({ pairStanding })) : [];
  }
  if (!analysis) return [];
  if (mode === "hands") {
    return analysis.boards.flatMap((board) => SEATS.map((seat) => ({ board, seat, hand: board.hands[seat] })));
  }
  if (mode === "pairs") {
    return analysis.boards.flatMap((board) => ["NS", "EW"].map((pair) => ({ board, pair, pairStats: board.pairs[pair] })));
  }
  if (mode === "doubleDummy") {
    return analysis.boards.flatMap((board) => board.optimumRows.map((dd) => ({ board, dd })));
  }
  return analysis.boards.map((board) => ({ board }));
}

function updateRowModeOptions() {
  const select = document.getElementById("rowMode");
  if (!select) return;
  const hasPbn = !!STATE.analysis;
  const resultModes = new Set(["results", "boardResults", "pairResults"]);
  Array.from(select.options).forEach((option) => {
    option.disabled = !hasPbn && !resultModes.has(option.value);
  });
}

function renderCsvControls() {
  const analysis = STATE.analysis;
  if (!analysis && !STATE.results) return;
  if (!analysis && !["results", "boardResults", "pairResults"].includes(STATE.rowMode)) {
    STATE.rowMode = "results";
    STATE.selectedColumns = new Set(defaultColumnKeys("results", analysis));
  }
  const defs = getColumnDefs(STATE.rowMode, analysis, STATE.results);
  const selected = STATE.selectedColumns;
  updateRowModeOptions();
  document.getElementById("rowMode").value = STATE.rowMode;

  document.getElementById("csvCaption").textContent = `${plural(getCsvContexts(STATE.rowMode, analysis, STATE.results).length, "row")} available.`;
  document.getElementById("columnList").innerHTML = defs.map((entry) => `
    <label class="column-check${entry.description ? " term-tip" : ""}"${entry.description ? ` data-tooltip="${escapeHtml(entry.description)}" aria-describedby="termTooltip" tabindex="0"` : ""}>
      <input type="checkbox" data-column-key="${escapeHtml(entry.key)}" ${selected.has(entry.key) ? "checked" : ""}>
      <span>${escapeHtml(entry.label)}</span>
    </label>
  `).join("");
  renderCsvPreview();
  annotateTermTooltips(document.getElementById("columnList"));
}

function selectedColumnDefs() {
  const analysis = STATE.analysis;
  const defs = getColumnDefs(STATE.rowMode, analysis, STATE.results);
  return defs.filter((entry) => STATE.selectedColumns.has(entry.key));
}

function renderCsvPreview() {
  const analysis = STATE.analysis;
  const columns = selectedColumnDefs();
  const contexts = getCsvContexts(STATE.rowMode, analysis, STATE.results).slice(0, 12);
  if (!columns.length) {
    document.getElementById("csvPreview").innerHTML = `<div class="empty-state">Choose at least one column.</div>`;
    return;
  }
  if (!contexts.length) {
    document.getElementById("csvPreview").innerHTML = `<div class="empty-state">This row mode has no rows for the current file.</div>`;
    return;
  }

  document.getElementById("csvPreview").innerHTML = `
    <table>
      <thead><tr>${columns.map((colDef) => th(colDef.label, "", colDef.description)).join("")}</tr></thead>
      <tbody>
        ${contexts.map((ctx) => `
          <tr>${columns.map((colDef) => `<td>${escapeHtml(colDef.value(ctx))}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
  annotateTermTooltips(document.getElementById("csvPreview"));
}

function makeCsv() {
  const analysis = STATE.analysis;
  const columns = selectedColumnDefs();
  const contexts = getCsvContexts(STATE.rowMode, analysis, STATE.results);
  if (!columns.length) throw new Error("Choose at least one CSV column.");
  const rows = [
    columns.map((entry) => csvCell(entry.label)).join(","),
    ...contexts.map((ctx) => columns.map((entry) => csvCell(entry.value(ctx))).join(","))
  ];
  return rows.join("\r\n");
}

function downloadCsv() {
  try {
    const csv = makeCsv();
    const baseName = STATE.analysis && STATE.analysis.parsed.fileName
      ? STATE.analysis.parsed.fileName
      : STATE.results && STATE.results.fileName
        ? STATE.results.fileName
        : "bridge";
    const base = baseName
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bridge";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-${STATE.rowMode}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded.");
  } catch (error) {
    showToast(error.message, "error");
  }
}

export {
  pbnFileName,
  defaultColumnKeys,
  getColumnDefs,
  col,
  isGameAvailable,
  getCsvContexts,
  updateRowModeOptions,
  renderCsvControls,
  selectedColumnDefs,
  renderCsvPreview,
  makeCsv,
  downloadCsv,
};
