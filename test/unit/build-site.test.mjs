import assert from "node:assert/strict";
import test from "node:test";

import { rewriteIndexHtml } from "../../tools/build-site.mjs";

test("production entry rewriting tolerates script attribute order and quote style", () => {
  const source = [
    '<html data-version="__BARBELO_VERSION__">',
    "<script data-purpose='entry' src='src/main.js?v=__BARBELO_VERSION__' type='module'></script>",
    "</html>",
  ].join("\n");

  assert.equal(
    rewriteIndexHtml(source, "abc1234"),
    [
      '<html data-version="abc1234">',
      '<script defer src="assets/barbelo.js?v=abc1234"></script>',
      "</html>",
    ].join("\n"),
  );
});

test("production entry rewriting rejects missing and duplicate source entries", () => {
  assert.throws(
    () => rewriteIndexHtml("<html></html>", "dev"),
    /Expected one source entry.*found 0/,
  );

  const entry = '<script type="module" src="src/main.js?v=__BARBELO_VERSION__"></script>';
  assert.throws(
    () => rewriteIndexHtml(`${entry}\n${entry}`, "dev"),
    /Expected one source entry.*found 2/,
  );
});
