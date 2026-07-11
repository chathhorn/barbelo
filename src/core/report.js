// The Pair Improvement Report engine: per-board views from a pair's
// perspective, loss classification against same-direction peers, the
// loss ledger, profile, and practice priorities.

import { denomMeta } from "./constants.js";
import { formatSigned, formatMp, plural, sum, average, uniqueSorted } from "./format.js";
import { classifyContract, contractClassRank, contractTarget, samePlayedContract } from "./contracts.js";
import { numericPairSort } from "./format.js";
import {
  rowContractText,
  sideScore,
  sideMatchpoints,
  sidePercent,
  sideParticipantKey,
  sideParticipantNo,
  sideParticipantPlayers
} from "./results.js";

const LOSS_CATEGORY_INFO = {
  declarerTricks: {
    label: "Declarer Tricks",
    tone: "gold",
    advice: "Review card play, timing, safety plays, and overtrick chances in contracts your side also declared."
  },
  defensiveTricks: {
    label: "Defensive Tricks",
    tone: "gold",
    advice: "Review opening lead, signaling, shifts, and cash-out decisions on boards your side defended."
  },
  contractSelection: {
    label: "Contract Selection",
    tone: "gold",
    advice: "Compare the auction with peers who reached a better-scoring contract; focus on level, strain, and stopping decisions."
  },
  missedGameSlam: {
    label: "Missed Game/Slam",
    tone: "red",
    advice: "Review game tries, slam tries, invites, and acceptance decisions where peers reached a bonus contract."
  },
  overreach: {
    label: "Overreach",
    tone: "red",
    advice: "Look for auctions where passing, signing off, or defending would have protected the score."
  },
  wrongStrain: {
    label: "Wrong Strain",
    tone: "gold",
    advice: "Compare why peers found a better strain, especially NT versus major/minor and major-fit choices."
  },
  penaltyDouble: {
    label: "Penalty / Double Decisions",
    tone: "red",
    advice: "Review penalty doubles, redoubles, sacrifice judgment, and opportunities to collect a larger set."
  },
  partscoreBattle: {
    label: "Partscore Battle",
    tone: "",
    advice: "Focus on competitive bidding, partscore protection, and small-score overtricks."
  },
  competitiveAuction: {
    label: "Competitive Auction",
    tone: "gold",
    advice: "Review whether to compete, defend, double, or sell out when peers won the auction more profitably."
  },
  tieSplit: {
    label: "Tie Splits",
    tone: "",
    advice: "These are shared results; look for small overtricks or partscore edges needed to turn shared boards into tops."
  },
  outlier: {
    label: "Manual Review",
    tone: "",
    advice: "The score swing is real, but the simple heuristics do not identify one clear cause."
  }
};

const DECISION_TYPE_INFO = {
  biddingJudgment: {
    label: "Bidding Judgment",
    tone: "gold",
    categories: ["missedGameSlam", "overreach", "wrongStrain", "contractSelection"],
    advice: "Use these boards for auction review: level, strain, invitation, signoff, and partnership agreement decisions are the likely swing points."
  },
  declarerPlay: {
    label: "Declarer Play",
    tone: "gold",
    categories: ["declarerTricks"],
    advice: "Replay the contract card by card before checking double-dummy; look for timing, entries, safety plays, and overtrick chances."
  },
  defense: {
    label: "Defense",
    tone: "gold",
    categories: ["defensiveTricks"],
    advice: "Review opening lead, count signals, suit preference, shifts, and cash-out timing against the traveler contracts."
  },
  competitiveAuction: {
    label: "Competitive Auctions",
    tone: "gold",
    categories: ["competitiveAuction", "partscoreBattle"],
    advice: "Focus on vulnerability, total-tricks judgment, balancing, selling out, and whether competing protected or damaged the score."
  },
  penaltyDouble: {
    label: "Penalty / Double Decisions",
    tone: "red",
    categories: ["penaltyDouble"],
    advice: "Review doubles, redoubles, sacrifices, and penalty passes as separate decisions; these boards often swing more than one normal partscore."
  },
  smallEdges: {
    label: "Small Edges",
    tone: "",
    categories: ["tieSplit"],
    advice: "Tied comparisons point to thin overtricks, extra undertricks, and partscore details that convert shared boards into above-average scores."
  },
  manualReview: {
    label: "Manual Review",
    tone: "",
    categories: ["outlier"],
    advice: "The score loss is real, but the app cannot identify a single cause from the traveler alone; compare the auction and play record manually."
  }
};

const LOSS_CATEGORY_ORDER = [
  "missedGameSlam",
  "overreach",
  "penaltyDouble",
  "declarerTricks",
  "defensiveTricks",
  "wrongStrain",
  "contractSelection",
  "competitiveAuction",
  "partscoreBattle",
  "tieSplit",
  "outlier"
];

function lossCategoryInfo(key) {
  return LOSS_CATEGORY_INFO[key] || LOSS_CATEGORY_INFO.outlier;
}

