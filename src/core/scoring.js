// Duplicate bridge scoring (Law 77): trick scores, bonuses, penalties,
// and vulnerability handling.

import { PAIRS } from "./constants.js";
import { parsePlayedContract, normalizeResultValue } from "./contracts.js";

function contractTrickScore(contract) {
  if (!contract || !contract.level || !contract.strain) return 0;
  if (contract.strain === "N") return 40 + (contract.level - 1) * 30;
  if (contract.strain === "S" || contract.strain === "H") return contract.level * 30;
  return contract.level * 20;
}

function overtrickValue(contract) {
  if (contract.strain === "C" || contract.strain === "D") return 20;
  return 30;
}

function isVulnerable(vulnerable, pair) {
  const normalized = normalizeVulnerability(vulnerable);
  if (normalized === "All") return true;
  if (normalized === "NS") return pair === "NS";
  if (normalized === "EW") return pair === "EW";
  return false;
}

function normalizeVulnerability(value) {
  const text = String(value || "").trim();
  if (/^(none|love)$/i.test(text) || text === "-") return "None";
  if (/^(all|both)$/i.test(text)) return "All";
  if (/^n-?s$/i.test(text)) return "NS";
  if (/^e-?w$/i.test(text)) return "EW";
  return "";
}

function resultToTricks(contract, resultText) {
  if (!contract || contract.passout) return 0;
  if (!contract.level) return null;
  const target = contract.level + 6;
  const result = normalizeResultValue(resultText);
  if (!result) return null;
  let tricks = null;
  if (result === "=") tricks = target;
  else {
    const offset = result.match(/^([+-])\s*(\d+)$/);
    if (offset) tricks = target + (offset[1] === "+" ? 1 : -1) * Number(offset[2]);
    else if (/^\d+$/.test(result)) tricks = Number(result);
  }
  if (tricks == null || tricks < 0 || tricks > 13) return null;
  return tricks;
}

function undertrickPenalty(undertricks, vulnerable, doubled) {
  if (!doubled) return undertricks * (vulnerable ? 100 : 50);
  let penalty = 0;
  for (let index = 1; index <= undertricks; index += 1) {
    if (vulnerable) penalty += index === 1 ? 200 : 300;
    else penalty += index === 1 ? 100 : index <= 3 ? 200 : 300;
  }
  return doubled === "XX" ? penalty * 2 : penalty;
}

/**
 * Scores one played contract under duplicate (Law 77) scoring.
 *
 * @param {string} contractText Contract text ("3 NT X", "PASS", ...).
 * @param {string} resultText Result text ("=", "+1", "-2", or tricks).
 * @param {string} declarerSide Declarer seat letter, or "".
 * @param {string} vulnerable "None", "NS", "EW", or "All".
 * @param {string} [declarerPairOverride] "NS"/"EW" fallback when the
 *   declarer seat is missing but the declaring pair is known.
 * @returns {{ contract: import("./types.js").ParsedContract, tricks: number|null, scoreDeclarer: number|null, scoreNS: number|null, error: string }}
 */
function scoreDuplicateContract(contractText, resultText, declarerSide, vulnerable, declarerPairOverride) {
  const contract = parsePlayedContract(contractText);
  if (contract.passout) {
    return { contract, tricks: 0, scoreDeclarer: 0, scoreNS: 0, error: "" };
  }
  const declarerPair = PAIRS[declarerSide] || declarerPairOverride || "";
  const tricks = resultToTricks(contract, resultText);
  if (!contract.level || !declarerPair || tricks == null) {
    return { contract, tricks, scoreDeclarer: null, scoreNS: null, error: "Could not score the contract." };
  }

  const target = contract.level + 6;
  const vulnerablePair = isVulnerable(vulnerable, declarerPair);
  const madeBy = tricks - target;
  let scoreDeclarer = 0;

  if (madeBy < 0) {
    scoreDeclarer = -undertrickPenalty(Math.abs(madeBy), vulnerablePair, contract.doubled);
  } else {
    const multiplier = contract.doubled === "XX" ? 4 : contract.doubled === "X" ? 2 : 1;
    const trickScore = contractTrickScore(contract) * multiplier;
    const gameBonus = trickScore >= 100 ? (vulnerablePair ? 500 : 300) : 50;
    const slamBonus = contract.level === 6 ? (vulnerablePair ? 750 : 500) : contract.level === 7 ? (vulnerablePair ? 1500 : 1000) : 0;
    const insult = contract.doubled === "XX" ? 100 : contract.doubled === "X" ? 50 : 0;
    let overtricks = 0;
    if (madeBy > 0) {
      if (contract.doubled) {
        const doubledOvertrick = vulnerablePair ? 200 : 100;
        overtricks = madeBy * (contract.doubled === "XX" ? doubledOvertrick * 2 : doubledOvertrick);
      } else {
        overtricks = madeBy * overtrickValue(contract);
      }
    }
    scoreDeclarer = trickScore + gameBonus + slamBonus + insult + overtricks;
  }

  return {
    contract,
    tricks,
    scoreDeclarer,
    scoreNS: declarerPair === "NS" ? scoreDeclarer : -scoreDeclarer,
    error: ""
  };
}

export {
  contractTrickScore,
  overtrickValue,
  isVulnerable,
  normalizeVulnerability,
  resultToTricks,
  undertrickPenalty,
  scoreDuplicateContract,
};
