# Barbelo

Barbelo is a local-first duplicate bridge session analyzer. Open a PBN hand
record, a Bridgemate BWS database, or a results CSV in the browser to inspect
boards, matchpoints, standings, and a Pair Improvement Report. Files are read
locally; the application has no backend, accounts, telemetry, or runtime CDN.

The top-left ouroboros variant also launches Bridge Simulator, a separate,
generic bridge-coaching game package. The alternate monad/compass logo is
non-interactive. The simulator does not receive uploaded files, selected-pair
state, or report data.

## Run locally

The source application needs no build step, but browser modules must be served
over HTTP rather than opened with `file://`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/>. Node.js 22 or newer is required for the
development commands.

## Develop and verify

Install the pinned development tools and run the standard checks:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

`npm run build` creates the deployable `_site/` directory and verifies the
lazy package boundary, retained licenses, simulator payload budget, and
versioned production entry point. Browser-test setup and focused commands are
documented in [test/README.md](test/README.md).

## Project map

- `src/core/` contains the dependency-free, DOM-free analysis engine.
- `src/parsers/` reads PBN, BWS, and results CSV inputs.
- `src/ui/` renders the application and coordinates browser interaction.
- `packages/bridge-simulator/` is a self-contained game package with its own
  content, runtime, assets, tests, license, and vendored renderer dependency.
- `test/` contains analyzer, integration, golden-master, and browser tests.
- `corpus/` documents optional upstream BWS compatibility fixtures; the current
  tree contains no copies of those third-party binaries.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data contracts,
deployment boundaries, scoring invariants, and the full module map.

## License

Barbelo and the original Bridge Simulator package are MIT licensed. Vendored
Three.js remains under its upstream MIT license; simulator asset provenance is
recorded in
[packages/bridge-simulator/assets/ATTRIBUTIONS.md](packages/bridge-simulator/assets/ATTRIBUTIONS.md).
Application-asset provenance is recorded in [assets/README.md](assets/README.md).
