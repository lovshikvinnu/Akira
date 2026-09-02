# Stage 1B — Summary

**Scope:** Diagnostics subsystem recovery + clean installation verification.
**HEAD:** `b561730` · **Date:** 2026-09-02

| Report | |
| :--- | :--- |
| [`stage-1b-diagnostics-baseline.md`](stage-1b-diagnostics-baseline.md) | Pre-modification error capture |
| [`stage-1b-diagnostics-investigation.md`](stage-1b-diagnostics-investigation.md) | Census, Git evidence, classification, escalation |
| [`stage-1b-clean-install-verification.md`](stage-1b-clean-install-verification.md) | Two isolated environments, full results |

---

## Current Build Integrity

Measured on the development machine **and independently reproduced** in a clean isolated copy (E2).

| Gate | Status | Evidence |
| :--- | :--- | :--- |
| **TypeScript** | **FAIL** | 9 errors — 7 diagnostics + 2 event-contract. Both groups are documented deliberate holds. Down from 103 at Stage 1A baseline. |
| **Production Build** | **PASS** | `npx vite build` exit 0 — client 2,336 / server 435 / SSR 2,092 modules |
| **Tests** | **PASS (with pre-existing limitation)** | 327 tests passed, 0 failed. 23 of 42 files execute; 19 fail to load — the pre-existing hand-rolled scripts (Master Audit CRIT-007), unchanged by this stage. |
| **Diagnostics** | **FAIL — escalated, not repaired** | 7 errors in `src/diagnostics/core/diagnostics-manager.ts`. Root cause fully established; repair blocked on an architecture decision. |
| **Fresh Installation** | **FAIL for committed `main`** / **PASS for the recovered tree** | Clean clone of `HEAD`: 103 errors, build exit 1. Clean copy of the working tree: identical to dev machine in every measure. |
| **Startup** | **PASS (documented path, scoped)** | `npm run dev` → `http://localhost:8080`, database initialised from scratch (20 tables / 24 triggers / 38 indexes), 6 routes HTTP 200 SSR-rendered, zero errors logged. Full UI functionality **not** verified. |
| Lint | PASS-equivalent | 22 errors + 1 warning, all `prettier/prettier` formatting — below the 25+1 Stage 1A baseline |
| Architecture validation | **PASS** | `npx tsx scripts/validate-architecture.ts` → 360/360 assertions |

---

## Critical Findings

Only objectively verified findings. Each is reproducible from the evidence cited.

### CF-1 — The Stage 1A build recovery is not committed 🔴

A clean clone of committed `main` **reproduces the original P0 exactly**: 103 TypeScript errors and `vite build` exit 1 on `[UNRESOLVED_IMPORT] '../health/createHealthRuleEngine'` — byte-identical to the Stage 1A baseline.

Cause: three files created in Stage 1A remain untracked.
```
?? src/genesis/planning/health/createHealthRuleEngine.ts
?? src/genesis/planning/health/rules/HealthyRule.ts
?? src/compatibility/adapters/event-adapter.ts
```

**The development machine builds. The repository does not.** Fix is `git add` — no code change.
*Evidence: clean-install report §2.1, §4 (E1), §5 F1.*

### CF-2 — `src/diagnostics/` is an abandoned draft, superseded one day after creation 🟠

Git history is unambiguous:

| Subsystem | First commit | Date |
| :--- | :--- | :--- |
| `src/diagnostics/` | `45f3b5a` | **2026-07-24** — 4 files, never touched again |
| `src/observability/` | `5297517` | **2026-07-25** — 34 files + ADR-021 + 11 architecture docs |

- The 6 missing modules **have never existed in any form**: `git rev-list --all --objects | grep -Ei "health-checker|performance-monitor|startup-profiler|diagnostics-exporter|metrics-collector|event-metrics"` returns nothing. `-S` content search finds each symbol only in `45f3b5a`, only as the broken import.
- One branch, no stash, two dangling objects (one tree, one blob) — nothing recoverable.
- **`src/diagnostics/` is documented nowhere** — no ADR, no `DIRECTORY_STRUCTURE.md`, no `ARCHITECTURE.md`, no `MODULE_CONTRACT.md`.
- ADR-021 explicitly claims its scope: *"we require system-wide observability (Metrics, Logs, Traces, **Diagnostics, Health**, Auditing, and **Resource Monitoring**)"*.
- `PACKAGE_STRUCTURE.md` assigns **every one** of the 6 missing modules a documented home inside `src/observability/` (`health/`, `resources/`, `exporters/`, `metrics/`, `events/`).

