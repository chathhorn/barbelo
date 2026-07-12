# Tests

Run the suite from the repo root with:

```sh
node --test
```

No dependencies are needed for the core Node suite (Node 20+; it uses the
built-in `node:test` runner). Note that `node --test test/` does not work on
some Node versions — use the bare form above. Browser scripts discovered by
that command self-skip when Playwright is absent; running their explicit gates
below requires Playwright and Chromium.

## Layout

| Path | What it covers |
|---|---|
| `test/*.test.mjs` | Unit tests importing `src/` modules directly (scoring sweep vs an independent reference scorer, loss-classification matrix, matchpoints/identity, report engine, parsers, formatting, template HTML) |
| `test/golden/` | Golden-master tests: the full pipeline must reproduce committed snapshots for the three sample sessions. After an **intentional** behavior change, regenerate with `node tools/generate-golden-fixtures.mjs` |
| `test/integration/` | Boots the real entry (`src/main.js`) against DOM stubs via `test/helpers/load-app.js` and checks the public API wiring |
| `test/e2e/` | Real-browser checks using Chromium through Playwright, including app smoke/a11y coverage and source/built Bridge Simulator harnesses. They self-skip when their browser or built-site prerequisite is absent. |
| `test/helpers/` | The DOM-stub app loader, synthetic Jet3 BWS fixture builder, reference scorer, golden snapshotter |

Tests that need the real sample files in `samples/` (golden masters, BWS
ground truth) skip automatically when that directory is absent, so the suite
passes in CI where samples are not checked in.

## Bridge Simulator browser test

From the repository root, install the pinned Playwright package and its
Chromium browser, then run the simulator script directly. The npm manifest and
lockfile remain intentionally untracked because browser tooling is development
and CI-only:

```sh
npm install --no-save --package-lock=false --ignore-scripts playwright@1.61.1
npx --no-install playwright install chromium
node test/e2e/simulator.js
```

On Debian/Ubuntu, use the following browser-install command if the required
system libraries are not already present (it may request elevated privileges):

```sh
npx --no-install playwright install --with-deps chromium
```

The script starts its own static server on an ephemeral loopback port, loads
synthetic PBN/results through the real app, and exercises source-mode loading,
Coach-only coaching, keyboard play, all three checkpoints, the boss/debrief,
failure recovery, renderer draw-call budget, cleanup, and same-origin requests.
A passing run ends with `SIMULATOR E2E PASSED`. To retain a gameplay screenshot
from the run:

```sh
SIMULATOR_SCREENSHOT=/tmp/bridge-simulator.png node test/e2e/simulator.js
```

CI performs the same ephemeral pinned install, verifies Playwright `1.61.1`,
installs only Chromium, and additionally builds both production IIFEs and runs
`test/e2e/simulator-built.js` against a generated static site. To run that gate
locally after preparing `_site` with the Pages workflow commands:

```sh
SERVE_ROOT=_site node test/e2e/simulator-built.js
```

When upgrading Playwright, update both explicit version references and the CI
version check together.

The Pair Improvement Report launch control remains intentionally absent until
the simulator is finalized. This test asserts that absence, then imports the
internal simulator lifecycle module directly as a development harness; passing
the test does not expose a user-facing launch path.

The existing app browser checks remain available separately:

```sh
node test/e2e/smoke.js
node test/e2e/a11y.js
```

Set `SERVE_ROOT=_site` when running `smoke.js` against a prepared Pages build.
