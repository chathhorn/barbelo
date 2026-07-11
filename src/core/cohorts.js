// Same-contract cohort analyses for the Pair Improvement Report:
// declared/defended scorecards, the overtrick meter, and the game/slam
// bidding scorecard. A "cohort" is every other table on the board that
// played the identical contract with the same declaring side - the
// fairest club benchmark, since it compares real play on the same cards.

import { sum } from "./format.js";
import { contractClassRank, contractTarget, samePlayedContract } from "./contracts.js";
import { isVulnerable, scoreDuplicateContract } from "./scoring.js";
import { sideParticipantKey, sideScore, rowContractText } from "./results.js";

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Other tables on the same board that played the identical contract
 * with the same declaring side, excluding the pair's own rows.
 *
 * @param {import("./types.js").ResultsAnalysis} results
 * @param {import("./types.js").ReportView} view
 * @returns {import("./types.js").ResultRow[]}
 */
function sameContractCohort(results, view) {
  const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
  return boardRows.filter((peer) =>
    peer !== view.row &&
    String(sideParticipantKey(peer, view.side)) !== String(view.participantKey) &&
    peer.declarerPair === view.row.declarerPair &&
    samePlayedContract(view.row.parsedContract, peer.parsedContract));
}

function triageFailure(view, cohort) {
  const row = view.row;
  const target = contractTarget(row.parsedContract);
  const peerMadeIt = cohort.some((peer) => {
    const peerTarget = contractTarget(peer.parsedContract);
    return peerTarget != null && peer.tricks != null && peer.tricks >= peerTarget;
  });
  if (peerMadeIt) {
    return { key: "play", tone: "red", label: "The tricks were there", detail: "Another table made this contract; review the play." };
  }
  if (row.ddTricks != null && target != null && row.ddTricks >= target) {
    return { key: "play-dd", tone: "gold", label: "Double-dummy makes it", detail: "Best play lands this contract; treat it as a play review, with a grain of salt." };
  }
  const mpLoss = view.mpLoss || 0;
  if (row.boardTop && mpLoss <= row.boardTop * 0.25) {
    return { key: "shared", tone: "", label: "Everyone struggled", detail: "The failure cost little; most of the field was minus too." };
  }
  return { key: "auction", tone: "gold", label: "The auction was the swing", detail: "The contract had no play; review how the auction got there." };
}

/**
 * "When You Declared": per-board verdicts against the same-contract
 * cohort (double-dummy fallback), with a triage bucket per failure.
 */
function buildDeclaredScorecard(results, views) {
  const declaredViews = views.filter((view) => view.declared);
  const boards = declaredViews.map((view) => {
    const row = view.row;
    const target = contractTarget(row.parsedContract);
    const made = target != null && row.tricks != null ? row.tricks >= target : null;
    const cohort = sameContractCohort(results, view);
    const cohortTricks = cohort.map((peer) => peer.tricks).filter((value) => value != null);
    const cohortMedian = median(cohortTricks);
    let verdict = null;
    let basis = "";
    if (row.tricks != null && cohortMedian != null) {
      verdict = row.tricks > cohortMedian ? "beat" : row.tricks < cohortMedian ? "trailed" : "matched";
      basis = "cohort";
    } else if (row.tricks != null && row.ddTricks != null) {
      verdict = row.tricks > row.ddTricks ? "beat" : row.tricks < row.ddTricks ? "trailed" : "matched";
      basis = "dd";
    }
    return {
      boardNo: row.boardNo,
      rowIndex: row.index,
      contractText: rowContractText(row),
      tricks: row.tricks,
      target,
      made,
      cohortSize: cohortTricks.length,
      cohortMedian,
      verdict,
      basis,
      triage: made === false ? triageFailure(view, cohort) : null,
      mpVsAverage: view.matchpoints != null && row.boardTop != null ? view.matchpoints - row.boardTop / 2 : null,
      percent: view.percent
    };
  });

  const withCohort = boards.filter((board) => board.basis === "cohort");
  return {
    boards,
    declares: boards.length,
    madeCount: boards.filter((board) => board.made === true).length,
    failedCount: boards.filter((board) => board.made === false).length,
    cohortCovered: withCohort.length,
    beat: withCohort.filter((board) => board.verdict === "beat").length,
    matched: withCohort.filter((board) => board.verdict === "matched").length,
    trailed: withCohort.filter((board) => board.verdict === "trailed").length
  };
}

