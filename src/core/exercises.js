// "Table Time" exercise generator: a short personalized quiz built from
// the pair's own session. Three honesty rules govern everything here:
// (1) bridge judgment is never graded by one layout's outcome - phase-1
// puzzle types are pure arithmetic, so every answer key is a fact;
// (2) double-dummy may answer trick-counting questions only, and is
// always labeled; (3) generation is deterministic - same files, same
// quiz - with variety coming from the pair's own data.

import { formatSigned, formatMp, plural } from "./format.js";
import { scoreDuplicateContract, isVulnerable } from "./scoring.js";
import { sideScore, sideParticipantKey, rowContractText } from "./results.js";

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
function buildOvertrickCard(report) {
  const meter = report.overtrickMeter;
  if (!meter || !meter.boards.length) return null;
  const candidates = meter.boards
    .filter((board) => board.boardTop != null && board.boardTop > 0 && board.percent != null)
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
function buildLadderCard(results, report) {
  const views = report.rows.filter((view) =>
    view.percent != null && view.pairScore != null &&
    view.row.boardTop != null && view.row.boardTop >= 3);
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
    const doubledText = row.parsedContract.doubled === "XX" ? " redoubled" : row.parsedContract.doubled === "X" ? " doubled" : "";
    const madeBy = row.tricks != null ? row.tricks - (Number(row.parsedContract.level) + 6) : null;
    const outcome = madeBy == null ? "" : madeBy >= 0 ? `making ${row.tricks}` : `down ${-madeBy}`;
    return {
      id,
      type: "scoring",
      title: "Scorekeeper's Minute",
      boardNo: row.boardNo,
      maskBoard: false,
      prompt: {
        lead: `${rowContractText(row)}${doubledText ? "" : ""} - ${outcome}, ${candidate.vulnerable ? "vulnerable" : "not vulnerable"}.`,
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
  const cards = [];
  const overtrick = buildOvertrickCard(report);
  if (overtrick) cards.push(overtrick);
  const ladder = buildLadderCard(results, report);
  if (ladder) cards.push(ladder);
  cards.push(...buildScoringCards(results, report, 2));
  // Mask labels are assigned in display order: Deal A, Deal B, ...
  let dealIndex = 0;
  cards.forEach((card) => {
    card.dealLabel = card.maskBoard ? `Deal ${String.fromCharCode(65 + dealIndex++)}` : "";
  });
  return { cards };
}

export {
  buildPairExercises,
  buildOvertrickCard,
  buildLadderCard,
  buildScoringCards,
  overtrickBandFor,
  ladderBandFor,
  coachLine,
};
