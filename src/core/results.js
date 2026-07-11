// Results ingestion: row normalization and scoring, player rosters and
// pair identity, matchpointing, standings, and the session analysis.

import { SEATS, PAIRS, seatName } from "./constants.js";
import { pickField, safeNumber, plural, average, sum, uniqueSorted, countBy, numericPairSort } from "./format.js";
import { normalizePlayedContractText, normalizeResultValue } from "./contracts.js";
import { scoreDuplicateContract } from "./scoring.js";
import { fallbackResultBoard, getDoubleDummyTricks, emptyAnalysis } from "./boards.js";
import { assessPbnResultsCompatibility } from "./compatibility.js";

function normalizeResultSide(value) {
  const text = String(value || "").trim().toUpperCase();
  if (SEATS.includes(text)) return text;
  return "";
}

function parseScoreAdjustment(remarks) {
  const text = String(remarks || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!text) return null;
  const tokenPercent = (token) => {
    if (/^\d{1,3}%$/.test(token)) {
      const percent = Number(token.slice(0, -1));
      return percent > 100 ? null : percent;
    }
    if (/^(AVE|AVG|A)$/.test(token)) return 50;
    if (/^(AVE|AVG|A)\+$/.test(token)) return 60;
    if (/^(AVE|AVG|A)-$/.test(token)) return 40;
    return null;
  };
  const tokenPattern = "\\d{1,3}%|AVE[+-]?|AVG[+-]?|A[+-]?";
  const pairMatch = text.match(new RegExp(`^(${tokenPattern})[-/](${tokenPattern})$`));
  const nsToken = pairMatch ? pairMatch[1] : text;
  const ewToken = pairMatch ? pairMatch[2] : text;
  const nsPercent = tokenPercent(nsToken);
  const ewPercent = tokenPercent(ewToken);
  if (nsPercent == null || ewPercent == null) return null;
  return { nsPercent, ewPercent };
}

function boardMapByNumber(analysis) {
  return new Map((analysis ? analysis.boards : []).map((board) => [String(board.boardNo), board]));
}

/**
 * Normalizes and scores one raw traveler row. Returns null when the row
 * has no recognizable board number.
 *
 * @param {Object<string, *>} row One raw receivedData row.
 * @param {number} index Position in the raw receivedData array.
 * @param {import("./types.js").PbnAnalysis} analysis
 * @param {Map<string, import("./types.js").Board>} boardMap PBN boards keyed by boardNo.
 * @returns {import("./types.js").ResultRow|null}
 */
