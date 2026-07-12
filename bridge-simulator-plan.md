# Bridge Simulator: Product and Implementation Plan

Status: unlinked implementation candidate. The renderer, deterministic scenario adapter, authored level, simulation, Coach/coaching UI, source and production lazy bundles, accessibility paths, and automated Chromium/Firefox/WebKit gates are implemented. Phase 8 finalization still requires Standard-mode balance evidence, the structured human playtest, real-device performance, and the real-Safari manual gate below, so no visible Pair Improvement Report launch control has been added.

Implementation checkpoint (2026-07-12):

- The complete 12-space, three-wing level, three secrets, 20 ordinary opponents, timed lift shortcut, boss, visible/proximity-cued exit, Standard/Practice/Coach-only modes, and two-part debrief are present.
- The fixed 35 Hz simulation covers deterministic movement/AI, nearest-impact card combat, held fire, bounded Shuffle, checkpoints without Honor farming, System Notes, lifts, arena containment, and full cleanup.
- Original simulator art, procedural audio, captions, semantic coaching overlays, reduced effects, high contrast, keyboard fallback, Pointer Lock failure handling, and context-loss recovery are present.
- A deterministic Practice bot completes the real map through movement, portals, lift timing, combat, all slips/secrets, boss, and exit without state teleports; it visits all 12 spaces and earns the exact 5,250 Honor total.
- Pure/core, source-browser, resize/zoom, load-failure, complete-mission, and built-IIFE browser gates use committed synthetic data and keep all requests same-origin. The 2026-07-12 local gate used Playwright 1.61.1 with Chromium 149.0.7827.55, Firefox 151.0, and WebKit 26.5; macOS 26.5.2 reports real Safari 26.5.2, whose manual gate remains pending.
- The report loader prepares current pair/session inputs, but the launch control remains intentionally absent pending the explicit finalization decision.

Working subtitle: **The Lost Matchpoints**

## 1. Executive decision

Build Bridge Simulator as an original, one-level, 1990s-style 2.5-D browser FPS that runs in a full-viewport overlay inside Barbelo. It should use the selected pair's current report as a deterministic mission seed, but keep the level's underlying topology hand-authored and validated.

The recommended technical direction is:

- A pinned, locally vendored Three.js ESM build, bundled into a separate simulator file and loaded only when the game is launched.
- Original low-resolution textures, sprites, map geometry, names, sounds, music, and UI. Do not copy or convert Doom WAD data, E1M1 geometry, sprites, textures, sounds, music, enemy designs, or logos. Do not incorporate Doom source code; it is outside this feature's scope and would introduce GPL obligations.
- A fixed 35 Hz simulation with a low-resolution WebGL render, billboard actors, limited vertical aim, simple sector lighting, no jumping, no rooms-over-rooms, and no dynamic shadows.
- One authored level with roughly 10-12 primary rooms, three thematic wings, loops, shortcuts, three secrets, 18-25 ordinary enemies, and one boss. A first run should take roughly 8-12 minutes; a repeat run roughly 5-8 minutes.
- A pure, deterministic scenario builder that converts `{ analysis, results, report }` into a small serializable game scenario. Session data changes content, emphasis, signs, encounter skins, featured boards, and coaching; it does not generate the level topology or make a weak session mechanically harder.
- Genuine coaching taken from the existing report engine and, eventually, optional `buildPairExercises()` terminals. The game must not invent a specific bid, lead, or card-play error that the loaded data does not establish.
- A same-page modal lifecycle. A separate page would require explicit serialization and cross-window messaging for the uploaded PBN/results held in memory, with no product benefit for this short experience.
- No backend/server-side application, account, telemetry, remote asset host, or runtime CDN. Local HTTP static serving and GitHub Pages remain sufficient.

This is intentionally not a Doom source port and not a general game engine. It is one polished joke level that happens to be personalized.

## 2. Product premise and tone

The Field has seized the pair's lost matchpoints and locked the traveler in the basement of a sinister convention center. The selected pair must clear three coaching wings, recover three review slips, open the Traveler Vault, defeat **The Bottom Board**, and leave through the **Move for the Next Round** door.

The Border Collie Bridge Coach delivers the opening briefing:

> Pair 6, win back your bridge honor from the filthy opponents. Metaphorically. They're lovely people. Legal insisted.

An early follow-up supplies a real bridge joke and a useful fact:

> The pair across the table is not your true matchpoint enemy. Your scores are compared with the pairs sitting your direction. It is a strange game. Try not to dwell on it.

The violence is abstract and papery:

- Enemies are animated score slips, bidding-box phantoms, overtrick imps, and matchpoint demons.
- Thrown cards knock enemies into loose paper, pencils, and score tickets; there is no gore.
- Defeated enemies are described as having been “sent to the coffee table.”
- Health is **Composure**.
- Armor is **System Notes**: while the meter has points, it absorbs 50% of incoming damage and depletes by the absorbed amount; convention-card pickups restore a fixed amount.
- Score is **Honor Reclaimed**, shown with suit-token icons rather than matchpoint-like pips. Fixed fictional awards are 100 per ordinary enemy, 500 per Review Slip, 250 per secret, and 1,000 for the boss; no report fact or real matchpoint value changes those awards.
- Health pickups are biscuits or coffee.
- Keys are **Review Slips** recovered from coaching terminals.

The joke must point at bridge concepts and the fictional Field, not at identifiable players. Real opponent names or likenesses must never be attached to shootable characters.

## 3. Goals and non-goals

### Goals

- Feel immediately recognizable as a fast 1993-era corridor shooter: low resolution, chunky pixels, billboard sprites, sector-like lighting, doors, lifts/stairs, loops, secrets, a large HUD, and a short replayable level.
- Make different selected pairs visibly produce different missions.
- Provide three honest coaching checkpoints; normally all three are board-specific, while sparse sessions use every suitable board once and clearly label any report-level or static filler rather than pretending it is personalized evidence.
- Give the full-body Border Collie Coach an in-world presence as a friendly ally and tutorial guide.
- Finish in one browser session, with a clear pause/exit path and complete cleanup afterward.
- Remain deterministic and extensively testable despite being a real-time game.
- Keep all data and execution local.

### Non-goals for version 1

- Doom, WAD, DeHackEd, or source-port compatibility.
- A literal recreation of E1M1 or any other copyrighted map.
- Multiplayer, network play, leaderboards, accounts, or telemetry.
- Fully procedural map geometry.
- A general bridge card-play simulator.
- Full auction or trick-by-trick reconstruction; the current sample data does not contain that evidence.
- Modern 3-D fidelity, physics, PBR materials, dynamic shadows, ragdolls, or complex skeletal animation.
- A continuously pathfinding companion. The Coach can use scripted waypoints and “director-only movement” between checkpoints.
- Touch-first gameplay in the initial release. Mobile and unsuitable devices get the complete Coach-only coaching path rather than a broken FPS.
- Persisting uploaded data or a resumable run.
- Adding the report launch control before the final gate.

## 4. Core game loop