function decisionTypeInfoForCategory(categoryKey) {
  return Object.entries(DECISION_TYPE_INFO)
    .map(([key, info]) => ({ key, ...info }))
    .find((info) => info.categories.includes(categoryKey)) || { key: "manualReview", ...DECISION_TYPE_INFO.manualReview };
}

function bestMakeableForPair(board, pair) {
  if (!board || !board.optimumRows.length) return { className: "Unknown", rank: 0, text: "" };
  const pairRows = board.optimumRows.filter((row) => row.pair === pair);
  if (!pairRows.length) return { className: "Unknown", rank: 0, text: "" };
  const best = pairRows
    .filter((row) => row.makeableLevel >= 1)
    .map((row) => {
      const className = classifyContract(row.makeableLevel, row.denomination);
      return {
        ...row,
        className,
        rank: contractClassRank(className),
        text: `${row.declarer} ${row.makeableLevel} ${row.denomination === "N" ? "NT" : row.denomination}`
      };
    })
    .sort((a, b) => b.rank - a.rank || b.makeableLevel - a.makeableLevel)[0];
  return best || { className: "None", rank: 0, text: "Nothing makes" };
}

/**
 * Recasts one result row from the selected pair's perspective. Returns
 * null when the pair did not play the row.
 *
 * @param {import("./types.js").ResultsAnalysis} results
 * @param {import("./types.js").ResultRow} row
 * @param {string} participantKey
 * @returns {import("./types.js").ReportView|null}
 */
function pairResultView(results, row, participantKey) {
  const pairKey = String(participantKey);
  const isNS = String(row.nsParticipantKey) === pairKey;
  const isEW = String(row.ewParticipantKey) === pairKey;
  if (!isNS && !isEW) return null;
  const side = isNS ? "NS" : "EW";
  const boardRows = results.rowsByField.get(row.fieldKey) || [];
  const pairScore = row.scoreNS == null ? null : isNS ? row.scoreNS : -row.scoreNS;
  // Peers only: including the pair's own row would shrink fieldDelta by
  // (n-1)/n and systematically under-trip the fixed flag thresholds.
  const fieldScores = boardRows
    .filter((entry) => String(sideParticipantKey(entry, side)) !== pairKey)
    .map((entry) => entry.scoreNS == null ? null : isNS ? entry.scoreNS : -entry.scoreNS)
    .filter((value) => value != null);
  const fieldAverage = fieldScores.length ? average(fieldScores) : null;
  const parScore = row.parNS == null ? null : isNS ? row.parNS : -row.parNS;
  const matchpoints = isNS ? row.nsMatchpoints : row.ewMatchpoints;
  const percent = isNS ? row.nsPercent : row.ewPercent;
  const declared = row.declarerPair === side;
  const trickDeltaForPair = row.ddDelta == null ? null : declared ? row.ddDelta : -row.ddDelta;
  const bestMakeable = bestMakeableForPair(row.board, side);
  const fieldDelta = pairScore != null && fieldAverage != null ? pairScore - fieldAverage : null;
  const vsPar = pairScore != null && parScore != null ? pairScore - parScore : null;

  return {
    row,
    side,
    participantKey: pairKey,
    participantNo: isNS ? row.nsParticipantNo : row.ewParticipantNo,
    players: isNS ? row.nsParticipantPlayers : row.ewParticipantPlayers,
    declared,
    pairScore,
    matchpoints,
    percent,
    mpLoss: row.boardTop == null || matchpoints == null ? null : row.boardTop - matchpoints,
    fieldAverage,
    fieldDelta,
    parScore,
    vsPar,
    trickDeltaForPair,
    bestMakeable
  };
}

function addReviewReason(reasons, label, tone, weight) {
  reasons.push({ label, tone: tone || "", weight: weight || 0 });
}