function normalizeResultRow(row, index, analysis, boardMap) {
  const boardNo = safeNumber(pickField(row, ["Board", "board", "Board Number", "board_number"]));
  if (boardNo == null) return null;
  const pairNS = safeNumber(pickField(row, ["PairNS", "Pair NS", "NSPair", "NS Pair", "pair_ns"]));
  const pairEW = safeNumber(pickField(row, ["PairEW", "Pair EW", "EWPair", "EW Pair", "pair_ew"]));
  const declarerNumber = safeNumber(pickField(row, ["Declarer", "declarer"]));
  const declarerSide = normalizeResultSide(pickField(row, ["NS/EW", "NSEW", "Direction", "DeclarerSide", "Declarer Side", "declarer_side"]));
  const contract = normalizePlayedContractText(pickField(row, ["Contract", "contract", "Actual Contract"]));
  const result = normalizeResultValue(pickField(row, ["Result", "result", "Tricks Result"]));
  const board = boardMap.get(String(boardNo));
  const resultBoard = board || fallbackResultBoard(boardNo);
  const declarerPairOverride = declarerNumber != null && declarerNumber === pairNS
    ? "NS"
    : declarerNumber != null && declarerNumber === pairEW
      ? "EW"
      : "";
  const remarks = pickField(row, ["Remarks", "remarks"]);
  const adjustment = parseScoreAdjustment(remarks);
  const scored = scoreDuplicateContract(contract, result, declarerSide, resultBoard.vulnerable, declarerPairOverride);
  const parNS = board && board.optimum.nsPerspective != null ? board.optimum.nsPerspective : null;
  const ddTricksRaw = board && scored.contract.strain && declarerSide ? getDoubleDummyTricks(board, declarerSide, scored.contract.strain) : "";
  const ddTricks = ddTricksRaw === "" ? null : Number(ddTricksRaw);
  const erased = safeNumber(pickField(row, ["Erased", "erased", "Deleted", "deleted"])) || 0;

  return {
    index,
    id: pickField(row, ["ID", "id"]),
    section: safeNumber(pickField(row, ["Section", "section"])),
    tableNo: safeNumber(pickField(row, ["Table", "table"])),
    round: safeNumber(pickField(row, ["Round", "round"])),
    boardNo,
    pairNS,
    pairEW,
    declarerNumber,
    declarerSide,
    declarerPair: PAIRS[declarerSide] || declarerPairOverride,
    contract,
    result,
    parsedContract: scored.contract,
    contractClass: scored.contract.className,
    tricks: scored.tricks,
    scoreDeclarer: scored.scoreDeclarer,
    scoreNS: scored.scoreNS,
    parNS,
    vsParNS: scored.scoreNS != null && parNS != null ? scored.scoreNS - parNS : null,
    ddTricks,
    ddDelta: scored.tricks != null && ddTricks != null ? scored.tricks - ddTricks : null,
    leadCard: pickField(row, ["LeadCard", "Lead Card", "lead_card"]),
    remarks,
    adjustment,
    dateLog: pickField(row, ["DateLog", "Date Log", "date_log"]),
    timeLog: pickField(row, ["TimeLog", "Time Log", "time_log"]),
    erased,
    scoringError: adjustment ? "" : scored.error,
    board: resultBoard,
    hasPbnBoard: !!board
  };
}

function normalizePlayerNumbers(rows) {
  return (rows || [])
    .map((row) => {
      const player = {
        section: safeNumber(pickField(row, ["Section", "section"])),
        tableNo: safeNumber(pickField(row, ["Table", "table"])),
        direction: normalizeResultSide(pickField(row, ["Direction", "direction", "Seat", "seat"])),
        number: String(pickField(row, ["Number", "number", "PlayerNumber", "player_number"]) || "").trim(),
        name: String(pickField(row, ["Name", "name", "Player", "player"]) || "").trim(),
        round: safeNumber(pickField(row, ["Round", "round"])) || 0
      };
      player.placeholder = playerHasIdentity(player) ? "" : playerPlaceholder(player);
      return player;
    })
    .filter((row) => row.section != null && row.tableNo != null && row.direction);
}

function playerHasIdentity(player) {
  return !!(player && (player.name || player.number));
}

function playerPlaceholder(player) {
  if (!player || player.tableNo == null || !player.direction) return "";
  return `Table ${player.tableNo} ${seatName(player.direction)}`;
}

function playerDisplay(player) {
  if (!player) return "";
  return player.name || player.number || player.placeholder || "";
}

function pairRosterKey(pairNo, side) {
  return side ? `${pairNo}:${side}` : String(pairNo);
}

function ensurePairRoster(pairRosters, pairNo, side) {
  const key = pairRosterKey(pairNo, side);
  if (!pairRosters.has(key)) {
    pairRosters.set(key, { pairNo, side: side || "", playersBySeat: {}, players: [], label: "" });
  }
  return pairRosters.get(key);
}

function rosterTableKey(section, tableNo, multiSection) {
  return `${multiSection && section != null ? section : ""}|${tableNo}`;
}

function rosterPairId(section, pairNo, multiSection) {
  if (pairNo == null) return null;
  return multiSection && section != null ? `S${section}:${pairNo}` : String(pairNo);
}

