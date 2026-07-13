// Board and deal analysis: hand evaluation, PBN board normalization,
// double-dummy access, and the standard dealer/vulnerability cycles.

import { SEATS, SUITS, HCP_VALUE } from "./constants.js";
import { countBy, uniqueSorted, safeNumber, average } from "./format.js";
import { sortHolding } from "./cards.js";
import { normalizeVulnerability } from "./scoring.js";
import {
  parseDeal,
  parseParContracts,
  parseOptimumScore,
  parseOptimumRows,
  parseDoubleDummyTricks
} from "../parsers/pbn.js";

const STANDARD_VULNERABILITY_CYCLE = [
  "None", "NS", "EW", "All",
  "NS", "EW", "All", "None",
  "EW", "All", "None", "NS",
  "All", "None", "NS", "EW"
];

function longestSuitByLength(lengths) {
  return SUITS.reduce((best, suit) => {
    const candidate = { suit: suit.key, length: lengths[suit.key] || 0 };
    return !best || candidate.length > best.length ? candidate : best;
  }, null);
}

function analyzeHand(hand) {
  /** @type {Object<string, string>} */
  const normalized = {};
  SUITS.forEach((suit) => {
    normalized[suit.key] = sortHolding(hand && hand[suit.key]);
  });

  /** @type {Object<string, number>} */
  const lengths = {};
  /** @type {Object<string, number>} */
  const hcpBySuit = {};
  let hcp = 0;
  let controls = 0;
  let distributionPoints = 0;

  SUITS.forEach((suit) => {
    const holding = normalized[suit.key];
    lengths[suit.key] = holding.length;
    hcpBySuit[suit.key] = 0;
    holding.split("").forEach((rank) => {
      const points = HCP_VALUE[rank] || 0;
      hcp += points;
      hcpBySuit[suit.key] += points;
      if (rank === "A") controls += 2;
      if (rank === "K") controls += 1;
    });
    if (holding.length === 0) distributionPoints += 3;
    if (holding.length === 1) distributionPoints += 2;
    if (holding.length === 2) distributionPoints += 1;
  });

  const shape = SUITS.map((suit) => lengths[suit.key]).join("-");
  const longest = longestSuitByLength(lengths);
  const voids = SUITS.filter((suit) => lengths[suit.key] === 0).map((suit) => suit.key);
  const singletons = SUITS.filter((suit) => lengths[suit.key] === 1).map((suit) => suit.key);
  const display = SUITS.map((suit) => normalized[suit.key] || "-").join(".");

  return {
    cards: normalized,
    lengths,
    hcp,
    hcpBySuit,
    controls,
    distributionPoints,
    shape,
    longestSuit: longest ? longest.suit : "",
    longestLength: longest ? longest.length : 0,
    voids,
    singletons,
    display
  };
}

function combinePairStats(hands, pair) {
  const seats = pair === "NS" ? ["N", "S"] : ["E", "W"];
  /** @type {Object<string, number>} */
  const lengths = {};
  /** @type {Object<string, string>} */
  const holdings = {};
  SUITS.forEach((suit) => {
    holdings[suit.key] = seats.map((seat) => hands[seat] ? hands[seat].cards[suit.key] : "").join("");
    lengths[suit.key] = holdings[suit.key].length;
  });

  const bestFit = longestSuitByLength(lengths);

  return {
    pair,
    seats,
    hcp: seats.reduce((acc, seat) => acc + (hands[seat] ? hands[seat].hcp : 0), 0),
    lengths,
    holdings,
    bestFitSuit: bestFit ? bestFit.suit : "",
    bestFitLength: bestFit ? bestFit.length : 0,
    majorFit: Math.max(lengths.S || 0, lengths.H || 0),
    minorFit: Math.max(lengths.D || 0, lengths.C || 0)
  };
}

function standardDealer(boardNo) {
  const board = Number(boardNo);
  if (!Number.isFinite(board) || board < 1) return "";
  return SEATS[(board - 1) % 4];
}

function standardVulnerability(boardNo) {
  const board = Number(boardNo);
  if (!Number.isFinite(board) || board < 1) return "";
  return STANDARD_VULNERABILITY_CYCLE[(board - 1) % STANDARD_VULNERABILITY_CYCLE.length];
}

