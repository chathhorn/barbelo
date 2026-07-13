// "Table Time" exercise generator: a short personalized quiz built from
// the pair's own session. Three honesty rules govern everything here:
// (1) bridge judgment is never graded by one layout's outcome - phase-1
// puzzle types are pure arithmetic, so every answer key is a fact;
// (2) double-dummy may answer trick-counting questions only, and is
// always labeled; (3) generation is deterministic - same files, same
// quiz - with variety coming from the pair's own data.

import { formatSigned, formatMp, plural, average } from "./format.js";
import { seatName } from "./constants.js";
import { contractClassRank } from "./contracts.js";
import { scoreDuplicateContract, isVulnerable } from "./scoring.js";
import { sideScore, sidePercent, sideParticipantKey, rowContractText } from "./results.js";

const PARTNER_SEAT = { N: "S", S: "N", E: "W", W: "E" };
const STRAIN_WORD = { S: "spades", H: "hearts", D: "diamonds", C: "clubs", N: "notrump" };

function vulnerabilityText(vulnerable) {
  const value = String(vulnerable || "None");
  if (value === "All" || value === "Both") return "Both sides vulnerable";
  if (value === "NS") return "NS vulnerable";
  if (value === "EW") return "EW vulnerable";
  return "Neither side vulnerable";
}

// Percent-point bands for "one more trick was worth..." answers.
const OVERTRICK_BANDS = [
  { key: "nothing", label: "Nothing", max: 0 },
  { key: "nudge", label: "A nudge", max: 25 },
  { key: "jump", label: "A big jump", max: Infinity }
];

const LADDER_BANDS = [
  { key: "top", label: "Near the top", min: 70 },
  { key: "middle", label: "Middle of the pack", min: 30 },
  { key: "bottom", label: "Near the bottom", min: -1 }
];

// Deterministic pick, same idea as the collie pose hash.
function pickVariant(seed, count) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % count;
}

const COACH_LINES = {
  bid: {
    right: [
      "With the room. Sound game bidding is mostly showing up, hand after hand.",
      "Right call. When the values are there, the field bids it - and so did you."
    ],
    wrong: [
      "The room saw it differently - worth asking what they counted that you didn't.",
      "No shame in it: compare the two hands with partner and find the trigger you would want next time."
    ]
  },
  target: {
    right: [
      "Well counted. Planning the trick total before playing to trick one is the whole craft.",
      "Right. Counting winners before touching a card is what the best declarers do."
    ],
    wrong: [
      "Recount together: top winners first, then the extra tricks that need developing.",
      "Close - replay it with partner and find where the extra trick hides."
    ]
  },
  room: {
    right: [
      "Good field sense. Knowing what the room will do is half of matchpoint judgment.",
      "Right read. Playing the field, not just the cards, is the matchpoint edge."
    ],
    wrong: [
      "The field is a habit to learn: before scoring up, guess what the room did, then check.",
      "A miss here is cheap practice - guessing the room sharpens every close decision."
    ]
  },
  overtrick: {
    right: [
      "Exactly. At matchpoints an overtrick is not decoration - it is the whole board.",
      "Right. Frequencies, not totals: one trick can leapfrog half the room."
    ],
    wrong: [
      "A common surprise: at matchpoints one trick can be worth half the room.",
      "Worth a second look - totals feel small, but the frequency column tells the real story."
    ]
  },
  ladder: {
    right: [
      "Spot on. One point for every result you beat, half for a tie - that is the whole game.",
      "Right. Reading the room's score column is the core matchpoint skill."
    ],
    wrong: [
      "The trick is to count the column: one point per result you beat, half per tie.",
      "No matter - placing scores in the room takes practice, and this is the practice."
    ]
  },
  scoring: {
    right: [
      "Correct - and knowing the score before the auction ends is a quiet superpower.",
      "Right. Scorekeepers make better sacrifices and sharper doubles."
    ],
    wrong: [
      "Close - the breakdown below shows where the points hide.",
      "These add up in odd steps; the breakdown below is worth a slow read."
    ]
  }
};

function coachLine(type, id, correct) {
  const pool = (COACH_LINES[type] || COACH_LINES.scoring)[correct ? "right" : "wrong"];
  return pool[pickVariant(`${id}:${correct}`, pool.length)];
}

function overtrickBandFor(percentPoints) {
  if (percentPoints <= 0) return "nothing";
  return percentPoints < 25 ? "nudge" : "jump";
}

function ladderBandFor(percent) {
  if (percent >= 70) return "top";
  return percent >= 30 ? "middle" : "bottom";
}