1. **Briefing:** the Coach greets the selected pair, summarizes the session mode, and gives a short factual bark derived from `report.profile.focus`; the full sanitized focus prose remains available in a semantic briefing panel.
2. **Tutorial:** walk, turn, throw a card, interact, pause, and recover Composure. The Coach is immune to projectiles; hitting the Coach produces “Partner!” The tutorial is skippable and Help can be reopened at any time.
3. **Main Cardroom:** a central hub shows the locked Traveler Vault and the three coaching wings.
4. **Theme wings:** clear a short combat space and inspect a Coach's Chalkboard based on a unique review board when one exists, otherwise on clearly labeled report-level or static fallback content.
5. **Review slips:** interacting with each chalkboard immediately awards one slip. Questions are not part of version-one progression.
6. **Shortcuts:** each completed wing opens a loop back to the hub, preventing repetitive backtracking.
7. **Traveler Vault:** use all three slips to enter the finale.
8. **Boss:** defeat The Bottom Board, a large fictional/category-inspired result slip. An unused suitable review item may supply neutral intro/debrief evidence, but is not required.
9. **Exit:** leave through Move for the Next Round.
10. **Debrief:** show fictional game statistics separately from real session coaching, then return cleanly to the Pair Improvement Report.

On defeat in a wing, return the player to the hub with completed Review Slips retained and restore the unfinished wing's entry snapshot: actors, pickups, doors, triggers, fictional score, a full card hand, 100 Composure, and zero System Notes. On boss defeat, retain all slips but restore the boss-entry snapshot and the entire arena/boss state with the same starting resources. An explicit **Restart Run** action clears all run progress. **Practice Mode** makes the player invulnerable without changing coaching or objectives.

## 5. Level plan

Use a fixed original level skeleton. Personalization fills named slots but does not alter reachability.

### Final scope target

- Approximate footprint: 100 by 70 in-world meters, or an equivalent compact sector layout.
- 10-12 primary rooms plus short connector spaces.
- Three two-room theme wings.
- One hub visible early and revisited naturally.
- Two looping shortcuts.
- Two staged gates: hub-to-wings and three-slips-to-vault.
- Three secrets.
- One small outdoor/sky-lit courtyard.
- Visible height variation through stairs, platforms, windows, and one lift.
- 18-25 ordinary enemies on standard difficulty and one boss.
- No mandatory precision platforming.

### First playable slice

Before expanding to the final target, prove a deliberately narrow end-to-end slice:

- Hub, one representative wing, one chalkboard, boss room, and exit.
- One ordinary enemy behavior plus the boss.
- One card weapon with Shuffle and Practice Deck fallback.
- Static/talking Coach with one point pose; no directional animation requirement.
- Required effects and captions, but no music.
- Standard and invulnerable Practice modes only.
- WebGL context loss may offer a clean restart or Coach-only mode; live world restoration is not required.

Only expand to three wings, the full actor set, secrets, richer animation, and the complete room target after this slice is fun, readable, maintainable, and proven through the lazy-build path.

### Spaces

1. **Club Entrance / Coat Check** — spawn, Coach briefing, settings, and target dummy.
2. **Movement Hall** — tutorial encounter and same-direction scoring explanation.
3. **Main Cardroom** — central hub; the Traveler Vault is visible but sealed.
4. **Theme Wing A: entrance encounter**
5. **Theme Wing A: Coach's Chalkboard**
6. **Theme Wing B: entrance encounter**
7. **Theme Wing B: Coach's Chalkboard**
8. **Theme Wing C: entrance encounter**
9. **Theme Wing C: Coach's Chalkboard**
10. **Vulnerability Passage** — red/white or neutral treatment based on an unused boss evidence board when available, otherwise the deterministic scenario palette.
11. **Traveler Vault** — boss arena with a loop, cover, and no dead ends.
12. **Results Posted / Move for the Next Round** — completion debrief and exit.

### Theme names

| Report theme | Wing presentation |
| --- | --- |
| Bidding Judgment | The Auction Pits |
| Declarer Play | The Trickworks |
| Defense | The Lead Mines |
| Competitive Auctions | The Partscore Trenches |
| Penalty / Double Decisions | The Red-X Vault |
| Manual Review | The Fog-of-War Archive |
| No meaningful loss theme | The Baseline Gallery |

### Secrets

- **Biscuit Closet:** restores Composure and contains a Coach joke.
- **Dummy's Hand:** shows all four hands of the representative deal when valid PBN data exists. With no valid deal, it becomes the clearly fictional Practice Deck room.
- **The 7NT Room:** grants a temporary Rapid Deal effect (faster throws plus instant Shuffle) and contains an excessively grand Coach speech.

### Map representation and validation

Author the level as original JSON-like sector data rather than a WAD:

- 2-D polygons or room/corridor outlines.
- Floor and ceiling heights.
- Wall/floor/ceiling material IDs.
- Door, lift, trigger, shortcut, objective, secret, spawn, cover, and navigation markers.
- A lightweight 2.5-D collision/nav representation—2-D footprints plus floor/ceiling, step, actor-height, and lift metadata—independent of rendered meshes.

Each level manifest declares its required objectives. The slice manifest requires one slip, boss, and exit; the final manifest requires all Coach checkpoints, three slips, vault, secrets, triggers, and exit. Validation must prove those declared objectives reachable and reject entity-wall overlap, doors with no reachable control side, required drops outside walkable space, and height/step/lift routes that actors cannot actually traverse.

## 6. Card-throwing combat

### Version-one weapon

Use one reliable card weapon before attempting four suit modes.

- The HUD displays a fan of 13 cards from the loaded PBN board associated with the featured result when compatibility permits; it never calls them the pair's proven “actual hand.”
- Primary fire throws the next visible card as a spinning billboard projectile.
- Resolve hits with a fast oversized projectile or hitscan plus a visible card/trail, with classic vertical auto-aim. Version 1 uses horizontal look so low resolution and height changes do not make a paper-thin projectile frustrating to aim.
- All ranks and suits do equal base damage. A weak loaded bridge hand must not create a worse action game.
- Honors receive distinctive trails and impact sounds for flavor only.
- After 13 throws, the hand performs a short automatic **Shuffle** and refills infinitely. Target a 0.4-0.6 second Shuffle, allow movement throughout, and make the animation non-blocking if playtests still find the cadence irritating.
- No puzzle or enemy requires a suit the representative hand does not contain.
- The card hand remains readable in pause/help screens even when the action HUD is simplified.

### Representative hand selection

Prefer a valid hand associated with the boss/review board:

1. If the selected pair declared, use the declarer's seat.
2. If the selected pair defended, use the opening leader: the seat clockwise after declarer.
3. If declarer information is incomplete, use a deterministic seat belonging to the selected pair's side.
4. If that board has no valid deal, try the remaining featured review rows.
5. If no valid PBN hand exists, use an explicitly labeled **Practice Deck**.

Flatten `board.hands[seat].cards` into exactly thirteen unique valid `{ suit, rank }` objects. Display both real and Practice Deck hands in explicit suit order spades, hearts, diamonds, clubs and descending rank order `A K Q J T 9 ... 2`; never depend on object iteration order. Generate a Practice Deck by deterministically selecting thirteen unique cards from the standard 52-card deck. Use the report row index/field identity, not board number alone, because replayed board numbers are supported.

Provisional combat targets are two to four hits for an ordinary enemy and 45-75 seconds for the boss on Standard. Keep wing encounters contained and show a remaining-enemy/objective cue so progression never becomes a hunt for one lost actor.

### Possible later suit modes

- Clubs: rapid three-card burst.
- Diamonds: piercing throw.
- Hearts: short-range fan or stun.
- Spades: slower heavy card.

These should be pickups or selectable modes rather than properties forced by the loaded PBN hand. They require a balance pass and are not part of the first playable milestone.

## 7. Opponents, ally, and boss

### Base enemy behaviors

Keep the behavior set small and vary presentation by report theme.