function buildPairRosters(playerNumbers, rows, multiSection) {
  const roundsByTable = new Map();
  rows.forEach((row) => {
    if (row.tableNo == null) return;
    const key = rosterTableKey(row.section, row.tableNo, multiSection);
    if (!roundsByTable.has(key)) roundsByTable.set(key, new Map());
    const byRound = roundsByTable.get(key);
    const round = row.round == null ? 0 : row.round;
    if (!byRound.has(round)) byRound.set(round, row);
  });

  const assignmentFor = (player) => {
    const byRound = roundsByTable.get(rosterTableKey(player.section, player.tableNo, multiSection));
    if (!byRound) return null;
    const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
    const target = player.round || 0;
    const chosen = rounds.find((round) => round >= target);
    return byRound.get(chosen != null ? chosen : rounds[rounds.length - 1]);
  };

  const assignSeat = (roster, player) => {
    const existing = roster.playersBySeat[player.direction];
    if (!existing || (playerHasIdentity(player) && !playerHasIdentity(existing))) {
      roster.playersBySeat[player.direction] = player;
    }
  };

  /** @type {Map<string, Object<string, *>> & { profile?: Object<string, *> }} */
  const pairRosters = new Map();
  playerNumbers.forEach((player) => {
    const tableRow = assignmentFor(player);
    if (!tableRow) return;
    const side = player.direction === "N" || player.direction === "S" ? "NS" : "EW";
    const pairNo = side === "NS" ? tableRow.pairNS : tableRow.pairEW;
    const pairId = rosterPairId(tableRow.section, pairNo, multiSection);
    if (pairId == null) return;
    assignSeat(ensurePairRoster(pairRosters, pairId, side), player);
    assignSeat(ensurePairRoster(pairRosters, pairId), player);
  });

  pairRosters.forEach((roster) => {
    roster.players = SEATS.map((seat) => roster.playersBySeat[seat]).filter((player) => player && playerDisplay(player));
    roster.knownPlayers = roster.players.filter(playerHasIdentity);
    roster.placeholderPlayers = roster.players.filter((player) => player && !playerHasIdentity(player));
    // Labels carry real identities only. Placeholder seats ("Table 6
    // East") stay internal bookkeeping: a pair with no recovered names
    // is shown by its number, never by an invented name.
    roster.label = roster.knownPlayers.map(playerDisplay).join(" / ");
  });
  pairRosters.profile = summarizePairRosters(pairRosters);
  return pairRosters;
}

function summarizePairRosters(pairRosters) {
  const groups = Array.from(pairRosters.values()).filter((roster) => !roster.side);
  const sideRosters = Array.from(pairRosters.values()).filter((roster) => roster.side);
  const teamLikeGroups = groups.filter((roster) => {
    const ns = pairRosters.get(pairRosterKey(roster.pairNo, "NS"));
    const ew = pairRosters.get(pairRosterKey(roster.pairNo, "EW"));
    return ns && ns.players.length && ew && ew.players.length;
  });
  const incompleteSideRosters = sideRosters.filter((roster) => roster.players.length > 0 && roster.knownPlayers.length < 2);
  return {
    groupCount: groups.length,
    teamLikeGroups: teamLikeGroups.length,
    maxPlayersPerNumber: groups.length ? Math.max(...groups.map((roster) => roster.players.length)) : 0,
    incompleteSideRosters: incompleteSideRosters.length,
    incompleteSideRosterLabels: incompleteSideRosters.map((roster) => `${roster.pairNo} ${roster.side}`).slice(0, 6)
  };
}

function pairRosterLabel(pairRosters, pairNo, side, sideOnly) {
  const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
  if (sideRoster && sideRoster.label) return sideRoster.label;
  if (!sideOnly) {
    const roster = pairRosters.get(pairRosterKey(pairNo));
    if (roster && roster.label) return roster.label;
  }
  // No invented fallback names: displays degrade to "Pair N".
  return "";
}