Classification: errors 1–6 = **D (STALE REFERENCE)**; error 7 = **C (INCOMPLETE IMPLEMENTATION)**.
*Evidence: investigation §4, §5.*

### CF-3 — The 7 diagnostics errors are inert 🟡

`src/diagnostics/` has **zero importers**, is unreachable from every entry point (`grep` across `src/routes`, `src/app`, `src/server.ts`, `src/router.tsx`, `src/start.ts` → no reference), and has zero test coverage. This is why the production build passes at exit 0 with all 7 outstanding — `rolldown` never resolves the subsystem.

They block `tsc` and nothing else.
*Evidence: baseline §5.*

### CF-4 — AKIRA has three unrelated "Diagnostics" implementations, two unreachable 🟠

| | Location | Compiles | Importers | Documented |
| :--- | :--- | :--- | ---: | :--- |
| A — Runtime Diagnostics | `src/diagnostics/` | **No** (7 errors) | **0** | **Nowhere** |
| B — Observability Diagnostics | `src/observability/diagnostics/` | Yes | **0** | ADR-021 + 11 docs |
| C — Analytics Diagnostics | `src/analytics/validation/diagnostics.ts` | Yes | 2 | ADR-015 |

**A and B both export a class named `DiagnosticsService`** with no shared interface. Only C has a live consumer — and its only test contributes 0 assertions under vitest.

Additionally, `src/observability/` has **zero external consumers** repo-wide, its own facade `RuntimeVisibility` is imported by nothing, and **7 of its 17 documented packages do not exist** — including `health/`, `resources/` and `exporters/`, exactly the three that would replace the abandoned draft.

**Deleting `src/diagnostics/` would make `tsc` green while leaving AKIRA with no working diagnostics capability at all.** That is why this stage escalates rather than deletes.
*Evidence: investigation §3.1, §3.3, §3.4, §6.*

### CF-5 — No architectural boundary violation in any diagnostics implementation ✅

`grep -rn "genesis" src/diagnostics src/observability` → no matches. All three implementations report only infrastructure facts (uptime, memory, event rate, schema validity, diagnostic codes). None contains cognitive reasoning. The AKIRA OS / GENESIS boundary holds.

`src/genesis/planning/health/` also uses the word "health" but evaluates *plan* health — a cognitive judgement, correctly located in GENESIS. Naming overlap only.
*Evidence: investigation §6 (Step 5).*

### CF-6 — The recovered source is genuinely reproducible ✅

A clean copy of the working tree, with `node_modules`/`.output`/`.tanstack`/`.wrangler`/`.lovable`/`.git` excluded and a fresh `npm ci`, reproduced the dev machine **exactly**: 9 type errors (same ones), 327 tests passing, build exit 0 with identical module counts, working startup.

No hidden generated source, no global packages, no required secrets, no undocumented build step. `better-sqlite3`'s native binding installs and loads from a plain `npm ci` — verified explicitly, not assumed.
*Evidence: clean-install report §4 (E2), §2.4, §2.6.*

### CF-7 — The `events` table is not part of the initialised schema 🟡

A freshly initialised database contains 20 tables — **`events` is not among them**. `runEventStoreMigration` runs only when `SqliteEventRepository` is constructed, inside the `persistPublishEvent` RPC handler. It appears in neither `schema.sql` nor any dynamic-migration block in `initializer.ts`.

So a fresh AKIRA install has **no Event Store until the first event is published**. This independently corroborates Phase B §4.8 (the instrumentation pipeline has never been exercised against real usage).
*Evidence: clean-install report §4.3.*

### CF-8 — The production build artefact is not self-hostable 🟠

