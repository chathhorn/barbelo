const TEST_CARDS = Object.freeze(
  ["SA", "SK", "SQ", "SJ", "ST", "S9", "H8", "H7", "D6", "D5", "C4", "C3", "C2"]
    .map((value) => Object.freeze({ suit: value[0], rank: value[1] }))
);

function createTestScenario({
  seed = "simulator-test",
  cards = null,
  wings = [{ slot: "A" }],
  boss = {},
} = {}) {
  return Object.freeze({
    seed,
    hand: cards ? { cards } : null,
    wings,
    boss: { title: "The Bottom Board", ...boss },
  });
}

export { TEST_CARDS, createTestScenario };
