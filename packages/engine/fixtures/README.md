# CSV fixtures

Drop real (scrubbed) bank CSV exports here to refine the presets in
`src/csv/presets.ts` and pin them with tests:

- `banco-popular.csv` — Banco Popular (DR) account export
- `parval.csv` — Parval (DR) export
- `chase.csv` — Chase checking or card export
- `bank-of-america.csv` — BofA export (keep the summary preamble intact)
- `relay.csv` — Relay export (keep the sub-account column)

Scrub account numbers and names first; amounts/dates/descriptions are what
matter. Until real samples land, the preset tests use synthetic fixtures.