function pairSeatPlayer(pairRosters, pairNo, seat, side, sideOnly) {
  const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
  const roster = sideRoster || (sideOnly ? null : pairRosters.get(pairRosterKey(pairNo)));
  const player = roster ? roster.playersBySeat[seat] : null;
  return player && playerHasIdentity(player) ? playerDisplay(player) : "";
}

function pairRosterKnownCount(pairRosters, pairNo, side, sideOnly) {
  const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
  if (sideRoster) return sideRoster.knownPlayers ? sideRoster.knownPlayers.length : 0;
  if (sideOnly) return 0;
  const roster = pairRosters.get(pairRosterKey(pairNo));
  return roster && roster.knownPlayers ? roster.knownPlayers.length : 0;
}

function participantKeyFor(pairNo, side, useSidePartnerships) {
  if (pairNo == null) return "";
  return useSidePartnerships ? pairRosterKey(pairNo, side) : String(pairNo);
}

function participantLabelFor(pairNo, side, useSidePartnerships) {
  if (pairNo == null) return "";
  return useSidePartnerships ? `${pairNo} ${side}` : String(pairNo);
}

function attachPlayerNames(rows, pairRosters, useSidePartnerships, multiSection) {
  rows.forEach((row) => {
    const nsPairId = rosterPairId(row.section, row.pairNS, multiSection);
    const ewPairId = rosterPairId(row.section, row.pairEW, multiSection);
    row.nsPlayers = pairRosterLabel(pairRosters, nsPairId, "NS", useSidePartnerships);
    row.ewPlayers = pairRosterLabel(pairRosters, ewPairId, "EW", useSidePartnerships);
    row.nsParticipantKey = participantKeyFor(nsPairId, "NS", useSidePartnerships);
    row.ewParticipantKey = participantKeyFor(ewPairId, "EW", useSidePartnerships);
    row.nsParticipantNo = participantLabelFor(nsPairId, "NS", useSidePartnerships);
    row.ewParticipantNo = participantLabelFor(ewPairId, "EW", useSidePartnerships);
    row.nsParticipantPlayers = useSidePartnerships ? row.nsPlayers : pairRosterLabel(pairRosters, nsPairId);
    row.ewParticipantPlayers = useSidePartnerships ? row.ewPlayers : pairRosterLabel(pairRosters, ewPairId);
    row.nsKnownPlayers = pairRosterKnownCount(pairRosters, nsPairId, "NS", useSidePartnerships);
    row.ewKnownPlayers = pairRosterKnownCount(pairRosters, ewPairId, "EW", useSidePartnerships);
    row.nsParticipantKnownPlayers = useSidePartnerships ? row.nsKnownPlayers : pairRosterKnownCount(pairRosters, nsPairId);
    row.ewParticipantKnownPlayers = useSidePartnerships ? row.ewKnownPlayers : pairRosterKnownCount(pairRosters, ewPairId);
    row.declarerName = row.declarerSide === "N" || row.declarerSide === "S"
      ? pairSeatPlayer(pairRosters, nsPairId, row.declarerSide, "NS", useSidePartnerships)
      : pairSeatPlayer(pairRosters, ewPairId, row.declarerSide, "EW", useSidePartnerships);
  });
}

