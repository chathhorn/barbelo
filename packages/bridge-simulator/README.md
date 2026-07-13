# Bridge Simulator

Bridge Simulator is a self-contained browser game package. It owns its generic
bridge coaching content, deterministic simulation, renderer, controls,
stylesheet, original art, and pinned Three.js source. It does not import from
Barbelo's analyzer, parsers, report engine, application state, or UI.

The public API is deliberately narrow:

```js
import { launch } from "./src/index.js";

const controller = await launch(document.querySelector("#game"), {
  assetBaseUrl: new URL("./assets/", document.baseURI).href,
  onRequestClose() {},
});

controller.destroy();
```

Consumers provide a host element and the URL from which the package's assets
are served. Optional callbacks report status and request that the embedding UI
close. `levelId: "slice"` selects the short test level; normal launches use the
full level. No uploaded hands, results, pair identities, or coaching reports
are accepted by `launch()`.

Give the host a usable height and include `simulator.css` only when the game is
opened. `launch()` adds the package-owned `.bridge-simulator-root` class, so its
theme and accessibility settings do not depend on an embedding application's
markup. The package stores only display/input preferences under
`bridgeSimulator.settings.v1`; run progress is ephemeral.

The package is source-first and has no install step. Its Three.js copy and
provenance are under `vendor/three/`; original visual-asset provenance is in
`assets/ATTRIBUTIONS.md`.

Run its dependency-free unit suite from this directory with `npm test`. The
tests live alongside the package in `test/`; Barbelo's browser integration
harnesses remain in the repository-level `test/e2e/` directory.