/**
 * Builds a reduced Board for result rows with no PBN board loaded:
 * dealer and vulnerability follow standard board numbering.
 *
 * @param {number} boardNo
 * @returns {import("./types.js").Board}
 */
function fallbackResultBoard(boardNo) {
  return {
    boardNo,
    dealer: standardDealer(boardNo),
    vulnerable: standardVulnerability(boardNo),
    tags: {},
    optimum: { nsPerspective: null, edge: "Flat", pair: "", side: "" },
    optimumRows: [],
    className: "Unknown",
    issues: []
  };
}

function getDoubleDummyTricks(board, declarer, denomination) {
  const row = board.optimumRows.find((entry) => entry.declarer === declarer && entry.denomination === denomination);
  return row ? row.tricks : "";
}

/**
 * Analyzes one parsed PBN record into a Board: hands, HCP, par,
 * optimum score, and the double-dummy table.
 *
 * @param {Object} record One record from `parsePbn`.
 * @param {number} index Record index in the PBN file.
 * @returns {import("./types.js").Board}
 */
function normalizeBoard(record, index) {
  const tags = record.tags;
  const boardNo = safeNumber(tags.Board) || index + 1;
  const dealerTag = String(tags.Dealer || "").toUpperCase();
  const dealer = SEATS.includes(dealerTag) ? dealerTag : standardDealer(boardNo);
  const vulnerable = normalizeVulnerability(tags.Vulnerable) || standardVulnerability(boardNo);
  const deal = parseDeal(tags.Deal);
  /** @type {Object<string, import("./types.js").HandAnalysis>} */
  const hands = {};
  SEATS.forEach((seat) => {
    hands[seat] = analyzeHand(deal.hands[seat]);
  });
  const pairs = {
    NS: combinePairStats(hands, "NS"),
    EW: combinePairStats(hands, "EW")
  };
  const parContracts = parseParContracts(tags.ParContract);
  const primaryPar = parContracts[0] || null;
  const optimum = parseOptimumScore(tags.OptimumScore);
  const optimumRows = parseOptimumRows(record.sections.OptimumResultTable);
  const doubleDummyRows = optimumRows.length ? optimumRows : parseDoubleDummyTricks(tags.DoubleDummyTricks);
  const voids = [];
  const longSuits = [];

  if (deal.valid) {
    SEATS.forEach((seat) => {
      hands[seat].voids.forEach((suit) => voids.push(`${seat} ${suit}`));
      if (hands[seat].longestLength >= 7) longSuits.push(`${seat} ${hands[seat].longestLength}${hands[seat].longestSuit}`);
    });
  }

  const issues = [...deal.issues];
  if (!tags.Deal) issues.push("No deal to analyze");
  if (!tags.ParContract) issues.push("No par contract");
  if (!tags.OptimumScore) issues.push("No optimum score");

  return {
    index,
    record,
    tags,
    boardNo,
    dealer,
    vulnerable,
    deal,
    hands,
    pairs,
    hcpNS: pairs.NS.hcp,
    hcpEW: pairs.EW.hcp,
    hcpDeltaNS: pairs.NS.hcp - pairs.EW.hcp,
    parContracts,
    primaryPar,
    optimum,
    optimumRows: doubleDummyRows,
    voids,
    longSuits,
    issues,
    validDeal: deal.valid,
    className: primaryPar ? primaryPar.className : "Unknown"
  };
}

/**
 * Builds the full PBN analysis from `parsePbn` output.
 *
 * @param {{ fileName: string, directives: Array<Object>, records: Array<Object>, warnings: string[] }} parsed
 * @returns {import("./types.js").PbnAnalysis}
 */