`node .output/server/index.mjs` exits 0 immediately without opening a listener. The output is a Cloudflare Workers `fetch` handler — matching `vite.config.ts`'s own comment, *"nitro (build-only using cloudflare as a default target)"*.

For a "desktop-first, offline-first" product whose every RPC requires `better-sqlite3` (a native module Workers cannot load), this default warrants review. No repository documentation describes running a production build. The documented path (`npm run dev`) works.
*Evidence: clean-install report §4.2, §5 F2.*

### CF-9 — A fresh install writes to live user data by default 🟡

`getDatabasePath()` falls back to `%APPDATA%\AKIRA\akira.db` when `AKIRA_DATABASE_PATH` is unset — so the app, **the test suite, and `validate:architecture`** all target the user's real database unless that variable is set. There is no `.env.example` (though `.gitignore` whitelists one) and no repository file documents the variable.

Evidence this has already occurred: the live database contains an `events` row `id: "evt-async-1"`, `source: "tasks-test"` — a hard-coded test fixture in production data.
*Evidence: clean-install report §2.5.*

---

## Changes Made

### Source modifications in Stage 1B: **none.**

Phase 1 reached its stop condition and escalated. Phase 2 was verification-only, performed in isolated copies outside the repository.

The only files added are the four Stage 1B reports under `docs/recovery/`.

```
$ git status --porcelain | wc -l
37        # 30 modified + 7 untracked — identical to the state Stage 1B began with,
          # plus the 4 Stage 1B documents
```

For completeness, the two diagnostics files that **Stage 1A** (not this stage) modified:

| File | Problem | Root cause | Fix | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| `src/diagnostics/core/diagnostics-context.ts` | `TS2307` unresolved `../interfaces/runtime-adapter`; `TS2729` property used before initialization | Wrong relative path — `RuntimeAdapter` lives in `src/compatibility/interfaces/`. Separately, a class-field initializer read a parameter property, which under `target: ES2022` class-fields semantics evaluates **before** parameter properties are assigned, yielding `undefined` at runtime. | Corrected the import path; moved `runtimeVersion` assignment into the constructor body. Public shape unchanged. | `src/compatibility/interfaces/runtime-adapter.ts` exists and declares `runtimeVersion: string`, exactly what the file consumes. `phase-a-build-recovery.md` §5.2. |
| `src/diagnostics/core/diagnostics-manager.ts` | `TS2307` unresolved `../interfaces/runtime-adapter` | Same wrong path | Corrected the import path only. **The 6 missing-module imports and `DiagnosticError` were deliberately left untouched.** | Same. |

### Verification cleanup

| Item | State |
| :--- | :--- |
| Isolated environments E1 / E2 | Session scratchpad, outside the repository |
| Test dev server | Terminated; port 8080 free |
| Isolated test database | Scratchpad only |
| **User's real database** | **Untouched** — mtime `Jul 25 21:23`, size 1,753,088 b, verified after every phase |
| Package versions | Unmodified in all environments |
| Stray scripts in repo | None |

---

## Remaining Blockers

### 🔴 BLOCKS FOUNDATION RECOVERY

**B-1 — The build recovery is not committed (CF-1).**
A clean clone of `main` does not build. Until the three Stage 1A files are committed, the repository is in the same state the Master Audit condemned, regardless of what this machine does. **One `git add` away from resolved.**

### 🟢 DOES NOT BLOCK FOUNDATION RECOVERY

| | Item |
| :--- | :--- |
| **B-2** | **The 7 diagnostics `tsc` errors (CF-3).** Inert: zero importers, unreachable, build passes. They block a green `tsc` but no capability. They must not be "fixed" by fabricating six modules. |
| **B-3** | **19 test files fail to load.** Pre-existing (Master Audit CRIT-007), unchanged by this stage. Hand-rolled scripts predating the Vitest migration, plus one `@/` alias resolution gap in `vitest.config.ts`. 4,230 lines of test code producing 0 assertions. |
| **B-4** | **`events` table not in the initialised schema (CF-7).** Created lazily on first publish. |
| **B-5** | **No `.env.example`; `AKIRA_DATABASE_PATH` defaults to live user data (CF-9).** Data-safety and documentation gap. |
| **B-6** | **22 lint errors + 1 warning.** All `prettier/prettier` formatting, below baseline. |

