# BWS Corpus

This directory contains publicly downloadable Bridgemate BWS files used for parser compatibility checks.

## Sources

- `Template_Access97_v5.bws`
  - Source: https://www.bridgemate.com/resources/developer/Template_Access97_v5.bws
  - Format: Access 97 / Jet 3
  - SHA-256: `0abe6df723ad3a19042626ee9439986179f3f875461727046a42a6fcc544e6e1`

- `Template_Access2000_v5.bws`
  - Source: https://www.bridgemate.com/resources/developer/Template_Access2000_v5.bws
  - Format: Access 2000-2003 / Jet 4
  - SHA-256: `b9dc23c2ab3d5f120214eeb44f80bd99e234ce0a8919ef7ee98d43b336146b2e`

Downloaded on 2026-07-09 from Bridgemate's official "Template (blank) .bws score files" developer support page:

https://support.bridgemate.com/en/support/solutions/articles/44001826950-template-blank-bws-score-files

## Notes

These are blank template databases, not completed event result files. They are still useful for validating:

- Jet 3 versus Jet 4 file detection.
- Current BWS v5 table/column layout.
- Empty-table behavior.
- Browser-side import diagnostics for valid BWS files with no result rows.

They do not exercise scoring-result extraction, player-name recovery, or movement/result analysis.