function buildAnalysis(parsed) {
  const boards = parsed.records.map((record, index) => normalizeBoard(record, index));
  const tags = uniqueSorted(parsed.records.flatMap((record) => Object.keys(record.tags)));
  const map = directiveMap(parsed.directives);
  const parContractPieces = boards.flatMap((board) => board.parContracts);
  const validDeals = boards.filter((board) => board.validDeal).length;
  const boardsWithActualResults = boards.filter((board) => board.tags.Contract || board.tags.Declarer || board.tags.Result).length;
  const nsPerspectiveScores = boards.map((board) => board.optimum.nsPerspective).filter((value) => value != null);
  const largestScores = [...boards]
    .filter((board) => board.optimum.nsPerspective != null)
    .sort((a, b) => Math.abs(b.optimum.nsPerspective) - Math.abs(a.optimum.nsPerspective))
    .slice(0, 5);

  const summary = {
    boardCount: boards.length,
    validDeals,
    invalidDeals: boards.length - validDeals,
    dealers: countBy(boards.map((board) => board.dealer)),
    vulnerabilities: countBy(boards.map((board) => board.vulnerable)),
    parEdges: countBy(boards.map((board) => board.optimum.edge)),
    parContractSides: countBy(parContractPieces.map((contract) => contract.pair || contract.side)),
    classes: countBy(boards.map((board) => board.className)),
    levels: countBy(parContractPieces.map((contract) => contract.level ? String(contract.level) : "")),
    strains: countBy(parContractPieces.map((contract) => contract.strain)),
    boardsWithActualResults,
    boardsMissingActualResults: boards.length - boardsWithActualResults,
    averageHcpBySeat: Object.fromEntries(SEATS.map((seat) => [seat, average(boards.map((board) => board.hands[seat].hcp))])),
    averageHcpByPair: {
      NS: average(boards.map((board) => board.hcpNS)),
      EW: average(boards.map((board) => board.hcpEW))
    },
    maxAbsScore: nsPerspectiveScores.length ? Math.max(...nsPerspectiveScores.map((value) => Math.abs(value))) : 0,
    largestScores,
    slamLevelBoards: boards.filter((board) => board.parContracts.some((contract) => contract.level >= 6)),
    voidBoards: boards.filter((board) => board.voids.length),
    longSuitBoards: boards.filter((board) => board.longSuits.length),
    hcpImbalanceBoards: [...boards].sort((a, b) => Math.abs(b.hcpDeltaNS) - Math.abs(a.hcpDeltaNS)).slice(0, 5)
  };

  return {
    parsed,
    boards,
    tagKeys: tags,
    directiveMap: map,
    summary
  };
}

/**
 * The PbnAnalysis used when no PBN is loaded (results-only mode).
 *
 * @returns {import("./types.js").PbnAnalysis}
 */
function emptyAnalysis() {
  return {
    parsed: { fileName: "", directives: [], warnings: [] },
    directiveMap: new Map(),
    boards: [],
    tagKeys: [],
    summary: {
      boardCount: 0,
      validDeals: 0,
      boardsWithActualResults: 0,
      boardsMissingActualResults: 0,
      parEdges: {},
      classes: {},
      slamLevelBoards: [],
      averageHcpByPair: { NS: 0, EW: 0 }
    }
  };
}

function vulSides(vulnerable) {
  return {
    ns: vulnerable === "NS" || vulnerable === "All",
    ew: vulnerable === "EW" || vulnerable === "All"
  };
}

function vulLabel(vulnerable) {
  if (vulnerable === "None") return "None vul";
  if (vulnerable === "NS") return "NS vul";
  if (vulnerable === "EW") return "EW vul";
  if (vulnerable === "All") return "Both vul";
  return "Vul unknown";
}

function directiveMap(directives) {
  const map = new Map();
  directives.forEach((directive) => {
    if (!map.has(directive.key)) map.set(directive.key, []);
    map.get(directive.key).push(directive.value);
  });
  return map;
}

function firstDirective(analysis, keys) {
  const map = analysis.directiveMap;
  for (const key of keys) {
    const values = map.get(key);
    if (values && values.length) return values[0];
  }
  return "";
}

function pbnHeaderDetails(analysis) {
  if (!analysis) return { event: "", date: "" };
  const firstBoard = analysis && analysis.boards ? analysis.boards[0] || { tags: {} } : { tags: {} };
  return {
    event: firstDirective(analysis, ["HRTitleEvent"]) || firstBoard.tags.Event || "",
    date: firstDirective(analysis, ["HRTitleDate"]) || firstBoard.tags.Date || ""
  };
}

export {
  fallbackResultBoard,
  getDoubleDummyTricks,
  buildAnalysis,
  emptyAnalysis,
  vulSides,
  vulLabel,
  firstDirective,
  pbnHeaderDetails,
};
