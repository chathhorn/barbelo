// Sanity checks that an uploaded results file plausibly belongs to the
// loaded PBN hand record: board overlap, date agreement, join coverage.

import { sum, average, uniqueSorted, numericPairSort } from "./format.js";
import { pbnHeaderDetails } from "./boards.js";

function normalizedDateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const ymd = text.match(/\b([12]\d{3})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);
  if (ymd) return `${ymd[1]}${ymd[2].padStart(2, "0")}${ymd[3].padStart(2, "0")}`;
  const mdy = text.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
  if (!mdy) return "";
  let year = Number(mdy[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  return `${String(year).padStart(4, "0")}${mdy[1].padStart(2, "0")}${mdy[2].padStart(2, "0")}`;
}

function dateKeyLabel(key) {
  if (!key || key.length !== 8) return "";
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;
}

function compatibilityPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function assessPbnResultsCompatibility(analysis, rows, boardSummaries) {
  const hasPbn = analysis && analysis.boards && analysis.boards.length;
  const resultBoardNumbers = new Set(boardSummaries.map((summary) => String(summary.boardNo)));
  const resultBoardCount = resultBoardNumbers.size;
  if (!hasPbn) {
    return {
      status: "unknown",
      label: "No PBN to compare",
      score: null,
      details: ["Open a PBN to compare board numbers, event date, par, and double-dummy clues."],
      metrics: {}
    };
  }

  const pbnBoardNumbers = new Set(analysis.boards.map((board) => String(board.boardNo)));
  const overlapBoards = [...resultBoardNumbers].filter((boardNo) => pbnBoardNumbers.has(boardNo)).sort(numericPairSort);
  const extraBoards = [...resultBoardNumbers].filter((boardNo) => !pbnBoardNumbers.has(boardNo)).sort(numericPairSort);
  const missingBoards = [...pbnBoardNumbers].filter((boardNo) => !resultBoardNumbers.has(boardNo)).sort(numericPairSort);
  const overlapRatio = resultBoardCount ? overlapBoards.length / resultBoardCount : 0;
  const pbnCoverageRatio = pbnBoardNumbers.size ? overlapBoards.length / pbnBoardNumbers.size : 0;
  const commonRows = rows.filter((row) => row.hasPbnBoard);
  const completeContractRows = commonRows.filter((row) => row.contract && row.result && row.declarerSide).length;
  const contractCoverage = commonRows.length ? completeContractRows / commonRows.length : 0;
  const ddDeltas = commonRows.map((row) => row.ddDelta).filter((value) => value != null);
  const vsPar = commonRows.map((row) => row.vsParNS).filter((value) => value != null);
  const avgAbsDd = ddDeltas.length ? average(ddDeltas.map((value) => Math.abs(value))) : null;
  const avgAbsVsPar = vsPar.length ? average(vsPar.map((value) => Math.abs(value))) : null;
  const pbnDateKey = normalizedDateKey(pbnHeaderDetails(analysis).date);
  const resultDateKeys = uniqueSorted(rows.map((row) => normalizedDateKey(row.dateLog)).filter(Boolean));
  const dateMismatch = Boolean(pbnDateKey && resultDateKeys.length && !resultDateKeys.includes(pbnDateKey));
  let score = 100;
  const details = [];
  const concerns = [];

  if (!resultBoardCount) {
    return {
      status: "unknown",
      label: "No comparable result boards",
      score: null,
      details: ["The results file did not yield any playable board numbers to compare with the loaded PBN."],
      metrics: {
        pbnBoards: pbnBoardNumbers.size,
        resultBoards: 0,
        overlapBoards: 0,
        overlapRatio: 0,
        pbnCoverageRatio: 0,
        pbnDate: dateKeyLabel(pbnDateKey),
        resultDates: resultDateKeys.map(dateKeyLabel)
      }
    };
  }

  score -= (1 - overlapRatio) * 70;
  if (dateMismatch) score -= 35;
  if (contractCoverage && contractCoverage < 0.75) score -= 12;
  if (avgAbsDd != null && ddDeltas.length >= 12 && avgAbsDd > 3.5) score -= avgAbsDd > 5 ? 30 : 16;
  if (avgAbsVsPar != null && vsPar.length >= 12 && avgAbsVsPar > 650) score -= avgAbsVsPar > 900 ? 24 : 12;
  score = Math.max(0, Math.round(score));

  details.push(`${overlapBoards.length} of ${resultBoardCount} result boards overlap the PBN (${compatibilityPercent(overlapRatio)}).`);
  details.push(`${overlapBoards.length} of ${pbnBoardNumbers.size} PBN boards have uploaded results (${compatibilityPercent(pbnCoverageRatio)}).`);
  if (overlapRatio < 0.85) concerns.push(`Only ${compatibilityPercent(overlapRatio)} of result boards overlap the PBN.`);
  if (extraBoards.length) {
    const text = `Result-only boards: ${extraBoards.slice(0, 12).join(", ")}${extraBoards.length > 12 ? ", ..." : ""}.`;
    details.push(text);
    concerns.push(text);
  }
  if (missingBoards.length) details.push(`PBN boards without results: ${missingBoards.slice(0, 12).join(", ")}${missingBoards.length > 12 ? ", ..." : ""}.`);
  if (pbnDateKey || resultDateKeys.length) {
    const text = `PBN date ${dateKeyLabel(pbnDateKey) || "unknown"}; result date${resultDateKeys.length === 1 ? "" : "s"} ${resultDateKeys.map(dateKeyLabel).join(", ") || "unknown"}.`;
    details.push(text);
    if (dateMismatch) concerns.push(text);
  }
  if (commonRows.length) details.push(`${compatibilityPercent(contractCoverage)} of joined result rows include contract, result, and declarer direction.`);
  if (avgAbsDd != null && ddDeltas.length >= 12) {
    const text = `Average absolute DD trick delta on joined rows is ${avgAbsDd.toFixed(1)}.`;
    details.push(text);
    if (avgAbsDd > 3.5) concerns.push(text);
  }
  if (avgAbsVsPar != null && vsPar.length >= 12) {
    const text = `Average absolute score-vs-par on joined rows is ${Math.round(avgAbsVsPar)}.`;
    details.push(text);
    if (avgAbsVsPar > 650) concerns.push(text);
  }

  let status = "match";
  let label = "Looks compatible";
  if (overlapRatio === 0 || overlapRatio < 0.5 || score < 35) {
    status = "mismatch";
    label = "Likely mismatch";
  } else if (dateMismatch || overlapRatio < 0.85 || score < 70) {
    status = "warning";
    label = "Possible mismatch";
  } else if (pbnCoverageRatio < 0.65) {
    status = "partial";
    label = "Partial but plausible";
  }

  return {
    status,
    label,
    score,
    primaryConcern: concerns[0] || details[0] || "",
    details,
    metrics: {
      pbnBoards: pbnBoardNumbers.size,
      resultBoards: resultBoardCount,
      overlapBoards: overlapBoards.length,
      extraBoards: extraBoards.length,
      missingBoards: missingBoards.length,
      overlapRatio,
      pbnCoverageRatio,
      contractCoverage,
      avgAbsDd,
      avgAbsVsPar,
      pbnDate: dateKeyLabel(pbnDateKey),
      resultDates: resultDateKeys.map(dateKeyLabel)
    }
  };
}

export {
  normalizedDateKey,
  dateKeyLabel,
  compatibilityPercent,
  assessPbnResultsCompatibility,
};
