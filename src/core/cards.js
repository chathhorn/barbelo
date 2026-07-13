// Card-holding normalization shared by PBN parsing and board analysis.

import { RANK_ORDER } from "./constants.js";

function normalizeSuitHolding(value) {
  const text = String(value == null ? "" : value).trim().toUpperCase();
  return text === "-" ? "" : text;
}

function sortHolding(holding) {
  return [...normalizeSuitHolding(holding)]
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
    .join("");
}

export { sortHolding };
