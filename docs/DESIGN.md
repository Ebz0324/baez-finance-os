# Household Finance OS — Design Document

**Status:** Approved (design phases 1–8 complete). Implementation follows the roadmap in §8, one milestone at a time.
**Companion file:** `CLAUDE.md` at the repo root holds the non-negotiable invariants and conventions. This document is the full specification.
**Household:** Two adults (Eimer — "the Operator"; Ashley — "the Partner"), based in the Dominican Republic with US and DR financial lives.

---

## 1. Vision & Requirements

A personal finance operating system for one household that feels like an intelligent assistant, not a spreadsheet. Designed ADHD-first: extremely low mental load, minimal data entry, one question at a time, resumable everything, dopamine-friendly feedback, zero shame.

### Foundational decisions (locked)

1. **Multi-currency from day one.** USD and DOP accounts coexist. Every transaction carries a currency; every account has one fixed currency; the household consolidates to USD at display time using a daily FX rate table. Stored amounts are never mutated by conversion. Historical views use the rate as of the snapshot date.
2. **Statement-upload-first. No bank aggregation APIs.** Data sources are: PDF/CSV statement uploads and manual quick entry. The parser must handle Spanish-language DR bank statements (Banco Popular, Parval) and US formats. DR is cash-heavy, so quick cash entry is a primary input path, not an afterthought.
3. **Reconciliation, not just import.** Every imported statement must satisfy `opening_balance + Σ(transactions) = closing_balance` before entering the ledger. This catches duplicates, misreads, and gaps deterministically, and produces the satisfying "reconciled ✓" done-state.
4. **Tax jurisdictions interact; they aren't parallel.** The system models US federal (MFJ, SE tax on 1099 income, quarterly estimates) and DR (DGII) obligations, including FEIE vs. Form 1116 treatment as user-configured parameters. Set-asides accrue automatically from tagged income.
5. **Privacy posture:** server-authoritative but self-hosted; binder contents encrypted client-side; account identifiers masked before any LLM call; auth separated from financial data. No passwords stored anywhere in the app.
6. **Separate product from the owner's business bookkeeping app.** This is the household layer. It may later export figures useful for Schedule C, but shares no code or database.

### Distinctive features (beyond the original brief)

- **Money date mode** — the weekly check-in designed as a shared 15-minute couple session.
- **Sinking funds** — auto-detected annual/irregular expenses pre-funded monthly.
- **Confidence-scored categorization** — the AI only asks about low-confidence transactions, batched to five questions max per session.
- **Immutable locked periods** — reconciled periods lock; corrections supersede rather than edit.
- **One-number daily view** — "safe to spend" is the default screen; everything else is one tap deeper.

---

## 2. Personas & Journeys

### Personas

**The Operator (Eimer).** Finance professional; bottleneck is activation energy, not comprehension. Wants power features (tax modeling, reconciliation, per-source income) available but never in the way. Mac + phone. Failure mode: builds systems, uses intensely, lapses during busy client seasons, and backlog guilt prevents re-entry. → *The app must be cheap to return to, not just cheap to use.*

**The Partner (Ashley).** Capable, not finance-native, phone-only. Needs: know we're okay, know what's expected this week, be able to run everything solo in an emergency (the binder is *for her* and must be legible *to her*). Failure mode: if her only role is confirming the Operator's work, she disengages. → *She needs her own jobs: quick cash entry, the shared check-in, goal celebrations.*

**The core design problem is the asymmetry.** One operator, one partner. The partner path is deliberately simpler; the operator's complexity is hidden from shared views.

### Journeys (behavioral contracts)