/**
 * "The Price of One Trick": the overtrick meter as a one-tap quiz.
 * Pure arithmetic against the board's real score column.
 */
function buildOvertrickCard(report, used = new Set()) {
  const meter = report.overtrickMeter;
  if (!meter || !meter.boards.length) return null;
  const candidates = meter.boards
    .filter((board) => board.boardTop != null && board.boardTop > 0 && board.percent != null &&
      !used.has(String(board.boardNo)))
    .sort((a, b) => (b.flagged - a.flagged) || (b.mpIfUp - a.mpIfUp) || a.boardNo - b.boardNo);
  const board = candidates[0];
  if (!board) return null;
  const pctUp = (board.mpIfUp / board.boardTop) * 100;
  const pctDown = (board.mpIfDown / board.boardTop) * 100;
  const upBand = overtrickBandFor(pctUp);
  const newPercent = Math.min(100, board.percent + pctUp);
  const downPercent = Math.max(0, board.percent - pctDown);
  const id = `overtrick-${board.rowIndex != null ? board.rowIndex : board.boardNo}`;
  const correctText = board.mpIfUp > 0
    ? `One more trick was worth ${formatMp(board.mpIfUp)} MP: ${board.percent.toFixed(0)}% becomes ${newPercent.toFixed(0)}%.`
    : `One more trick was worth nothing - your score already beat or tied every result it could.`;
  const downText = board.mpIfDown > 0
    ? `Going one down instead would have cost ${formatMp(board.mpIfDown)} MP (down to ${downPercent.toFixed(0)}%).`
    : `And going one down would have cost nothing - the safe line was free.`;
  return {
    id,
    type: "overtrick",
    title: "The Price of One Trick",
    boardNo: board.boardNo,
    maskBoard: false,
    prompt: {
      lead: `You made ${board.contractText} for ${formatSigned(board.pairScore)} - ${board.percent.toFixed(0)}% that night.`,
      question: "One more trick was worth..."
    },
    options: OVERTRICK_BANDS.map((band) => ({ key: band.key, label: band.label })),
    answerKey: upBand,
    reveal: {
      room: board.peerTookTrick
        ? "A table playing your exact contract took that trick - it was there."
        : "No same-contract table found the extra trick that night.",
      dd: null,
      yours: `${correctText} ${downText}`,
      coachRight: coachLine("overtrick", id, true),
      coachWrong: coachLine("overtrick", id, false)
    }
  };
}

/**
 * "Where Did It Land?": place a score in the board's real column.
 * Prefers counter-intuitive rows (plus scores that scored badly, minus
 * scores that scored well); needs an unambiguous band.
 */
function buildLadderCard(results, report, used = new Set()) {
  const views = report.rows.filter((view) =>
    view.percent != null && view.pairScore != null &&
    view.row.boardTop != null && view.row.boardTop >= 3 &&
    !used.has(String(view.row.boardNo)));
  if (!views.length) return null;
  const surprising = (view) =>
    (view.pairScore > 0 && view.percent <= 30) ||
    (view.pairScore < 0 && view.percent >= 70);
  const unambiguous = (view) => view.percent <= 25 || view.percent >= 75 ||
    (view.percent >= 40 && view.percent <= 60);
  const pool = views.filter(surprising).concat(views.filter((view) => !surprising(view) && unambiguous(view)));
  const view = pool[0];
  if (!view) return null;
  const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
  const otherScores = boardRows
    .filter((row) => row !== view.row)
    .map((row) => sideScore(row, view.side))
    .filter((value) => value != null)
    .sort((a, b) => b - a);
  if (otherScores.length < 3) return null;
  const beats = otherScores.filter((score) => view.pairScore > score).length;
  const ties = otherScores.filter((score) => score === view.pairScore).length;
  const id = `ladder-${view.row.index}`;
  return {
    id,
    type: "ladder",
    title: "Where Did It Land?",
    boardNo: view.row.boardNo,
    maskBoard: true,
    prompt: {
      lead: `On one deal, a ${view.side} score of ${formatSigned(view.pairScore)} landed among these other results:`,
      column: otherScores.map((score) => formatSigned(score)),
      question: `Where did ${formatSigned(view.pairScore)} finish?`
    },
    options: LADDER_BANDS.map((band) => ({ key: band.key, label: band.label })),
    answerKey: ladderBandFor(view.percent),
    reveal: {
      room: `${formatSigned(view.pairScore)} beat ${plural(beats, "result")}${ties ? ` and tied ${ties}` : ""}: ${formatMp(view.matchpoints)} of ${formatMp(view.row.boardTop)} - ${view.percent.toFixed(0)}%. One point per result you beat, half per tie.`,
      dd: null,
      yours: `That was your own row.`,
      coachRight: coachLine("ladder", id, true),
      coachWrong: coachLine("ladder", id, false)
    }
  };
}