/**
 * "When You Defended": tricks conceded vs the same-contract cohort
 * median, falling back to the field-relative DD deviation.
 */
function buildDefendedScorecard(results, views) {
  const defendedViews = views.filter((view) => !view.declared && view.row.declarerPair);
  const boards = defendedViews.map((view) => {
    const row = view.row;
    const cohort = sameContractCohort(results, view);
    const cohortTricks = cohort.map((peer) => peer.tricks).filter((value) => value != null);
    const cohortMedian = median(cohortTricks);
    // Positive edge: the pair conceded fewer tricks than the room.
    const trickEdge = row.tricks != null && cohortMedian != null ? cohortMedian - row.tricks : null;
    const fallbackEdge = trickEdge == null ? view.relativeTrickDelta : null;
    const edge = trickEdge != null ? trickEdge : fallbackEdge;
    return {
      boardNo: row.boardNo,
      contractText: rowContractText(row),
      conceded: row.tricks,
      cohortSize: cohortTricks.length,
      cohortMedian,
      trickEdge,
      basis: trickEdge != null ? "cohort" : fallbackEdge != null ? "field-dd" : "",
      edge,
      flagged: edge != null && edge <= -1,
      percent: view.percent
    };
  });

  const withEdge = boards.filter((board) => board.edge != null);
  return {
    boards,
    defends: boards.length,
    cohortCovered: boards.filter((board) => board.basis === "cohort").length,
    netTricks: withEdge.length ? sum(withEdge.map((board) => board.edge)) : null,
    flaggedCount: boards.filter((board) => board.flagged).length
  };
}

function pairPerspectiveScore(scored, side) {
  if (!scored || scored.scoreNS == null) return null;
  return side === "NS" ? scored.scoreNS : -scored.scoreNS;
}

function resultTextForDiff(diff) {
  if (diff === 0) return "=";
  return diff > 0 ? `+${diff}` : String(diff);
}

/**
 * The Overtrick Meter: for every made contract, what one more trick
 * would have been worth and what going down would have cost, priced in
 * matchpoints against the board's actual score column.
 */
function buildOvertrickMeter(results, views) {
  const boards = [];
  views.forEach((view) => {
    if (!view.declared || view.pairScore == null) return;
    const row = view.row;
    const target = contractTarget(row.parsedContract);
    if (target == null || row.tricks == null || row.tricks < target) return;
    if (row.tricks >= 13) return;
    const boardRows = results.rowsByField.get(row.fieldKey) || [];
    const peerScores = boardRows
      .filter((peer) => peer !== row && String(sideParticipantKey(peer, view.side)) !== String(view.participantKey))
      .map((peer) => sideScore(peer, view.side))
      .filter((value) => value != null);
    if (!peerScores.length) return;
    const mpOf = (score) => sum(peerScores.map((peer) => score > peer ? 1 : score === peer ? 0.5 : 0));
    const rescore = (diff) => scoreDuplicateContract(
      row.contract, resultTextForDiff(diff), row.declarerSide, row.board ? row.board.vulnerable : "None", row.declarerPair);
    const diff = row.tricks - target;
    const upScore = pairPerspectiveScore(rescore(diff + 1), view.side);
    const downScore = pairPerspectiveScore(rescore(diff - 1), view.side);
    if (upScore == null || downScore == null) return;
    const mpActual = mpOf(view.pairScore);
    const mpIfUp = mpOf(upScore) - mpActual;
    const mpIfDown = mpActual - mpOf(downScore);
    const cohort = sameContractCohort(results, view);
    const peerTookTrick = cohort.some((peer) => peer.tricks != null && peer.tricks > row.tricks);
    boards.push({
      boardNo: row.boardNo,
      rowIndex: row.index,
      contractText: rowContractText(row),
      mpIfUp,
      mpIfDown,
      peerTookTrick,
      // Red only when the trick is field-proven: a same-contract peer took it.
      flagged: peerTookTrick && mpIfUp > 0,
      freeSafety: mpIfDown === 0,
      pairScore: view.pairScore,
      matchpoints: view.matchpoints,
      percent: view.percent,
      boardTop: row.boardTop
    });
  });

  return {
    boards,
    flaggedBoards: boards.filter((board) => board.flagged),
    pushWorth: sum(boards.filter((board) => board.flagged).map((board) => board.mpIfUp)),
    freeSafetyCount: boards.filter((board) => board.freeSafety).length
  };
}

