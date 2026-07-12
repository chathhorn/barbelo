# Tests

Run the suite from the repo root with:

```sh
node --test
```

No dependencies are needed for the core Node suite (Node 20+; it uses the
built-in `node:test` runner). Note that `node --test test/` does not work on
some Node versions — use the bare form above. Browser scripts discovered by
that command self-skip when Playwright is absent; running their explicit gates
below requires Playwright and at least one installed browser.

## Layout

| Path | What it covers |
|---|---|
| `test/*.test.mjs` | Unit tests importing `src/` modules directly (scoring sweep vs an independent reference scorer, loss-classification matrix, matchpoints/identity, report engine, parsers, formatting, template HTML) |
| `test/golden/` | Golden-master tests: the full pipeline must reproduce committed snapshots for the three sample sessions. After an **intentional** behavior change, regenerate with `node tools/generate-golden-fixtures.mjs` |
| `test/integration/` | Boots the real entry (`src/main.js`) against DOM stubs via `test/helpers/load-app.js` and checks the public API wiring |
| `test/e2e/` | Real-browser checks through Playwright. Simulator source/built harnesses support Chromium, Firefox, and WebKit; the existing general app smoke/a11y scripts remain Chromium checks. |
| `test/helpers/` | The DOM-stub app loader, synthetic Jet3 BWS fixture builder, reference scorer, golden snapshotter |

Tests that need the real sample files in `samples/` (golden masters, BWS
ground truth) skip automatically when that directory is absent, so the suite
passes in CI where samples are not checked in.

## Bridge Simulator browser test

From the repository root, install the pinned Playwright package and its three
browser builds, then run the source simulator harness once per browser. The npm
manifest and lockfile remain intentionally untracked because browser tooling is
development and CI-only:

```sh
npm install --no-save --package-lock=false --ignore-scripts playwright@1.61.1
npx --no-install playwright install chromium firefox webkit
PLAYWRIGHT_BROWSER=chromium node test/e2e/simulator.js
PLAYWRIGHT_BROWSER=firefox node test/e2e/simulator.js
PLAYWRIGHT_BROWSER=webkit node test/e2e/simulator.js
```

The focused resize/zoom capability gate uses the same browser selector:

```sh
PLAYWRIGHT_BROWSER=chromium node test/e2e/simulator-responsive.js
PLAYWRIGHT_BROWSER=firefox node test/e2e/simulator-responsive.js
PLAYWRIGHT_BROWSER=webkit node test/e2e/simulator-responsive.js
```

It crosses the 960×540 CSS-pixel threshold in both directions and verifies
that the visible preflight immediately updates Standard/Practice availability.
An FPS run that was already active is deliberately preserved after a later
compact resize: resize/zoom does not erase progress or tear down WebGL in the
middle of play. The newly measured capability applies when the player next
returns to preflight or attempts another launch.

The sustained slow-frame offer has a separate deterministic gate:

```sh
PLAYWRIGHT_BROWSER=chromium node test/e2e/simulator-performance.js
PLAYWRIGHT_BROWSER=firefox node test/e2e/simulator-performance.js
PLAYWRIGHT_BROWSER=webkit node test/e2e/simulator-performance.js
```

It feeds measured frame samples directly rather than depending on host-machine
load. A frame qualifies only while the run is active and visible, between
41.7 ms and 200 ms. The offer requires 90 consecutive qualifying frames and at
least four accumulated seconds; normal frames, pauses, hidden tabs, and large
resume stalls reset the streak. The offer appears at most once per run. Both
actions resume the identical simulation state, and enabling Reduced Effects
persists only the existing `reducedEffects` preference—never frame history or
game/session data.

On Debian/Ubuntu, use the following browser-install command if the required
system libraries are not already present (it may request elevated privileges):

```sh
npx --no-install playwright install --with-deps chromium firefox webkit
```

`PLAYWRIGHT_BROWSER` accepts `chromium`, `firefox`, or `webkit` and defaults to
`chromium` when omitted. Playwright `1.61.1` currently resolves those to
Chromium v1228, Firefox v1532, and WebKit v2311, respectively.

The script starts its own static server on an ephemeral loopback port, loads
synthetic PBN/results through the real app, and exercises source-mode loading,
Coach-only coaching, keyboard play, all three checkpoints, the boss/debrief,
failure recovery, the compact/results-only Coach-only route, renderer draw-call
budget, cleanup, and same-origin requests.
A passing run ends with `SIMULATOR E2E PASSED (<browser>)`. To retain a
gameplay screenshot from the run:

```sh
PLAYWRIGHT_BROWSER=firefox SIMULATOR_SCREENSHOT=/tmp/bridge-simulator-firefox.png node test/e2e/simulator.js
```

CI performs the same ephemeral pinned install, verifies Playwright `1.61.1`,
and runs three parallel browser legs. Each leg installs only its selected
browser, runs the focused responsive and slow-frame gates plus the full source
harness, builds both production IIFEs, and runs `test/e2e/simulator-built.js`
against the generated static site. To run the built gate locally after
preparing `_site` with the Pages workflow commands:

```sh
PLAYWRIGHT_BROWSER=chromium SERVE_ROOT=_site node test/e2e/simulator-built.js
PLAYWRIGHT_BROWSER=firefox SERVE_ROOT=_site node test/e2e/simulator-built.js
PLAYWRIGHT_BROWSER=webkit SERVE_ROOT=_site node test/e2e/simulator-built.js
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
