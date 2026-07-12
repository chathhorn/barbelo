// Pure adapter from the existing results/report models to the small,
// serializable content model consumed by Bridge Simulator. This module owns
// no DOM, renderer, input, audio, or mutable run state.

import { PAIRS, RANK_ORDER, SEATS, SUITS } from "../constants.js";
import { createSeededRandom, fingerprint, shuffledCopy } from "./seed.js";

const SCENARIO_SCHEMA_VERSION = 1;
const COMPATIBILITY_STATUSES = new Set(["match", "partial", "warning", "mismatch", "unknown"]);
const TRUSTED_HAND_STATUSES = new Set(["match", "partial"]);
const SUIT_KEYS = SUITS.map((suit) => suit.key);

const THEME_INFO = {
  biddingJudgment: { title: "The Auction Pits", encounterSkin: "auction-wraith" },
  declarerPlay: { title: "The Trickworks", encounterSkin: "overtrick-imp" },
  defense: { title: "The Lead Mines", encounterSkin: "lead-goblin" },
  competitiveAuction: { title: "The Partscore Trenches", encounterSkin: "partscore-rat" },
  penaltyDouble: { title: "The Red-X Vault", encounterSkin: "red-x-sentinel" },
  manualReview: { title: "The Fog-of-War Archive", encounterSkin: "score-slip" },
  fieldContext: { title: "The Field Annex", encounterSkin: "score-slip" },
  scorekeeping: { title: "The Scorekeeper's Office", encounterSkin: "score-slip" },
  baseline: { title: "The Baseline Gallery", encounterSkin: "score-slip" },
};

const CATEGORY_THEME = {
  missedGameSlam: "biddingJudgment",
  overreach: "biddingJudgment",
  wrongStrain: "biddingJudgment",
  contractSelection: "biddingJudgment",
  declarerTricks: "declarerPlay",
  defensiveTricks: "defense",
  competitiveAuction: "competitiveAuction",
  partscoreBattle: "competitiveAuction",
  penaltyDouble: "penaltyDouble",
  outlier: "manualReview",
  tieSplit: "baseline",
};

function stringValue(value) {
  return value == null ? "" : String(value).trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayNumber(value, digits = 1) {
  const number = finiteNumber(value);
  if (number == null) return "";
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(digits).replace(/\.0+$/, "");
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((entry) => deepFreeze(entry, seen));
  return Object.freeze(value);
}

function copyConfidence(confidence) {
  if (!confidence) return null;
  const level = stringValue(confidence.level);
  const label = stringValue(confidence.label);
  const detail = stringValue(confidence.detail);
  if (!level && !label && !detail) return null;
  return { level, label, detail };
}

function rowIdentityFor(row) {
  const fieldKey = stringValue(row && row.fieldKey) || String(row && row.boardNo != null ? row.boardNo : "?");
  let rowIndex;
  if (row && row.index != null && stringValue(row.index) !== "") rowIndex = row.index;
  else if (row && row.rowIndex != null && stringValue(row.rowIndex) !== "") rowIndex = row.rowIndex;
  else rowIndex = `missing:${fieldKey}:${stringValue(row && row.boardNo)}:${stringValue(row && row.contract)}:${stringValue(row && row.result)}`;
  const boardNo = finiteNumber(row && row.boardNo);
  return {
    rowIndex,
    fieldKey,
    boardNo,
    key: `${fieldKey}|row:${String(rowIndex)}`,
  };
}

function contentSegment(text, claimKind, options = {}) {
  const kind = ["report", "static", "fiction"].includes(claimKind) ? claimKind : "static";
  const sourceFields = Array.from(new Set((options.sourceFields || []).map(stringValue).filter(Boolean)));
  return {
    text: stringValue(text),
    claimKind: kind,
    sourceFields: kind === "report" ? sourceFields : [],
    rowIdentity: options.rowIdentity || null,
    contentId: kind === "report" ? null : stringValue(options.contentId) || "simulator-copy",
    confidence: copyConfidence(options.confidence),
    transform: stringValue(options.transform) || null,
  };
}

function reportSegment(text, sourceFields, options = {}) {
  return contentSegment(text, "report", { ...options, sourceFields });
}

function staticSegment(text, contentId) {
  return contentSegment(text, "static", { contentId });
}

function fictionSegment(text, contentId) {
  return contentSegment(text, "fiction", { contentId });
}

function normalizeCompatibilityStatus(results) {
  const status = stringValue(results && results.summary && results.summary.compatibility && results.summary.compatibility.status).toLowerCase();
  return COMPATIBILITY_STATUSES.has(status) ? status : "unknown";
}

function hasPbnData(analysis, results) {
  return Boolean(
    (results && results.hasPbn) ||
    (analysis && Array.isArray(analysis.boards) && analysis.boards.length)
  );
}

function canonicalCardSort(a, b) {
  return SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit) ||
    RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
}