function addPairStanding(map, side, row) {
  if (row.nsMatchpoints == null || row.boardTop == null) return;
  const key = side === "NS" ? row.nsParticipantKey : row.ewParticipantKey;
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, {
      key,
      pairNo: side === "NS" ? row.nsParticipantNo : row.ewParticipantNo,
      sourcePairNo: side === "NS" ? row.pairNS : row.pairEW,
      rosterSide: side,
      players: side === "NS" ? row.nsParticipantPlayers : row.ewParticipantPlayers,
      knownPlayers: side === "NS" ? row.nsParticipantKnownPlayers : row.ewParticipantKnownPlayers,
      matchpoints: 0,
      top: 0,
      boards: 0,
      nsBoards: 0,
      ewBoards: 0,
      scores: []
    });
  }
  const standing = map.get(key);
  if (!standing.players) standing.players = side === "NS" ? row.nsParticipantPlayers : row.ewParticipantPlayers;
  standing.knownPlayers = Math.max(standing.knownPlayers || 0, side === "NS" ? row.nsParticipantKnownPlayers : row.ewParticipantKnownPlayers);
  const mp = side === "NS" ? row.nsMatchpoints : row.ewMatchpoints;
  standing.matchpoints += mp;
  standing.top += row.boardTop;
  standing.boards += 1;
  if (row.scoreNS != null) standing.scores.push(side === "NS" ? row.scoreNS : -row.scoreNS);
  if (side === "NS") standing.nsBoards += 1;
  else standing.ewBoards += 1;
}

function applyMatchpoints(rowsByField) {
  rowsByField.forEach((rows) => {
    const scoredRows = rows.filter((row) => row.scoreNS != null);
    const top = Math.max(0, scoredRows.length - 1);
    scoredRows.forEach((row) => {
      let mp = 0;
      scoredRows.forEach((other) => {
        if (other === row) return;
        if (row.scoreNS > other.scoreNS) mp += 1;
        else if (row.scoreNS === other.scoreNS) mp += 0.5;
      });
      row.boardTop = top;
      row.nsMatchpoints = mp;
      row.ewMatchpoints = top - mp;
      row.nsPercent = top ? (mp / top) * 100 : null;
      row.ewPercent = top ? ((top - mp) / top) * 100 : null;
    });
    rows.forEach((row) => {
      if (!row.adjustment || row.scoreNS != null) return;
      row.boardTop = top;
      row.nsMatchpoints = (row.adjustment.nsPercent / 100) * top;
      row.ewMatchpoints = (row.adjustment.ewPercent / 100) * top;
      row.nsPercent = row.adjustment.nsPercent;
      row.ewPercent = row.adjustment.ewPercent;
    });
  });
}