function analyzeReviewItem(view) {
  const row = view.row;
  const reasons = [];
  let severity = 0;
  const pct = view.percent == null ? 100 : view.percent;
  const mpLoss = view.mpLoss || 0;
  const fieldLoss = view.fieldDelta == null ? 0 : Math.max(0, -view.fieldDelta);
  const parLoss = view.vsPar == null ? 0 : Math.max(0, -view.vsPar);
  const actualRank = view.declared ? contractClassRank(row.contractClass) : 0;
  const target = contractTarget(row.parsedContract);
  const failedContract = view.declared && target != null && row.tricks != null && row.tricks < target;

  if (pct <= 25) addReviewReason(reasons, "low board", "red", 35);
  else if (pct <= 40) addReviewReason(reasons, "below average board", "gold", 18);

  if (row.boardTop && mpLoss >= row.boardTop * 0.5) addReviewReason(reasons, "large matchpoint loss", "red", 28);
  if (fieldLoss >= 500) addReviewReason(reasons, "far below field", "red", 26);
  else if (fieldLoss >= 200) addReviewReason(reasons, "below field", "gold", 14);

  if (parLoss >= 500) addReviewReason(reasons, "well below par", "red", 24);
  else if (parLoss >= 200) addReviewReason(reasons, "below par", "gold", 12);

  if (view.trickDeltaForPair != null && view.trickDeltaForPair <= -2) addReviewReason(reasons, "multiple trick loss vs DD", "red", 24);
  else if (view.trickDeltaForPair === -1) addReviewReason(reasons, view.declared ? "declarer trick loss vs DD" : "defensive trick loss vs DD", "gold", 13);

  if (failedContract) {
    addReviewReason(reasons, row.parsedContract.doubled ? "failed doubled contract" : "failed contract", "red", row.parsedContract.doubled ? 28 : 18);
  }

  if (view.bestMakeable.rank >= 3 && actualRank < 3 && pct < 60) addReviewReason(reasons, "slam potential", "gold", 20);
  else if (view.bestMakeable.rank >= 2 && actualRank < 2 && pct < 60) addReviewReason(reasons, "game available", "gold", 16);

  if (!view.declared && view.bestMakeable.rank >= 2 && pct < 45) {
    addReviewReason(reasons, "competitive auction review", "gold", 14);
  }

  if (!reasons.length && pct < 50) addReviewReason(reasons, "small loss", "", 6);

  severity += Math.max(0, 100 - pct) * 0.7;
  severity += mpLoss * 4;
  severity += Math.min(35, fieldLoss / 25);
  severity += Math.min(35, parLoss / 25);
  if (view.trickDeltaForPair != null && view.trickDeltaForPair < 0) severity += Math.abs(view.trickDeltaForPair) * 14;
  severity += reasons.reduce((acc, reason) => acc + reason.weight, 0);

  return {
    ...view,
    reasons,
    severity
  };
}

function buildDecisionTypeSummary(lossLedger) {
  const typeMap = new Map();
  if (!lossLedger || !lossLedger.categories) return [];

  lossLedger.categories.forEach((category) => {
    const info = decisionTypeInfoForCategory(category.key);
    if (!typeMap.has(info.key)) {
      typeMap.set(info.key, {
        key: info.key,
        label: info.label,
        tone: info.tone,
        advice: info.advice,
        totalLoss: 0,
        boardCount: 0,
        comparisonCount: 0,
        boards: new Set(),
        categoryLabels: [],
        comparisons: []
      });
    }
    const type = typeMap.get(info.key);
    type.totalLoss += category.totalLoss;
    type.comparisonCount += category.comparisonCount;
    category.boards.forEach((boardNo) => type.boards.add(String(boardNo)));
    type.categoryLabels.push(category.label);
    type.comparisons.push(...category.comparisons);
  });

  return Array.from(typeMap.values())
    .map((type) => ({
      ...type,
      boardCount: type.boards.size,
      boards: Array.from(type.boards).sort(numericPairSort),
      categoryLabels: uniqueSorted(type.categoryLabels),
      examples: buildLossExamples(type.comparisons)
    }))
    .sort((a, b) => b.totalLoss - a.totalLoss || a.label.localeCompare(b.label));
}

function dominantBoardLoss(boardItem) {
  if (!boardItem || !boardItem.comparisons || !boardItem.comparisons.length) return null;
  const map = new Map();
  boardItem.comparisons.forEach((comparison) => {
    if (!map.has(comparison.categoryKey)) {
      const info = lossCategoryInfo(comparison.categoryKey);
      map.set(comparison.categoryKey, {
        key: comparison.categoryKey,
        label: info.label,
        loss: 0,
        maxDelta: 0,
        comparisons: []
      });
    }
    const entry = map.get(comparison.categoryKey);
    entry.loss += comparison.loss;
    entry.maxDelta = Math.max(entry.maxDelta, comparison.scoreDelta || 0);
    entry.comparisons.push(comparison);
  });
  // Ties never carry the narrative: at equal loss they always have more
  // (0.5-MP) comparisons, so a count tiebreak buries the real lesson
  // (e.g. a missed slam diagnosed as "small overtrick details").
  const entries = Array.from(map.values());
  const substantive = entries.filter((entry) => entry.key !== "tieSplit");
  const candidates = substantive.length ? substantive : entries;
  return candidates
    .sort((a, b) => b.loss - a.loss || b.maxDelta - a.maxDelta || b.comparisons.length - a.comparisons.length)[0] || null;
}

function comparisonSameContract(comparison) {
  return samePlayedContract(
    comparison && comparison.targetRow ? comparison.targetRow.parsedContract : null,
    comparison && comparison.peerRow ? comparison.peerRow.parsedContract : null
  );
}

