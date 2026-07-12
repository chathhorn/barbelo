// Deterministic, dependency-free helpers for simulator scenario seeds.
// These functions deliberately operate only on JSON-like data so the
// scenario builder never depends on object insertion order, Math.random(),
// filenames, player names, or wall-clock state.

function canonicalJsonValue(value, seen) {
  if (value == null) return null;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") return Number.isFinite(value) ? value : null;
  if (type === "bigint") return String(value);
  if (type === "undefined" || type === "function" || type === "symbol") return undefined;

  if (seen.has(value)) throw new TypeError("Cannot canonically serialize circular simulator seed data");
  seen.add(value);
  let canonical;
  if (Array.isArray(value)) {
    canonical = value.map((entry) => {
      const normalized = canonicalJsonValue(entry, seen);
      return normalized === undefined ? null : normalized;
    });
  } else {
    canonical = {};
    Object.keys(value).sort().forEach((key) => {
      const normalized = canonicalJsonValue(value[key], seen);
      if (normalized !== undefined) canonical[key] = normalized;
    });
  }
  seen.delete(value);
  return canonical;
}

/**
 * JSON serialization with recursively sorted object keys.
 *
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  return JSON.stringify(canonicalJsonValue(value, new Set()));
}

/**
 * FNV-1a over JavaScript UTF-16 code units. `Math.imul` keeps the hash
 * identical across engines.
 *
 * @param {string} value
 * @returns {number} Unsigned 32-bit hash.
 */
function hashString32(value) {
  const text = String(value == null ? "" : value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stable eight-character hexadecimal fingerprint for JSON-like data.
 *
 * @param {*} value
 * @returns {string}
 */
function fingerprint(value) {
  return hashString32(stableStringify(value)).toString(16).padStart(8, "0");
}

/**
 * Small seeded PRNG (Mulberry32). The returned function yields values in
 * [0, 1) and is suitable for deterministic cosmetic/content selection,
 * not cryptography.
 *
 * @param {number|string} seed
 * @returns {() => number}
 */
function createSeededRandom(seed) {
  let state = typeof seed === "number" ? seed >>> 0 : hashString32(String(seed));
  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates copy.
 *
 * @template T
 * @param {T[]} values
 * @param {() => number} random
 * @returns {T[]}
 */
function shuffledCopy(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export {
  stableStringify,
  hashString32,
  fingerprint,
  createSeededRandom,
  shuffledCopy,
};
