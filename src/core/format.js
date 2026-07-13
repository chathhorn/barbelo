// Formatting and small generic helpers: HTML escaping, number/text
// formatting, contract glyph rendering, and collection utilities.

import { SUITS } from "./constants.js";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CONTRACT_TOKEN_RE = /([1-7])\s?(NT|[SHDCN])\s?(XX|X)?(?![A-Za-z])/g;

function contractGlyphHtml(text) {
  const escaped = escapeHtml(String(text == null ? "" : text));
  return escaped.replace(CONTRACT_TOKEN_RE, (_match, level, strain, doubled) => {
    const suit = strain === "NT" || strain === "N" ? null : SUITS.find((entry) => entry.key === strain);
    const strainHtml = suit ? `<span class="suit-glyph ${suit.className}">${suit.html}</span>` : "NT";
    const doubledHtml = doubled ? `<span class="dbl">${doubled === "XX" ? "&times;&times;" : "&times;"}</span>` : "";
    return `${level}${strainHtml}${doubledHtml}`;
  });
}

function formatSigned(value) {
  if (value == null || Number.isNaN(value)) return "";
  return value > 0 ? `+${value}` : String(value);
}

function formatMp(value) {
  if (value == null || Number.isNaN(value)) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function plural(value, singular, pluralText) {
  return `${value} ${value === 1 ? singular : pluralText || `${singular}s`}`;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function average(values) {
  return values.length ? sum(values) / values.length : 0;
}

function safeNumber(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function countBy(values) {
  const counts = {};
  values.forEach((value) => {
    const key = value || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function csvCell(value) {
  let text = String(value == null ? "" : value);
  const formulaLike = (/^[=@\t\r]/.test(text) && text !== "=") || /^[+-][A-Za-z(@]/.test(text);
  if (formulaLike) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function pickField(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
}

function numericPairSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export {
  numericPairSort,
  escapeHtml,
  contractGlyphHtml,
  formatSigned,
  formatMp,
  plural,
  sum,
  average,
  safeNumber,
  uniqueSorted,
  countBy,
  formatBytes,
  csvCell,
  pickField,
};
