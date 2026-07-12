# Tests

Run the suite from the repo root with:

```sh
node --test
```

No dependencies are needed (Node 20+; the suite uses the built-in `node:test`
runner). Note that `node --test test/` does not work on some Node versions —
use the bare form above.

## Layout

| Path | What it covers |
|---|---|
| `test/*.test.mjs` | Unit tests importing `src/` modules directly (scoring sweep vs an independent reference scorer, loss-classification matrix, matchpoints/identity, report engine, parsers, formatting, template HTML) |
| `test/golden/` | Golden-master tests: the full pipeline must reproduce committed snapshots for the three sample sessions. After an **intentional** behavior change, regenerate with `node tools/generate-golden-fixtures.mjs` |
| `test/integration/` | Boots the real entry (`src/main.js`) against DOM stubs via `test/helpers/load-app.js` and checks the public API wiring |
| `test/e2e/` | Real-browser checks (need Chromium via Playwright, not run by `node --test`): `node test/e2e/smoke.js` (17 functional checks; set `SERVE_ROOT` to a built `_site` to test the CI bundle) and `node test/e2e/a11y.js` (13 accessibility checks) |
| `test/helpers/` | The DOM-stub app loader, synthetic Jet3 BWS fixture builder, reference scorer, golden snapshotter |

Tests that need the real sample files in `samples/` (golden masters, BWS
ground truth) skip automatically when that directory is absent, so the suite
passes in CI where samples are not checked in.
