const SUIT_ORDER = Object.freeze(["S", "H", "D", "C"]);
const RANK_ORDER = "AKQJT98765432";

function canonicalCardKey(card) {
  return `${card && card.suit || ""}${card && card.rank || ""}`;
}

function isValidCard(card) {
  return Boolean(card) && SUIT_ORDER.includes(card.suit) && RANK_ORDER.includes(card.rank);
}

function canonicalCardSort(a, b) {
  return SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
    RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
}

function normalizeThirteenCards(cards) {
  const normalized = (Array.isArray(cards) ? cards : []).map((card) => ({
    suit: String(card && card.suit || "").toUpperCase(),
    rank: String(card && card.rank || "").toUpperCase(),
  }));
  if (normalized.length !== 13 || normalized.some((card) => !isValidCard(card))) return null;
  if (new Set(normalized.map(canonicalCardKey)).size !== 13) return null;
  return normalized.sort(canonicalCardSort);
}

function hashSeed(seed) {
  const text = String(seed == null ? "bridge-simulator" : seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function nextRandom(state) {
  let next = state.value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  state.value = next >>> 0;
  return state.value / 4294967296;
}

function buildTrainingHand(seed) {
  const deck = SUIT_ORDER.flatMap((suit) => [...RANK_ORDER].map((rank) => ({ suit, rank })));
  const random = { value: hashSeed(seed) };
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(nextRandom(random) * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return deck.slice(0, 13).sort(canonicalCardSort);
}

export {
  canonicalCardKey,
  normalizeThirteenCards,
  buildTrainingHand,
};
