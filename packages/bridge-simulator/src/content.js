import { buildTrainingHand } from "./core/cards.js";

const SCENARIO_SCHEMA_VERSION = 2;
const GENERIC_SCENARIO_SEED = "bridge-fundamentals-v1";

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((entry) => deepFreeze(entry, seen));
  return Object.freeze(value);
}

const GENERIC_SCENARIO = deepFreeze({
  schemaVersion: SCENARIO_SCHEMA_VERSION,
  seed: GENERIC_SCENARIO_SEED,
  briefing: {
    bark: [
      "Three coaching wings, thirteen cards, and one Bottom Board. Recover the notes, keep your Composure, and move for the next round.",
    ],
  },
  palette: { key: "felt-green" },
  hand: {
    cards: buildTrainingHand(GENERIC_SCENARIO_SEED),
  },
  wings: [
    {
      slot: "A",
      title: "The Auction Pits",
      encounterSkin: "auction-wraith",
      coachFeedback: {
        summary: ["Build an auction picture before choosing a contract."],
        details: [
          "Track partner's range and shape with every call, and distinguish forcing, invitational, competitive, and signoff bids.",
          "Once a fit is found, revalue distribution and use vulnerability and the scoring method to choose the level.",
        ],
      },
    },
    {
      slot: "B",
      title: "The Trickworks",
      encounterSkin: "overtrick-imp",
      coachFeedback: {
        summary: ["Plan the whole hand before playing from trick one."],
        details: [
          "Count sure winners in notrump or likely losers in a suit contract, then identify entries and the danger hand.",
          "Ask what can go wrong before deciding whether to draw trumps, establish a suit, duck, or take a finesse.",
        ],
      },
    },
    {
      slot: "C",
      title: "The Lead Mines",
      encounterSkin: "lead-goblin",
      coachFeedback: {
        summary: ["Defend from the auction, dummy, and a continuously updated count."],
        details: [
          "Review the auction before leading; as cards appear, count declarer's likely shape and high-card points.",
          "Treat partnership signals as evidence within your agreements, cash winners when necessary, and shift only with a reason.",
        ],
      },
    },
  ],
  boss: {
    title: "The Bottom Board",
    encounterSkin: "bottom-board",
  },
  debrief: {
    notes: [
      "Auction: keep track of range, shape, fit, and which calls are forcing.",
      "Declarer play: count winners or losers, preserve entries, and make a plan before trick one.",
      "Defense: use the auction and dummy, then update the count after every reveal.",
    ],
    nextTableHabit: [
      "On the next three deals, pause before your first call, first play, or opening lead and state your plan in one sentence.",
    ],
  },
});

export {
  SCENARIO_SCHEMA_VERSION,
  GENERIC_SCENARIO_SEED,
  GENERIC_SCENARIO,
};
