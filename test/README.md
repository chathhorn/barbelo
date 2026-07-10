# Tests

Run the suite from the repo root with:

```sh
node --test
```

No dependencies are needed (Node 20+; the suite uses the built-in `node:test`
runner). Note that `node --test test/` does not work on some Node versions —
use the bare form above or `node --test test/*.test.js`.

The tests load the real browser bundles (`assets/pbn-parser.js`,
`assets/bws-parser.js`, `assets/barbelo.js`) into a Node `vm` context with a
stub DOM via `test/helpers/load-app.js`, so they exercise the exact shipped
code. `test/helpers/bws-fixture.js` builds synthetic Jet3 `.BWS` byte buffers
for the binary-parser tests.

Tests that need the real sample files in `samples/` skip automatically when
that directory is absent.