- **Kibitzer:** standard ranged enemy that throws score slips.
- **Overtrick Imp:** small, fast, close-range attacker.
- **Red-X Sentinel:** slower armored enemy with a doubled-contract shield.
- **The Bottom Board:** boss result slip with phase changes at fixed health thresholds.

Theme skins can include Auction Wraiths, Lead Goblins, Wrong-Strain Shifters, and Partscore Rats without needing unique AI in version 1.

Session/report data may select only names, skins, palette, signs, and coaching. Spawn budgets, placements, formations, enemy statistics, damage, and counts come solely from the authored wing slot and game mode. Version 1 ships one balanced **Standard** mode plus invulnerable **Practice** mode; report quality never changes challenge.

Use `fieldContext.rivals` only to derive anonymized patterns such as Rival A/B/C badges, palette, or cosmetic ordering. Do not put real player names, likenesses, or raw pair identities on hostile bodies or in hostile speech. Neutral cardroom signs may use anonymized pair labels—but never `players`—to explain that table opponents and same-direction rivals are different concepts.

### The Bottom Board

After assigning wing checkpoints, choose the highest-priority *unused* suitable `reviewItem` for neutral boss-intro evidence. If none remains, use a generic category-inspired Bottom Board and do not repeat a row diagnosis. When an unused item exists, it may provide:

- Board number and row identity.
- Pair percentage and score on the neutral intro/debrief, not the hostile sprite.
- Contract/result.
- Diagnosis category and confidence.
- Vulnerability palette.

The boss's mechanics remain fixed for balance. Report data changes its fictional category skin, palette, projectiles, and neutral Coach/chalkboard commentary—not its difficulty. Raw diagnosis prose, player names, peer identities, percentages, and other potentially humiliating details never become hostile speech.

Set `mode` to **Defend the Crown** only when the filtered scenario inputs contain neither a usable `decisionType` nor a suitable `reviewItem`; otherwise use **Restore Honor**. In Defend the Crown the boss is **Complacency**, not a fabricated mistake. This predicate is deterministic and must have boundary tests.

### Border Collie Bridge Coach

The Coach must be an in-world, full-body, transparent pixel-art billboard at plausible life size—roughly 0.5-0.6 meters at the shoulder—not a stretched portrait. Version 1 needs only:

- A full-body idle/talk frame, point frame, and victory frame.
- An optional two-frame trot for checkpoint entrances; directional animation is later polish.
- A high-contrast outline that remains readable at low resolution.

The existing `assets/bc.jpg`, `assets/bc-avatar.png`, and `collie-01.svg` through `collie-20.svg` are useful visual references and dialogue portraits, but their provenance/rights must be confirmed before deriving a shipped sprite. Otherwise create a new original Coach design.

For feasibility, the Coach follows scripted checkpoints rather than continuous navigation:

- Entrance tutorial.
- Hub explanation.
- One appearance after each wing.
- Low-Composure biscuit drop.
- Boss intro and victory pose.

If the Coach would become stuck, it can disappear around a corner and reappear at the next “director-only movement” marker. It cannot take damage, block a doorway, trigger combat, or become a progression dependency.

## 8. Personalization model

Create a pure function such as:

```text
buildBridgeSimulatorScenario({ analysis, results, report }) -> SimulatorScenario
```

The result must be serializable, immutable during a run, schema-versioned, and free of DOM objects, Maps, circular row references, and Three.js types.

### Data mapping

| Existing source | Simulator use |
| --- | --- |
| `report.pairKey`, `pairNo`, `standing.players` | Mission identity; player names are optional greeting text only |
| `report.summary` | Factual debrief and celebratory/repair-oriented copy; the explicit mode predicate uses filtered themes/reviews |
| `report.profile.focus` | Full semantic briefing and source for one short factual Coach bark |
| Unique `decisionTypes` | First-choice wing identities, skins, and signage |
| `practicePriorities` | Wing objectives and final practice action |
| `reviewItems` | Chalkboards, featured boards, and boss candidate |
| `reviewItem.diagnosis` | Coaching copy, confidence, and theme |
| `peerComparison` | Honest “your table vs peer” terminal evidence |
| `fieldContext.rivals` | Anonymized encounter flavor and same-direction lesson |
| `fieldContext.opponents` | Anonymized neutral room plaques and opponent-vs-rival explanation; never copy `.players` |
| Bidding/declared/defended scorecards | Optional room facts and encounter decoration |
| `overtrickMeter` | Overtrick encounter and optional bonus terminal |
| Result row contract/result/lead | Signs and factual board summaries |
| Board dealer/vulnerability/par/DD | Palette and explicitly labeled computer analysis |
| Valid board hand | Thirteen-card visual weapon hand |
| `buildPairExercises(results, report)` | Optional fact-based bonus terminals |

### Suggested scenario shape

```text
SimulatorScenario
  schemaVersion
  seed
  identity
    pairKey
    pairLabel
    players (display only; optional)
  mode: restore-honor | defend-crown
  briefing
    barkSegments[]
    detailSegments[]
  palette
  representativeHand
    source: pbn | practice
    rowIdentity
    boardNo
    seat
    cards[13]
    provenanceNote
  wings[3]
    slot
    themeKey
    title
    featuredBoard
    encounterSkin
    objective
    coachFeedback
      summarySegments[]
      detailSegments[]
  rivals[] (anonymized)
  terminals[]
  boss
  debrief
    fictionalStatsLabels
    sessionFacts
    practiceAction
  provenance
    hasResults
    hasPbn
    usedValidDeal
    compatibilityStatus: match | partial | warning | mismatch | unknown
```

Every rendered copy segment has `{ text, claimKind, rowIdentity?, sourceFields?, contentId? }`, where `claimKind` is `report | static | fiction`. Keep a report fact, generic advice, and a joke as separate segments even when they render as one Coach speech. A report-derived segment carries its exact `rowIdentity` where applicable and `sourceFields` such as `reviewItem.diagnosis.explanation` or `summary.percent`; static controls/bridge facts and fictional jokes carry stable content IDs instead of fake report provenance.

### Three-wing fill algorithm

Build exactly three coaching checkpoints without fabricating three board errors:

1. Take distinct usable `decisionTypes` in report priority order.
2. Fill unused wing themes from evidence-bearing scorecard or `practicePriorities` categories.
3. Fill any remaining geometry with **Baseline Gallery** or **Field Context** content.
4. Assign each suitable review board at most once. Never duplicate or embellish a diagnosis simply to fill a wing.

A **suitable evidence item** is a scored, non-erased, non-adjusted report row with a diagnosis/scorecard fact that the existing report is willing to display and that retains its confidence. A **normal** session has at least three; all three checkpoints use unique board-specific evidence. A **sparse** session has fewer than three; use each suitable board once, then prefer a real report-level strength/field fact and finally a clearly labeled static bridge tip. Final acceptance is three coaching checkpoints overall and `min(3, suitable evidence items)` unique board-specific checkpoints; static filler is never called personalized.

### Deterministic seed

Hash a canonical string containing:

- Scenario schema version.
- Exact string participant key.
- Sorted report row identities: row index, field key, board number, contract, result, and score.
- Relevant report theme keys.

Do not seed from player names, filenames alone, current time, object iteration order, or `Math.random()`. Use a small explicit seeded PRNG and test it.

The same loaded session and selected pair must produce byte-identical scenario data. Changing pair must change more than the greeting: at least three of wing order/content, featured boards, representative hand or Practice Deck seed, anonymized rival flavor, and boss presentation should differ. Equivalent evidence may produce different cosmetic ordering, but factual coaching must never be altered or embellished merely to satisfy this difference test.