function diagnosisConfidence(item, boardItem, dominant) {
  if (!boardItem || !dominant) {
    return {
      level: "low",
      label: "Low Confidence",
      detail: "No same-direction peer loss was found, so this is a general review suggestion."
    };
  }

  const sameContractCount = dominant.comparisons.filter(comparisonSameContract).length;
  const maxDelta = Math.max(...dominant.comparisons.map((comparison) => comparison.scoreDelta || 0));
  if (["declarerTricks", "defensiveTricks"].includes(dominant.key) && sameContractCount) {
    return {
      level: "high",
      label: "High Confidence",
      detail: "Same-direction peers produced a better score in the same or directly comparable contract."
    };
  }
  if (["missedGameSlam", "overreach", "penaltyDouble"].includes(dominant.key) && (dominant.loss >= 2 || maxDelta >= 300)) {
    return {
      level: "high",
      label: "High Confidence",
      detail: "Multiple peer comparisons or a large score gap point to the same decision area."
    };
  }
  if (dominant.key === "outlier") {
    return {
      level: "low",
      label: "Low Confidence",
      detail: "The traveler shows a loss, but contract and trick clues do not isolate one clear cause."
    };
  }
  if (dominant.key === "tieSplit") {
    return {
      level: "medium",
      label: "Medium Confidence",
      detail: "The loss comes from tied peer comparisons, usually thin overtrick or undertrick edges."
    };
  }
  if (dominant.loss >= 1.5 || dominant.comparisons.length >= 2 || item.severity >= 60) {
    return {
      level: "medium",
      label: "Medium Confidence",
      detail: "The same-direction traveler supports the diagnosis, but the exact auction or play decision still needs review."
    };
  }
  return {
    level: "low",
    label: "Low Confidence",
    detail: "Treat this as a review prompt rather than a firm diagnosis."
  };
}

function peerDisplayName(pairNo, players) {
  const pair = pairNo == null || pairNo === "" ? "Peer" : `Pair ${pairNo}`;
  return players ? `${pair} - ${players}` : pair;
}

function buildSwingDiagnosis(item, boardItem) {
  const dominant = dominantBoardLoss(boardItem);
  const confidence = diagnosisConfidence(item, boardItem, dominant);
  if (!boardItem || !dominant) {
    return {
      categoryKey: "",
      categoryLabel: "Review Candidate",
      lostMp: item.mpLoss || 0,
      confidence,
      explanation: reviewPriorityAdvice(item)
    };
  }

  const comparisons = [...dominant.comparisons].sort((a, b) => b.scoreDelta - a.scoreDelta || b.loss - a.loss);
  const bestPeer = comparisons[0];
  const peerName = bestPeer ? peerDisplayName(bestPeer.peerPair, bestPeer.peerPlayers) : "A same-direction peer";
  const targetText = `${boardItem.targetContract} for ${formatSigned(boardItem.targetScore)}`;
  const peerText = bestPeer ? `${bestPeer.peerContract} for ${formatSigned(bestPeer.peerScore)}` : "a better score";
  const lossText = `${formatMp(dominant.loss)} MP`;
  let explanation;

  if (dominant.key === "declarerTricks") {
    explanation = `This pair lost ${lossText} mainly because same-direction peers took more tricks in the same contract family. Compare ${targetText} with ${peerName}'s ${peerText}.`;
  } else if (dominant.key === "defensiveTricks") {
    explanation = `This pair lost ${lossText} on defense. Same-direction peers defended the same or similar contract more profitably; start with opening lead, shifts, and cash-out timing.`;
  } else if (dominant.key === "missedGameSlam") {
    explanation = `This pair lost ${lossText} because peers reached a game or slam bonus that this table did not. Compare the auction with ${peerName}'s ${peerText}.`;
  } else if (dominant.key === "overreach") {
    explanation = `This pair lost ${lossText} after landing too high or in a costly contract. Check whether stopping lower, passing, or defending would have protected the matchpoints.`;
  } else if (dominant.key === "wrongStrain") {
    explanation = `This pair lost ${lossText} to strain choice. Compare ${targetText} with ${peerName}'s ${peerText} and look for the auction clue that found the better denomination.`;
  } else if (dominant.key === "penaltyDouble") {
    explanation = `This pair lost ${lossText} around a doubled, redoubled, penalty, or sacrifice decision. Review the vulnerability and whether the double or sacrifice was earning its keep.`;
  } else if (dominant.key === "competitiveAuction" || dominant.key === "partscoreBattle") {
    explanation = `This pair lost ${lossText} in a competitive or partscore position. Compare who bought the contract, at what level, and whether an extra trick changed the board.`;
  } else if (dominant.key === "tieSplit") {
    explanation = `${lossText} came from tied same-direction comparisons. Look for small overtrick, undertrick, or partscore details that could turn ties into wins.`;
  } else {
    explanation = `This pair lost ${lossText} against same-direction peers, but the traveler does not isolate one clear cause. Use the peer table to compare contracts and scores.`;
  }

  return {
    categoryKey: dominant.key,
    categoryLabel: dominant.label,
    lostMp: dominant.loss,
    confidence,
    explanation
  };
}