function canonicalizeCards(cards) {
  if (!Array.isArray(cards)) return null;
  const normalized = [];
  const seen = new Set();
  for (const card of cards) {
    const suit = stringValue(card && card.suit).toUpperCase();
    let rank = stringValue(card && card.rank).toUpperCase();
    if (rank === "10") rank = "T";
    if (!SUIT_KEYS.includes(suit) || rank.length !== 1 || !RANK_ORDER.includes(rank)) return null;
    const key = `${suit}${rank}`;
    if (seen.has(key)) return null;
    seen.add(key);
    normalized.push({ suit, rank });
  }
  if (normalized.length !== 13) return null;
  return normalized.sort(canonicalCardSort);
}

function cardsFromAnalyzedHand(hand) {
  if (!hand || !hand.cards) return null;
  const cards = [];
  for (const suit of SUIT_KEYS) {
    const holding = stringValue(hand.cards[suit]).toUpperCase().replace(/-/g, "");
    for (const rank of holding) cards.push({ suit, rank });
  }
  return canonicalizeCards(cards);
}

function standardDeck() {
  return SUIT_KEYS.flatMap((suit) => [...RANK_ORDER].map((rank) => ({ suit, rank })));
}

function buildPracticeDeck(seed) {
  const random = createSeededRandom(`${seed}:practice-deck`);
  return shuffledCopy(standardDeck(), random).slice(0, 13).sort(canonicalCardSort);
}

function selectedSeatForView(view) {
  const row = view && view.row ? view.row : {};
  const side = stringValue(view && view.side).toUpperCase();
  const declared = view && typeof view.declared === "boolean"
    ? view.declared
    : stringValue(row.declarerPair).toUpperCase() === side;
  const declarer = stringValue(row.declarerSide).toUpperCase();
  if (declared && SEATS.includes(declarer) && PAIRS[declarer] === side) return declarer;
  if (!declared && SEATS.includes(declarer)) {
    const leader = SEATS[(SEATS.indexOf(declarer) + 1) % SEATS.length];
    if (PAIRS[leader] === side) return leader;
  }
  return side === "EW" ? "E" : "N";
}

function rowCanSupplyHand(view) {
  const row = view && view.row;
  return Boolean(
    row &&
    row.hasPbnBoard &&
    !row.erased &&
    !row.adjustment &&
    row.scoreNS != null &&
    !(row.parsedContract && row.parsedContract.passout) &&
    row.board &&
    row.board.validDeal === true &&
    row.board.hands
  );
}

function actualHandFromView(view) {
  if (!rowCanSupplyHand(view)) return null;
  const seat = selectedSeatForView(view);
  const cards = cardsFromAnalyzedHand(view.row.board.hands[seat]);
  if (!cards) return null;
  return {
    view,
    seat,
    cards,
    rowIdentity: rowIdentityFor(view.row),
    boardNo: finiteNumber(view.row.boardNo),
  };
}

function isSuitableReviewItem(item) {
  const row = item && item.row;
  const diagnosis = item && item.diagnosis;
  return Boolean(
    row &&
    row.index != null &&
    !row.erased &&
    !row.adjustment &&
    row.scoreNS != null &&
    !(row.parsedContract && row.parsedContract.passout) &&
    stringValue(row.contract) &&
    diagnosis &&
    (stringValue(diagnosis.explanation) || stringValue(diagnosis.categoryLabel))
  );
}