### Fallbacks and edge cases

- Results only: launch the complete FPS normally with traveler-based coaching and a clearly labeled Practice Deck.
- `match`: a valid hand from a joined result/PBN row may be used, but label it only as “Loaded PBN — Board N, Seat.” The compatibility result is a plausibility heuristic, not proof that this was the session's actual deal.
- `partial`: use a PBN hand only when the row's board number is present in the loaded PBN and that deal passes validation; label it as loaded-PBN provenance, not proof of the session deal. Otherwise use Practice Deck.
- `warning`, `mismatch`, or `unknown`: always use Practice Deck and never claim that displayed cards came from the session. A concise nonblocking provenance note may explain why.
- Missing or invalid deal: search other featured rows, then fall back.
- No usable loss theme or review item: apply the explicit Defend the Crown predicate above and use strengths/Maintain the Baseline language.
- Tiny session: reuse generic wing geometry/content, feature each available board only once, and fill remaining checkpoints according to the sparse-session rules.
- Adjusted, passed-out, unscored, or erased rows: do not use them for unsupported coaching claims or a combat hand.
- Replayed board: identity is row index plus field key, not board number.
- Multi-section participant keys: preserve the exact string key.
- Placeholder or hostile text: fall back to pair label, escape all DOM text, and truncate display without mutating evidence.
- Large field: cap rivals and actors; aggregate the remainder as “The Rest of the Field.”
- Pair/session changes while open: the active run keeps its immutable snapshot; a restart after closing rebuilds from current state.

## 9. Real coaching without fake certainty

The app usually knows contracts, tricks, scores, opening lead, par/double-dummy, traveler comparisons, and same-contract peer outcomes. It usually does not know the full auction or card play. Therefore:

- Treat `reviewItem.diagnosis.explanation`, `confidence`, `peerComparison`, `practicePriorities`, and existing scorecard facts as evidence. Preserve their factual meaning and uncertainty in neutral semantic UI, substituting anonymized pair labels for any embedded names, rather than copying raw prose into enemy speech.
- Preserve “low confidence” and manual-review language.
- Never infer a specific correct bid, lead, signal, or line of play unless a future data source actually establishes it.
- Label double-dummy as computer analysis.
- Keep action-game performance and real session performance in separate panels and vocabularies.
- Never add fictional Honor Reclaimed to actual matchpoints.
- Give every session-specific claim field-level provenance. Validate only `claimKind: report` content against report evidence; controls, generic bridge facts, and jokes are explicitly `static` or `fiction`.

### Coach's Chalkboard

Interacting with a chalkboard immediately awards its Review Slip and presents one short Coach sentence. The detailed evidence is expandable, dismissible, and reopenable from the chalkboard so coaching does not stall the action. A board-specific semantic DOM overlay includes:

- Board number.
- Selected pair's contract/result/percentage.
- A better same-direction peer result when available.
- Loss category.
- Diagnosis confidence.
- A reconstructed/sanitized coaching explanation derived from structured report evidence; never inject raw diagnosis prose verbatim.
- “Mark for review” state held only for the current run.

Report-level/static fallback checkpoints replace those board fields with an accurate source/category label and never imply a board diagnosis. The game can pause while a chalkboard is open. All text must be readable without relying on the canvas. Neutral evidence may use board/pair labels, but player names are hidden by default and raw diagnosis prose never becomes hostile dialogue.

### Optional Table Time terminals

In a later phase, adapt two or three cards from `buildPairExercises()` into optional targets or terminals:

> You cannot outgun a bad auction. Fortunately, this is a simulator.

- Present the existing fact-based question and options.
- Let the player choose by interaction or by throwing at a target.
- Correct: award temporary System Notes or a secret.
- Incorrect: reveal the same explanation and continue.
- Neutral judgment cards retain their neutral grading.
- No answer blocks required progression.

This is the strongest way to make gameplay itself produce real feedback without inventing bridge logic.

### Debrief

The completion screen must have two explicit columns:

**The Simulation**

- Time.
- Card accuracy.
- Enemies reseated.
- Biscuits found.
- Secrets.
- Honor Reclaimed.

**Your Actual Session**

- Session percentage and MP versus average.
- Main focus or strength.
- Best board to review next.
- One concrete practice action.
- Evidence/confidence label.

Every debrief field has an honest null fallback: “not available for this session” for percentage or MP-versus-average, a report-level strength/focus when no board is suitable, and “manual review” when confidence is absent. Never coerce missing data to zero or manufacture a best board.

Provide a Coach-only linear mode containing the briefing, all three checkpoint summaries with the same expandable evidence, the practice action, and the debrief. It must not merely skip from opening to final summary, so no coaching content is locked behind twitch gameplay.

## 10. Rendering and engine decision

### Options considered

| Approach | Strengths | Problem | Decision |
| --- | --- | --- | --- |
| Custom Canvas DDA raycaster | Small, dependency-free, naturally pixelated | Basic implementations are grid/flat-height and read more like Wolfenstein; Doom-like arbitrary walls, stairs, varying heights, clipping, and occlusion become a large engine project | Fallback only if fidelity is deliberately reduced |
| Raw WebGL | Total control | Reimplements geometry, batching, shaders, picking, resource recovery, and diagnostics | Reject |
| Three.js/WebGL | Arbitrary geometry, stairs/heights, sprites, raycasts, mature diagnostics, easy low-res treatment | One vendored dependency and a custom lightweight game layer | **Recommend** |
| Babylon.js | Strong FPS camera/collision/controller facilities | Broader/heavier engine surface than this one-level game needs | Runner-up |

Three.js is an intentional exception to the current dependency-free runtime. Pin and vendor one audited ESM build plus its MIT license; do not fetch it from a CDN. Keep it isolated behind a renderer adapter so scenario, collision, AI, combat, and tests do not import Three.js.

### Retro rendering specification

- Internal render target: 320×200 by default, with an optional 640×400 sharp mode.
- Integer nearest-neighbor upscaling and letterboxing; do not scale with device pixel ratio.
- Perspective camera with horizontal look and classic vertical auto-aim in version 1; limited vertical look is later polish only if it remains readable and comfortable.
- No antialiasing, PBR, bloom, motion blur, or dynamic shadows.
- Original 32×32 or 64×64 palette-limited/pre-quantized RGBA texture atlas using nearest filtering. An indexed-palette shader is unnecessary for version 1.
- Unlit/basic materials with coarse room/sector light levels and distance fog.
- Billboard sprite sheets for enemies, Coach, cards, pickups, signs, and effects.
- Merge static geometry by material/atlas and omit unseen faces.
- Target under 100 draw calls, under 20 actively thinking enemies, and no more than 25 ordinary actors alive.
- Expose a development HUD for frame time, draw calls, triangles, textures, and geometries.

### Simulation

- Fixed 35 Hz update using an accumulator; rendering follows browser animation frames with interpolation where useful.
- Cap accumulated time after pause or a slow frame so actors do not teleport.
- Deterministic simulation uses seeded state, explicit ticks, and injected input—not wall clock or `Math.random()`.
- Lightweight 2.5-D collision: 2-D actor radius plus feet height, actor height, floor/ceiling lookup, maximum step height, drop rules, and lift-carried actors.
- A height-aware nav graph with reachable floor ranges/lift edges plus line-of-sight, chase, attack, stagger, and down states.
- Object pools for card projectiles and short effects.
- Pause simulation and audio when the document becomes hidden or loses focus.

## 11. Proposed module and asset layout

Keep the simulator isolated and keep pure code under the existing type-check boundary.