function describeFlip(flip) {
  if (flip === "vul") return "the other vulnerability";
  if (flip === "doubling") return "forgetting the doubling";
  if (flip === "tricks") return "one trick off";
  return "a common miscount";
}

/**
 * "Scorekeeper's Minute": duplicate-scoring flashcards from contracts
 * really played on the pair's boards, distractors made by flipping one
 * scoring parameter so every wrong answer teaches something.
 */
function buildScoringCards(results, report, maxCards) {
  const seen = new Set();
  const candidates = [];
  report.rows.forEach((view) => {
    const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
    boardRows.forEach((row) => {
      if (row.scoreDeclarer == null || !row.contract || !row.result || !row.declarerSide) return;
      if (!row.parsedContract || row.parsedContract.passout || !row.parsedContract.level) return;
      const vulnerable = isVulnerable(row.board ? row.board.vulnerable : "None", row.declarerPair);
      const signature = `${row.contract}|${row.result}|${vulnerable}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      const doubled = row.parsedContract.doubled;
      const pairKey = String(view.participantKey);
      candidates.push({
        row,
        vulnerable,
        doubled: Boolean(doubled),
        fromOwnTable: String(sideParticipantKey(row, "NS")) === pairKey || String(sideParticipantKey(row, "EW")) === pairKey,
        interest: (doubled ? 4 : 0) + (Math.abs(row.scoreDeclarer) >= 500 ? 2 : 0) + (row.scoreDeclarer < 0 ? 1 : 0)
      });
    });
  });
  if (!candidates.length) return [];

  // Theme-keyed mix: competitive/doubling pairs drill doubled contracts.
  const topTypes = (report.decisionTypes || []).slice(0, 2).map((type) => type.key);
  const wantsDoubled = topTypes.includes("competitiveAuction") || topTypes.includes("penaltyDouble");
  candidates.sort((a, b) =>
    (Number(b.doubled && wantsDoubled) - Number(a.doubled && wantsDoubled)) ||
    (a.fromOwnTable - b.fromOwnTable) ||
    (b.interest - a.interest) ||
    (a.row.boardNo - b.row.boardNo) ||
    (a.row.index - b.row.index));

  // Rotate within the most interesting handful, seeded by the pair key,
  // so different pairs drill different contracts (still deterministic).
  // A theme-matched doubled card always survives the rotation.
  const pool = candidates.slice(0, Math.max(maxCards, Math.min(6, candidates.length)));
  const themed = wantsDoubled ? pool.filter((candidate) => candidate.doubled) : [];
  const rest = pool.filter((candidate) => !themed.includes(candidate));
  const chosen = [];
  if (themed.length) chosen.push(themed[pickVariant(String(report.pairKey), themed.length)]);
  if (rest.length) {
    const start = pickVariant(`${report.pairKey}:rest`, rest.length);
    for (let i = 0; i < rest.length && chosen.length < maxCards; i += 1) {
      chosen.push(rest[(start + i) % rest.length]);
    }
  }
  themed.forEach((candidate) => {
    if (chosen.length < maxCards && !chosen.includes(candidate)) chosen.push(candidate);
  });

  return chosen.map((candidate) => {
    const row = candidate.row;
    const correct = row.scoreDeclarer;
    const rescore = (contract, result, vulnerable) => {
      const scored = scoreDuplicateContract(contract, result, row.declarerSide, vulnerable ? "All" : "None", row.declarerPair);
      return scored.scoreDeclarer;
    };
    const flips = [];
    const addFlip = (value, kind) => {
      if (value == null || value === correct || flips.some((flip) => flip.value === value)) return;
      flips.push({ value, kind });
    };
    addFlip(rescore(row.contract, row.result, !candidate.vulnerable), "vul");
    const strippedContract = candidate.doubled
      ? row.contract.replace(/\s*XX?\s*$/i, "")
      : `${row.contract} X`;
    addFlip(rescore(strippedContract, row.result, candidate.vulnerable), "doubling");
    if (row.tricks != null) {
      const target = row.tricks;
      const diff = (delta) => {
        const made = target + delta - (Number(row.parsedContract.level) + 6);
        return made === 0 ? "=" : made > 0 ? `+${made}` : String(made);
      };
      addFlip(rescore(row.contract, diff(1), candidate.vulnerable), "tricks");
      addFlip(rescore(row.contract, diff(-1), candidate.vulnerable), "tricks");
    }
    [50, 100, -50].forEach((offset) => addFlip(correct + offset, "offset"));
    const distractors = flips.slice(0, 3);
    const options = [{ key: "correct", label: formatSigned(correct), flip: "" }]
      .concat(distractors.map((flip, index) => ({
        key: `wrong${index}`,
        label: formatSigned(flip.value),
        flip: describeFlip(flip.kind)
      })))
      .sort((a, b) => Number(String(a.label).replace("+", "")) - Number(String(b.label).replace("+", "")));
    const id = `scoring-${row.index}`;
    const madeBy = row.tricks != null ? row.tricks - (Number(row.parsedContract.level) + 6) : null;
    const outcome = madeBy == null ? "" : madeBy >= 0 ? `making ${row.tricks}` : `down ${-madeBy}`;
    return {
      id,
      type: "scoring",
      title: "Scorekeeper's Minute",
      boardNo: row.boardNo,
      maskBoard: false,
      prompt: {
        lead: `${rowContractText(row)} - ${outcome}, ${candidate.vulnerable ? "vulnerable" : "not vulnerable"}.`,
        question: "The declaring side scores..."
      },
      options: options.map((option) => ({ key: option.key, label: option.label })),
      answerKey: "correct",
      optionNotes: options.reduce((acc, option) => {
        if (option.flip) acc[option.key] = option.flip;
        return acc;
      }, {}),
      reveal: {
        room: `Played on board ${row.boardNo}${candidate.fromOwnTable ? " - at your own table" : " at another table"}.`,
        dd: null,
        yours: `${rowContractText(row)} ${outcome}, ${candidate.vulnerable ? "vulnerable" : "not vulnerable"} = ${formatSigned(correct)} to the declaring side. Each wrong answer here is a real miscount: check the note under the one you picked.`,
        coachRight: coachLine("scoring", id, true),
        coachWrong: coachLine("scoring", id, false)
      }
    };
  });
}

/**
 * "Bid It Again": the pair's two hands and one question - game or not.
 * Verdicts only on field consensus (70%+ of 4+ same-direction tables);
 * split rooms are judgment calls with no wrong answer. DD is labeled
 * evidence, never the grader.
 */
function buildBidItAgainCard(results, report, used) {
  const scorecard = report.biddingScorecard;
  if (!scorecard || !scorecard.hasDd) return null;
  const viewsByIndex = new Map(report.rows.map((view) => [view.row.index, view]));
  const pick = scorecard.gameBoards
    .filter((entry) => ["missed", "stayedLow", "bidFailed", "beatGame"].includes(entry.bucket) &&
      !used.has(String(entry.boardNo)))
    .map((entry) => ({ entry, view: viewsByIndex.get(entry.rowIndex) }))
    .filter(({ view }) => view && view.bestMakeable.rank === 2 &&
      view.row.hasPbnBoard && view.row.board && view.row.board.hands &&
      view.percent != null && view.pairScore != null)
    .sort((a, b) => ((a.entry.mpVsAverage ?? 0) - (b.entry.mpVsAverage ?? 0)) || (a.entry.boardNo - b.entry.boardNo))[0];
  if (!pick) return null;
  const { entry, view } = pick;
  const row = view.row;
  const share = entry.sidePeers ? entry.peersInGame / entry.sidePeers : 0;
  const consensus = entry.sidePeers >= 4 ? (share >= 0.7 ? "game" : share <= 0.3 ? "stop" : null) : null;

  // Price both roads with the night's real results, never DD.
  const boardRows = results.rowsByField.get(row.fieldKey) || [];
  const peers = boardRows.filter((peer) =>
    peer !== row && String(sideParticipantKey(peer, view.side)) !== String(view.participantKey));
  const inGamePercents = [];
  const outPercents = [];
  peers.forEach((peer) => {
    const percent = sidePercent(peer, view.side);
    if (percent == null) return;
    if (peer.declarerPair === view.side && contractClassRank(peer.contractClass) >= 2) inGamePercents.push(percent);
    else outPercents.push(percent);
  });
  const pricing = inGamePercents.length && outPercents.length
    ? ` Game bidders averaged ${average(inGamePercents).toFixed(0)}% on this board; the others ${average(outPercents).toFixed(0)}%.`
    : "";

  const id = `bid-${row.index}`;
  const splitLine = `The room split ${entry.peersInGame}-${entry.sidePeers - entry.peersInGame}: a genuine judgment call. Worth a conversation with partner.`;
  return {
    id,
    type: "bid",
    title: "Bid It Again",
    boardNo: row.boardNo,
    maskBoard: true,
    neutral: consensus == null,
    hands: { board: row.board, seats: view.side === "NS" ? ["N", "S"] : ["W", "E"] },
    prompt: {
      lead: `${vulnerabilityText(row.board.vulnerable)}, dealer ${seatName(row.board.dealer) || "unknown"}. Your side held:`,
      question: "Where do you want to be?"
    },
    options: [
      { key: "game", label: "Bid game" },
      { key: "stop", label: "Stop low" },
      { key: "close", label: "Too close to call" }
    ],
    answerKey: consensus == null ? "" : consensus,
    reveal: {
      room: `${entry.peersInGame} of ${plural(entry.sidePeers, "same-direction table")} bid game; ${entry.peersMadeGame} made it.${pricing}`,
      dd: `Double-dummy says ${view.bestMakeable.text} makes - with all 52 cards visible, one layout.`,
      yours: `You played ${rowContractText(row)} for ${formatSigned(view.pairScore)} - ${view.percent.toFixed(0)}% that night.`,
      coachRight: consensus == null ? splitLine : coachLine("bid", id, true),
      coachWrong: consensus == null
        ? splitLine
        : `The room was fairly sure here: ${entry.peersInGame} of ${entry.sidePeers} ${consensus === "game" ? "bid the game" : "stayed low"}. ${coachLine("bid", id, false)}`
    }
  };
}

/**
 * "Trick Target": count declarer's best-play tricks - the one honest
 * use of DD as an answer key, preferring boards where a human declarer
 * actually matched the computer's number.
 */
function buildTrickTargetCard(results, report, used) {
  const boards = report.declaredScorecard ? report.declaredScorecard.boards : [];
  const viewsByIndex = new Map(report.rows.map((view) => [view.row.index, view]));
  const corroboration = (view) => {
    const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
    const sameStrain = boardRows.filter((peer) =>
      peer.declarerPair === view.row.declarerPair &&
      peer.parsedContract && peer.parsedContract.strain === view.row.parsedContract.strain &&
      peer.tricks != null);
    const best = sameStrain.length ? Math.max(...sameStrain.map((peer) => peer.tricks)) : null;
    return { best, matched: best != null && view.row.ddTricks != null && best >= view.row.ddTricks };
  };
  const candidates = boards
    .filter((board) => !used.has(String(board.boardNo)) &&
      (board.verdict === "trailed" || (board.triage && (board.triage.key === "play" || board.triage.key === "play-dd"))))
    .map((board) => viewsByIndex.get(board.rowIndex))
    .filter((view) => view && view.row.ddTricks != null && view.row.tricks != null &&
      view.row.board && view.row.board.hands && view.row.declarerSide && view.percent != null)
    .map((view) => ({ view, corroboration: corroboration(view) }))
    .sort((a, b) => (Number(b.corroboration.matched) - Number(a.corroboration.matched)) ||
      (a.view.percent - b.view.percent) || (a.view.row.boardNo - b.view.row.boardNo));
  const pick = candidates[0];
  if (!pick) return null;
  const view = pick.view;
  const row = view.row;
  const dd = row.ddTricks;
  const base = Math.max(0, Math.min(dd - 2, 10));
  const strain = STRAIN_WORD[row.parsedContract.strain] || "this strain";
  const id = `target-${row.index}`;
  const roomText = pick.corroboration.best == null
    ? "No other table declared in this strain that night."
    : `The most any declarer took in ${strain} that night was ${pick.corroboration.best}${pick.corroboration.matched ? " - the computer's number was human." : "."}`;
  return {
    id,
    type: "target",
    title: "Trick Target",
    boardNo: row.boardNo,
    maskBoard: true,
    hands: { board: row.board, seats: [row.declarerSide, PARTNER_SEAT[row.declarerSide]].filter(Boolean) },
    prompt: {
      lead: `You declared ${rowContractText(row)}. Declarer and dummy:`,
      question: `With best play by everyone - all 52 cards visible - how many tricks can declarer take in ${strain}?`
    },
    options: [0, 1, 2, 3].map((offset) => ({ key: String(base + offset), label: String(base + offset) })),
    answerKey: String(dd),
    reveal: {
      room: roomText,
      dd: null,
      yours: `Double-dummy says ${dd} - one layout, all cards visible. Your table took ${row.tricks} for ${formatSigned(view.pairScore)} - ${view.percent.toFixed(0)}%.`,
      coachRight: coachLine("target", id, true),
      coachWrong: coachLine("target", id, false)
    }
  };
}

/**
 * "Read the Room": predict how many same-direction tables bid game.
 * The answer is a counted fact, so it grades honestly, and it works
 * without a PBN. Exact-count buttons in small fields, bands above.
 */
function buildReadRoomCard(results, report, used) {
  const candidates = report.rows
    .map((view) => {
      if (view.percent == null || used.has(String(view.row.boardNo))) return null;
      const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
      const peers = boardRows.filter((peer) =>
        peer !== view.row && String(sideParticipantKey(peer, view.side)) !== String(view.participantKey));
      if (peers.length < 3) return null;
      const inGame = peers.filter((peer) =>
        peer.declarerPair === view.side && contractClassRank(peer.contractClass) >= 2);
      if (!inGame.length || inGame.length === peers.length) return null;
      const made = inGame.filter((peer) => {
        const made = contractMadeTricks(peer);
        return made === true;
      });
      const pairBidGame = view.declared && contractClassRank(view.row.contractClass) >= 2;
      const majorityGame = inGame.length * 2 >= peers.length;
      return {
        view,
        count: inGame.length,
        total: peers.length,
        made: made.length,
        pairBidGame,
        diverged: pairBidGame !== majorityGame
      };
    })
    .filter(Boolean)
    .sort((a, b) => (Number(b.diverged) - Number(a.diverged)) ||
      ((a.view.percent ?? 50) - (b.view.percent ?? 50)) || (a.view.row.boardNo - b.view.row.boardNo));
  const pick = candidates[0];
  if (!pick) return null;
  const view = pick.view;
  const row = view.row;
  const exact = pick.total <= 4;
  const bandFor = (count, total) => {
    if (count <= 1) return "few";
    if (count < total * 0.7) return "half";
    return count < total ? "most" : "all";
  };
  const options = exact
    ? Array.from({ length: pick.total + 1 }, (_, index) => ({ key: String(index), label: String(index) }))
    : [
      { key: "few", label: "One or none" },
      { key: "half", label: "About half" },
      { key: "most", label: "Most" },
      { key: "all", label: "All of them" }
    ];
  const hasHands = row.hasPbnBoard && row.board && row.board.hands;
  const id = `room-${row.index}`;
  return {
    id,
    type: "room",
    title: "Read the Room",
    boardNo: row.boardNo,
    maskBoard: true,
    hands: hasHands ? { board: row.board, seats: view.side === "NS" ? ["N", "S"] : ["W", "E"] } : null,
    prompt: {
      lead: hasHands
        ? `${vulnerabilityText(row.board.vulnerable)}. Your side held:`
        : `On one board your side played ${rowContractText(row)}.`,
      question: `Of the ${pick.total} other tables holding your side's cards, how many bid game?`
    },
    options,
    answerKey: exact ? String(pick.count) : bandFor(pick.count, pick.total),
    reveal: {
      room: `${pick.count} of ${pick.total} bid game; ${pick.made} made it.`,
      dd: null,
      yours: `Your table: ${rowContractText(row)} for ${formatSigned(view.pairScore)} - ${view.percent.toFixed(0)}%.`,
      coachRight: coachLine("room", id, true),
      coachWrong: coachLine("room", id, false)
    }
  };
}

function contractMadeTricks(row) {
  if (!row.parsedContract || row.tricks == null) return null;
  const level = Number(row.parsedContract.level);
  if (!level) return null;
  return row.tricks >= level + 6;
}

/**
 * "Strain Check": which strain is the fit? Verdict only when the field
 * really played two or more strains and one clearly outscored; a
 * one-strain field is a judgment card with labeled DD evidence.
 */
function buildStrainCheckCard(results, report, used) {
  const category = (report.lossLedger.categories || []).find((entry) => entry.key === "wrongStrain");
  if (!category || !category.comparisons.length) return null;
  const viewsByIndex = new Map(report.rows.map((view) => [view.row.index, view]));
  const comp = [...category.comparisons]
    .filter((entry) => !used.has(String(entry.boardNo)) &&
      entry.targetRow && entry.targetRow.board && entry.targetRow.board.hands)
    .sort((a, b) => (b.loss - a.loss) || (b.scoreDelta - a.scoreDelta) || (a.boardNo - b.boardNo))[0];
  if (!comp) return null;
  const view = viewsByIndex.get(comp.targetRow.index);
  if (!view || view.percent == null) return null;
  const row = view.row;
  const seats = view.side === "NS" ? ["N", "S"] : ["W", "E"];
  const fit = ["S", "H", "D", "C"].map((suit) => ({
    suit,
    lengths: seats.map((seat) => (row.board.hands[seat].cards[suit] || "").length)
  }));

  // What the same-direction field actually did, per strain.
  const boardRows = results.rowsByField.get(row.fieldKey) || [];
  const byStrain = new Map();
  boardRows.forEach((peer) => {
    if (peer.declarerPair !== view.side || !peer.parsedContract || !peer.parsedContract.strain) return;
    const percent = sidePercent(peer, view.side);
    if (percent == null) return;
    if (!byStrain.has(peer.parsedContract.strain)) byStrain.set(peer.parsedContract.strain, []);
    byStrain.get(peer.parsedContract.strain).push(percent);
  });
  const played = Array.from(byStrain.entries())
    .map(([strain, percents]) => ({ strain, count: percents.length, avg: average(percents) }))
    .sort((a, b) => b.avg - a.avg);
  const decisive = played.length >= 2 && (played[0].avg - played[1].avg) >= 15;
  const id = `strain-${row.index}`;
  const roomText = played.length
    ? played.map((entry) => `${STRAIN_WORD[entry.strain]} tables averaged ${entry.avg.toFixed(0)}% (${plural(entry.count, "table")})`).join("; ") + "."
    : "Only your table declared from your side that night.";
  const splitLine = "The field's evidence is thin here - compare the two hands with partner and pick your agreement.";
  return {
    id,
    type: "strain",
    title: "Strain Check",
    boardNo: row.boardNo,
    maskBoard: true,
    neutral: !decisive,
    hands: { board: row.board, seats },
    prompt: {
      lead: `${vulnerabilityText(row.board.vulnerable)}. Your side held:`,
      fit,
      question: "Which strain would you choose?"
    },
    options: [
      { key: "S", label: "Spades" },
      { key: "H", label: "Hearts" },
      { key: "D", label: "Diamonds" },
      { key: "C", label: "Clubs" },
      { key: "N", label: "Notrump" }
    ],
    answerKey: decisive ? played[0].strain : "",
    reveal: {
      room: roomText,
      dd: view.bestMakeable.rank > 0 && view.bestMakeable.text
        ? `Double-dummy's best spot for your side: ${view.bestMakeable.text} - with all 52 cards visible, one layout.`
        : null,
      yours: `You played ${rowContractText(row)} for ${formatSigned(view.pairScore)} - ${view.percent.toFixed(0)}%.`,
      coachRight: decisive ? `With the room: the ${STRAIN_WORD[played[0].strain]} tables cashed in.` : splitLine,
      coachWrong: decisive ? `The room's money was on ${STRAIN_WORD[played[0].strain]}. Worth finding the auction that gets there.` : splitLine
    }
  };
}

/**
 * "Price the Save": break-even sacrifice arithmetic against a game the
 * opponents' side actually made - engine-scored, so the answer is a
 * fact. Only offered to competitive-auction-themed pairs.
 */
function buildPriceTheSaveCard(results, report, used) {
  const topTypes = (report.decisionTypes || []).slice(0, 2).map((type) => type.key);
  if (!topTypes.includes("competitiveAuction") && !topTypes.includes("penaltyDouble")) return null;
  const candidates = report.rows
    .map((view) => {
      if (view.percent == null || view.percent >= 50 || used.has(String(view.row.boardNo))) return null;
      const oppSide = view.side === "NS" ? "EW" : "NS";
      const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
      const madeGames = boardRows.filter((peer) =>
        peer.declarerPair === oppSide && contractClassRank(peer.contractClass) >= 2 &&
        contractMadeTricks(peer) === true && sideScore(peer, view.side) != null);
      if (!madeGames.length) return null;
      // The most common made-game score, from the pair's perspective.
      const counts = new Map();
      madeGames.forEach((peer) => {
        const score = sideScore(peer, view.side);
        counts.set(score, (counts.get(score) || 0) + 1);
      });
      const oppScore = Array.from(counts.entries())
        .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
      return { view, oppScore, gameText: rowContractText(madeGames[0]) };
    })
    .filter(Boolean)
    .sort((a, b) => (a.view.percent - b.view.percent) || (a.view.row.boardNo - b.view.row.boardNo));
  const pick = candidates[0];
  if (!pick) return null;
  const view = pick.view;
  const row = view.row;
  const declarerSeat = view.side === "NS" ? "N" : "E";
  const vulnerable = row.board ? row.board.vulnerable : "None";
  // Engine-scored doubled undertricks at the pair's colors.
  const penaltyAt = (down) => {
    const scored = scoreDuplicateContract("5 C X", `-${down}`, declarerSeat, vulnerable, "");
    return scored.scoreDeclarer == null ? null : scored.scoreDeclarer;
  };
  let breakEven = 0;
  for (let down = 1; down <= 7; down += 1) {
    const sac = penaltyAt(down);
    if (sac == null) break;
    if (sac > pick.oppScore) breakEven = down;
    else break;
  }
  if (breakEven < 1 || breakEven > 6) return null;
  const base = Math.max(1, breakEven - 1);
  const ladder = [];
  for (let down = 1; down <= Math.min(7, breakEven + 1); down += 1) {
    ladder.push(`down ${down} = ${formatSigned(penaltyAt(down))}`);
  }
  const vulSide = isVulnerable(vulnerable, view.side);
  const sacRows = (results.rowsByField.get(row.fieldKey) || []).filter((peer) =>
    peer.declarerPair === view.side && peer.parsedContract && peer.parsedContract.doubled &&
    sideScore(peer, view.side) != null);
  const id = `save-${row.index}`;
  return {
    id,
    type: "save",
    title: "Price the Save",
    boardNo: row.boardNo,
    maskBoard: true,
    hands: row.hasPbnBoard && row.board && row.board.hands
      ? { board: row.board, seats: view.side === "NS" ? ["N", "S"] : ["W", "E"] }
      : null,
    prompt: {
      lead: `Their side makes ${pick.gameText} (${formatSigned(pick.oppScore)} to you). You are ${vulSide ? "vulnerable" : "not vulnerable"}.`,
      question: "Doubled at your colors, how many down is still cheaper than letting them make it?"
    },
    options: [0, 1, 2, 3].map((offset) => ({ key: String(base + offset), label: `Down ${base + offset}` })),
    answerKey: String(breakEven),
    reveal: {
      room: sacRows.length
        ? `${plural(sacRows.length, "table")} on your side played doubled that night: ${sacRows.map((peer) => formatSigned(sideScore(peer, view.side))).join(", ")}.`
        : "Nobody saved that night.",
      dd: null,
      yours: `The ladder at your colors: ${ladder.join(", ")} - the save breaks even at down ${breakEven}. Your table: ${rowContractText(row) || "defended"} for ${formatSigned(view.pairScore)} - ${view.percent.toFixed(0)}%.`,
      coachRight: coachLine("room", id, true),
      coachWrong: `Sacrifice math is pure arithmetic - the ladder in the reveal is worth memorizing at both colors.`
    }
  };
}

/**
 * Builds the Table Time quiz for one pair: at most a handful of cards,
 * deterministic, honest, and finishable. Works without a PBN (all
 * phase-1 types are score-column arithmetic).
 *
 * @param {import("./types.js").ResultsAnalysis} results
 * @param {import("./types.js").Report} report
 * @returns {{ cards: Array<Object<string, *>> }}
 */
function buildPairExercises(results, report) {
  if (!results || !report) return { cards: [] };
  /** @type {Array<Object<string, *>>} */
  const cards = [];
  const used = new Set();
  const add = (card) => {
    if (!card) return;
    cards.push(card);
    if (card.boardNo != null && card.type !== "scoring") used.add(String(card.boardNo));
  };

  add(buildOvertrickCard(report, used));
  add(buildLadderCard(results, report, used));
  add(buildBidItAgainCard(results, report, used));
  // The fourth slot mirrors the pair's diagnosis: play-heavy profiles
  // count tricks, bidding-heavy profiles read the field.
  const topTypes = (report.decisionTypes || []).slice(0, 2).map((type) => type.key);
  const prefersPlay = topTypes.includes("declarerPlay") || topTypes.includes("defense");
  const primary = prefersPlay
    ? buildTrickTargetCard(results, report, used)
    : buildReadRoomCard(results, report, used);
  add(primary || (prefersPlay
    ? buildReadRoomCard(results, report, used)
    : buildTrickTargetCard(results, report, used)));
  // One themed extra at most: wrong-strain boards get Strain Check,
  // competitive profiles get the sacrifice ladder.
  add(buildStrainCheckCard(results, report, used) || buildPriceTheSaveCard(results, report, used));
  const scoringCount = Math.min(2, Math.max(1, 6 - cards.length));
  cards.push(...buildScoringCards(results, report, scoringCount));

  // Mask labels are assigned in display order: Deal A, Deal B, ...
  let dealIndex = 0;
  cards.forEach((card) => {
    card.dealLabel = card.maskBoard ? `Deal ${String.fromCharCode(65 + dealIndex++)}` : "";
  });
  return { cards };
}

export {
  buildPairExercises,
  buildBidItAgainCard,
  buildTrickTargetCard,
  buildReadRoomCard,
  buildStrainCheckCard,
  buildPriceTheSaveCard,
  overtrickBandFor,
  ladderBandFor,
};