function buildSameDirectionPeerComparison(results, view) {
  const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
  const rows = boardRows
    // A replay by the same pair is not a peer table.
    .filter((row) => row === view.row || String(sideParticipantKey(row, view.side)) !== String(view.participantKey))
    .map((row) => {
      const score = sideScore(row, view.side);
      if (score == null) return null;
      const matchpoints = sideMatchpoints(row, view.side);
      const percent = sidePercent(row, view.side);
      const pairNo = sideParticipantNo(row, view.side);
      const players = sideParticipantPlayers(row, view.side);
      return {
        row,
        isTarget: row === view.row,
        pairNo,
        players,
        contract: rowContractText(row),
        score,
        matchpoints,
        percent,
        scoreDelta: view.pairScore == null ? null : score - view.pairScore,
        mpDelta: view.matchpoints == null || matchpoints == null ? null : matchpoints - view.matchpoints
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || numericPairSort(a.pairNo, b.pairNo));
  const targetIndex = rows.findIndex((entry) => entry.isTarget);
  return {
    boardNo: view.row.boardNo,
    side: view.side,
    rows,
    targetRank: targetIndex >= 0 ? targetIndex + 1 : null,
    peerCount: Math.max(0, rows.length - 1)
  };
}

function contractMadeByRow(row) {
  const target = contractTarget(row && row.parsedContract);
  if (target == null || row.tricks == null) return null;
  return row.tricks >= target;
}

function classifyLossComparison(view, peerRow, peerScore, scoreDelta, loss) {
  const row = view.row;
  const side = view.side;
  const targetContract = row.parsedContract || {};
  const peerContract = peerRow.parsedContract || {};
  const targetDeclared = view.declared;
  const peerDeclared = peerRow.declarerPair === side;
  const targetMade = contractMadeByRow(row);
  const peerMade = contractMadeByRow(peerRow);
  const targetRank = targetDeclared ? contractClassRank(row.contractClass) : 0;
  const peerRank = peerDeclared ? contractClassRank(peerRow.contractClass) : 0;
  const targetContractRank = contractClassRank(row.contractClass);
  const peerContractRank = contractClassRank(peerRow.contractClass);
  const sameContract = samePlayedContract(targetContract, peerContract);
  const targetFailed = targetDeclared && targetMade === false;
  const smallScoreContext = Math.max(Math.abs(view.pairScore || 0), Math.abs(peerScore || 0)) <= 220;
  const partscoreContext = targetContractRank <= 1 && peerContractRank <= 1;

  if (loss === 0.5 && scoreDelta === 0) return { key: "tieSplit" };
  if (sameContract && targetDeclared && peerDeclared && row.tricks != null && peerRow.tricks != null && peerRow.tricks > row.tricks) {
    return { key: "declarerTricks" };
  }
  if (sameContract && !targetDeclared && !peerDeclared) return { key: "defensiveTricks" };
  // Only a double at the pair's own table is a double decision the pair
  // faced; a doubled peer table falls through to the real cause.
  if (targetContract.doubled) return { key: "penaltyDouble" };
  if (targetFailed && (scoreDelta >= 200 || peerMade || !peerDeclared)) return { key: "overreach" };
  if (peerDeclared && peerRank >= 2 && peerRank > targetRank && peerMade !== false) return { key: "missedGameSlam" };

  if (targetDeclared && peerDeclared && targetContract.strain && peerContract.strain && targetContract.strain !== peerContract.strain) {
    const levelGap = Math.abs((targetContract.level || 0) - (peerContract.level || 0));
    if (levelGap <= 1) return { key: "wrongStrain" };
  }

  // Partscore battles are small-stakes trench warfare; a big swing in a
  // partscore context (going for a number) deserves the sharper
  // contract-selection / competitive-auction labels below.
  if (smallScoreContext && partscoreContext) {
    return { key: "partscoreBattle" };
  }
  if (targetDeclared && peerDeclared && !sameContract) return { key: "contractSelection" };
  if (targetDeclared !== peerDeclared) return { key: "competitiveAuction" };
  if (!targetDeclared) return { key: "competitiveAuction" };
  return { key: "outlier" };
}

function buildBoardLossItem(results, view) {
  const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
  if (view.pairScore == null) return null;
  const comparisons = [];

  boardRows.forEach((peerRow) => {
    if (peerRow === view.row || peerRow.scoreNS == null) return;
    if (String(sideParticipantKey(peerRow, view.side)) === String(view.participantKey)) return;
    const peerScore = sideScore(peerRow, view.side);
    if (peerScore == null) return;
    const scoreDelta = peerScore - view.pairScore;
    const loss = scoreDelta > 0 ? 1 : scoreDelta === 0 ? 0.5 : 0;
    if (!loss) return;
    const classification = classifyLossComparison(view, peerRow, peerScore, scoreDelta, loss);
    const info = lossCategoryInfo(classification.key);
    comparisons.push({
      boardNo: view.row.boardNo,
      side: view.side,
      categoryKey: classification.key,
      categoryLabel: info.label,
      loss,
      scoreDelta,
      targetRow: view.row,
      targetScore: view.pairScore,
      targetContract: rowContractText(view.row),
      targetPercent: view.percent,
      peerRow,
      peerScore,
      peerContract: rowContractText(peerRow),
      peerPair: sideParticipantNo(peerRow, view.side),
      peerPlayers: sideParticipantPlayers(peerRow, view.side)
    });
  });

  if (!comparisons.length) return null;
  return {
    boardNo: view.row.boardNo,
    side: view.side,
    row: view.row,
    targetScore: view.pairScore,
    targetContract: rowContractText(view.row),
    targetPercent: view.percent,
    matchpoints: view.matchpoints,
    boardTop: view.row.boardTop,
    totalLoss: sum(comparisons.map((comparison) => comparison.loss)),
    comparisons
  };
}

function buildLossExamples(comparisons) {
  const examplesByBoard = new Map();
  comparisons.forEach((comparison) => {
    // Key by the pair's own row, not the board number: a replayed board
    // is two distinct plays and must not merge into one example.
    const key = comparison.targetRow && comparison.targetRow.index != null
      ? `row:${comparison.targetRow.index}`
      : String(comparison.boardNo);
    if (!examplesByBoard.has(key)) {
      examplesByBoard.set(key, {
        boardNo: comparison.boardNo,
        side: comparison.side,
        targetScore: comparison.targetScore,
        targetContract: comparison.targetContract,
        targetPercent: comparison.targetPercent,
        loss: 0,
        maxDelta: 0,
        comparisons: []
      });
    }
    const example = examplesByBoard.get(key);
    example.loss += comparison.loss;
    example.maxDelta = Math.max(example.maxDelta, comparison.scoreDelta);
    example.comparisons.push(comparison);
  });

  return Array.from(examplesByBoard.values())
    .map((example) => ({
      ...example,
      comparisons: example.comparisons.sort((a, b) => b.scoreDelta - a.scoreDelta || b.loss - a.loss)
    }))
    .sort((a, b) => b.loss - a.loss || b.maxDelta - a.maxDelta || a.boardNo - b.boardNo);
}

function buildPairLossLedger(results, views) {
  const boardItems = views
    .map((view) => buildBoardLossItem(results, view))
    .filter(Boolean)
    .sort((a, b) => b.totalLoss - a.totalLoss || a.boardNo - b.boardNo);
  const categoryMap = new Map();
  let totalLoss = 0;
  let tieLoss = 0;
  let outrightLoss = 0;

  boardItems.forEach((boardItem) => {
    boardItem.comparisons.forEach((comparison) => {
      const info = lossCategoryInfo(comparison.categoryKey);
      if (!categoryMap.has(comparison.categoryKey)) {
        categoryMap.set(comparison.categoryKey, {
          key: comparison.categoryKey,
          label: info.label,
          tone: info.tone,
          advice: info.advice,
          totalLoss: 0,
          comparisonCount: 0,
          boards: new Set(),
          comparisons: []
        });
      }
      const category = categoryMap.get(comparison.categoryKey);
      category.totalLoss += comparison.loss;
      category.comparisonCount += 1;
      category.boards.add(String(comparison.boardNo));
      category.comparisons.push(comparison);
      totalLoss += comparison.loss;
      if (comparison.loss === 0.5 && comparison.scoreDelta === 0) tieLoss += comparison.loss;
      else outrightLoss += comparison.loss;
    });
  });

  const orderIndex = new Map(LOSS_CATEGORY_ORDER.map((key, index) => [key, index]));
  const categories = Array.from(categoryMap.values())
    .map((category) => ({
      ...category,
      boardCount: category.boards.size,
      examples: buildLossExamples(category.comparisons),
      boards: Array.from(category.boards)
    }))
    .sort((a, b) => {
      return b.totalLoss - a.totalLoss ||
        (orderIndex.get(a.key) ?? 99) - (orderIndex.get(b.key) ?? 99);
    });

  return {
    totalLoss,
    outrightLoss,
    tieLoss,
    boardCount: boardItems.length,
    categoryCount: categories.length,
    boardItems,
    categories
  };
}

function averagePercentForViews(views) {
  const percents = views.map((view) => view.percent).filter((value) => value != null);
  return percents.length ? average(percents) : null;
}

function buildViewStat(label, views) {
  const percent = averagePercentForViews(views);
  const losses = views.map((view) => view.mpLoss).filter((value) => value != null);
  return {
    label,
    count: views.length,
    percent,
    averageLoss: losses.length ? average(losses) : null
  };
}

function bestStat(stats) {
  return stats
    .filter((stat) => stat.count >= 2 && stat.percent != null)
    .sort((a, b) => b.percent - a.percent || b.count - a.count)[0] || null;
}

function weakestStat(stats) {
  return stats
    .filter((stat) => stat.count >= 2 && stat.percent != null)
    .sort((a, b) => a.percent - b.percent || b.count - a.count)[0] || null;
}

function buildPairProfile(views, lossLedger, decisionTypes) {
  const roleStats = [
    buildViewStat("Declaring", views.filter((view) => view.declared)),
    buildViewStat("Defending", views.filter((view) => !view.declared))
  ];
  const classGroups = new Map();
  views.forEach((view) => {
    const label = view.row.contractClass || "Unknown";
    if (!classGroups.has(label)) classGroups.set(label, []);
    classGroups.get(label).push(view);
  });
  const contractStats = Array.from(classGroups.entries()).map(([label, group]) => buildViewStat(label, group));
  const strongestRole = bestStat(roleStats);
  const weakestRole = weakestStat(roleStats);
  const strongestContract = bestStat(contractStats);
  const weakestContract = weakestStat(contractStats);
  const topCategory = lossLedger && lossLedger.categories ? lossLedger.categories[0] : null;
  const topDecisionType = decisionTypes && decisionTypes.length ? decisionTypes[0] : null;
  const highBoards = views.filter((view) => view.percent != null && view.percent >= 65).length;
  const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35).length;
  const strengths = [];
  const weaknesses = [];

  if (strongestRole && strongestRole.percent >= 50) {
    strengths.push({
      label: "Best Role",
      value: `${strongestRole.label} ${strongestRole.percent.toFixed(1)}%`,
      detail: `${plural(strongestRole.count, "board")} in this role.`
    });
  }
  if (strongestContract && strongestContract.percent >= 50 && (!strongestRole || strongestContract.label !== strongestRole.label)) {
    strengths.push({
      label: "Best Contract Class",
      value: `${strongestContract.label} ${strongestContract.percent.toFixed(1)}%`,
      detail: `${plural(strongestContract.count, "result")} in this class.`
    });
  }
  if (highBoards) {
    strengths.push({
      label: "High Boards",
      value: plural(highBoards, "board"),
      detail: "Boards at 65% or better show where the pair converted chances."
    });
  }

  if (topCategory) {
    weaknesses.push({
      label: "Biggest Loss Theme",
      value: topCategory.label,
      detail: `${formatMp(topCategory.totalLoss)} lost MP on ${plural(topCategory.boardCount, "board")}.`
    });
  }
  if (weakestRole && weakestRole.percent < 50) {
    weaknesses.push({
      label: "Weakest Role",
      value: `${weakestRole.label} ${weakestRole.percent.toFixed(1)}%`,
      detail: `${plural(weakestRole.count, "board")} in this role.`
    });
  }
  if (weakestContract && weakestContract.percent < 50) {
    weaknesses.push({
      label: "Weakest Contract Class",
      value: `${weakestContract.label} ${weakestContract.percent.toFixed(1)}%`,
      detail: `${plural(weakestContract.count, "result")} in this class.`
    });
  }
  if (lowBoards) {
    weaknesses.push({
      label: "Low Boards",
      value: plural(lowBoards, "board"),
      detail: "Boards at 35% or worse are the best candidates for detailed partnership review."
    });
  }

  const focus = topDecisionType
    ? `The largest improvement area is ${topDecisionType.label.toLowerCase()}, worth ${formatMp(topDecisionType.totalLoss)} lost MP across ${plural(topDecisionType.boardCount, "board")}. ${topDecisionType.advice}`
    : "No same-direction loss pattern stands out. Review the lowest boards first and look for small scoring edges.";

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    roleStats,
    contractStats,
    focus
  };
}