```text
src/core/simulator/
  scenario.js          pure report/results -> SimulatorScenario adapter
  seed.js              canonical fingerprint and seeded PRNG
  level.js             authored sector/topology data
  validateLevel.js     reachability and placement checks
  simulation.js        fixed-step world update
  collision.js
  combat.js
  ai.js
  types.js             JSDoc typedefs

src/simulator/
  index.js             launch(container, inputs, options) -> controller
  renderer.js          Three.js adapter only
  levelMeshes.js
  sprites.js
  input.js
  audio.js
  hud.js

src/ui/simulatorView.js
  preflight, overlay lifecycle, focus/inert state, pause/help/debrief

vendor/three/
  three.module.js
  LICENSE
  VERSION

assets/simulator/
  textures/
  sprites/
  audio/               only if procedural Web Audio is insufficient
  ATTRIBUTIONS.md

test/
  simulator-scenario.test.mjs
  simulator-level.test.mjs
  simulator-engine.test.mjs
  e2e/simulator.js
```

`src/core/simulator/` stays dependency-free and DOM-free, so it is covered by the existing JSDoc/TypeScript check. The WebGL adapter remains outside the core.

Do not add simulator fields to `buildPairImprovementReport()`; doing so would couple game data to the report and churn the existing golden fixtures. Build the scenario separately from the already completed report.

Simulator presentation code must not import `src/ui/reportView.js`; that would worsen the existing `reportView.js`/`quizView.js` cycle. Pass report data into an independent simulator formatter, or extract genuinely shared, dependency-neutral formatting helpers.

## 12. Packaging and local-browser operation

The repository currently serves source ES modules in development and bundles only `src/main.js` into an IIFE for GitHub Pages. Avoid making every analyzer user download Three.js and the game assets.

Recommended packaging:

1. Keep Three.js, the scenario builder, game code, and assets out of the main Barbelo bundle; Phase 9 adds only a bounded launch/loader delta.
2. Preserve the repository's dependency-free runtime convention: do not add a tracked `package.json` or lockfile. Vendor one exact audited Three.js release with its upstream URL, version/tag, SHA-256, unmodified ESM file, and MIT license.
3. Add a second esbuild entry point for `src/simulator/index.js`, producing `_site/assets/bridge-simulator.js` as a classic/IIFE bundle with `--global-name=BridgeSimulator` (or equivalent explicit self-registration). Define one unambiguous API: `BridgeSimulator.launch(container, { analysis, results, report }, options) -> Promise<controller>`, where the lazy bundle builds the scenario and `controller.destroy()` owns cleanup.
4. Make the thin UI loader deduplicate concurrent script-load Promises, report load errors in the preflight DOM, and remove/retry a failed script cleanly. In source mode it may dynamically import the simulator ESM; in `_site` it loads the versioned IIFE URL.
5. Retain `{ analysis, results, report }` in the small loader without statically importing the scenario builder. After the lazy bundle arrives, pass those inputs to it and build the immutable scenario there.
6. Pass a same-origin `assetBaseUrl` and deployed version into `launch()`; do not rely on `import.meta.url`, because source modules and the production IIFE have different locations. Resolve the root with `new URL(relativePath, document.baseURI)` for GitHub Pages subpath safety, and append the version to every JS/CSS/texture/audio URL (or use a versioned directory)—a query on a directory URL is not inherited by child URLs.
7. Lazy-load simulator CSS scoped below `.bridge-simulator`, and recursively copy nested simulator assets, that CSS, `ATTRIBUTIONS.md`, the vendored Three.js license/third-party notice, and the bundle into `_site`. Retain esbuild legal comments.
8. Extend local/e2e static-server MIME maps for module JavaScript, CSS, audio, images, and any future data formats. Keep the authored map in JavaScript when practical so JSON does not add another copy rule.
9. Assert in CI that the built main page contains no Three.js/game payload or third-party runtime URL, and test both source mode and built `_site`.

The simulator's local runtime means “served from local static files over HTTP,” not a backend service. The existing analyzer may retain its current built-bundle `file://` behavior, but launching the simulator requires local HTTP for reliable scripts, Pointer Lock, WebGL assets, and audio. It makes only same-origin static-asset requests and no CDN or data-bearing request.

## 13. App integration and lifecycle

### Integration seam

The eventual launch control belongs in `renderThisWeek()` immediately after `${renderQuizLaunch()}`. It should be a button styled like a launch link/card because it opens a same-page application modal rather than navigating to a document.

Do not add that control during simulator development.

At final integration:

1. `renderPairImprovementReport()` already builds the selected pair's `report` and calls `prepareQuiz(results, report)`.
2. A lightweight `prepareBridgeSimulator(analysis, results, report)` retains only the current inputs whenever the selected pair changes. The lazy bundle builds the immutable scenario after loading; the main bundle never statically imports the scenario/game modules.
3. Launch loads assets during preflight and instantiates the heavy engine only after a Start click.
4. Mount the overlay as a `document.body` child and sibling of `.app-shell`; then make `.app-shell` inert, own focus, and close/pause other overlays. Never mount inside the subtree being made inert.
5. Preflight offers **Mouse Lock** and **Keyboard Look** input modes. Start requests Pointer Lock only for Mouse Lock and creates/resumes Web Audio inside the user gesture; Keyboard Look never requests it.
6. Treat `pointerlockchange` as the authoritative pause signal only after this run successfully acquired Pointer Lock; losing a lock that was never requested/granted must not pause Keyboard Look. The browser may consume Escape while releasing a real lock. Exit remains an explicit control.
7. Close/destroy cancels animation, removes every listener, releases Pointer Lock, stops/disconnects audio, disposes all app-owned Three.js geometry/materials/textures/renderer state (optionally calling `renderer.forceContextLoss()`), clears the overlay, removes inert, and restores focus.
8. Clearing/reloading data while inactive invalidates the prepared inputs. Both early-return paths in `renderPairImprovementReport()`—no results and no report—must invalidate them too. Active runs use their frozen scenario until exit.
9. A dynamic-import/script/asset failure leaves the report fully usable, removes inert/modal state, and restores focus to the launch control.

Do not add `simulator` to `STATE.activeView`; this is a modal experience, not a dashboard view.

### Development access before the link exists

- Source e2e tests can dynamically import `STATE`, the report builder, scenario builder, and simulator module from the local static server, then mount into a test container.
- Built-site tests can inject the produced simulator bundle and call its narrow global `launch()` API with committed synthetic `{ analysis, results, report }` inputs.
- A standalone developer harness may use committed synthetic scenarios, but it must not be shipped as a visible navigation path.
- Avoid a permanent public console API; the exact `window.PBNAnalyzer` key list is intentionally tested.

### Event and modal coordination

Simulator input must run before the global quiz/board key handlers or be attached only while active and stop propagation. Prefer introducing a small shared modal/inert manager before stacking more overlay state, because the current board and quiz overlays independently toggle `body.modal-open` and `.app-shell.inert`.

## 14. Controls and settings

### Required controls

- WASD: movement.
- Arrow keys: movement/turning fallback.
- Mouse: horizontal look under Pointer Lock.
- Primary click or Space: throw card.
- E or Enter: interact.
- Escape: release Pointer Lock; `pointerlockchange` opens pause.
- R: reset the unfinished wing from the pause menu; a separately confirmed **Restart Run** clears all slips and run state.
- M: mute.
- Tab: optional automap in a later polish phase.

### Preflight/start menu

