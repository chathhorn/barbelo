# Architecture

Barbelo is a static webapp: ES modules served as-is during development and
bundled by the checked `tools/build-site.mjs` command for GitHub Pages. The
analysis core is
dependency-free and DOM-free; the UI layer renders HTML strings from its output
into `index.html`'s fixed skeleton.

The Bridge Simulator is a separate local package under
`packages/bridge-simulator/`. It owns its generic coaching content, rules,
runtime, styles, original assets, and pinned Three.js build. None of those
files are eagerly loaded with the analyzer.

## Data flow

```
files (.pbn / .BWS / .csv)
  -> src/parsers/          pbn.js, bws.js, csv.js   (raw records, no scoring)
  -> src/core/             buildAnalysis (boards.js)
                           buildResultsAnalysis (results.js)
  -> report engine         buildPairImprovementReport (core/report.js)
  -> src/ui/ templates     dashboard, chartsView, boardsView, reportView, csvExport
  -> DOM                   innerHTML into the panels declared in index.html
```

Concretely: `src/ui/io.js` reads and decodes an uploaded file, hands it
to the matching parser, and calls `setCurrentPbn`/`setCurrentResults` in
`src/ui/controller.js`. The controller rebuilds the core analyses,
stores them on the single `STATE` object (`src/ui/state.js`), and runs
`renderAll()`, which repaints every panel from `STATE`. A PBN and a
results file can be loaded in either order; results-only mode uses
`emptyAnalysis()` plus standard dealer/vulnerability cycles inferred
from board numbers.

The shapes passed across these boundaries are documented as JSDoc
typedefs in `src/core/types.js` and type-checked in CI
(`tsc -p jsconfig.json --noEmit`, covering the application entry, analysis,
parsers, and UI). The
simulator package has an independent `jsconfig.json` gate for its generic
content, deterministic core, and dependency-neutral browser modules. Its
Three.js-facing renderer is exercised by the source and built Playwright
gates instead of type-checking the vendored renderer distribution.

## Lazy simulator boundary

No analyzer state crosses into Bridge Simulator. The package does not accept
an analysis, results, report, selected pair, uploaded hand, or readiness flag;
its public boundary is `launch(host, options)`. The eager
`src/ui/simulatorView.js` adapter only owns Barbelo's modal lifecycle, lazy
URLs, deployment version, and close/status callbacks. Whenever the top-left
mark is the ouroboros it can launch the game, including before any file is
loaded. The alternate monad/compass remains static artwork, and the Pair
Improvement Report has no simulator control.

Source development remains no-build. When served from the repository root,
the loader dynamically imports `packages/bridge-simulator/src/index.js` and
loads the package stylesheet and art from the same package directory. Normal
ESM imports then load its deterministic core and vendored Three.js module.
The source tree must be served over local HTTP rather than opened with
`file://`, because module loading, Pointer Lock, WebGL assets, and Web Audio
need a normal browser origin. No application server is involved.

GitHub Pages uses two classic-script IIFE artifacts:

- `_site/assets/barbelo.js` contains the analyzer and the small lifecycle
  loader, but no Bridge Simulator package or Three.js modules.
- `_site/assets/bridge-simulator.js` exposes the lazy
  `BridgeSimulator.launch(host, options)` API and contains the game plus its pinned
  renderer dependency.

