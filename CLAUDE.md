# CLAUDE.md — Household Finance OS

ADHD-first personal finance app for a two-person household (Eimer + Ashley), US/DR dual-currency, statement-upload driven. The full specification is in `docs/DESIGN.md` — **read it before planning any milestone.** Backlog ideas go to `docs/SOMEDAY.md`, never into scope.

## Non-negotiable invariants

1. **Money is integer minor units + ISO currency code.** `amount_minor: bigint` paired with `currency`. Never floats, never a bare number. Use branded types (`Minor`, `CurrencyCode`).
2. **The LLM never computes money math.** Balances, budgets, envelopes, affordability, taxes = deterministic pure functions in the engine. LLM jobs are only: PDF extraction, category suggestion, phrasing pre-computed insights (numbers passed as immutable slots), intent parsing.
3. **The balance gate is inviolable.** A statement enters the ledger only if `opening + Σ(transactions) = closing` to the cent. Retry extraction once, then fix queue. Never bypass, never fudge.
4. **Immutability past `locked_through`.** Reconciled-period transactions are never edited or hard-deleted; corrections create superseding rows.
5. **Mask before the API.** Account numbers/names are masked (`····4471`) before any data leaves the server for the Claude API. API key lives server-side only.
6. **Single-entry ledger + `transfer_group`.** Do not introduce double-entry/journal entries, even though the owner is a bookkeeper. Transfers = two rows sharing a group id, excluded from spending.
7. **One envelope abstraction.** Goals, sinking funds, and tax set-asides share the `envelopes`/`allocations` model and one code path. Do not fork them into separate features.
8. **Binder crypto is client-side.** PIN → Argon2id → AES-GCM in the browser; server stores ciphertext only. No passwords stored anywhere in the app, ever.

## Stack (fixed — don't relitigate)

TypeScript end-to-end · React + Vite + Tailwind PWA · TanStack Query with IndexedDB persistence · offline outbox for quick-add writes (client UUIDs, idempotent) · Node + Hono · Drizzle · server-side SQLite + Litestream → R2 · Caddy on one VPS · passkeys via Lucia + magic-link fallback · Claude API (Sonnet-tier PDF extraction, Haiku-tier categorization, Batches for backlogs) · Docker Compose, deploy via GitHub Action over SSH.

## Repo conventions

- `packages/engine` — pure functions only (money, FX, safe-to-spend, balance gate, envelopes, tax calc). **Tests first**: unit tests + property-based tests (reconciliation: for any generated statement, the equation holds or the gate rejects). No I/O in this package.
- `packages/server` — Hono API, Drizzle schema, jobs (cron: FX rates, bill detection, insights, check-in prompts).
- `packages/app` — the PWA. Exactly five UI patterns: hero number, prompt card, question card, progress bar, record card. If a screen needs a sixth, the design is wrong — stop and flag it.
- Every session ends deployable: commit + deploy. Small PRs per module.

## Product rules (UX/copy)

- Sentence case. Observations, not verdicts. Always name the comparison window. No exclamation-point cheer; if there's no genuine win, say a neutral truth.
- **No red badges or backlog counts, anywhere.** Prompts are gentle cards; deferral is scheduling ("Tonight"), not dismissal.
- Every guided mode (check-in, catch-up, binder, reconcile) is resumable: one question per screen, auto-save per step, exit without penalty, deep-link back to the exact step.
- Quick add: amount is the only required field; category optional; no way to fail the screen. No AI commentary on this surface.
- Stale data is always labeled ("data through <date>"); a stale Home is replaced by the catch-up invitation.
- Max five categorization questions per session; remainder carries forward.

## Roadmap discipline

Build in order: **M0 skeleton → M1 ledger (Ashley onboards) → M2 AI intake (starts with the real-PDF spike) → M3 rhythm → M4 depth.** Do not build ahead of the current milestone; new ideas go to `docs/SOMEDAY.md`. MVP is behavioral: *every week, statements go in, get reconciled, and Home tells the truth.*

## Workflow

Start each milestone in plan mode and get the plan approved before writing code. For engine work, write the failing tests first. Verify current Claude API model names and batch pricing at docs.claude.com before wiring the AI integration.