### 🟠 REQUIRES ARCHITECTURE DECISION

| | Decision | Detail |
| :--- | :--- | :--- |
| **D-1** | **Fate of `src/diagnostics/` and ownership of platform Diagnostics** | Three options in `stage-1b-diagnostics-investigation.md` §7. **Recommended: Option 2** — remove the stale draft, record `src/observability/` (ADR-021) as sole owner, then build `observability/health/` + `resources/` + `exporters/` against the already-existing `HealthRecord` / `ResourceRecord` / `TelemetrySink` contracts and wire `RuntimeVisibility` into `src/server.ts`. Option 3 (completing `src/diagnostics/`) is rejected: it would require **inventing** a health-scoring algorithm and a contract for `MetricsCollector`, which has no call site at all. |
| **D-2** | **`DiagnosticsService` name collision (CF-4)** | Subsystems A and B export the same class name with no shared interface. Disambiguate whichever survives D-1. |
| **D-3** | **Production deployment target (CF-8)** | The nitro Cloudflare default is incompatible with `better-sqlite3` and with the product's stated desktop-first, offline-first design. |
| **D-4** | **Event contract duplicate keys** | The 2 remaining `TS1117` errors in `src/contracts/events.ts`. Already analysed in `phase-b-event-architecture-reconciliation.md` §6; Phase 1 of that migration plan resolves them. **The migration window is open now** — the live `events` table holds 1 test row, so renaming is currently free. |

---

## Stage 1B Verdict

# REQUIRES REMEDIATION

**One blocker, and it is not the diagnostics subsystem.**

The verdict rests on **CF-1**: a clean clone of committed `main` produces 103 TypeScript errors and a failed production build. Reproducibility is measured by what is committed, and the repository does not contain its own recovery. This is precisely the class of "works on my machine" state that Foundation Recovery exists to eliminate, and `PASS` cannot be claimed while it stands.

**What this stage did establish, and it is substantial:**

- The recovered *source* is **genuinely reproducible** — a clean copy with a fresh `npm ci` matched the development machine exactly across type-check, tests, build and startup (CF-6). No hidden generated files, no global packages, no required secrets, no undocumented steps.
- **Startup works from scratch** — a brand-new database was created and correctly initialised (20 tables, 24 triggers, 38 indexes), and six routes returned SSR-rendered HTTP 200 with zero errors logged (§4.1). Scoped honestly: full UI functionality was not verified.
- The diagnostics mystery is **solved, with Git-level certainty** — an abandoned draft, superseded one day after creation by a documented subsystem that claims its scope, with all six missing modules assigned documented homes elsewhere (CF-2).
- The **AKIRA OS / GENESIS boundary holds** in all three diagnostics implementations (CF-5).

**Why the diagnostics errors did not drive the verdict:** they are inert (CF-3), and the honest repair is blocked on an architecture decision (D-1), not on missing information. I deliberately did not delete `src/diagnostics/` to reach a green compiler, because doing so would have produced a green `tsc` that misrepresents reality — AKIRA would still have no working diagnostics capability, and 3,242 lines of documented observability code would still have zero consumers.

**Path to PASS:**

1. **`git add`** the three Stage 1A files, then re-run the E1 clean-clone verification. This alone converts the reproducibility verdict to *REPRODUCIBLE WITH DOCUMENTED REQUIREMENTS* and clears B-1.
2. **Decide D-1.** Executing Option 1 (removal + ADR note) takes `tsc` from 9 errors to 2 honestly.
3. **Decide D-4** (event contract) — Phase B's Phase 1 clears the final 2 errors and reaches `tsc` = 0.

After steps 1–3, `tsc` is green, the build is green, startup is verified, and every green represents reality. That is the point at which Stage 1B becomes **PASS — Build Integrity Verified**, and the next recovery stage can begin.

Nine honest errors are worth more than zero dishonest ones. I have not manufactured either.