function buildPracticePriorities(lossLedger, decisionTypes, views) {
  const priorities = [];
  decisionTypes.slice(0, 5).forEach((type) => {
    priorities.push({
      title: type.label,
      metric: `${formatMp(type.totalLoss)} lost MP`,
      detail: `${plural(type.boardCount, "board")} / ${plural(type.comparisonCount, "comparison")}`,
      advice: type.advice,
      boards: type.examples.slice(0, 4).map((example) => example.boardNo)
    });
  });

  if (priorities.length < 3) {
    const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35);
    if (lowBoards.length) {
      priorities.push({
        title: "Low-Board Triage",
        metric: plural(lowBoards.length, "board"),
        detail: "Boards at 35% or worse",
        advice: "Start with the lowest boards and ask whether the first swing came from the auction, opening lead, declarer plan, or defense.",
        boards: lowBoards.slice(0, 4).map((view) => view.row.boardNo)
      });
    }
  }

  if (priorities.length < 3) {
    const trickLosses = views.filter((view) => view.trickDeltaForPair != null && view.trickDeltaForPair < 0);
    if (trickLosses.length) {
      priorities.push({
        title: "Double-Dummy Trick Checks",
        metric: plural(trickLosses.length, "board"),
        detail: "Actual tricks below double-dummy expectation",
        advice: "Use double-dummy only after replaying the hand yourself; then compare where best play finds the missing trick.",
        boards: trickLosses.slice(0, 4).map((view) => view.row.boardNo)
      });
    }
  }

  if (!priorities.length) {
    priorities.push({
      title: "Maintain The Baseline",
      metric: "No major loss pattern",
      detail: "Same-direction traveler losses are limited",
      advice: "Use the review queue to look for thin overtricks, judgment calls, and partnership agreement refinements.",
      boards: views.slice(0, 4).map((view) => view.row.boardNo)
    });
  }

  return priorities.slice(0, 5);
}