/**
 * The Game & Slam Decision Scorecard: on boards where double-dummy says
 * the pair's side has a game, what did the pair do and what did the
 * same-direction field do?
 */
function buildBiddingScorecard(results, views) {
  const gameBoards = [];
  const slams = [];
  // Without a PBN double-dummy table there is no game availability to
  // judge; the renderer needs to say so honestly.
  const hasDd = views.some((view) =>
    view.row.board && Array.isArray(view.row.board.optimumRows) && view.row.board.optimumRows.length > 0);
  views.forEach((view) => {
    const row = view.row;
    if (view.bestMakeable.rank < 2) return;
    // Unplayed or director-adjusted rows carry no auction to judge.
    if (view.pairScore == null) return;
    const pairRank = view.declared ? contractClassRank(row.contractClass) : 0;
    const pairBidGame = view.declared && pairRank >= 2;
    const target = contractTarget(row.parsedContract);
    const made = view.declared && target != null && row.tricks != null ? row.tricks >= target : null;
    const boardRows = results.rowsByField.get(row.fieldKey) || [];
    const sidePeers = boardRows.filter((peer) =>
      peer !== row && String(sideParticipantKey(peer, view.side)) !== String(view.participantKey));
    const peersInGame = sidePeers.filter((peer) =>
      peer.declarerPair === view.side && contractClassRank(peer.contractClass) >= 2);
    const peersMadeGame = peersInGame.filter((peer) => {
      const peerTarget = contractTarget(peer.parsedContract);
      return peerTarget != null && peer.tricks != null && peer.tricks >= peerTarget;
    });
    const madeGameScores = peersMadeGame
      .map((peer) => sideScore(peer, view.side))
      .filter((value) => value != null);
    const bestGameScore = madeGameScores.length ? Math.max(...madeGameScores) : null;
    let bucket;
    if (view.declared && row.parsedContract && row.parsedContract.doubled) bucket = "competitive";
    else if (pairBidGame) bucket = made === false ? "bidFailed" : "bidMade";
    // "Missed" needs the outcome, not just the auction: a pair that
    // out-scored the game (e.g. +800 defending a doubled save) missed
    // nothing.
    else if (bestGameScore != null && view.pairScore < bestGameScore) bucket = "missed";
    else if (bestGameScore != null) bucket = "beatGame";
    else bucket = "stayedLow";
    const vulnerable = isVulnerable(row.board ? row.board.vulnerable : "None", view.side);
    gameBoards.push({
      boardNo: row.boardNo,
      rowIndex: row.index,
      vulnerable,
      bucket,
      contractText: rowContractText(row) || "Defended",
      declared: view.declared,
      bestText: view.bestMakeable.text,
      peersInGame: peersInGame.length,
      peersMadeGame: peersMadeGame.length,
      sidePeers: sidePeers.length,
      mpVsAverage: view.matchpoints != null && row.boardTop != null ? view.matchpoints - row.boardTop / 2 : null,
      percent: view.percent
    });
    if (view.bestMakeable.rank >= 3) {
      slams.push({
        boardNo: row.boardNo,
        bestText: view.bestMakeable.text,
        bidSlam: view.declared && pairRank >= 3,
        made,
        percent: view.percent,
        contractText: rowContractText(row) || "Defended"
      });
    }
  });

  const bucketCount = (key) => gameBoards.filter((board) => board.bucket === key).length;
  const judged = gameBoards.filter((board) => board.bucket !== "competitive");
  return {
    gameBoards,
    slams,
    hasDd,
    gamesAvailable: gameBoards.length,
    bidMade: bucketCount("bidMade"),
    bidFailed: bucketCount("bidFailed"),
    missed: bucketCount("missed"),
    beatGame: bucketCount("beatGame"),
    stayedLow: bucketCount("stayedLow"),
    competitive: bucketCount("competitive"),
    netMp: judged.length ? sum(judged.map((board) => board.mpVsAverage || 0)) : null
  };
}

export {
  median,
  sameContractCohort,
  buildDeclaredScorecard,
  buildDefendedScorecard,
  buildOvertrickMeter,
  buildBiddingScorecard,
};