The Pages build command copies an explicit application/package asset manifest,
the root and package licenses, the package stylesheet, and
`vendor/three/{LICENSE,VERSION}` into stable paths below `_site`. The host
adapter supplies a same-origin asset base URL, so source and built modes use
the same asset names without a CDN. CI checks both esbuild dependency graphs:
the analyzer bundle must contain none of the package, and every local input to
the simulator bundle must come from the package. It also checks the retained
legal notices, payload budget, ouroboros route, and absent report route.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/main.js` | Entry point: startup wiring and the `window.PBNAnalyzer` console API. |
| `src/core/constants.js` | Shared bridge vocabulary: seats, suits, denominations, tiny lookups. |
| `src/core/cards.js` | Shared normalization and canonical ordering for card holdings. |
| `src/core/format.js` | HTML escaping, number/text formatting, contract glyphs, collection helpers. |
| `src/core/contracts.js` | Contract text normalization, classification, and contract comparisons. |
| `src/core/scoring.js` | Duplicate bridge scoring (Law 77): trick scores, bonuses, penalties, vulnerability. |
| `src/core/boards.js` | Hand evaluation, PBN board normalization, double-dummy access, dealer/vul cycles. |
| `src/core/compatibility.js` | Plausibility checks that a results file belongs to the loaded PBN. |
| `src/core/results.js` | Result-row normalization and scoring, rosters, matchpointing, standings, session summary. |
| `src/core/report.js` | Pair Improvement Report engine: per-pair views, loss ledger, diagnoses, priorities, field context. |
| `src/core/cohorts.js` | Same-contract cohort analyses: bidding scorecard, declared/defended scorecards, overtrick meter. |
| `src/core/exercises.js` | Table Time quiz generator: deterministic, self-checking exercises from the pair's own session. |
| `src/core/types.js` | JSDoc typedefs only; no runtime code. |
| `src/parsers/pbn.js` | PBN text to directives and per-board tag records; deal/par/double-dummy tag parsing. |
| `src/parsers/bws.js` | Bridgemate `.BWS` (Jet3 database) binary scan to raw result and player rows. |
| `src/parsers/csv.js` | Results-CSV parsing with header mapping and RFC-ish quoting. |
| `src/parsers/text.js` | Shared BOM and line-ending normalization for text formats. |
| `src/ui/state.js` | The single mutable `STATE` object and pure view-availability rules. |
| `src/ui/dom.js` | Toast queue, stacked-modal/focus lifecycle, board-jump buttons, deploy-version helpers. |
| `src/ui/terms.js` | Glossary definitions, tooltip annotation, and the tooltip runtime. |
| `src/ui/dashboard.js` | File status, task navigation, metrics, metadata, data quality, import diagnostics. |
| `src/ui/chartsView.js` | SVG charts, notable-board groups, and the pair standings table. |
| `src/ui/boardsView.js` | Board explorer: list, filters, deal diagram, traveler, double dummy, board overlay. |
| `src/ui/reportView.js` | Renders the Pair Improvement Report sections. |
| `src/ui/quizView.js` | Renders and drives the Table Time quiz cards (reveal spine, biscuit jar). |
| `src/ui/simulatorView.js` | Small host adapter for the logo trigger, modal lifecycle, and lazy source/built package loading. |
| `src/ui/csvExport.js` | CSV column definitions per row mode, preview, and download. |
| `src/ui/controller.js` | Load/clear actions and the top-level `renderAll()` render pass. |
| `src/ui/io.js` | File reading and decoding, drag-and-drop, and all DOM event wiring. |
| `index.html` | Static panel skeleton; the UI fills its `id`-addressed containers. |
| `assets/barbelo.css` | All styling, organized in layered sections (tokens → base → views). |
| `packages/bridge-simulator/` | Self-contained generic game package: content, core simulation, browser runtime, styles, art, package docs/license, and vendored Three.js. |
| `packages/bridge-simulator/src/assets.js` | Frozen deployable-art manifest shared by the renderer preloader and reproducible site build. |
| `packages/bridge-simulator/src/content.js` | Fixed generic auction, declarer-play, and defense coaching mission; contains no application/session inputs. |
| `packages/bridge-simulator/src/index.js` | Package entry exposing `launch(host, options)`. |
| `packages/bridge-simulator/src/core/object.js` | Serializable cloning and cycle-safe deep freezing for authored data. |
| `packages/bridge-simulator/src/runtime/{capability,settings}.js` | FPS preflight and package-owned preference boundaries. |
| `packages/bridge-simulator/test/` | Package-local unit coverage for generic content, rules, authored geometry, and renderer helpers. |
| `test/` | `node --test` suite, golden fixtures, and opt-in Playwright/real-Safari harnesses. |
| `test/fixtures/app-session.mjs` | Committed synthetic PBN/BWS session shared by full-pipeline and browser regression gates. |
| `test/e2e/simulator-harness.js` | Shared static server, browser selection, diagnostics, and assertion reporting for browser harnesses. |
| `tools/generate-golden-fixtures.mjs` | Regenerates the mandatory synthetic golden and any available real-session goldens. |
| `tools/build-site.mjs` | Builds and verifies the versioned Pages artifact and lazy package boundary. |

## Invariants worth knowing

- **Scores are stored NS-perspective.** `scoreDuplicateContract` returns
  `scoreNS` (negated `scoreDeclarer` when EW declared), and every
  downstream field (`parNS`, `vsParNS`, board summaries, charts) keeps
  that convention. The EW score is always `-scoreNS`; per-side views
  (`sideScore`, `pairResultView`) negate at the edge, never in storage.

- **Matchpoints use the American 1 / 0.5 convention.** In
  `applyMatchpoints`, each scored row earns 1 MP per same-field scored
  row it beats and 0.5 per tie, so the board top is
  `scored results - 1`. Rows are compared within their `fieldKey` group:
  the board number, prefixed with the section in multi-section events,
  so boards are matchpointed within each section.

- **Participant keys encode the pairing mode.** In plain pair mode the
  key is the pair number as a string (`"4"`). When the same numbers sit
  both directions (team-like rosters, or a Mitchell-style NS/EW
  collision detected by `detectSidePairCollision`), each direction is a
  separate partnership: `"4:NS"` / `"4:EW"`. Multi-section events prefix
  the section (`"S2:4"`, side mode `"S2:4:EW"`). `PairStanding.key`,
  `ResultRow.nsParticipantKey`/`ewParticipantKey`, and the report's
  `participantKey` all use this format and must stay comparable as
  strings.

- **Director adjustments become percentage awards.** A Remarks value
  like `40%-60%`, `AVE`, `A+`, or `A-/A+` (`parseScoreAdjustment`) sets
  `row.adjustment` instead of a score. Such rows get
  `adjustment.percent / 100 × top` matchpoints but have `scoreNS ==
  null`, so they are excluded from score comparisons: they do not shape
  the board top, field averages, travelers' score ranks, or the
  report's peer-loss ledger (review candidates skip adjusted rows).

- **Erased rows are excluded from scoring.** BWS rows with the `Erased`
  flag (score corrections) are parsed, counted in diagnostics, and then
  filtered out before matchpointing.

- **The BWS parser is a Jet3 row cracker, not a heuristic scraper.**
  `crackJet3Row` mirrors mdbtools' `mdb_crack_row3()`: page walk, row
  directory flags (0x8000 lookup rows read, 0x4000 deleted rows
  skipped), variable-column offset/jump tables, and the null bitmask
  whose bits are the values of boolean columns. Column layouts for
  ReceivedData and PlayerNumbers are documented in `src/parsers/bws.js`
  and validated field-for-field against `mdb-export` ground truth
  (`test/bws-parser.test.mjs` and its `01-receiveddata.json` snapshot).
  Jet4 (Access 2000+) files are detected and rejected with guidance.

- **Golden fixtures lock the whole pipeline.**
  `test/golden/synthetic-session.test.mjs` always snapshots the committed
  synthetic BWS/PBN session through parsing, join, matchpoints, standings,
  improvement reports, and Table Time exercises. Optional real-session tests
  cover the same path when the ignored `samples/` directory is present. Both
  compare against `test/golden/fixtures/*.json` with `deepEqual`, so numeric
  drift fails visibly. Run `node tools/generate-golden-fixtures.mjs` only for
  intentional pipeline behavior changes; it always rewrites the synthetic
  fixture and also rewrites any real fixtures whose local samples are present.
  Review fixture diffs like code.