- Start Standard.
- Practice Mode (same level and coaching, invulnerable player).
- Coach-only full coaching path.
- Mouse Lock or Keyboard Look input mode.
- Skip Tutorial and replayable Help.
- Mouse sensitivity.
- Keyboard turn speed.
- Field of view within a conservative comfort/readability range.
- Effects volume and mute.
- Reduced motion/effects.
- High contrast.
- Controls/help.
- Fullscreen as an optional separate action, never a requirement.

Persist only small preferences such as mute, sensitivity, contrast, and reduced effects. Wrap storage access in `try/catch`. Never store PBN text, BWS data, player names, report data, representative hands, or full game state.

## 15. Audio and visual assets

- Create original bridge-club, paper, felt, bidding-box, suit, score-slip, and convention-card motifs.
- Use high-contrast silhouettes and large suit/rank marks that survive 320×200 rendering.
- Prefer procedurally generated Web Audio for card throws, impacts, doors, pickups, UI, and simple ambient loops.
- If shipping audio files, use original recordings/compositions and document them.
- Music is optional polish after the first playable. If retained, compose an original tracker-like or industrial bridge-club theme; do not imitate a recognizable Doom track.
- Create captions for every Coach line and meaningful audio cue.
- Maintain `assets/simulator/ATTRIBUTIONS.md` with source URL, creator, license, download date, and file hash for every third-party asset, even where attribution is optional.
- Include the vendored Three.js MIT notice.

Conservative legal rule: broad retro-FPS ideas are the inspiration; all expressive content is new. The public-facing product is **Bridge Simulator**, not a Doom-branded game.

## 16. Accessibility and comfort

The FPS is inherently visual, but the feature can still avoid trapping or withholding the coaching experience.

- Use a real DOM dialog shell around the canvas with labeled Start, Pause, Help, Mute, Restart, Coach-only, and Exit controls. Give the canvas an accessible name/description and mirror changing objective, pause, completion, and error status into concise DOM live regions.
- Explain Pointer Lock and Escape before Start.
- Provide keyboard turning and throwing so Pointer Lock is not mandatory.
- Make the full run completable with keyboard alone, not only the Coach-only path.
- Ensure focus containment while open and focus restoration on close.
- Respect `prefers-reduced-motion`; disable head bob, screen shake, weapon lunge, large damage flashes, and animated camera sway by default in that mode.
- Avoid rapid full-screen flashes and do not use red flashes as the only damage signal.
- Provide reduced effects, high contrast, aim assist, sensitivity, turn-speed, and invulnerable Practice Mode.
- Never encode suit, vulnerability, lock state, or enemy state by color alone.
- Caption Coach/audio content.
- Pause on tab hide, window blur, loss of an acquired Pointer Lock, and WebGL context loss; Keyboard Look remains playable without ever acquiring a lock.
- Put briefing, chalkboards, and debrief in semantic DOM, not canvas-only pixels.
- Measure the 960×540 FPS minimum in CSS pixels *after* browser zoom. At or above that post-zoom size, mandatory semantic UI remains readable at 200%; if zoom makes the CSS viewport smaller, intentionally route to the complete Coach-only mode and keep that content readable.
- Offer Coach-only mode on devices without suitable controls, WebGL, or the post-zoom minimum viewport.
- Do not make simulator completion necessary to access any report fact, board review, or Table Time content.

## 17. Privacy and data handling

- No third-party or data-bearing requests, telemetry, analytics, accounts, or remote scores; only same-origin static scripts/assets are requested.
- No uploaded or derived session data is transmitted, put in a URL, or persisted.
- Player names may appear in the local greeting only and are never part of the seed, hostile characters, storage, or asset generation.
- Real opponent names and likenesses never appear on enemies.
- Use anonymized Rival A/B/C in combat. Neutral coaching may use an anonymized pair number/label for a factual comparison, but not player names by default.
- Escape all imported text placed into DOM; draw only normalized/truncated strings into textures or canvas.
- The scenario snapshot is discarded on close.

## 18. Performance and resilience targets

- 60 rendered FPS at the low internal resolution on an exact hardware/OS/browser baseline recorded in Phase 1; final QA must name that baseline and also spot-check a slower supported device.
- Fixed 35 Hz simulation independent of display refresh.
- Under 100 draw calls in ordinary scenes.
- Under 20 actively thinking enemies and 25 ordinary actors alive.
- No dynamic shadows, PBR textures, large 3-D models, or per-frame geometry creation.
- The initial lazy simulator payload—JS, CSS, and every asset required for the complete run—has a provisional aggregate encoded-file budget of 3 MiB and reaches a ready preflight within 2 seconds over local HTTP on the cold-cache Phase 1 baseline. Load all required gameplay assets before Start; only optional music or purely cosmetic extras may load later, without transmitting session data.
- The main analyzer contains no Three.js/game payload; only the measured, bounded loader/view delta is present before launch.
- Loading preflight shows progress and a recoverable asset error.
- Sustained slow-frame detection offers Reduced Effects rather than silently changing combat rules.
- WebGL initialization failure shows Coach-only mode.
- WebGL context loss pauses and offers clean restart or Coach-only mode; live state restoration is optional polish.
- Hidden tab or lost focus consumes no active simulation/audio work.
- Destroying the simulator leaves no app-owned animation frame, timer, input listener, pointer lock, audio node, canvas, geometry, material, or texture reachable; browser/driver-level GPU allocation lifetime remains browser-owned.

## 19. Test strategy

### Pure Node tests

- Scenario schema and serialization.
- Stable canonical fingerprint and seeded PRNG.
- Same pair/session gives byte-identical scenario.
- Different pairs produce materially different content.
- No `Math.random()` or wall-clock dependency in deterministic code.
- Results-only, every compatibility status (`match`, `partial`, `warning`, `mismatch`, `unknown`), invalid deal, tiny session, clean session, adjusted row, replayed board, multi-section key, placeholder name, and hostile-text cases.
- Actual-hand extraction and Practice Deck generation each produce exactly thirteen unique valid cards in canonical suit/rank order.
- Every `claimKind: report` segment points to existing report evidence and retains confidence; mixed Coach copy remains segmented, and static facts/fiction remain separately labeled.
- Checkpoint assignments never duplicate a row or diagnosis. An unused row may skin the boss; otherwise the boss uses a generic theme presentation.
- Defend the Crown predicate and sparse three-wing fill boundaries.

### Level validation

- Manifest-driven, height-aware reachability for the slice and final objectives: spawn, Coach, slips, vault, secrets, boss, and exit as declared.
- Valid door/trigger pairs.
- No required entity or pickup inside geometry.
- No softlock when an actor is lost, a combat drop fails, or an optional post-v1 terminal is answered incorrectly.
- Standard and invulnerable Practice modes remain completable.
- Property/fuzz test the authored level across every available sample pair/scenario seed.

### Simulation tests

- Movement and collision.
- Door/lift state transitions.
- Actor height, floor/ceiling clearance, maximum steps/drops, lift-carried actors, and height-aware navigation.
- Card throw/auto-aim, hit, cooldown, Shuffle after thirteen cards, movement during the bounded Shuffle, and infinite recovery.
- Enemy line of sight, navigation, attack, stagger, and defeat.
- Coach immunity/non-blocking behavior.
- Composure, 50% System Notes absorption/depletion/pickups, fixed Honor Reclaimed awards/rollback, and Practice Mode.
- Objective/slip/vault/boss/exit progression.
- Wing defeat and boss defeat each restore their defined entry snapshot while retaining completed slips; confirmed Restart Run clears all progress.
- Fixed-tick behavior under variable render deltas.
- Pause/resume and bounded catch-up.
- Complete destroy/cleanup.

