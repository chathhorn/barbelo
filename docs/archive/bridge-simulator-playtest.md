# Bridge Simulator Finalization Playtest

Status: not yet run. The Pair Improvement Report launch was authorized separately on 2026-07-12; this protocol remains the outstanding structured human release-readiness gate.

Use this protocol for the Phase 8 decision in [bridge-simulator-plan.md](bridge-simulator-plan.md). Keep the raw notes local; do not commit participant names or uploaded session data.

## Gate summary

Recruit at least five people who have not watched development or a prior run. The gate passes only when:

- At least four of five can state the three-slip/vault objective without a hint.
- At least four of five finish without facilitator help.
- Median first-run completion time is 8–12 minutes.
- No more than one person calls Shuffle, chalkboards, or boss duration a major pacing blocker.
- All five understand that Honor Reclaimed is fictional and does not restore real matchpoints.
- The real-Safari/macOS keyboard-turn run and the named real-hardware performance checks below pass.

Do not coach controls beyond what the preflight and Help screens say. Record a hint as facilitator help even if it seems minor.

## Local facilitator setup

1. From the repository root, serve the source tree over loopback HTTP, for example:

   ```sh
   python3 -m http.server 8000 --bind 127.0.0.1
   ```

   Then open `http://127.0.0.1:8000/`.
2. Open the analyzer, load the intended PBN/results, and select the pair to test.
3. Confirm the Pair Improvement Report contains the Bridge Simulator launch control directly below Table Time.
4. Have the participant activate **Bridge Simulator — reclaim your matchpoints ›**. The current pair/session remains in memory and is not placed in a URL.
5. Use a fresh browser profile or clear only `barbelo.bridgeSimulator.settings.v1` between participants so saved Skip Tutorial, input, or Reduced Effects choices do not bias the next run.

Use at least two materially different selected pairs across the five runs. Include one results-only/Practice Deck run if that is a supported launch case for the intended release.

## Participant script

Say only:

> This is a local game prototype based on the selected pair's bridge report. Please start in Standard mode, play until you reach the end or decide you cannot continue, and think aloud when something is unclear. Everything you need should be on screen; I will not answer gameplay questions during the run.

After the run, ask these questions without suggesting answers:

1. What was the main mission objective?
2. What did the three coaching checkpoints represent?
3. What did Honor Reclaimed mean? Did it change the pair's real matchpoints?
4. Was Shuffle, any chalkboard, or the boss a major pacing problem?
5. What was the first point where you did not know what to do?
6. Did the session-based coaching feel specific to this pair? Name one example if so.

## Run record

Copy this table once per participant. Use an anonymous ID only.

| Field | Observation |
| --- | --- |
| Participant ID | |
| Date / pair key / results-only? | |
| Browser + exact version | |
| Hardware / viewport / zoom | |
| Standard + Keyboard Look? | |
| Start time / finish-or-stop time | |
| Stated three-slip/vault objective without hint? | Yes / No |
| Finished without facilitator help? | Yes / No |
| Hints or interventions | |
| Death/reset count | |
| Help/pause/Reduced Effects use | |
| Shuffle major blocker? | Yes / No + note |
| Chalkboard major blocker? | Yes / No + note |
| Boss duration major blocker? | Yes / No + note |
| Correctly separated Honor from matchpoints? | Yes / No + verbatim summary |
| Personalized coaching example recalled | |
| First confusion / softlock / defect | |
| Observer notes | |

## Real Safari gate

Run at least one full Standard mission on real Safari 26.5.2 under macOS 26.5.2, not only Playwright WebKit. Select Keyboard Look before Start and never grant Pointer Lock.

Verify:

- WASD movement, arrow turning, Space/click throw, E/Enter interact, Help, Pause, Resume, Mute, and Exit.
- The three coaching wings, live remaining-opponent cue, slips, vault, boss, visible final exit, and debrief.
- One outer modal root, contained keyboard focus, readable semantic overlays at 960×540 CSS pixels, and restored focus on close.
- At a 200% zoom-equivalent viewport below 960×540, Standard/Practice disable and the complete Coach-only route remains readable.
- No console errors, third-party/data-bearing requests, Pointer Lock dependency, or cleanup residue.

The dependency-free `test/e2e/simulator-safari.js` smoke can catch basic Safari regressions once Safari Remote Automation is enabled, but it does not replace this observed full run. The 2026-07-12 attempt stopped cleanly because **Develop → Allow Remote Automation** was disabled; no system setting was changed.

## Real-hardware performance gate

Named candidate baseline:

- MacBook Pro `Mac16,5`
- Apple M4 Max, 14-core CPU / 32-core GPU
- 36 GB RAM
- macOS 26.5.2

On a headed production build with a cold browser cache, record:

- Time from activation to ready preflight; target at most 2 seconds.
- Required simulator payload; current automated measurement is 1,510,309 bytes, target at most 3 MiB.
- At least 60 seconds of active gameplay in an ordinary room and the boss arena; target sustained 60 rendered FPS at the low internal resolution and fewer than 100 draw calls.
- Browser/WebGL renderer strings, exact browser version, viewport, display refresh rate, and whether Reduced Effects was offered.
- A spot check on one slower supported desktop, including whether the explicit Reduced Effects offer appears and resumes the same run without changing combat.

Headless measurements are diagnostic only. Run both headed production scenes and retain their JSON output with the local playtest notes:

```sh
PLAYWRIGHT_BROWSER=chromium SERVE_ROOT=_site \
  SIMULATOR_HEADED=1 SIMULATOR_ENFORCE_PERF=1 \
  SIMULATOR_BASELINE_SCENE=ordinary SIMULATOR_SAMPLE_MS=30000 \
  node test/e2e/simulator-production-baseline.js

PLAYWRIGHT_BROWSER=chromium SERVE_ROOT=_site \
  SIMULATOR_HEADED=1 SIMULATOR_ENFORCE_PERF=1 \
  SIMULATOR_BASELINE_SCENE=boss SIMULATOR_SAMPLE_MS=30000 \
  node test/e2e/simulator-production-baseline.js
```

The 2026-07-12 named-baseline run passed both scenes on Chromium 149.0.7827.55 with hardware WebGL2 over Metal. Ordinary gameplay recorded a 621.8 ms cold preflight, 120 FPS, 8.9 ms p95, and 34 draw calls. The boss arena recorded 120.3 FPS, 9.2 ms p95, and 36 draw calls. Neither scene triggered Reduced Effects. The required slower-device spot check remains open.

## Finalization decision

Summarize aggregate counts and the median time, list every defect found, and explicitly choose one:

- **Not release-ready:** keep the launch available only under the current product decision, record the blockers, and return to implementation/playtesting.
- **Release-ready:** all acceptance criteria pass and the remaining manual gates can be marked complete.