function summarizeResultBoard(boardNo, rows, board) {
  const scored = rows.filter((row) => row.scoreNS != null);
  const scores = scored.map((row) => row.scoreNS);
  const ddDeltas = rows.map((row) => row.ddDelta).filter((value) => value != null);
  const parNS = board && board.optimum.nsPerspective != null ? board.optimum.nsPerspective : null;
  const maxScore = scores.length ? Math.max(...scores) : null;
  const minScore = scores.length ? Math.min(...scores) : null;
  const topNs = maxScore == null ? [] : scored.filter((row) => row.scoreNS === maxScore).map((row) => row.nsParticipantNo || row.pairNS).filter((value) => value != null && value !== "");
  const topEw = minScore == null ? [] : scored.filter((row) => row.scoreNS === minScore).map((row) => row.ewParticipantNo || row.pairEW).filter((value) => value != null && value !== "");
  const averageNsScore = scores.length ? average(scores) : null;
  const contractCounts = countBy(rows.map((row) => row.contract || "Unknown"));
  const contractSummary = Object.entries(contractCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .slice(0, 4)
    .map(([contract, count]) => `${contract} (${count})`)
    .join(", ");

  return {
    boardNo,
    board,
    rows,
    resultCount: rows.length,
    scoredCount: scored.length,
    parNS,
    averageNsScore,
    averageVsPar: averageNsScore != null && parNS != null ? averageNsScore - parNS : null,
    minNsScore: minScore,
    maxNsScore: maxScore,
    scoreSpread: maxScore != null && minScore != null ? maxScore - minScore : null,
    averageDdDelta: ddDeltas.length ? average(ddDeltas) : null,
    contractSummary,
    topNs: uniqueSorted(topNs.map(String)),
    topEw: uniqueSorted(topEw.map(String))
  };
}

function detectSidePairCollision(rows) {
  const nsKeys = new Set();
  const ewKeys = new Set();
  const relevant = rows.filter((row) => row.scoreNS != null || row.adjustment);
  for (const row of relevant) {
    const validNS = row.pairNS != null && row.pairNS > 0;
    const validEW = row.pairEW != null && row.pairEW > 0;
    if (validNS && validEW && row.pairNS === row.pairEW) return true;
    const sectionKey = row.section == null ? "" : row.section;
    if (validNS) nsKeys.add(`${sectionKey}|${row.boardNo}|${row.pairNS}`);
    if (validEW) ewKeys.add(`${sectionKey}|${row.boardNo}|${row.pairEW}`);
  }
  for (const key of nsKeys) {
    if (ewKeys.has(key)) return true;
  }
  return false;
}


function defaultReportPair(results) {
  if (!results || !results.pairStandings.length) return "";
  const first = [...results.pairStandings].sort((a, b) => numericPairSort(a.pairNo, b.pairNo))[0];
  return first ? String(first.key) : "";
}

function sideScore(row, side) {
  if (!row || row.scoreNS == null) return null;
  return side === "NS" ? row.scoreNS : -row.scoreNS;
}

function sideMatchpoints(row, side) {
  return side === "NS" ? row.nsMatchpoints : row.ewMatchpoints;
}

function sidePercent(row, side) {
  return side === "NS" ? row.nsPercent : row.ewPercent;
}

function sideParticipantKey(row, side) {
  return side === "NS" ? row.nsParticipantKey : row.ewParticipantKey;
}

function sideParticipantNo(row, side) {
  return side === "NS" ? row.nsParticipantNo || row.pairNS : row.ewParticipantNo || row.pairEW;
}

function sideParticipantPlayers(row, side) {
  return side === "NS" ? row.nsParticipantPlayers || row.nsPlayers : row.ewParticipantPlayers || row.ewPlayers;
}

function rowContractText(row) {
  if (!row) return "No contract";
  if (row.adjustment && row.scoreNS == null) return `Adjusted ${row.adjustment.nsPercent}%/${row.adjustment.ewPercent}%`;
  return `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim() || "No contract";
}

/**
 * Builds the scored session from raw parser output: row normalization,
 * rosters, matchpointing, standings, board summaries, and warnings.
 *
 * @param {import("./types.js").RawResults} rawResults
 * @param {import("./types.js").PbnAnalysis} [analysis] Omit or pass null
 *   in results-only mode.
 * @returns {import("./types.js").ResultsAnalysis}
 */
function buildResultsAnalysis(rawResults, analysis) {
  analysis = analysis || emptyAnalysis();
  const boardMap = boardMapByNumber(analysis);
  const warnings = [...(rawResults.warnings || [])];
  const hasPbn = analysis.boards.length > 0;
  if (!hasPbn) {
    warnings.push("No PBN hand record is loaded; par, double-dummy, deal, and HCP analysis will be added after a PBN is opened. Dealer and vulnerability are inferred from standard board numbering for scoring.");
  }
  const playerNumbers = normalizePlayerNumbers(rawResults.playerNumbers || []);
  const normalizedRows = (rawResults.receivedData || [])
    .map((row, index) => normalizeResultRow(row, index, analysis, boardMap))
    .filter(Boolean);
  const skippedNoBoard = (rawResults.receivedData || []).length - normalizedRows.length;
  if (skippedNoBoard) {
    warnings.push(`${plural(skippedNoBoard, "result row had", "result rows had")} no recognizable board number and ${skippedNoBoard === 1 ? "was" : "were"} skipped.`);
  }
  const erasedRowCount = normalizedRows.filter((row) => row.erased).length;
  if (erasedRowCount) {
    warnings.push(`${plural(erasedRowCount, "erased (corrected) result row was", "erased (corrected) result rows were")} excluded from scoring.`);
  }
  const rows = normalizedRows.filter((row) => !row.erased);
  const sectionNumbers = uniqueSorted(rows.map((row) => row.section).filter((value) => value != null));
  const multiSection = sectionNumbers.length > 1;
  if (multiSection) {
    warnings.push(`${sectionNumbers.length} sections detected; boards are matchpointed within each section and pair numbers are section-scoped.`);
  }
  rows.forEach((row) => {
    row.fieldKey = multiSection ? `${row.section == null ? "?" : row.section}|${row.boardNo}` : String(row.boardNo);
  });
  const adjustedCount = rows.filter((row) => row.adjustment && row.scoreNS == null).length;
  if (adjustedCount) {
    warnings.push(`${plural(adjustedCount, "director-adjusted row was", "director-adjusted rows were")} applied as percentage awards instead of scored contracts.`);
  }
  const pairRosters = buildPairRosters(playerNumbers, rows, multiSection);
  const rosterProfile = pairRosters.profile || {};
  const sidePairCollision = detectSidePairCollision(rows);
  const useSidePartnerships = !!rosterProfile.teamLikeGroups || sidePairCollision;
  if (rosterProfile.teamLikeGroups) {
    warnings.push(`${rosterProfile.teamLikeGroups} result numbers have both NS-side and EW-side player rosters; pair standings and reports are split into side-specific partnerships.`);
  } else if (sidePairCollision) {
    warnings.push("Pair numbers repeat across the NS and EW directions (Mitchell-style movement); each direction is treated as a separate partnership in standings and reports.");
  }
  const numberOnlyPlayers = playerNumbers.filter((player) => player.number && !player.name).length;
  if (numberOnlyPlayers) {
    warnings.push(`${plural(numberOnlyPlayers, "PlayerNumbers record has", "PlayerNumbers records have")} a member number but no player name; the member number is shown where no name was available.`);
  }
  attachPlayerNames(rows, pairRosters, useSidePartnerships, multiSection);
  const rowsByBoard = new Map();
  const rowsByField = new Map();
  rows.forEach((row) => {
    const key = String(row.boardNo);
    if (!rowsByBoard.has(key)) rowsByBoard.set(key, []);
    rowsByBoard.get(key).push(row);
    if (!rowsByField.has(row.fieldKey)) rowsByField.set(row.fieldKey, []);
    rowsByField.get(row.fieldKey).push(row);
  });

  applyMatchpoints(rowsByField);

  const pairMap = new Map();
  rows.forEach((row) => {
    addPairStanding(pairMap, "NS", row);
    addPairStanding(pairMap, "EW", row);
    if (row.scoringError) warnings.push(`Board ${row.boardNo}, row ${row.id || row.index + 1}: ${row.scoringError}`);
  });

  const pairStandings = Array.from(pairMap.values())
    .map((standing) => ({
      ...standing,
      averageScore: standing.scores.length ? average(standing.scores) : 0,
      percent: standing.top ? (standing.matchpoints / standing.top) * 100 : null
    }))
    .sort((a, b) => (b.percent || 0) - (a.percent || 0) || String(a.pairNo).localeCompare(String(b.pairNo), undefined, { numeric: true }))
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
  const partialRosterStandings = pairStandings.filter((standing) => standing.boards && standing.knownPlayers > 0 && standing.knownPlayers < 2);
  if (partialRosterStandings.length) {
    const examples = partialRosterStandings.map((standing) => standing.pairNo).sort(numericPairSort).slice(0, 8).join(", ");
    warnings.push(`${plural(partialRosterStandings.length, "active partnership has", "active partnerships have")} only one recovered player name or member number${examples ? ` (${examples})` : ""}; the missing member is left blank.`);
  }
  const missingRosterStandings = pairStandings.filter((standing) => standing.boards && !standing.knownPlayers);
  if (missingRosterStandings.length) {
    const examples = missingRosterStandings.map((standing) => standing.pairNo).sort(numericPairSort).slice(0, 8).join(", ");
    warnings.push(`${plural(missingRosterStandings.length, "active partnership has", "active partnerships have")} no recovered player names or member numbers${examples ? ` (${examples})` : ""}; these pairs are listed by pair number only.`);
  }

  const boardSummaries = Array.from(rowsByBoard.entries())
    .map(([boardNo, boardRows]) => summarizeResultBoard(Number(boardNo), boardRows, boardMap.get(String(boardNo))))
    .sort((a, b) => a.boardNo - b.boardNo);
  const boardsByNumber = new Map(boardSummaries.map((summary) => [String(summary.boardNo), summary]));
  const pbnBoardNumbers = new Set(analysis.boards.map((board) => String(board.boardNo)));
  const resultBoardNumbers = new Set(boardSummaries.map((summary) => String(summary.boardNo)));
  const vsPar = rows.map((row) => row.vsParNS).filter((value) => value != null);
  const ddDeltas = rows.map((row) => row.ddDelta).filter((value) => value != null);
  const compatibility = assessPbnResultsCompatibility(analysis, rows, boardSummaries);
  if (hasPbn && ["warning", "mismatch"].includes(compatibility.status)) {
    warnings.push(`${compatibility.label}: the results file may not correspond to the loaded PBN. ${compatibility.primaryConcern || compatibility.details[0] || ""}`);
  }

  return {
    fileName: rawResults.fileName,
    sourceType: rawResults.sourceType,
    metadata: rawResults.metadata || {},
    raw: rawResults,
    rows,
    playerNumbers,
    pairRosters,
    rosterProfile,
    participantMode: useSidePartnerships ? "side" : "pair",
    hasPbn,
    rowsByBoard,
    rowsByField,
    boardSummaries,
    boardsByNumber,
    pairStandings,
    warnings,
    summary: {
      resultCount: rows.length,
      scoredCount: rows.filter((row) => row.scoreNS != null).length,
      boardsCovered: boardSummaries.length,
      tables: uniqueSorted(rows.map((row) => row.tableNo)).length,
      rounds: uniqueSorted(rows.map((row) => row.round)).length,
      pairs: pairStandings.length,
      playerRecords: playerNumbers.length,
      namedPlayers: playerNumbers.filter((player) => player.name).length,
      contractClasses: countBy(rows.map((row) => row.contractClass)),
      declarerSides: countBy(rows.map((row) => row.declarerSide)),
      missingResultBoards: analysis.boards.filter((board) => !resultBoardNumbers.has(String(board.boardNo))).map((board) => board.boardNo),
      extraResultBoards: boardSummaries.filter((summary) => !pbnBoardNumbers.has(String(summary.boardNo))).map((summary) => summary.boardNo),
      compatibility,
      averageVsPar: vsPar.length ? average(vsPar) : null,
      averageAbsVsPar: vsPar.length ? average(vsPar.map((value) => Math.abs(value))) : null,
      ddExact: ddDeltas.filter((value) => value === 0).length,
      ddCompared: ddDeltas.length
    }
  };
}

export {
  normalizeResultSide,
  parseScoreAdjustment,
  boardMapByNumber,
  normalizeResultRow,
  normalizePlayerNumbers,
  playerHasIdentity,
  playerPlaceholder,
  playerDisplay,
  pairRosterKey,
  ensurePairRoster,
  rosterTableKey,
  rosterPairId,
  buildPairRosters,
  summarizePairRosters,
  pairRosterLabel,
  pairSeatPlayer,
  pairRosterKnownCount,
  participantKeyFor,
  participantLabelFor,
  attachPlayerNames,
  addPairStanding,
  applyMatchpoints,
  summarizeResultBoard,
  detectSidePairCollision,
  defaultReportPair,
  sideScore,
  sideMatchpoints,
  sidePercent,
  sideParticipantKey,
  sideParticipantNo,
  sideParticipantPlayers,
  rowContractText,
  buildResultsAnalysis,
};
