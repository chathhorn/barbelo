# Architecture

Barbelo is a static webapp: ES modules served as-is during development, bundled
by esbuild only in CI for the GitHub Pages deploy.  The analysis core is
dependency-free and DOM-free; the UI layer renders HTML strings from its output
into `index.html`'s fixed skeleton.

The Bridge Simulator is an intentionally isolated runtime exception. Its
scenario and rules remain dependency-free, while its renderer uses one pinned,
locally vendored Three.js build. Three.js, game code, simulator styles, and
simulator assets are not eagerly loaded with the analyzer.

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
(`tsc -p jsconfig.json --noEmit`, covering `src/core` and `src/parsers`).

## Lazy simulator boundary

The selected pair's `{ analysis, results, report }` snapshot crosses a narrow
loader boundary in `src/ui/simulatorView.js`. The loader retains those inputs
but does not import the scenario builder, simulation, renderer, or Three.js.
Only an explicit development harness or, after finalization, the report launch
control asks it to load the game. There is deliberately no visible Pair
Improvement Report launch control yet.

Source development remains no-build. When served from the repository root,
the loader dynamically imports `src/simulator/index.js`; normal ESM imports
then load the dependency-free simulator core and the vendored Three.js module.
The source tree must be served over local HTTP rather than opened with
`file://`, because module loading, Pointer Lock, WebGL assets, and Web Audio
need a normal browser origin. No application server is involved.

GitHub Pages uses two classic-script IIFE artifacts:

- `_site/assets/barbelo.js` contains the analyzer and the small lifecycle
  loader, but no `src/simulator`, `src/core/simulator`, or Three.js modules.
- `_site/assets/bridge-simulator.js` exposes the lazy
  `BridgeSimulator.launch(...)` API and contains the game plus its pinned
  renderer dependency.

The Pages build recursively copies `assets/simulator/`, the separately loaded
`assets/simulator.css`, and `vendor/three/{LICENSE,VERSION}` into the same
paths below `_site`. The simulator receives a same-origin asset base URL from
the loader, so source and built modes resolve the same asset names without a
CDN. Uploaded session data stays in memory and is passed directly into
`launch`; it is never placed in a URL or sent over the network. CI checks the
two esbuild dependency graphs, retained legal notice, copied assets/licenses,
and the still-absent report launch route.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/main.js` | Entry point: startup wiring and the `window.PBNAnalyzer` console API. |
| `src/core/constants.js` | Shared bridge vocabulary: seats, suits, denominations, tiny lookups. |
| `src/core/format.js` | HTML escaping, number/text formatting, contract glyphs, collection helpers. |
| `src/core/contracts.js` | Contract text normalization, classification, and contract comparisons. |
| `src/core/scoring.js` | Duplicate bridge scoring (Law 77): trick scores, bonuses, penalties, vulnerability. |
| `src/core/boards.js` | Hand evaluation, PBN board normalization, double-dummy access, dealer/vul cycles. |
| `src/core/compatibility.js` | Plausibility checks that a results file belongs to the loaded PBN. |
| `src/core/results.js` | Result-row normalization and scoring, rosters, matchpointing, standings, session summary. |
| `src/core/report.js` | Pair Improvement Report engine: per-pair views, loss ledger, diagnoses, priorities, field context. |
| `src/core/cohorts.js` | Same-contract cohort analyses: bidding scorecard, declared/defended scorecards, overtrick meter. |
| `src/core/exercises.js` | Table Time quiz generator: deterministic, self-checking exercises from the pair's own session. |
| `src/core/simulator/` | Dependency-free deterministic scenario, level, collision, and combat rules for the simulator. |
| `src/core/types.js` | JSDoc typedefs only; no runtime code. |
| `src/parsers/pbn.js` | PBN text to directives and per-board tag records; deal/par/double-dummy tag parsing. |
| `src/parsers/bws.js` | Bridgemate `.BWS` (Jet3 database) binary scan to raw result and player rows. |
| `src/parsers/csv.js` | Results-CSV parsing with header mapping and RFC-ish quoting. |
| `src/ui/state.js` | The single mutable `STATE` object and pure view-availability rules. |
| `src/ui/dom.js` | Toast queue, hidden-class toggles, board-jump buttons, deploy-version helpers. |
| `src/ui/terms.js` | Glossary definitions, tooltip annotation, and the tooltip runtime. |
| `src/ui/dashboard.js` | File status, task navigation, metrics, metadata, data quality, import diagnostics. |
| `src/ui/chartsView.js` | SVG charts, notable-board groups, and the pair standings table. |
| `src/ui/boardsView.js` | Board explorer: list, filters, deal diagram, traveler, double dummy, board overlay. |
| `src/ui/reportView.js` | Renders the Pair Improvement Report sections. |
| `src/ui/quizView.js` | Renders and drives the Table Time quiz cards (reveal spine, biscuit jar). |
| `src/ui/simulatorView.js` | Small, eager lifecycle bridge that prepares session inputs and lazy-loads the source module or built simulator IIFE. |
| `src/ui/csvExport.js` | CSV column definitions per row mode, preview, and download. |
| `src/ui/controller.js` | Load/clear actions and the top-level `renderAll()` render pass. |
| `src/ui/io.js` | File reading and decoding, drag-and-drop, and all DOM event wiring. |
| `index.html` | Static panel skeleton; the UI fills its `id`-addressed containers. |
| `assets/barbelo.css` | All styling, organized in layered sections (tokens → base → views). |
| `src/simulator/` | Lazy game presentation/runtime entry, renderer adapter, input, audio, sprites, and level meshes. |
| `assets/simulator.css` | Lazily loaded, simulator-scoped overlay and game styling. |
| `assets/simulator/` | Original same-origin simulator sprites, textures, effects, and attribution record. |
| `vendor/three/` | Pinned Three.js ESM source plus upstream MIT license and provenance/version record. |
| `test/` | `node --test` suite plus golden fixtures; no dependencies. |
| `tools/generate-golden-fixtures.mjs` | Regenerates the golden fixtures from `samples/`. |

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

- **Golden fixtures lock the whole pipeline.** For each sample session,
  `test/golden/sessions.test.mjs` snapshots BWS parse → join →
  matchpoints → standings → improvement report and compares against
  `test/golden/fixtures/*.json` with `deepEqual`. Any numeric drift is
  a test failure. Regenerate fixtures with
  `node tools/generate-golden-fixtures.mjs` only for intentional
  behavior changes, and review the fixture diff like code. (These tests
  skip when the untracked `samples/` directory is absent.)