function reviewPriorityAdvice(item) {
  const labels = item.reasons.map((reason) => reason.label);
  if (labels.some((label) => label.includes("trick loss"))) {
    return item.declared
      ? "Replay the play card by card against double-dummy: locate the trick where the contract slipped."
      : "Review opening lead, signal, shift, and cash-out choices before looking at the full traveler.";
  }
  if (labels.some((label) => label.includes("failed"))) {
    return "Check whether the contract was sound, then identify whether the failure came from auction judgment or declarer play.";
  }
  if (labels.some((label) => label.includes("game") || label.includes("slam"))) {
    return "Compare your auction to pairs who reached the higher-scoring level in the same direction.";
  }
  if (labels.some((label) => label.includes("below field") || label.includes("far below field"))) {
    return "Start with field comparison: look for contract, strain, or doubling decisions that separated the result.";
  }
  return "Use the traveler to compare same-direction results and isolate the first decision that changed the matchpoint outcome.";
}

/**
 * Builds the full improvement report for one pair: per-board views,
 * loss ledger, decision types, profile, and practice priorities.
 * Returns null when the pair has no played boards.
 *
 * @param {import("./types.js").ResultsAnalysis} results
 * @param {string} participantKey Key from `ResultsAnalysis.pairStandings`.
 * @returns {import("./types.js").Report|null}
 */
