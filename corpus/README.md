# External BWS compatibility fixtures

Bridge Systems BV publishes blank Bridgemate BWS templates that can be useful
for optional, manual parser compatibility checks. They are not included in the
current tree and are not covered by Barbelo's MIT license; historical commits
may retain earlier copies. Download them directly from the publisher only when
needed, comply with the publisher's
[Terms of Use](https://www.bridgemate.com/legal-information/terms-of-use/),
and do not commit downloaded copies.

The following manifest records the last files inspected by this project. The
hashes let a developer verify that a later download is the same artifact.

## Upstream manifest

- `Template_Access97_v5.bws`
  - Source: https://www.bridgemate.com/resources/developer/Template_Access97_v5.bws
  - Format: Access 97 / Jet 3
  - SHA-256: `0abe6df723ad3a19042626ee9439986179f3f875461727046a42a6fcc544e6e1`

- `Template_Access2000_v5.bws`
  - Source: https://www.bridgemate.com/resources/developer/Template_Access2000_v5.bws
  - Format: Access 2000-2003 / Jet 4
  - SHA-256: `b9dc23c2ab3d5f120214eeb44f80bd99e234ce0a8919ef7ee98d43b336146b2e`

- `defaultm.bws`
  - Source: https://www.bridgemate.com/resources/developer/defaultm.bws
  - Format: Access 97 / Jet 3
  - Producer property: `ACBLscore`
  - SHA-256: `b23d6587ad9aa717bdcd08981d7614d7a59102b6a94b6dbf494c35a51bc51d28`
  - Role: Blank ACBLscore compatibility template with legacy physical field ordering.

Downloaded and verified on 2026-07-09 from Bridgemate's official
"Template (blank) .bws score files" developer support page:

https://support.bridgemate.com/en/support/solutions/articles/44001826950-template-blank-bws-score-files

`defaultm.bws` was downloaded from its official developer-resources URL. The
publisher describes its ACBLscore integration context in
[this support article](https://www.bridgemate.com/news/windows-11-update-affects-bcs/).

## Test scope

These are blank databases, not completed event result files. When downloaded,
they are useful for manual checks of:

- Jet 3 versus Jet 4 file detection.
- Empty-table behavior.
- Browser-side import diagnostics for valid BWS files with no result rows.

Inspecting BWS v5 schema layout or legacy ACBLscore physical field ordering
requires a separate database/schema tool; the parser does not infer those
details from blank tables. These templates also do not exercise scoring-result
extraction, player-name recovery, or movement/result analysis.

The normal automated suite uses the synthetic builder in
`test/helpers/bws-fixture.js`; browser and mandatory full-pipeline gates share
the committed session in `test/fixtures/app-session.mjs`. Optional real-event
golden tests use locally supplied, ignored files under `samples/`. None of
these paths depends on this external manifest.