### Browser integration tests

- Mount without a visible report link during development.
- Preflight, Start, Skip Tutorial/reopen Help, canvas/HUD, movement, look fallback, throw, interact, pause, resume, wing reset, Restart Run, finish, and exit.
- App shell inertness, focus containment, Escape behavior, and restored focus.
- Muting, captions, reduced motion, high contrast, full keyboard completion, Practice Mode, and Coach-only mode with all three checkpoint evidence panels.
- Inject look deltas in tests rather than requiring OS Pointer Lock in headless mode.
- Complete a full Keyboard Look run in a session where Pointer Lock is never requested or granted; separately verify that losing an acquired Mouse Lock pauses.
- Source-mode and built `_site` simulator bundle.
- Only expected same-origin static-asset requests; no third-party or data-bearing requests.
- No duplicate handlers after repeated open/close cycles.
- WebGL failure/context loss recovery.
- Pair change rebuilds scenario before next launch.
- Practice Deck launches normally with provenance copy; it is not an error state.
- Dynamic load failure returns a usable report and restores focus/modal state.
- Record exact browser versions at finalization. Automate Chromium, Firefox, and WebKit; run Safari with keyboard-turn fallback in a real macOS manual gate. Test FPS at a post-zoom 960×540 CSS viewport and intentional complete Coach-only routing when a 200% zoom makes the CSS viewport smaller.

Add a dedicated CI browser job that installs pinned Playwright Chromium, Firefox, and WebKit tooling and runs committed, synthetic, non-private fixtures. The current smoke/a11y path can skip when an untracked sample is absent, so modify it to consume a committed synthetic fixture or add equivalent non-skipping suites; a skipped job is not a simulator gate. Existing Barbelo unit, smoke, browser, and accessibility suites must also remain green. Playwright WebKit is useful coverage but does not replace the real-Safari/macOS gate.

### Visual and performance checks

- Fixed scenario seed, viewport, clock, and browser for narrow screenshot smoke tests.
- Prefer scenario/map golden files over GPU pixel-perfect snapshots, which vary by platform.
- Development HUD exposes frame-time percentiles and renderer resource counts.
- Measure the 3 MiB/2 second/60 FPS budgets on the exact Phase 1 real-device baseline; headless software WebGL is not representative.
- Run a structured gate with at least five new players: at least four identify the three-slip/vault objective without a hint, at least four finish without author help, median completion is 8-12 minutes, no more than one rates any of Shuffle/chalkboards/boss duration a major pacing blocker, and all five correctly state that Honor Reclaimed is fictional rather than restored real matchpoints.

## 20. Delivery phases and gates

### Phase 0 — Rights, tone, and architecture approval

Deliverables:

- Approve this plan's engine choice, scope, tone, and public naming.
- Confirm provenance/rights for existing Coach images.
- Approve original-asset rule and attribution process.
- Confirm the desktop browser/minimum-viewport matrix and record the hardware class to name in Phase 1.

Exit criteria:

- No unresolved plan-level legal/asset question.
- No report link.

### Phase 1 — Rendering and packaging spike

Deliverables:

- Standalone original test room with stairs, diagonal wall, door, low-res scaling, one billboard enemy, one card projectile, and Coach billboard.
- Vendored Three.js exact version/source/hash/license record.
- Separate lazy simulator build, global registration, scoped CSS, versioned `assetBaseUrl`, and third-party notice proven in source and `_site` modes.
- WebGL failure and destroy paths.

Exit criteria:

- The room reads visually as a Doom-era rather than flat Wolfenstein-like space.
- Records the exact hardware/OS/browser baseline and meets the provisional payload, startup, frame, and draw-call targets on it.
- Main analyzer contains no Three.js/game payload; its loader delta is measured.
- No visible report link.

### Phase 2 — Deterministic scenario builder

Deliverables:

- Scenario schema, seed, pair/session mapping, three-wing fill, per-claim provenance, hand selection, compatibility matrix, and fallbacks.
- Unit/golden tests across representative pairs and edge cases.

Exit criteria:

- Determinism and coaching provenance tests pass.
- Different pairs produce materially different scenarios.

### Phase 3 — First playable vertical slice

Deliverables:

- Fixed tick, movement, collision, door, card combat/auto-aim, bounded Shuffle, one ordinary enemy behavior, one pickup, pause/restart/destroy.
- Hub, one evidence-aware wing/chalkboard/slip, generic-or-evidence-backed boss, exit, minimal placeholder static/talking Coach, minimal original effects/captions, and no music.
- Minimal Standard, Practice, Practice Deck, and Coach-only paths proving the flows; later phases replace placeholder art/copy and complete accessibility polish.
- Engine tests independent of WebGL.

Exit criteria:

- Five-minute soak test can open/close repeatedly without leaked state.
- The slice is fun/readable enough to justify expansion, completes keyboard-only, and has no softlock.
- WebGL loss can cleanly restart or fall back to Coach-only.

### Phase 4 — Complete authored level

Deliverables:

- All required rooms, loops, gates, secrets, encounter markers, boss arena, and exit.
- Automatic reachability/placement validation.

Exit criteria:

- Full generic run completable without cheats or softlocks.
- First/repeat run time falls near scope targets.
- Expansion occurred only after the Phase 3 playability/maintainability gate passed.

### Phase 5 — Personalized content and coaching

Deliverables:

- Three data-driven checkpoints, representative hand, anonymized rival flavor, real chalkboards, optional unused boss evidence, and two-part debrief.
- Defend the Crown, results-only, every compatibility status, and sparse-session variants.

Exit criteria:

- Normal sessions have three unique board-specific moments; sparse sessions have three coaching checkpoints and exactly `min(3, suitable evidence items)` unique board-specific moments.
- No unsupported coaching claims.
- Difficulty does not correlate with report quality.

### Phase 6 — Coach, art, audio, and humor pass

Deliverables:

- Original full-body Coach sprite set and checkpoint scripting.
- Final original enemy/card/texture/pickup/HUD art.
- Original/procedural required effects and captions; music only if it survives scope and pacing review.
- Copy review for tone and privacy.

Exit criteria:

- Asset provenance complete.
- No Doom-derived expressive assets or real-person hostile depictions.

### Phase 7 — Accessibility, resilience, and QA

Deliverables:

- Production-complete Coach-only and Practice modes, settings, reduced motion/effects, high contrast, focus lifecycle, context-loss handling, performance fallback, and complete tests, replacing the Phase 3 placeholders.
- Test every pair in available sample sessions plus committed synthetic edge fixtures.
- Dedicated pinned Chromium/Firefox/WebKit browser CI job, real-Safari/macOS manual gate, plus the existing Barbelo regression suites.

Exit criteria:

- All acceptance criteria below pass.
- Source and built-site browser suites pass.
- No visible report link.

### Phase 8 — Finalization review

Review the feature as a product, not merely as working code:

- Is the joke still funny after a full run?
- Is the game genuinely playable and approximately the promised scope?
- Does personalization feel materially different across pairs?
- Is the coaching accurate and useful?
- Is the Coach visibly an ally rather than a portrait pasted on the HUD?
- Are startup, pause, exit, and failure states polished?
- Are download size and performance acceptable for the analyzer?
- Are assets and licenses complete?

Only an explicit “finalized” decision advances to Phase 9.

### Phase 9 — Add the Pair Improvement Report launch control

Only now:

