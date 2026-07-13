# Tests

Run the suite from the repo root with:

```sh
npm test
```

The core Node suite itself has no runtime dependencies (Node 22+; it uses the
built-in `node:test` runner). The standard development setup is `npm ci`
followed by `npm test`, although the unit suites do not import any npm package.
The npm script intentionally selects `*.test.mjs` files; a bare `node --test`
would also discover the executable browser harnesses under `test/e2e/`. Those
harnesses are run explicitly as documented below and require Playwright plus
an installed browser.

## Layout

| Path | What it covers |
|---|---|
| `test/*.test.mjs` | Analyzer unit tests importing `src/` modules directly (scoring sweep vs an independent reference scorer, loss-classification matrix, matchpoints/identity, report engine, parsers, formatting, template HTML) |
| `test/unit/` | Focused tests for small shared parser/core utilities. |
| `packages/bridge-simulator/test/` | Simulator package unit tests for its generic content, deterministic engine, level, renderer adapter, and performance monitor |
| `test/golden/` | Golden-master tests: a committed synthetic session always exercises the full pipeline, while three optional real sessions guard field compatibility. After an **intentional** pipeline behavior change, regenerate with `node tools/generate-golden-fixtures.mjs` and review every fixture diff. |
| `test/integration/` | Boots the real entry (`src/main.js`) against DOM stubs via `test/helpers/load-app.js` and checks the public API wiring |
| `test/e2e/` | Real-browser checks through a shared local-server/browser harness. Simulator source/built scripts support Chromium, Firefox, and WebKit; general app smoke/a11y default to Chromium. |
| `test/fixtures/` | The committed synthetic PBN/BWS session shared by full-pipeline and browser checks. |
| `test/helpers/` | The DOM-stub app loader, synthetic Jet3 BWS fixture builder, reference scorer, and golden snapshotter. |

The synthetic golden, smoke, and accessibility checks never depend on private
sample data and run in CI. Additional tests that compare against real files in
`samples/` skip when those ignored files are absent.

## Bridge Simulator browser test

From the repository root, install the lockfile's exact development tools and
the three Playwright browser builds, then run the source simulator harness once
per browser:

```sh
npm ci --ignore-scripts
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
that the visible preflight immediately updates the single Start! action while
keeping the Coach's clipboard and Settings available.
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
game progress.

On Debian/Ubuntu, use the following browser-install command if the required
system libraries are not already present (it may request elevated privileges):

```sh
npx --no-install playwright install --with-deps chromium firefox webkit
```

`PLAYWRIGHT_BROWSER` accepts `chromium`, `firefox`, or `webkit` and defaults to
`chromium` when omitted. Playwright `1.61.1` currently resolves those to
Chromium v1228, Firefox v1532, and WebKit v2311, respectively.

The script starts its own static server on an ephemeral loopback port and opens
the generic simulator from an otherwise empty app. It exercises source-mode
package loading, the preflight clipboard and Settings flows, keyboard play,
the live minimap, early shuffle, all three coaching checkpoints, the
boss/debrief, failure recovery, the compact disabled-Start route, renderer
draw-call budget, cleanup, and same-origin requests.
A passing run ends with `SIMULATOR E2E PASSED (<browser>)`. To retain a
gameplay screenshot from the run:

```sh
PLAYWRIGHT_BROWSER=firefox SIMULATOR_SCREENSHOT=/tmp/bridge-simulator-firefox.png node test/e2e/simulator.js
```

CI installs the same lockfile, verifies Playwright `1.61.1`, and runs Chromium
and WebKit legs. Each leg installs only its selected browser, runs the focused
responsive and slow-frame gates plus the full source harness, builds both
production IIFEs with the same command used for deployment, and runs
`test/e2e/simulator-built.js` against that generated static site. Firefox
remains supported by the local harnesses, but the GPU-less GitHub Ubuntu runner
exposes no Firefox WebGL context even with `webgl.force-enabled`; CI therefore
leaves that renderer leg disabled instead of treating missing runner hardware
as an application failure. Separate failure-path coverage verifies that
unavailable WebGL leaves an explanatory preflight with Start! disabled and
Settings accessible. To run the built gate locally:

```sh
npm run build
PLAYWRIGHT_BROWSER=chromium SERVE_ROOT=_site node test/e2e/simulator-built.js
PLAYWRIGHT_BROWSER=firefox SERVE_ROOT=_site node test/e2e/simulator-built.js
PLAYWRIGHT_BROWSER=webkit SERVE_ROOT=_site node test/e2e/simulator-built.js
```

When upgrading Playwright, update the exact manifest dependency, lockfile,
workflow version check, and recorded browser versions together.

The Pair Improvement Report does not expose or configure the simulator. The
randomized top-left ouroboros is a launch button even before files are loaded;
the monad/compass remains non-interactive. Source and built tests exercise that
blank-app route, verify the package payload stays lazy until activation, and
check variant gating plus modal/focus cleanup. Package unit tests verify that
the fixed coaching scenario contains no pair, report, PBN, results, or session
fields. The full source harness also imports the host lifecycle adapter for
lower-level game states that would be unnecessarily slow to reach through the
UI.

The existing app browser checks remain available separately:

```sh
node test/e2e/smoke.js
node test/e2e/a11y.js
```

Set `SERVE_ROOT=_site` when running `smoke.js` against a prepared Pages build.

## Real Safari smoke on macOS

The dependency-free real-Safari harness is intentionally opt-in because it
opens the installed Safari application. On macOS, enable Safari's developer
features and **Develop → Allow Remote Automation**, then run:

```sh
SIMULATOR_REAL_SAFARI=1 node test/e2e/simulator-safari.js
```

The harness starts `safaridriver` and a loopback source server, records the real
Safari version/user agent, selects the ouroboros on an empty app, and opens the
generic package through its real logo control before using its internal
lifecycle for focused game states. It smoke-tests
WebGL preflight, launch focus restoration, the clipboard/Settings flow,
Keyboard Look movement and arrow turning without Pointer Lock, cleanup,
same-origin requests, settings-only persistence, and captured console/page
errors. It deletes the
WebDriver session and terminates the driver and server on success or failure.

The command clearly self-skips when it is not explicitly opted in, when run
off macOS, when `safaridriver` is unavailable, or when Safari Remote Automation
is disabled. It installs no package and is not part of CI.

This automated smoke is not the required human real-Safari gate. Finalization
still needs a person to complete and assess the mission in Safari—including
control feel, keyboard-turn fallback, audio/captions, readability, performance,
and comfort—on the recorded macOS hardware/browser baseline.