function buildPairImprovementReport(results, participantKey) {
  if (!results || !participantKey) return null;
  const key = String(participantKey);
  const standing = results.pairStandings.find((entry) => String(entry.key) === key);
  const views = results.rows
    .map((row) => pairResultView(results, row, key))
    .filter(Boolean);
  if (!views.length) return null;

  const lossLedger = buildPairLossLedger(results, views);
  // Keyed by row identity, not board number: a replayed board number
  // would otherwise attach one play's diagnosis to both review items.
  const boardLossItemsByRow = new Map(lossLedger.boardItems.map((item) => [item.row.index, item]));
  const analyzed = views.map(analyzeReviewItem).map((item) => {
    const boardLossItem = boardLossItemsByRow.get(item.row.index) || null;
    return {
      ...item,
      boardLossItem,
      peerComparison: buildSameDirectionPeerComparison(results, item),
      diagnosis: buildSwingDiagnosis(item, boardLossItem)
    };
  });
  const candidates = analyzed.filter((item) =>
    (item.reasons.length || item.severity >= 20) &&
    !(item.row.adjustment && item.row.scoreNS == null));
  const reviewed = candidates
    .sort((a, b) => b.severity - a.severity || (a.percent || 0) - (b.percent || 0))
    .slice(0, 10);
  const percents = views.map((view) => view.percent).filter((value) => value != null);
  const vsParValues = views.map((view) => view.vsPar).filter((value) => value != null);
  const trickLosses = views.filter((view) => view.trickDeltaForPair != null && view.trickDeltaForPair < 0);
  const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35);
  const fieldLosses = views.filter((view) => view.fieldDelta != null && view.fieldDelta <= -200);
  const decisionTypes = buildDecisionTypeSummary(lossLedger);
  const profile = buildPairProfile(views, lossLedger, decisionTypes);
  const practicePriorities = buildPracticePriorities(lossLedger, decisionTypes, views);

  return {
    pairKey: key,
    pairNo: standing ? standing.pairNo : key,
    standing,
    rows: views,
    reviewItems: reviewed,
    lossLedger,
    decisionTypes,
    practicePriorities,
    profile,
    summary: {
      boards: views.length,
      players: standing ? standing.players : views[0].players,
      percent: standing && standing.percent != null ? standing.percent : percents.length ? average(percents) : null,
      averageBoardPercent: percents.length ? average(percents) : null,
      lowBoards: lowBoards.length,
      fieldLosses: fieldLosses.length,
      averageVsPar: vsParValues.length ? average(vsParValues) : null,
      lostMatchpoints: lossLedger.totalLoss,
      lossCategories: lossLedger.categoryCount,
      trickLossBoards: trickLosses.length,
      declaredBoards: views.filter((view) => view.declared).length,
      defendedBoards: views.filter((view) => !view.declared).length
    }
  };
}

export {
  LOSS_CATEGORY_INFO,
  DECISION_TYPE_INFO,
  LOSS_CATEGORY_ORDER,
  lossCategoryInfo,
  decisionTypeInfoForCategory,
  bestMakeableForPair,
  pairResultView,
  addReviewReason,
  analyzeReviewItem,
  buildDecisionTypeSummary,
  dominantBoardLoss,
  comparisonSameContract,
  diagnosisConfidence,
  peerDisplayName,
  buildSwingDiagnosis,
  buildSameDirectionPeerComparison,
  contractMadeByRow,
  classifyLossComparison,
  buildBoardLossItem,
  buildLossExamples,
  buildPairLossLedger,
  averagePercentForViews,
  buildViewStat,
  bestStat,
  weakestStat,
  buildPairProfile,
  buildPracticePriorities,
  reviewPriorityAdvice,
  buildPairImprovementReport,
};