- Add the launch control directly below Table Time in `renderThisWeek()`.
- Add the corresponding delegated click route under `#pairReportBody` in `src/ui/io.js` (currently routed through `handleQuizClick` only), invoking the thin simulator loader without disturbing quiz handling or key-handler precedence.
- Suggested title: **Bridge Simulator — reclaim your matchpoints ›**
- Suggested note: **One personalized 1990s-style mission built from this pair's session.**
- Lazy-load the simulator only on activation.
- Add production smoke/a11y checks for the real launch path.
- Keep a graceful Coach-only path when the browser lacks WebGL. Practice Deck is a normal FPS launch with a nonblocking provenance note, not an unavailable state.

## 21. Final acceptance criteria

The feature is not finalized until all are true:

- One complete run is reliably playable without cheats or softlocks.
- Wing/boss defeat restores the corresponding defined entry snapshot, retains completed slips, and cannot farm Honor; confirmed Restart Run clears all progress.
- The scope is roughly 10-12 primary rooms, three wings, loops, three secrets, 18-25 ordinary enemies, and one boss.
- The level visibly includes sector-like height/lighting/geometry variation rather than only flat grid corridors.
- Standard is balanced so ordinary enemies generally take two to four hits and the boss lasts roughly 45-75 seconds; Practice is invulnerable but otherwise equivalent.
- Same session/pair produces identical scenario content.
- Changing selected pair visibly changes multiple substantive mission elements without altering factual evidence for cosmetic variety.
- Normal sessions have three unique board-specific checkpoints. Sparse sessions use every suitable board once, have three coaching checkpoints overall, and have exactly `min(3, suitable evidence items)` board-specific checkpoints.
- Every report-derived copy segment matches its field-level provenance and confidence; mixed speeches keep report facts, static advice, and fiction separately labeled.
- System Notes absorbs/depletes exactly as specified, and Honor Reclaimed uses only fixed fictional awards with suit-token—not matchpoint—iconography.
- Game score and real bridge score are clearly separated; all human-gate participants understand that Honor is not restored matchpoints.
- An eligible `match` or `partial` PBN join can supply exactly thirteen unique visible cards labeled as the loaded PBN board/seat, never as a proven session hand; `warning`, `mismatch`, `unknown`, invalid-deal, and results-only cases use exactly thirteen unique Practice Deck cards and never claim otherwise.
- Practice Deck launches as a normal playable FPS with a nonblocking provenance note.
- Throwing all thirteen cards can never leave the player weaponless; movement continues through a 0.4-0.6 second-or-faster Shuffle.
- Report quality does not set combat difficulty.
- The full-body Coach is world-scaled, friendly, present in tutorial/checkpoints, captioned, invulnerable, and non-blocking.
- No real player name, likeness, or pair identity appears on a hostile actor or in hostile speech.
- Results-only, every compatibility status, Defend the Crown boundary, sparse session, replay, multi-section, adjusted-row, invalid-deal, and missing-name paths work.
- Exact browser versions are recorded at finalization. Chromium, Firefox, and WebKit pass automation; real Safari with keyboard-turn fallback passes the macOS manual gate. The FPS minimum is 960×540 CSS pixels after zoom; smaller/mobile/unsuitable cases get Coach-only mode.
- A full run is keyboard-completable without requesting Pointer Lock. Skip Tutorial, replayable Help, pause, exit, mute, captions, FOV/sensitivity, reduced motion, high contrast, Practice, and Coach-only all work.
- At 960×540 post-zoom CSS pixels, mandatory FPS semantic UI is readable. When 200% zoom reduces the CSS viewport below that threshold, the complete Coach-only route activates and remains readable.
- Coach-only exposes the same briefing, three checkpoint summaries/expandable evidence, practice action, and debrief as the FPS.
- The canvas has an accessible description and objective, pause, completion, and error changes are exposed through semantic DOM/live status.
- WebGL initialization failure offers Coach-only; context loss offers clean restart or Coach-only.
- Source and built-site runs make only expected same-origin static-asset requests. No session data is transmitted, persisted, or placed in URLs.
- The cold-cache complete required lazy payload is no more than 3 MiB and reaches ready preflight within 2 seconds on the named Phase 1 baseline; no required gameplay asset remains to stream after Start, and the game sustains the performance targets there.
- The main analyzer contains no Three.js/game payload before activation, only a measured loader/view delta.
- Dynamic-load or asset failure leaves the report usable and restores focus/modal state.
- Closing leaves no app-owned input, animation, audio, pointer lock, DOM, geometry, material, or texture reachable.
- Asset provenance and dependency licenses are complete.
- Unit, integration, browser, accessibility, reachability, cleanup, source, built-site, and existing Barbelo regression suites pass in CI with committed synthetic fixtures.
- In a gate of at least five new players, at least four identify the objective and finish without help, median completion is 8-12 minutes, no more than one flags any named pacing blocker, and all five distinguish Honor from real matchpoints.
- The Pair Improvement Report has no simulator launch control before the Phase 8 finalization decision.

## 22. Open decisions for the first implementation review

These do not block the plan, but Phase 0 should settle them:

1. Confirm **The Lost Matchpoints** as the level/story subtitle or choose another.
2. Approve vendoring Three.js as the fidelity-driven exception to the dependency-free runtime.
3. Name the exact Phase 1 hardware/OS/browser performance baseline.
4. Decide after the first playable whether optional synthesized music earns its payload and production cost; sound effects/captions remain required.

## 23. Research references

Repository seams:

- `src/ui/reportView.js`: selected report construction, This Week, and eventual launch location.
- `src/ui/quizView.js`: same-page overlay preparation/lifecycle pattern.
- `src/ui/state.js`, `src/ui/controller.js`, `src/ui/io.js`: in-memory state, pair changes, rendering, and global events.
- `src/core/report.js`, `src/core/exercises.js`, `src/core/types.js`: report evidence, deterministic exercises, and data shapes.
- `docs/ARCHITECTURE.md`: no-build development, static deployment, and core/UI boundaries.

External technical references:

- [Three.js installation and static/local serving](https://threejs.org/manual/en/installation.html)
- [Three.js upstream MIT license](https://github.com/mrdoob/three.js/blob/dev/LICENSE) (implementation must record a pinned release URL/hash)
- [Three.js sprites](https://threejs.org/docs/pages/Sprite.html)
- [Three.js raycasting](https://threejs.org/docs/pages/Raycaster.html)
- [Three.js Pointer Lock controls](https://threejs.org/docs/pages/PointerLockControls.html)
- [Three.js official FPS example](https://threejs.org/examples/games_fps.html)
- [Three.js WebGLRenderer lifecycle and diagnostics](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API)
- [Animation timing with `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [Web Audio best practices and autoplay constraints](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Playwright browser/version behavior](https://playwright.dev/docs/browsers)
- [Apple Safari WebDriver testing](https://developer.apple.com/documentation/webkit/testing-with-webdriver-in-safari)
- [Canvas performance guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [Crisp pixel-art canvas scaling](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look)
- [Web Storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Three.js texture filtering and memory behavior](https://threejs.org/manual/en/textures.html)
- [Three.js static-geometry optimization](https://threejs.org/manual/en/optimize-lots-of-objects.html)
- [Official Doom source release and its explicit separation from game data](https://github.com/id-Software/DOOM)
- [Freedoom explanation of free engine code versus proprietary Doom content](https://freedoom.github.io/about.html)
- [U.S. Copyright Office video-game registration guidance](https://www.copyright.gov/register/tx-games.html)
- [USPTO likelihood-of-confusion guidance](https://www.uspto.gov/trademarks/search/likelihood-confusion)
