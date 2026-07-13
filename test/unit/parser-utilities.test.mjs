import test from "node:test";
import assert from "node:assert/strict";

import { sortHolding } from "../../src/core/cards.js";
import { normalizeText } from "../../src/parsers/text.js";

test("card holdings normalize case, whitespace, voids, and rank order", () => {
  assert.equal(sortHolding(" 2taK "), "AKT2");
  assert.equal(sortHolding("-"), "");
  assert.equal(sortHolding(null), "");
});

test("parser text normalization strips one BOM and standardizes line endings", () => {
  assert.equal(normalizeText("\uFEFFone\r\ntwo\rthree\n"), "one\ntwo\nthree\n");
});