function uniqueSuitableReviewItems(report) {
  const seen = new Set();
  return (Array.isArray(report && report.reviewItems) ? report.reviewItems : [])
    .filter(isSuitableReviewItem)
    .filter((item) => {
      const key = rowIdentityFor(item.row).key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function usableDecisionTypes(report) {
  return (Array.isArray(report && report.decisionTypes) ? report.decisionTypes : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => stringValue(entry && entry.key) && (stringValue(entry && entry.label) || THEME_INFO[entry.key]));
}

function decisionThemeForCategory(categoryKey) {
  const key = stringValue(categoryKey);
  if (THEME_INFO[key]) return key;
  return CATEGORY_THEME[key] || "manualReview";
}

function themeInfo(themeKey) {
  return THEME_INFO[themeKey] || THEME_INFO.manualReview;
}

function themeForPracticePriority(priority) {
  const text = `${stringValue(priority && priority.title)} ${stringValue(priority && priority.advice)}`.toLowerCase();
  if (/penalty|redouble|doubles?\b/.test(text) && !/double-dummy/.test(text)) return "penaltyDouble";
  if (/defen|opening lead|signal|cash-out/.test(text)) return "defense";
  if (/partscore|competitive|sacrifice|save/.test(text)) return "competitiveAuction";
  if (/declarer|card play|overtrick|double-dummy|trick/.test(text)) return "declarerPlay";
  if (/bid|auction|game|slam|strain|contract/.test(text)) return "biddingJudgment";
  if (/field|rival|peer/.test(text)) return "fieldContext";
  return "baseline";
}

function candidateFromDecision(type, index) {
  const rawKey = stringValue(type.key);
  const themeKey = THEME_INFO[rawKey] ? rawKey : "manualReview";
  const meta = themeInfo(themeKey);
  const label = stringValue(type.label) || meta.title;
  const count = finiteNumber(type.boardCount);
  const loss = finiteNumber(type.totalLoss);
  const metric = loss == null
    ? `${label} is a report focus.`
    : `${label} accounts for ${displayNumber(loss)} MP conceded${count == null ? "" : ` across ${plural(count, "board")}`}.`;
  const base = `report.decisionTypes[${index}]`;
  const details = stringValue(type.advice);
  return {
    themeKey,
    title: meta.title,
    encounterSkin: meta.encounterSkin,
    sourceKind: "decision-type",
    summary: [reportSegment(metric, [`${base}.label`, `${base}.totalLoss`, `${base}.boardCount`])],
    details: details ? [reportSegment(details, [`${base}.advice`])] : [],
    objective: details
      ? [reportSegment(details, [`${base}.advice`])]
      : [staticSegment(`Review the evidence behind ${label}.`, `objective-${themeKey}`)],
  };
}

function candidateFromPractice(priority, index) {
  const themeKey = themeForPracticePriority(priority);
  const meta = themeInfo(themeKey);
  const title = stringValue(priority.title) || meta.title;
  const metric = stringValue(priority.metric);
  const detail = stringValue(priority.detail);
  const advice = stringValue(priority.advice);
  const base = `report.practicePriorities[${index}]`;
  return {
    themeKey,
    title: meta.title,
    encounterSkin: meta.encounterSkin,
    sourceKind: "practice-priority",
    summary: [reportSegment(`${title}${metric ? `: ${metric}` : ""}.`, [`${base}.title`, `${base}.metric`])],
    details: [detail && reportSegment(detail, [`${base}.detail`]), advice && reportSegment(advice, [`${base}.advice`])].filter(Boolean),
    objective: advice
      ? [reportSegment(advice, [`${base}.advice`])]
      : [staticSegment(`Inspect the evidence behind ${title}.`, `objective-practice-${index}`)],
  };
}

function scorecardCandidates(report) {
  const candidates = [];
  const biddingCount = finiteNumber(report && report.biddingScorecard && report.biddingScorecard.gamesAvailable);
  if (biddingCount != null && biddingCount > 0) {
    const meta = themeInfo("biddingJudgment");
    candidates.push({
      themeKey: "biddingJudgment",
      title: meta.title,
      encounterSkin: meta.encounterSkin,
      sourceKind: "scorecard",
      summary: [reportSegment(`The bidding scorecard covers ${plural(biddingCount, "game-or-slam decision")}.`, ["report.biddingScorecard.gamesAvailable"])],
      details: [staticSegment("Compare level, strain, invitation, and signoff choices with the field evidence.", "scorecard-bidding-tip")],
      objective: [staticSegment("Inspect one auction decision without inventing the missing auction.", "objective-bidding-scorecard")],
    });
  }
  const declares = finiteNumber(report && report.declaredScorecard && report.declaredScorecard.declares);
  if (declares != null && declares > 0) {
    const meta = themeInfo("declarerPlay");
    candidates.push({
      themeKey: "declarerPlay",
      title: meta.title,
      encounterSkin: meta.encounterSkin,
      sourceKind: "scorecard",
      summary: [reportSegment(`This pair declared ${plural(declares, "board")}.`, ["report.declaredScorecard.declares"])],
      details: [staticSegment("Use same-contract and double-dummy evidence only as a prompt for replay.", "scorecard-declarer-tip")],
      objective: [staticSegment("Review declarer timing without claiming a card-by-card error.", "objective-declarer-scorecard")],
    });
  }
  const defends = finiteNumber(report && report.defendedScorecard && report.defendedScorecard.defends);
  if (defends != null && defends > 0) {
    const meta = themeInfo("defense");
    candidates.push({
      themeKey: "defense",
      title: meta.title,
      encounterSkin: meta.encounterSkin,
      sourceKind: "scorecard",
      summary: [reportSegment(`This pair defended ${plural(defends, "board")}.`, ["report.defendedScorecard.defends"])],
      details: [staticSegment("Review leads, shifts, signals, and cash-out timing without pretending the full play is known.", "scorecard-defense-tip")],
      objective: [staticSegment("Inspect one defensive result against the available field evidence.", "objective-defense-scorecard")],
    });
  }
  const overtrickBoards = Array.isArray(report && report.overtrickMeter && report.overtrickMeter.boards)
    ? report.overtrickMeter.boards.length
    : 0;
  if (overtrickBoards > 0) {
    const meta = themeInfo("scorekeeping");
    candidates.push({
      themeKey: "scorekeeping",
      title: meta.title,
      encounterSkin: meta.encounterSkin,
      sourceKind: "scorecard",
      summary: [reportSegment(`The overtrick meter priced one trick on ${plural(overtrickBoards, "board")}.`, ["report.overtrickMeter.boards"])],
      details: [staticSegment("At matchpoints, a small trick can move an entire board.", "scorecard-overtrick-tip")],
      objective: [staticSegment("Check the price of one trick.", "objective-overtrick-scorecard")],
    });
  }
  const rivalCount = Array.isArray(report && report.fieldContext && report.fieldContext.rivals)
    ? report.fieldContext.rivals.length
    : 0;
  const opponentCount = Array.isArray(report && report.fieldContext && report.fieldContext.opponents)
    ? report.fieldContext.opponents.length
    : 0;
  if (rivalCount || opponentCount) {
    const meta = themeInfo("fieldContext");
    candidates.push({
      themeKey: "fieldContext",
      title: meta.title,
      encounterSkin: meta.encounterSkin,
      sourceKind: "field-context",
      summary: [reportSegment(`The report compares this pair with ${plural(rivalCount, "same-direction rival")} and ${plural(opponentCount, "table opponent")}.`, ["report.fieldContext.rivals", "report.fieldContext.opponents"])],
      details: [staticSegment("At matchpoints, the same-direction scores determine the matchpoints.", "field-context-rule")],
      objective: [staticSegment("Separate the pairs at the table from the pairs in the scoring comparison.", "objective-field-context")],
    });
  }
  return candidates;
}

function fallbackCandidates(report) {
  const boardCount = finiteNumber(report && report.summary && report.summary.boards) || 0;
  const declared = finiteNumber(report && report.summary && report.summary.declaredBoards) || 0;
  const defended = finiteNumber(report && report.summary && report.summary.defendedBoards) || 0;
  return [
    {
      themeKey: "baseline",
      sourceKind: "baseline",
      summary: [reportSegment(`This report covers ${plural(boardCount, "board")}.`, ["report.summary.boards"])],
      details: [staticSegment("Preserve what worked and review only what the evidence supports.", "baseline-preserve")],
      objective: [staticSegment("Maintain the baseline.", "objective-baseline")],
    },
    {
      themeKey: "fieldContext",
      sourceKind: "baseline",
      summary: [reportSegment(`The selected pair declared ${declared} and defended ${defended} of the reviewed boards.`, ["report.summary.declaredBoards", "report.summary.defendedBoards"])],
      details: [staticSegment("The same-direction traveler, not an imagined full auction, is the available evidence.", "baseline-field")],
      objective: [staticSegment("Read the room without inventing missing play.", "objective-baseline-field")],
    },
    {
      themeKey: "scorekeeping",
      sourceKind: "baseline",
      summary: [reportSegment(`The report found ${finiteNumber(report && report.summary && report.summary.flaggedBoards) || 0} flagged review boards.`, ["report.summary.flaggedBoards"])],
      details: [staticSegment("A clean traveler is a standard to defend, not a problem to fabricate.", "baseline-clean")],
      objective: [staticSegment("Defend the standard.", "objective-baseline-scorekeeping")],
    },
  ].map((candidate) => {
    const meta = themeInfo(candidate.themeKey);
    return { ...candidate, title: meta.title, encounterSkin: meta.encounterSkin };
  });
}

function buildWingCandidates(report, decisionTypes) {
  const selected = [];
  const usedThemes = new Set();
  const add = (candidate) => {
    if (!candidate || selected.length >= 3 || usedThemes.has(candidate.themeKey)) return;
    usedThemes.add(candidate.themeKey);
    selected.push(candidate);
  };
  decisionTypes.forEach(({ entry, index }) => add(candidateFromDecision(entry, index)));
  (Array.isArray(report && report.practicePriorities) ? report.practicePriorities : [])
    .forEach((priority, index) => add(candidateFromPractice(priority, index)));
  scorecardCandidates(report).forEach(add);
  fallbackCandidates(report).forEach(add);
  while (selected.length < 3) {
    const fallback = fallbackCandidates(report)[selected.length % 3];
    selected.push({ ...fallback, sourceKind: `${fallback.sourceKind}-${selected.length + 1}` });
  }
  return selected.slice(0, 3);
}

function candidateFromReviewItem(item) {
  const themeKey = decisionThemeForCategory(item && item.diagnosis && item.diagnosis.categoryKey);
  const meta = themeInfo(themeKey);
  return {
    themeKey,
    title: meta.title,
    encounterSkin: meta.encounterSkin,
    sourceKind: "review-item",
    summary: [],
    details: [],
    objective: [],
  };
}

function assignReviewItems(candidates, reviewItems) {
  const remaining = [...reviewItems];
  const assigned = candidates.map((candidate) => ({ candidate, reviewItem: null }));
  assigned.forEach((slot) => {
    const index = remaining.findIndex((item) =>
      decisionThemeForCategory(item && item.diagnosis && item.diagnosis.categoryKey) === slot.candidate.themeKey);
    if (index >= 0) slot.reviewItem = remaining.splice(index, 1)[0];
  });
  assigned.forEach((slot) => {
    if (slot.reviewItem || !remaining.length) return;
    const item = remaining.shift();
    slot.reviewItem = item;
    // A board-specific checkpoint should never wear an unrelated theme just
    // to preserve cosmetic variety.
    slot.candidate = candidateFromReviewItem(item);
  });
  return { assigned, unused: remaining };
}

function sanitizedDiagnosisText(item) {
  let text = stringValue(item && item.diagnosis && item.diagnosis.explanation);
  if (!text) return { text: "", transformed: false };
  const peerRows = item && item.peerComparison && Array.isArray(item.peerComparison.rows)
    ? item.peerComparison.rows
    : [];
  const names = new Set();
  peerRows.forEach((entry) => {
    const players = stringValue(entry && entry.players);
    const pairNo = stringValue(entry && entry.pairNo);
    if (players && !/^table\s+\d+/i.test(players)) {
      names.add(players);
      if (pairNo) names.add(`Pair ${pairNo} - ${players}`);
    }
  });
  let transformed = false;
  [...names].sort((a, b) => b.length - a.length).forEach((name) => {
    if (!text.includes(name)) return;
    const pair = name.match(/^Pair\s+[^-]+/i);
    text = text.split(name).join(pair ? pair[0].trim() : "a same-direction rival");
    transformed = true;
  });
  return { text, transformed };
}

function bestPeerForItem(item) {
  const rows = item && item.peerComparison && Array.isArray(item.peerComparison.rows)
    ? item.peerComparison.rows
    : [];
  const targetScore = finiteNumber(item && item.pairScore);
  const peers = rows
    .filter((entry) => entry && !entry.isTarget && finiteNumber(entry.score) != null)
    .filter((entry) => targetScore == null || Number(entry.score) > targetScore)
    .sort((a, b) => Number(b.score) - Number(a.score) || stringValue(a.contract).localeCompare(stringValue(b.contract)));
  if (!peers.length) return null;
  return {
    label: "Same-direction rival",
    contract: stringValue(peers[0].contract),
    score: finiteNumber(peers[0].score),
    percent: finiteNumber(peers[0].percent),
  };
}

function featuredBoardFromItem(item) {
  const row = item.row;
  const diagnosis = item.diagnosis || {};
  const confidence = copyConfidence(diagnosis.confidence);
  const contract = stringValue(row.contract);
  const result = stringValue(row.result);
  const declarer = stringValue(row.declarerSide);
  return {
    rowIdentity: rowIdentityFor(row),
    boardNo: finiteNumber(row.boardNo),
    side: stringValue(item.side),
    declared: Boolean(item.declared),
    contract,
    result,
    contractText: `${declarer ? `${declarer} ` : ""}${contract}${result}`.trim() || "No contract",
    pairScore: finiteNumber(item.pairScore),
    percent: finiteNumber(item.percent),
    categoryKey: stringValue(diagnosis.categoryKey),
    categoryLabel: stringValue(diagnosis.categoryLabel) || "Review Candidate",
    confidence,
    vulnerability: stringValue(row.board && row.board.vulnerable) || "None",
    betterPeer: bestPeerForItem(item),
  };
}

function feedbackForItem(item) {
  const board = featuredBoardFromItem(item);
  const identity = board.rowIdentity;
  const confidenceText = board.confidence && board.confidence.label ? ` (${board.confidence.label})` : "";
  const summary = [reportSegment(
    `Board ${board.boardNo == null ? "?" : board.boardNo}: ${board.categoryLabel}${confidenceText}.`,
    ["report.reviewItems[].row.boardNo", "report.reviewItems[].diagnosis.categoryLabel", "report.reviewItems[].diagnosis.confidence"],
    { rowIdentity: identity, confidence: board.confidence }
  )];
  const diagnosis = sanitizedDiagnosisText(item);
  const details = [];
  if (diagnosis.text) {
    details.push(reportSegment(diagnosis.text, ["report.reviewItems[].diagnosis.explanation"], {
      rowIdentity: identity,
      confidence: board.confidence,
      transform: diagnosis.transformed ? "player-names-redacted" : null,
    }));
  }
  if (board.betterPeer) {
    details.push(reportSegment(
      `A same-direction rival recorded ${board.betterPeer.contract || "a different result"} for ${board.betterPeer.score == null ? "an available score" : displayNumber(board.betterPeer.score, 0)}.`,
      ["report.reviewItems[].peerComparison.rows"],
      { rowIdentity: identity }
    ));
  }
  return { board, summary, details };
}

function buildWings(assignments) {
  return assignments.map(({ candidate, reviewItem }, index) => {
    const slot = String.fromCharCode(65 + index);
    let featuredBoard = null;
    let summary = candidate.summary;
    let details = candidate.details;
    let objective = candidate.objective;
    if (reviewItem) {
      const feedback = feedbackForItem(reviewItem);
      featuredBoard = feedback.board;
      summary = feedback.summary;
      details = feedback.details;
      objective = [
        fictionSegment(`Recover Review Slip ${slot}.`, `review-slip-${slot.toLowerCase()}`),
        reportSegment(`This checkpoint is anchored to Board ${featuredBoard.boardNo == null ? "?" : featuredBoard.boardNo}.`, ["report.reviewItems[].row.boardNo"], { rowIdentity: featuredBoard.rowIdentity }),
      ];
    }
    return {
      slot,
      themeKey: candidate.themeKey,
      title: candidate.title,
      encounterSkin: candidate.encounterSkin,
      sourceKind: candidate.sourceKind,
      objective: { label: `Review Slip ${slot}`, segments: objective },
      featuredBoard,
      coachFeedback: { summary, details },
      boardSpecific: Boolean(featuredBoard),
      personalized: [...summary, ...details].some((segment) => segment.claimKind === "report"),
    };
  });
}

function uniqueViews(views) {
  const seen = new Set();
  return views.filter((view) => {
    if (!view || !view.row) return false;
    const key = rowIdentityFor(view.row).key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function seedInputFor(report, compatibilityStatus, trustedPbn) {
  const rows = (Array.isArray(report && report.rows) ? report.rows : [])
    .map((view) => {
      const row = view.row || {};
      let handSignature = null;
      if (trustedPbn && rowCanSupplyHand(view)) {
        const actual = actualHandFromView(view);
        handSignature = actual ? actual.cards.map((card) => `${card.suit}${card.rank}`).join(" ") : null;
      }
      return {
        identity: rowIdentityFor(row),
        side: stringValue(view.side),
        contract: stringValue(row.contract),
        result: stringValue(row.result),
        scoreNS: finiteNumber(row.scoreNS),
        pairScore: finiteNumber(view.pairScore),
        handSignature,
      };
    })
    .sort((a, b) => a.identity.key.localeCompare(b.identity.key));
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    pairKey: stringValue(report && report.pairKey),
    compatibilityStatus,
    rows,
    themes: usableDecisionTypes(report).map(({ entry }) => stringValue(entry.key)),
  };
}

function buildRepresentativeHand(report, status, hasPbn, seed, preferredViews) {
  const trusted = hasPbn && TRUSTED_HAND_STATUSES.has(status);
  if (trusted) {
    const candidates = uniqueViews([
      ...preferredViews,
      ...(Array.isArray(report && report.rows) ? report.rows : []),
    ]);
    for (const view of candidates) {
      const actual = actualHandFromView(view);
      if (!actual) continue;
      const boardLabel = actual.boardNo == null ? "a joined board" : `loaded PBN Board ${actual.boardNo}`;
      const statusText = status === "partial"
        ? `Using ${actual.seat}'s hand from ${boardLabel}, associated with this result row by a partial but plausible compatibility check; this is not proof that the PBN contains the session deal.`
        : `Using ${actual.seat}'s hand from ${boardLabel}, associated with this result row by the compatibility check; this is not proof that the PBN contains the session deal.`;
      return {
        source: "pbn",
        rowIdentity: actual.rowIdentity,
        boardNo: actual.boardNo,
        seat: actual.seat,
        cards: actual.cards,
        provenanceNote: [reportSegment(statusText, ["results.summary.compatibility.status", "results.rows[].hasPbnBoard", `results.rows[].board.hands.${actual.seat}.cards`], { rowIdentity: actual.rowIdentity })],
      };
    }
  }

  let note;
  if (!hasPbn || status === "unknown") {
    note = "Practice Deck: no loaded-PBN hand is eligible for association with this result row.";
  } else if (status === "partial") {
    note = "Practice Deck: no valid joined loaded-PBN hand was available inside the partial compatibility result.";
  } else if (status === "warning") {
    note = "Practice Deck: the PBN/results compatibility check raised a warning, so no loaded-PBN hand is associated with this result row.";
  } else if (status === "mismatch") {
    note = "Practice Deck: the PBN/results files appear mismatched, so no loaded-PBN hand is associated with this result row.";
  } else {
    note = "Practice Deck: no valid joined 13-card loaded-PBN hand was available.";
  }
  return {
    source: "practice",
    rowIdentity: null,
    boardNo: null,
    seat: null,
    cards: buildPracticeDeck(seed),
    provenanceNote: [reportSegment(note, ["results.hasPbn", "results.summary.compatibility.status", "results.rows[].hasPbnBoard"])],
  };
}

function anonymizedRivals(report, seed) {
  const rivals = Array.isArray(report && report.fieldContext && report.fieldContext.rivals)
    ? report.fieldContext.rivals
    : [];
  return rivals.slice(0, 3).map((rival, index) => ({
    id: `rival-${String.fromCharCode(97 + index)}`,
    label: `Rival ${String.fromCharCode(65 + index)}`,
    wins: finiteNumber(rival.wins) || 0,
    losses: finiteNumber(rival.losses) || 0,
    ties: finiteNumber(rival.ties) || 0,
    games: finiteNumber(rival.games) || 0,
    netMp: finiteNumber(rival.netMp),
    flavorSeed: fingerprint({ seed, index }),
    sourceFields: ["report.fieldContext.rivals"],
  }));
}

function buildBriefing(report, mode, decisionTypes, suitableItems) {
  const pairNo = stringValue(report && report.pairNo) || stringValue(report && report.pairKey) || "?";
  const bark = [
    reportSegment(`Pair ${pairNo}.`, ["report.pairNo"]),
    fictionSegment(
      mode === "defend-crown"
        ? "The Field demands a victory lap. Defend your bridge honor from Complacency."
        : "Win back your bridge honor from the filthy opponents. Metaphorically. They're lovely people. Legal insisted.",
      mode === "defend-crown" ? "coach-defend-crown" : "coach-restore-honor"
    ),
  ];
  if (decisionTypes.length) {
    const { entry, index } = decisionTypes[0];
    bark.push(reportSegment(`${stringValue(entry.label) || themeInfo(entry.key).title} is the leading report focus.`, [`report.decisionTypes[${index}].label`]));
  } else if (suitableItems.length) {
    const item = suitableItems[0];
    bark.push(reportSegment(`Board ${item.row.boardNo} leads the available review evidence.`, ["report.reviewItems[].row.boardNo"], { rowIdentity: rowIdentityFor(item.row) }));
  } else {
    bark.push(reportSegment("This report contains no usable loss theme or review-board diagnosis.", ["report.decisionTypes", "report.reviewItems"]));
  }
  bark.push(staticSegment("At matchpoints, your score is compared with the pairs sitting your direction.", "same-direction-rule"));

  const focus = stringValue(report && report.profile && report.profile.focus);
  const fullText = focus
    ? [reportSegment(focus, ["report.profile.focus"])]
    : [staticSegment("Use only the traveler evidence the session actually provides.", "briefing-evidence-rule")];
  return { bark, fullText };
}

function buildBoss(mode, unusedItems, decisionTypes) {
  const item = unusedItems[0] || null;
  const evidence = item ? featuredBoardFromItem(item) : null;
  const themeKey = item
    ? decisionThemeForCategory(item.diagnosis && item.diagnosis.categoryKey)
    : decisionTypes.length
      ? (THEME_INFO[decisionTypes[0].entry.key] ? decisionTypes[0].entry.key : "manualReview")
      : "baseline";
  const meta = themeInfo(themeKey);
  const intro = [fictionSegment(
    mode === "defend-crown" ? "Complacency has occupied the Traveler Vault." : "The Bottom Board has occupied the Traveler Vault.",
    mode === "defend-crown" ? "boss-complacency-intro" : "boss-bottom-board-intro"
  )];
  if (item) {
    const feedback = feedbackForItem(item);
    intro.push(...feedback.summary);
  } else if (decisionTypes.length) {
    const { entry, index } = decisionTypes[0];
    intro.push(reportSegment(`${stringValue(entry.label) || meta.title} supplies the finale's theme; the combat mechanics remain fictional.`, [`report.decisionTypes[${index}].label`]));
  } else {
    intro.push(reportSegment("No unused review-board diagnosis is available, so the boss carries no factual board claim.", ["report.reviewItems"]));
  }
  return {
    key: mode === "defend-crown" ? "complacency" : "bottom-board",
    title: mode === "defend-crown" ? "Complacency" : "The Bottom Board",
    themeKey,
    encounterSkin: mode === "defend-crown" ? "complacency-slip" : meta.encounterSkin,
    generic: !item,
    evidence,
    intro,
    hostileSpeech: [fictionSegment("Your score slip is overdue.", "boss-hostile-score-slip")],
    _reviewItem: item,
  };
}

function scenarioPalette(seed, boss, wings) {
  const featured = boss.evidence || wings.map((wing) => wing.featuredBoard).find(Boolean);
  const vulnerability = stringValue(featured && featured.vulnerability) || "None";
  if (vulnerability === "NS") return { key: "north-south-red", vulnerability };
  if (vulnerability === "EW") return { key: "east-west-red", vulnerability };
  if (vulnerability === "All") return { key: "all-red", vulnerability };
  const choices = ["felt-green", "midnight-blue", "paper-gold"];
  const random = createSeededRandom(`${seed}:palette`);
  return { key: choices[Math.floor(random() * choices.length)], vulnerability: "None" };
}

function buildDebrief(report, mode, wings, decisionTypes) {
  const sessionFacts = [];
  const percent = finiteNumber(report && report.summary && report.summary.percent);
  sessionFacts.push({
    id: "session-percent",
    segments: percent == null
      ? [staticSegment("Session percentage is not available for this session.", "debrief-percent-unavailable")]
      : [reportSegment(`Session percentage: ${displayNumber(percent)}%.`, ["report.summary.percent"])],
  });
  const mpVsAverage = finiteNumber(report && report.summary && report.summary.mpVsAverage);
  sessionFacts.push({
    id: "mp-vs-average",
    segments: mpVsAverage == null
      ? [staticSegment("MP versus average is not available for this session.", "debrief-mp-unavailable")]
      : [reportSegment(`MP versus average: ${mpVsAverage > 0 ? "+" : ""}${displayNumber(mpVsAverage)}.`, ["report.summary.mpVsAverage"])],
  });
  if (decisionTypes.length) {
    const { entry, index } = decisionTypes[0];
    sessionFacts.push({
      id: "main-focus",
      segments: [reportSegment(`Main focus: ${stringValue(entry.label) || themeInfo(entry.key).title}.`, [`report.decisionTypes[${index}].label`])],
    });
  } else {
    const strength = report && report.profile && Array.isArray(report.profile.strengths) ? report.profile.strengths[0] : null;
    sessionFacts.push({
      id: "main-focus",
      segments: strength
        ? [reportSegment(`Strength to preserve: ${stringValue(strength.label)} — ${stringValue(strength.value)}.`, ["report.profile.strengths[0]"])]
        : [reportSegment("No dominant loss theme was found in this report.", ["report.decisionTypes"])],
    });
  }
  const firstBoard = wings.map((wing) => wing.featuredBoard).find(Boolean);
  sessionFacts.push({
    id: "next-board",
    segments: firstBoard
      ? [reportSegment(`Review Board ${firstBoard.boardNo} next.`, ["report.reviewItems[].row.boardNo"], { rowIdentity: firstBoard.rowIdentity, confidence: firstBoard.confidence })]
      : [staticSegment("No evidence-backed board is singled out; preserve the report baseline.", "debrief-no-board")],
  });

  const priority = report && Array.isArray(report.practicePriorities) ? report.practicePriorities[0] : null;
  const practiceAction = priority && stringValue(priority.advice)
    ? [reportSegment(stringValue(priority.advice), ["report.practicePriorities[0].advice"])]
    : report && report.profile && stringValue(report.profile.focus)
      ? [reportSegment(stringValue(report.profile.focus), ["report.profile.focus"])]
      : [staticSegment("Maintain the baseline and review only evidence-backed swings.", "debrief-maintain-baseline")];

  return {
    mode,
    fictionalStatsLabels: ["Time", "Card Accuracy", "Enemies Reseated", "Biscuits Found", "Secrets", "Honor Reclaimed"],
    sessionFacts,
    practiceAction,
  };
}

/**
 * Build the deterministic, immutable, JSON-serializable simulator content
 * scenario for the currently selected report pair.
 *
 * @param {{ analysis?: import("../types.js").PbnAnalysis|null, results: import("../types.js").ResultsAnalysis, report: import("../types.js").Report }} inputs
 * @returns {import("./types.js").SimulatorScenario|null}
 */
function buildBridgeSimulatorScenario(inputs) {
  const analysis = inputs && inputs.analysis;
  const results = inputs && inputs.results;
  const report = inputs && inputs.report;
  if (!results || !report || !Array.isArray(report.rows) || !report.rows.length) return null;

  const compatibilityStatus = normalizeCompatibilityStatus(results);
  const hasPbn = hasPbnData(analysis, results);
  const trustedPbn = hasPbn && TRUSTED_HAND_STATUSES.has(compatibilityStatus);
  const decisionTypes = usableDecisionTypes(report);
  const suitableItems = uniqueSuitableReviewItems(report);
  const mode = decisionTypes.length === 0 && suitableItems.length === 0 ? "defend-crown" : "restore-honor";
  const seed = fingerprint(seedInputFor(report, compatibilityStatus, trustedPbn));

  const candidates = buildWingCandidates(report, decisionTypes);
  const assignments = assignReviewItems(candidates, suitableItems);
  const wings = buildWings(assignments.assigned);
  const bossWithInternal = buildBoss(mode, assignments.unused, decisionTypes);
  const bossItem = bossWithInternal._reviewItem;
  const boss = { ...bossWithInternal };
  delete boss._reviewItem;

  const wingViews = assignments.assigned.map((slot) => slot.reviewItem).filter(Boolean);
  const preferredViews = [bossItem, ...wingViews, ...suitableItems].filter(Boolean);
  const representativeHand = buildRepresentativeHand(report, compatibilityStatus, hasPbn, seed, preferredViews);
  const identityPlayers = stringValue(report.standing && report.standing.players) || stringValue(report.summary && report.summary.players);
  const players = /^table\s+\d+/i.test(identityPlayers) ? "" : identityPlayers;
  const pairNo = stringValue(report.pairNo) || stringValue(report.pairKey) || "?";
  const boardSpecificCount = wings.filter((wing) => wing.boardSpecific).length;
  const scenario = {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    seed,
    identity: {
      pairKey: stringValue(report.pairKey),
      pairLabel: `Pair ${pairNo}`,
      players,
    },
    mode,
    briefing: buildBriefing(report, mode, decisionTypes, suitableItems),
    palette: scenarioPalette(seed, boss, wings),
    representativeHand,
    wings,
    rivals: anonymizedRivals(report, seed),
    terminals: wings.map((wing) => ({
      id: `chalkboard-${wing.slot.toLowerCase()}`,
      wingSlot: wing.slot,
      rowIdentity: wing.featuredBoard ? wing.featuredBoard.rowIdentity : null,
      summary: wing.coachFeedback.summary,
      details: wing.coachFeedback.details,
    })),
    boss,
    debrief: buildDebrief(report, mode, wings, decisionTypes),
    coaching: {
      checkpointCount: wings.length,
      suitableEvidenceCount: suitableItems.length,
      boardSpecificCheckpointCount: boardSpecificCount,
      normal: suitableItems.length >= 3,
      sparse: suitableItems.length < 3,
      checkpointRowKeys: wings.map((wing) => wing.featuredBoard && wing.featuredBoard.rowIdentity.key).filter(Boolean),
    },
    provenance: {
      hasResults: true,
      hasPbn,
      usedValidDeal: representativeHand.source === "pbn",
      compatibilityStatus,
      handSource: representativeHand.source,
      schemaVersion: SCENARIO_SCHEMA_VERSION,
    },
  };
  return deepFreeze(scenario);
}

export {
  SCENARIO_SCHEMA_VERSION,
  THEME_INFO,
  rowIdentityFor,
  normalizeCompatibilityStatus,
  canonicalizeCards,
  buildPracticeDeck,
  buildBridgeSimulatorScenario,
};