1. **Daily glance (10 s, both).** Open → safe-to-spend + one-line status + at most one gentle prompt. Nothing requires action. Success metric: the app gets opened on days when nothing is wrong.
2. **Quick cash entry (15 s, mostly Ashley).** Big + → amount (DOP/USD toggle remembered) → tap one of six recent categories → done. Category optional; no merchant, no notes, no confirmation dialog.
3. **Weekly money date (15 min, together).** App initiates. Six visible steps: upload statements → auto-reconcile → five batched questions → week vs. usual → one insight → one celebrated win. Every step skippable; progress auto-saves; interruption resumes exactly where left off; session ends on the win.
4. **Statement upload & reconcile (Operator).** Drag PDF → parse status → "N transactions, M auto-categorized, statement balances ✓" → review the uncertain few → lock the period. The checkmark is the reward; the locked period kills re-litigation doubt.
5. **"Can we afford this?" (2 min, either).** Conversational in, plain-language verdict out with one supporting number and an optional priced tradeoff. Never a raw budget table. Tone matters most here.
6. **Quarterly tax moment (Operator only, hidden from shared views).** Two weeks before each IRS/DGII deadline: confirmation that the set-aside covers it, or a concrete catch-up number. The set-aside accrued quietly all quarter.
7. **The return after absence — the most important journey.** After weeks away: "Welcome back. Want a 10-minute catch-up?" Bulk-parse, aggressively auto-categorize, reconcile, present one reassuring summary, ask only what's unclear. Streaks pause, never break. Returning must be easier than staying away. No red numbers, no backlog counts, ever.
8. **Emergency binder (guided interview).** One account per 5-minute session, resumable over weeks. Completeness meter; past 80%, prompt a "fire drill" where Ashley opens the binder solo and confirms she could act on it.

**Patterns across all journeys:** the app initiates, the human confirms; every task is resumable; every session ends positive; lapsing is treated as normal.

---

## 3. Information Architecture

Three layers:

**Everyday layer (permanent surface).** Scope switcher at top of every screen — *me / household / partner* — a pure filter, never a mode; defaults to household, persists per user. Four tabs: **Home** (glance screen; check-in prompts launch here), **Money** (spending, auto-budget, accounts, net worth — stacked scrollable cards, no sub-tabs), **Goals** (progress bars, sinking funds), **Household** (bills + autopay status, subscriptions, maintenance, binder behind PIN). One **global +** opening exactly four options: cash expense, income received, upload statement, "can we afford…?"

**Guided modes (full-screen takeovers, not pages).** Weekly check-in, catch-up, binder interview, statement reconcile. Contract: launched by the app or a Home prompt; one question per screen; visible progress bar; auto-saved per step; exitable anytime without penalty; re-entered at the exact resumption point. Notifications always deep-link to the resumption point, never to a dashboard.

