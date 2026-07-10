// Bridge vocabulary shared across the app: seats, suits, denominations,
// and the tiny lookups over them.

const SEATS = ["N", "E", "S", "W"];

const PAIRS = { N: "NS", S: "NS", E: "EW", W: "EW" };

const SUITS = [
  { key: "S", label: "Spades", short: "S", html: "&spades;", className: "spade" },
  { key: "H", label: "Hearts", short: "H", html: "&hearts;", className: "heart" },
  { key: "D", label: "Diamonds", short: "D", html: "&diams;", className: "diamond" },
  { key: "C", label: "Clubs", short: "C", html: "&clubs;", className: "club" }
];

const DENOMS = [
  { key: "N", label: "NT", color: "#2457a6" },
  { key: "S", label: "Spades", color: "#1d2b3a" },
  { key: "H", label: "Hearts", color: "#bb3f45" },
  { key: "D", label: "Diamonds", color: "#b7791f" },
  { key: "C", label: "Clubs", color: "#0f7b6c" }
];

const RANK_ORDER = "AKQJT98765432";

const HCP_VALUE = { A: 4, K: 3, Q: 2, J: 1 };

function seatName(seat) {
  return { N: "North", E: "East", S: "South", W: "West" }[seat] || seat;
}

function suitMeta(key) {
  return SUITS.find((suit) => suit.key === key) || SUITS[0];
}

function denomMeta(key) {
  return DENOMS.find((denom) => denom.key === key) || DENOMS[0];
}

export {
  SEATS,
  PAIRS,
  SUITS,
  DENOMS,
  RANK_ORDER,
  HCP_VALUE,
  seatName,
  suitMeta,
  denomMeta,
};