**Operator workspace (behind a profile toggle; absent from partner's app by default).** Taxes (IRS + DGII calendars, set-aside config), income by source, categorization rules, data export/backup. Surfaces in shared views only as conclusions ("tax set-aside on track ✓"), never workings.

### Navigation laws

1. Two taps max from Home to anything done weekly; three for rare tasks.
2. **No red badges, ever.** Prompts are gentle cards on Home; unread counts are guilt mechanics and guilt drives churn.
3. Locked periods render collapsed + checkmarked — finished work reads as finished.
4. Empty/stale states always offer the next action; a stale Home is *replaced* by the catch-up invitation, never shown as if current.
5. Destructive/complex actions (delete, unlock, edit rules) live behind overflow menus, never beside frequent taps.

---

## 4. Screen Patterns & UX Rules

Five patterns cover the entire product — nothing may look unfamiliar:
**hero number** (Home), **prompt card** (invitations), **question card** (one item, one question, 2–3 big answers, AI's best guess first and visually distinct), **progress bar** (modes, goals, envelopes, binder meter), **record card** (accounts, binder entries, bills).

### Screen specs

**Home.** One permission number ("safe to spend this week"), not a judgment number. Beneath it, the trust line ("both accounts reconciled" or "based on data through <date>" — the app never quietly lies). One status line leading with reassurance and naming the next concrete event. At most one prompt card; its deferral option is a scheduling act ("Tonight"), never "Dismiss." Streak line. Tab bar with center +.

**Quick add.** Amount is the only required field. Currency toggle remembers last state per user. Six most-frequent category chips (reordered nightly); "Other…" is the sole path to the full list. No chip → saves uncategorized and becomes a future batched question. Save → brief confirmation → close. There is no way to fail this screen.

**Check-in question step.** One transaction card, "What was this?", three buttons with the best guess first (tapping it is the common case and trains a merchant rule). Skip link states its consequence honestly ("I'll keep my guesses"). Footer: "Progress saves automatically. Leave anytime."

**Catch-up / return screen.** Replaces Home when data is stale. Warm greeting; normalizes the lapse; lists what the app will handle (parse, categorize, reconcile, ~N questions); primary "Start catch-up," secondary "Show me today instead" (respected, with stale-data label). "Your streak is paused, not broken."

### Voice & copy rules

Sentence case everywhere. Observations, not verdicts. Always name the comparison window ("vs. your usual 3-month average"). Celebrate specifics, not effort. No exclamation-mark cheerfulness; if no genuine win exists, say something neutral and true ("steady week — everything reconciled") rather than manufacturing praise. No commentary of any kind on the quick-add surface.

---

## 5. Data Model

### Design decisions

1. **Single-entry ledger with transfer groups — deliberately not double-entry.** One signed row per transaction against one account; a transfer's two legs share `transfer_group`. The per-statement balance equation supplies the error-catching that double-entry would, at the account boundary where it matters. Do not introduce journal entries.
2. **Money = integer minor units + ISO currency code.** `amount_minor BIGINT`, `currency CHAR(3)`. Never floats, never a bare number. Accounts have one fixed currency; transactions inherit it.
3. **Statements are first-class and drive state.** Lifecycle: uploaded → parsed → in_review → reconciled. Reconciliation advances the account's `locked_through`; transactions on or before that date are immutable — corrections create superseding entries (audit trail for free).
4. **Categorization is provenance-tracked.** `cat_source ∈ {rule, ai, user}` + `confidence`. The five-questions queue is literally: uncategorized OR confidence < threshold, LIMIT 5. Answers upsert `merchant_rules`; the same merchant is never asked twice.
5. **One envelope abstraction.** Goals, sinking funds, and tax set-asides are the same structure: named target + virtual allocations over real balances. `envelopes.kind ∈ {goal, sinking, tax}`. Safe-to-spend ≡ liquid balances − unallocated upcoming bills − Σ envelope balances.

### Schema

```
household(id PK, name, base_currency)
users(id PK, household_id FK, name, role {operator|partner}, default_scope)

accounts(id PK, owner_id FK→users, name, kind {checking|savings|cash|card|cd|brokerage|retirement|property|vehicle|liability|custom},
         currency, scope {me|partner|household}, locked_through DATE)

statements(id PK, account_id FK, period_start, period_end,
           opening_minor BIGINT, closing_minor BIGINT, file_ref,
           status {uploaded|parsed|in_review|reconciled|failed})

transactions(id PK, account_id FK, statement_id FK NULL, category_id FK NULL,
             posted_on DATE, amount_minor BIGINT, currency CHAR(3),
             merchant_raw, merchant_norm, cat_source {rule|ai|user} NULL,
             confidence REAL NULL, transfer_group UUID NULL,
             superseded_by FK→transactions NULL, created_by FK→users, created_at)

categories(id PK, parent_id FK NULL, name, kind {expense|income|transfer})
merchant_rules(id PK, category_id FK, pattern, scope, hit_count, last_used)

fx_rates(rate_date, pair, rate)                      -- reference data, no FKs

income_sources(id PK, user_id FK, name, kind {w2|c1099|business|rental|investment|custom},
               jurisdiction {US|DO}, currency, set_aside_pct REAL)

envelopes(id PK, user_id FK, kind {goal|sinking|tax}, name,
          target_minor BIGINT, target_date DATE NULL, funding_rule JSON)
allocations(id PK, envelope_id FK, amount_minor BIGINT, alloc_on DATE,
            source {auto|manual|income_pct})

bills(id PK, household_id FK, name, cadence, due_day, autopay BOOL,
      amount_est_minor BIGINT, currency, detected BOOL, confirmed BOOL)

binder_entries(id PK, household_id FK, institution, kind,
               encrypted_payload BLOB, reviewed_on DATE)
   -- payload encrypted client-side (binder PIN → Argon2id → AES-GCM);
   -- institution + kind stay plaintext for listing; NO passwords ever stored.

sessions(id PK, user_id FK, kind {checkin|catchup|binder|reconcile},
         current_step INT, state JSON, started_at, completed_at NULL)

insights(id PK, household_id FK, generator, payload JSON,
         shown_at NULL, dismissed_at NULL)          -- dismissal suppresses ~6 weeks

-- Derived / materialized (regenerable from the ledger; never user-edited):
budget_lines(category_id, month, amount_minor, method)
net_worth_snapshots(scope, as_of DATE, assets_minor, liabilities_minor, base_currency)
```

Sync architecture: server-authoritative; clients read from a persisted cache and write through an offline outbox with client-generated UUIDs (idempotent replay). Last-write-wins per row; the audit trail covers rare conflicts. No CRDT/sync engine.

---

## 6. AI Layer

### Prime directive

**The LLM never touches money math.** All balances, budgets, envelope math, affordability, and tax arithmetic are deterministic pure functions over the ledger. The LLM has exactly four jobs: extract transactions from PDFs, suggest categories, phrase pre-computed insights, parse user intent in conversational flows.

### Statement pipeline

upload → extract → balance gate → categorize → review queue.

- CSVs parse deterministically via per-bank column maps. Only PDFs invoke the LLM, which returns strict JSON (date, description, amount, direction) — transcription only, English or Spanish.
- **Masking:** account numbers/names are masked (`····4471`) before anything is sent to the API.
- **Balance gate (the hallucination firewall):** if extracted rows don't satisfy the balance equation to the cent, the statement never enters the ledger. Retry extraction once, then fix queue with the specific gap shown. A parse error may inconvenience; it may never silently corrupt.
- **Categorization precedence:** user rules → learned merchant rules → LLM suggestion with confidence. ≥ 0.85 applies silently (provenance still `ai`); below, joins the question queue (five per session, remainder carried).

### The coach: generators + narrator

Deterministic **generators** produce candidate facts (spending deltas vs. trailing average, new recurring charges, bill/balance collisions, envelope milestones, streaks, savings wins). Candidates are scored (relevance, actionability, novelty); one winner per surface. Only then does the LLM phrase it, with numbers passed as immutable slots it must use verbatim.

**Voice charter:** observations, never verdicts; always name the comparison window; at most one suggestion, phrased as an option; celebrate specifics.

**Forbidden (enforced structurally where possible):** never two corrective insights in a row; dismissed insights suppressed six weeks; no comparisons to other people; no commentary during quick add; check-in wrap-ups end on the strongest genuine win, or a neutral truth if none exists; the narrator can never introduce a number not in its slots.

### "Can we afford this?"

LLM parses the utterance to {amount, currency, timing, envelope match}; at most one clarifying question. The affordability engine answers from discretionary remaining, upcoming committed bills, and envelope impact. Template: verdict → one supporting number → optional priced tradeoff ("…it could come from the vacation fund, pushing that goal out ~5 weeks. Want that?"). Never a flat no; never a lecture. Above a household-set threshold: add one line of goal impact and offer to flag for the weekly check-in.

### Tax logic: engine, not advisor

The Operator is the credentialed professional. Rates, brackets, SE-tax treatment, FEIE-vs-1116 election, and DGII parameters are **configuration he maintains**; the engine computes set-asides and quarterly amounts from config + ledger, always labeled "estimate — based on your settings." The LLM is not in this loop.

### Cost & degradation

One LLM call per statement (not per transaction); one narration call per check-in; every answered question converts a future LLM call into a free rule lookup. Cheap model tier for categorization; stronger tier for PDF extraction; Batches API for catch-up backlogs. Every AI feature has a one-tap manual fallback; offline, the app degrades to a fully working ledger (quick add, viewing, reconciliation), never a locked door.

---

## 7. Technology Stack

Constraint that outranks all others: solo-maintained, two users. Boring, cheap, impossible to babysit.

- **Language:** TypeScript end-to-end (frontend, backend, shared engine types). F#-style discipline via branded types (`Minor`, `CurrencyCode`) and discriminated unions; illegal states unrepresentable.
- **Frontend:** React + Vite + Tailwind, installable PWA (offline-capable, home-screen icon, iOS web push ≥ 16.4). Recharts for dashboards. TanStack Query with cache persisted to IndexedDB → Home opens instantly to last-known-good even offline.
- **Offline writes:** outbox pattern for quick add only (client UUIDs, idempotent replay). Statements need the network anyway.
- **Backend:** Node + Hono (or Fastify), Drizzle ORM.
- **Storage:** server-side **SQLite + Litestream** replicating continuously to object storage (Backblaze B2 / Cloudflare R2). Alternative if zero ops preferred: managed Postgres (Neon) — Drizzle makes this a config swap.
- **Hosting:** one small VPS (Hetzner / Fly.io, ~$5–10/mo) behind Caddy (auto-HTTPS). Cron on the same box: nightly FX rates, bill detection, insight generation, weekly check-in prompts.
- **Auth:** passkeys (WebAuthn) primary via a small library (e.g. Lucia), magic-link email fallback, HTTP-only cookie sessions. Binder: PIN → Argon2id (WebCrypto/WASM) → AES-GCM, client-side; server and backups hold only ciphertext. Print a recovery phrase and store it with physical documents (note this inside the binder itself).
- **AI:** Claude API, server-side only (key never ships to clients). Sonnet-tier for PDF extraction (API accepts PDFs directly, incl. scanned — no separate OCR pipeline) with tool-use-enforced JSON; Haiku-tier for categorization; Message Batches for backlogs. Expected cost: low single dollars/month, declining as rules accumulate. Verify current model names/pricing at docs.claude.com at build time.
- **Deploy:** Docker Compose (Caddy + app + Litestream), single GitHub Action over SSH. Free healthcheck ping for uptime.
- **Backups:** Litestream (point-in-time) + nightly encrypted full export (SQLite file + human-readable CSV bundle) to R2. The CSV bundle is the user-facing "make backups easy" feature and the escape hatch.
- **Testing:** concentrate where wrongness costs money — exhaustive unit tests on the engine's pure functions; property-based tests on reconciliation (for any generated statement, the balance equation holds or the gate rejects). UI testing stays light.

---

## 8. Roadmap

Organizing principle: **get real household data flowing as early as possible** — auto-budget, insights, bill detection, and seasonal models are *calendar-gated* (they need months of history), so the clock must start in month one. Estimation unit: weekends.

| Milestone | Contents | Estimate |
|---|---|---|
| **M0 — Walking skeleton** | Repo, VPS, Caddy, passkey auth, deploy pipeline, empty Home in production. Ship the empty app before any feature. | 1 weekend |
| **M1 — The ledger** *(household goes live)* | Accounts, quick add + offline outbox, CSV import through the balance gate, manual categories, scope switcher, safe-to-spend v1. **Ashley onboards here.** | 3–4 weekends |
| **M2 — AI intake** | Opens with a one-day **spike**: real Banco Popular / Parval / US PDFs vs. the Claude API, measuring balance-gate pass rate — the project's biggest technical risk, resolved first. Then: extraction + masking, rules-then-AI categorization, five-questions flow, reconcile + lock. If a bank's PDFs prove stubborn, CSV-only for that bank is a fine permanent answer. | 3 weekends |
| **M3 — The rhythm** | Weekly check-in mode, prompt cards, streaks, **catch-up mode** (lapses start immediately — not a v2 luxury), insights v1 (2–3 generators). | 2–3 weekends |
| **M4 — Depth (v2)** | Envelopes (goals/sinking/tax set-asides), bill detection + household dashboard, net worth snapshots, "can we afford", auto-budget (data now exists), binder + client-side crypto (fully independent — good low-energy parallel project). | 4–6 weekends |
| **M5+ — Later** | Full IRS + DGII quarterly calendars in the operator workspace, Spanish UI toggle, voice quick-add, seasonal models (12+ months of data), possible client white-label track. | ongoing |

**MVP definition (behavioral):** *every week, statements go in, get reconciled, and Home tells the truth* — that's M1+M2, ~7 weekends.

**Sequencing rationale:** Ashley onboards at M1, not M3 — her habit is quick add, which works fully at M1; habits compound like data. Catch-up ships in M3 because the first busy client week arrives immediately.

**Risks:** (1) DR bank PDF formats — mitigated by the M2 spike. (2) **Scope creep is the boss fight** — the original brief lists ~100 capabilities; anything outside M0–M4 goes to `docs/SOMEDAY.md`, reviewed quarterly, never acted on at midnight. (3) The three-week motivational trough mid-M1 — mitigated by M0: every weekend's work deploys to a real URL on real phones.

---

## Appendix: SOMEDAY.md seed

Voice input · Spanish UI · seasonal spending models · home inventory · appliance warranties & vehicle maintenance logs · medical appointment tracking · investment performance analytics · crypto tracking · white-label/client mode · native app wrappers · shared grocery-budget widget · anniversary/renewal negotiation reminders.
