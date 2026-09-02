# 12 — Documentation Audit

Inventory: 11 root-level markdown files, 105 files under `docs/`. Total documentation exceeds the volume of some subsystems it describes.

Method: every factual claim that could be checked against the code was checked.

---

## DOC-001 — CRITICAL — `CONTRIBUTING.md` prescribes four commands, two of which do not exist

**`CONTRIBUTING.md` §3.3, "Local Checks — Before opening a PR, ensure all checks pass":**
```bash
npm run lint          # Lint inspection
npm run type-check    # TypeScript compiler check      ← DOES NOT EXIST
npm run test          # Execute test suite
npm run build         # Verify build compilation
```

`package.json` scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test`, `validate:architecture`.

| Documented command | Reality |
| :--- | :--- |
| `npm run lint` | Exists — but reports only `prettier/prettier` formatting (QUA-001) |
| `npm run type-check` | **Does not exist.** No `typecheck` script under any name. |
| `npm run test` | Exists — runs bare `vitest`, i.e. **watch mode**, which never terminates. It cannot function as a pre-PR check. |
| `npm run build` | Exists — and **currently fails** (DEP-001) |

**Why this is critical rather than cosmetic:** the document names the exact gate that would have caught the two worst defects in this audit (`type-check` → 103 errors; `build` → unresolved import), and that gate has never been runnable as written. A contributor following `CONTRIBUTING.md` verbatim gets a lint pass, a hung watch process, and a build failure they have no context for.

`TESTING.md` §5 compounds it, documenting three more non-existent scripts:
```bash
npm run test:watch     # DOES NOT EXIST
npm run test:ui        # DOES NOT EXIST
npm run test:coverage  # DOES NOT EXIST
```
(`@vitest/coverage-v8` *is* installed — TST-009.)

---

## DOC-002 — CRITICAL — The changelog claims seven test suites that do not exist and describes a directory tree that was renamed

**`docs/shared/releases/changelog.md`** documents nine sprints, each ending with a line such as:

> *"**Testing**: Built comprehensive tests in `initiative.test.ts` passing 100%."*

Verified against the filesystem:

| Claimed test file | Present? |
| :--- | :--- |
| `initiative.test.ts` | **MISSING** |
| `context-resolution.test.ts` | **MISSING** |
| `habits.test.ts` | **MISSING** |
| `goals.test.ts` | **MISSING** |
| `knowledge.test.ts` | **MISSING** |
| `relationships.test.ts` | **MISSING** |
| `state.test.ts` | **MISSING** |
| `presence.test.ts` | present (but is a hand-rolled script with 0 assertions — TST-002) |

**Seven of eight claimed "passing 100%" suites do not exist in the repository.** The eighth exists and asserts nothing under `vitest`.

Separately, every `src/` path the changelog references is broken. `src/services/` does not exist — the tree was renamed to `src/genesis/` and the changelog was never updated:

```
BROKEN  src/services/companion/initiative/          BROKEN  src/services/memory/
BROKEN  src/services/companion/context-resolution/  BROKEN  src/services/memory/relationships/
BROKEN  src/services/companion/habits/              BROKEN  src/services/memory/validation/
BROKEN  src/services/companion/goals/               BROKEN  src/services/recall/
BROKEN  src/services/companion/knowledge/           BROKEN  src/services/stories/
BROKEN  src/services/companion/relationships/       BROKEN  src/services/identity/
BROKEN  src/services/companion/state/               BROKEN  src/services/importance/
BROKEN  src/services/companion/presence/            BROKEN  src/services/context/
BROKEN  src/services/ai/                            BROKEN  src/services/events/
BROKEN  src/services/akira-store                    BROKEN  src/components/akira/Shell
BROKEN  src/routes/brain-dump                       BROKEN  src/components/akira/primitives
BROKEN  src/routes/daily-mission
```
27 of 27 referenced source paths are invalid.

**Risk:** the changelog is the project's release record and the primary evidence for "v2.17 COMPLETE / v2.18 COMPLETE". Its test-coverage claims are false and its structural references are stale. Any decision made on the basis of "this sprint was tested" is unfounded.

---

## DOC-003 — HIGH — `ROADMAP.md` contradicts the code in both directions

**Claims completeness that does not hold.** §1, *"The following components are fully functional and tested"*:

| Claim | Reality |
| :--- | :--- |
| SQLite Persistence & Triggers | Schema and triggers are good, but writes are fire-and-forget with no error handling (DAT-001) |
| File Vault — "SHA-256 deduplication" | Dedup exists and **corrupts sibling records on soft delete** (DAT-002); the only upload path is named `uploadMockFileServerRpc` (QUA-006) |
| "Cognitive Infrastructure (GENESIS) — read-only memory graphs, recall, story, context, and reflection loops" | Structurally present; receives no reality events (BND-001) and persists nothing (GEN-002) |
| "fully functional and **tested**" | 20 of 42 test files execute zero tests; the build fails |

**Claims incompleteness for something substantial that exists.** §2.1:

> **Dynamic Analytics Dashboard** — *Status: Planned (UI structures exist in `toolsRegistry` as coming-soon).*

Actual: `src/analytics/` is **31 files, 4,661 LOC** with an engine, a repository layer, 700 lines of metric calculators, a query service, a dashboard builder, a rebuild manager, a consistency checker and a benchmark — plus five ADRs (`ADR-011-analytics-architecture`, `ADR-012-core-metrics-framework`, `ADR-013-analytics-query-layer`, `ADR-015-analytics-reliability`) and `docs/platform/ANALYTICS.md`. Calling it "Planned" understates the codebase by ~4,600 lines.

**Defines TITAN and FORGE differently from the project brief.** This is the most consequential drift because it affects planning:

| System | `ROADMAP.md` | Audit brief / project canon |
| :--- | :--- | :--- |
| TITAN | §2.2 "TITAN Background Processor — a unified queue worker for managing sync schedules, data backups, and slow database optimizations" | "Capability Architecture Layer — detect capability gaps, design module architectures, produce capability blueprints, plan dependencies and permissions" |
| FORGE | §3.2 "FORGE Sandbox Execution — sandbox script compiler … write, test, and run shell commands or scripts" | "Engineering Layer — code generation, testing, packaging, installation" |

`ARCHITECTURE.md` §6 repeats the ROADMAP definitions ("TITAN Background Processor: Standardized service worker queue for handling sync actions and backups"; "FORGE Developer Interface: Code compilation and command executions in local Sandboxes").

**Two irreconcilable definitions of the next two pillars exist in the repository.** Neither is marked as superseded. This is not a naming quibble: a background job queue and a capability-design layer are different systems with different dependencies.

---

## DOC-004 — HIGH — Version identity is inconsistent across five sources

| Source | Version claim |
| :--- | :--- |
| Audit brief / project canon | AKIRA OS **v1.8.2** Stability Release; GENESIS **v2.19 IDENTITY — NEXT** |
| `docs/AKIRA-OS/releases/README.md` | *"Current Production Target: **v1.1.0** (SQLite Foundation)"* |
| `docs/adr/ADR-021-observability-platform.md` | *"AKIRA OS **v1.8.2** contains several core subsystems…"* |
| Git tags | `v1.0.0`, `v1.1.1`, `v1.1.3`, `v1.3.0`, `v1.4.0`, `v1.7.0-runtime-complete`, `v1.8.0-architecture`, `v1.8.2-stable`, **`v1.16`**, **`v1.17`** |
| `package.json` | `"name": "tanstack_start_ts"`, `"private": true` — **no `version` field at all** |
| `src/genesis/identity/README.md` | `# GENESIS Identity Subsystem (v2.19)` |
| Git log | `45f3b5a release(genesis): v2.19.0 Identity Capability` — v2.19 is **already released** |
| `tests/*.test.ts` `describe` titles | v2.21 (×3), v2.22 (×3), v2.23 (×3), v2.24 (×1) |
| `changelog.md` | latest entry `[2.18.0-sprint-9] - 2026-07-08` |

Problems, in order of consequence:
1. **"v2.19 IDENTITY — NEXT" is wrong.** Identity is implemented (17 files, 15 services), released (commit `45f3b5a`), documented (`src/genesis/identity/README.md`), and tested (`tests/genesis-identity.test.ts`, 1,205 LOC). Work through **v2.24** (Decision Engine) is committed.
2. **The changelog stops at 2.18.0** — six milestones behind the code.
3. **`v1.16` and `v1.17` are malformed tags** that sort *above* `v1.8.2` lexically and *below* it semantically. Anyone using `git describe` or tag ordering to determine the current version gets an ambiguous answer.
4. **The project has no machine-readable version.** `package.json` has no `version`, so no tool can report what is installed.
5. `docs/AKIRA-OS/releases/README.md` is 7 minor versions stale.

---

## DOC-005 — HIGH — `DIRECTORY_STRUCTURE.md` omits 11 of 19 source directories and states rules the code violates

**Omitted entirely from the top-level layout and from §2's per-directory reference:**

`src/runtime/` (37 files, 2,856 LOC), `src/sdk/` (14), `src/observability/` (34), `src/instrumentation/` (24), `src/analytics/` (31), `src/compatibility/` (15), `src/diagnostics/` (4), `src/components/` (21), `src/hooks/` (7), `src/workers/` (1), `src/testing/` (1).

That is **188 files and ~15,500 LOC** — including the entire Platform Runtime, the Platform SDK, both instrumentation layers and the Observability Platform — absent from the document whose stated purpose is to "map out directory purposes, module ownerships, and import policies".

**It also claims `.github/` holds "GitHub workflow pipelines & issue templates".** `.github/` contains exactly one file: `CODEOWNERS`. No workflows, no templates (TST-001).

**Import rules it states, and their actual status:**

| Documented rule | Status |
| :--- | :--- |
| §2.3 `contracts/` "May only import types from `shared/types/`" | **Violated** — `contracts/repositories/TimelineRepository.ts` imports `akira-os/timeline/types` (BND-006) |
| §2.3 `contracts/` "Contains no execution code" | **Violated** — `contracts/workspace-provider.ts` holds mutable module state and two functions |
| §2.4 GENESIS "Must never make database mutations or imports from repositories directly" | **HOLDS** — verified: zero `genesis → persistence` or `better-sqlite3` imports |
| §2.4 GENESIS "Ingests workspace data strictly via the read-only `WorkspaceProvider`" | **HOLDS** in 12 of 12 state-read sites; but GENESIS also imports `akira-os/presence/types` in 12 files (BND-008) |
| §2.5 `persistence/` "Must never be loaded on the client side (prevented via window checks)" | **HOLDS** — 4 runtime `throw` guards |
| §2.6 `routes/` "No raw business logic allowed" | **Violated** — `brain.tsx` (2,106 LOC, fan-out 24) and `chat.tsx` (1,610 LOC, calls `companionStateService.bootstrap()`) (QUA-005) |
| §3 "Imports to database prepared statements from any file loaded by the browser … will throw an **import-boundary error at build-time**" | **FALSE** — `vite.config.ts` sets `importProtection: { enabled: false }` (PLT-004) |

The §3 claim is the most damaging: it asserts a build-time guarantee that the build configuration explicitly turns off.

---

## DOC-006 — MEDIUM — `MODULE_CONTRACT.md` prescribes a structure no module follows

§1 declares a *mandatory* seven-directory blueprint: `components/`, `hooks/`, `services/`, `server/`, `repositories/`, `types/`, `tests/`, `index.ts`.

Actual contents of `src/akira-os/*`:

| Module | Directories present |
| :--- | :--- |
| `notes`, `projects`, `sessions`, `settings`, `tasks` | `server/`, `services/`, `index.ts` |
| `search` | `server/`, `services/`, `index.ts`, `search.test.ts` |
| `timeline` | `server/`, `services/`, `index.ts`, `service.ts`, `types.ts`, `timeline.test.ts` |
| `vault` | `server/`, `services/`, `index.ts`, 4 loose `Vault*Service.ts`, `vault.test.ts` |
| `presence` | flat: `builder.ts`, `constants.ts`, `events.ts`, `rules.ts`, `service.ts`, `types.ts` — **no `server/` or `services/` at all** |
| `tools` | `registry.ts` only — no `index.ts` |

**Zero of ten modules conform.** No module has `components/`, `hooks/`, `repositories/` or `types/` as directories. Repositories live centrally in `src/persistence/repositories/` (which is arguably the better design, and is what `DIRECTORY_STRUCTURE.md` §2.5 describes — the two documents disagree with each other).

§3's worked example places `SqliteAnalyticsRepository.ts` at `src/akira-os/analytics/repositories/`. It actually lives at `src/analytics/repository/AnalyticsRepository.ts` + `SqliteAnalyticsRepository.ts` — different parent, singular directory name.

§2.6 states *"All new platform modules must register through the Tool Registry … inside `src/akira-os/tools/registry.ts`."* `analytics`, `runtime`, `sdk`, `observability`, `instrumentation`, `compatibility` and `diagnostics` do not.

The document closes with *"Compliance with this contract is verified during integration."* There is no verification mechanism (TST-001).

---

## DOC-007 — MEDIUM — `ARCHITECTURE.md` describes a GENESIS data flow the code does not implement

**§5, "GENESIS AI Context & Memory Flow":**
```
[ Reality Data Store ] (akira-store)
       ▼ (Implemented via WorkspaceProvider)
[ Read-Only Workspace Provider Interface ]
       ▼ (Ingested by Context Engine)
[ Context Builder & Recall Service ]
       ▼
[ Adaptive Memory Graph ] ──► [ AI Model Provider ] ──► [ Proactive Initiative Suggestions ]
```
and:
> §5.2 *"Narrative Arc Processing: System modifications publish messages via the `eventBus`, which GENESIS maps to adaptive memory stories."*

**The `eventBus` claim is false as written.** System modifications publish via the *instrumentation* `publish()`, not the legacy `eventBus` that GENESIS subscribes to (BND-001). This one sentence is the intended architecture; the code does the opposite.

The `WorkspaceProvider` half of the diagram **is** accurate and correctly implemented.

**Other `ARCHITECTURE.md` accuracy checks:**

| Claim | Status |
| :--- | :--- |
| §1 topology (UI → cache → service → RPC → repository → SQLite) | **Accurate** — this is exactly what the code does |
| §2.1 "All database reads and writes occur against a local SQLite instance" | Accurate |
| §2.3 "Frontend components must never make raw queries" | Accurate |
| §2.4 **"No Event Loop Blocking"** | **Violated** — `SqliteSearchRepository.executeWithRetry` spins synchronously for up to 15 s (REL-002) |
| §3.3 "`__root.tsx` … hydrates `akira-store` from the SQLite database, starts and shuts down key AI and Presence engines" | Accurate in mechanism; understates that GENESIS initialises *before* hydration completes (GEN-013) |
| §4 core tables (`projects`, `tasks`, `notes`, `sessions`, `timeline_events`, `fts_workspace`) | Accurate. Omits `settings`, `schema_version`, `migration_history`, `search_history`, the 5 `vault_*` tables and `events` — 10 of 16 tables undocumented |
| §4 WAL, auto-vacuum, foreign keys | Accurate |
| §6 "Future Expansion: ANALYTICS Module" | Same understatement as ROADMAP (DOC-003) |
| **Entire document** | Does not mention `runtime/`, `sdk/`, `observability/`, `instrumentation/`, `compatibility/` or `diagnostics/` — the "Platform Runtime", "Platform SDK", "Capability Registry", "Permission Framework", "Manifest System", "Dependency Resolver", "Lifecycle Manager", "Event Store", "Compatibility Layer" and "Runtime Diagnostics" pillars are absent from the architecture blueprint |

---

## DOC-008 — MEDIUM — `AGENTS.md` states a tech stack that is two architectures out of date

```
Backend (future)
- Python
- FastAPI
- SQLite
- OpenAI / Gemini APIs
```

Reality: the backend exists today, is TypeScript, and is built on TanStack Start `createServerFn` RPCs over `better-sqlite3` — 53 server functions, 11 repositories, 16 tables. There is no Python anywhere in the repository. Providers are Gemini and OpenRouter (not OpenAI).

`AGENTS.md` is the file an AI coding agent reads first. It currently instructs agents that the backend is unwritten and will be Python. Its "Current Priority" list (`1. Projects 2. Brain Dump 3. Daily Mission 4. Memory 5. AI 6. Voice`) also predates GENESIS v2.17–v2.24.

Its behavioural rules are sound and worth keeping: *"Preserve simplicity. Never overengineer. Reuse existing services. Preserve the current folder structure. Make the smallest possible changes. Explain the implementation plan before editing code."* The `process.exit` ESLint rule it names is real and enforced.

---

## DOC-009 — MEDIUM — `CONTRIBUTING.md` prescribes a branching model and PR process that has never been used

| Documented | Actual |
| :--- | :--- |
| `main` ← `develop` ← `feature/*` / `bugfix/*` / `hotfix/*` | `git branch -a` → `main` and `origin/main` **only**. No `develop`, no feature branches, ever. |
| "Direct commits to protected branches are disabled" | All 16 commits are direct to `main` |
| "Target `develop` as the merge destination" | No PRs; no merge commits |
| "Squash and Merge to maintain a linear history" | Linear by virtue of direct commits |
| "Keep PRs under 400 lines" | Commits range into the thousands of lines (e.g. `feat(genesis): implement Reflection Engine subsystem`) |
| §5 "All repository writes must be tested" | 18 test files assert nothing (TST-002); vault and persistence writes are untested |
| §5 "Mock database environments are initialized inside the `tests/` directory" | Test databases are initialised in `src/persistence/` and `src/persistence/scratch/` (TST-005) |
| §6 "Write in markdown using **absolute paths** for cross-references" | Followed — and this is itself the defect (DOC-010) |
| §6 "Do not create placeholder sections" | Violated by `README.md`'s screenshot placeholders (DOC-010) |

Commit-message conventions (`feat(scope):`, `fix(scope):`, `release(scope):`) **are** followed consistently across all 16 commits — the one documented process that holds.

**Risk:** a single-developer project documenting a multi-team GitFlow process with QA gates creates the impression of process rigour that does not exist. It should either be adopted or reduced to what is real.

---

## DOC-010 — MEDIUM — `README.md` links are unusable outside this one machine

Every cross-reference in the Documentation Index is an absolute local file URL:
```markdown
[Architecture Blueprint](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/ARCHITECTURE.md)
[ADR-006: Module Structure Standards](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-006-module-contract.md)
```
There are 25 such links. Every one is broken on GitHub, in any other clone, and for any other developer. `CONTRIBUTING.md` §6 explicitly mandates this ("using absolute paths for cross-references"), so the convention is deliberate and wrong.

Screenshot section:
```markdown
*Placeholder sections for visual interfaces:*
*   **Dashboard View**: `C:/Users/lovsh/Desktop/Project Akira Master/AKIRA/docs/assets/dashboard.png`
```
`docs/assets/` does not exist. Directly violates `CONTRIBUTING.md` §6 "Do not create placeholder sections".

**Documentation Index completeness:** the README lists ADR-001 through ADR-006 and five platform docs. The repository contains **ADR-001 through ADR-021** (18 files, ADR-007 and ADR-014 absent) plus `docs/RUNTIME.md`, `docs/MANIFEST.md`, `docs/LIFECYCLE.md`, `docs/SDK.md`, `docs/CAPABILITIES.md`, `docs/DEPENDENCIES.md`, `docs/platform/{ANALYTICS,EVENT_SYSTEM}.md`, 11 observability docs, 14 GENESIS ADRs and 20 GENESIS architecture documents. **Roughly 80 of 105 `docs/` files are unreachable from the README.**

Setup instructions say `npm run test` "to verify changes" and offer `bun test` as an equivalent — `bun test` invokes Bun's own runner, not `vitest`, and would not run these suites correctly.

---

## DOC-011 — LOW — ADR numbering gaps and an ADR describing unwired code

- `docs/adr/` jumps ADR-006 → ADR-008 and ADR-013 → ADR-015 → ADR-016. ADR-007 and ADR-014 are absent with no "superseded"/"withdrawn" record. `docs/GENESIS/architecture/decisions/` is complete (ADR-001…ADR-014).
- `ADR-021-observability-platform.md` specifies a platform that has 12 type errors, 4 unresolved imports and zero consumers (QUA-004). No ADR is marked `Superseded` or `Not Implemented`.
- `docs/adr/ADR-016..020` (Platform Runtime, Manifest, Dependency Resolution, Lifecycle, Capability Registry) describe well-built code that nothing imports (BND-007). The ADRs are accurate about the design and silent about adoption.

**Suggestion (not a defect):** ADRs would carry far more signal with a `Status:` line (`Accepted` / `Implemented` / `Implemented-but-unwired` / `Superseded`).

---

## DOC-012 — LOW — `TESTING.md` documents a test architecture that does not match the tests

| Claim | Reality |
| :--- | :--- |
| §1 tree shows `vault.test.ts` beside the service — "Module unit & integration tests" | Correct location; but the file is a hand-rolled script with 0 vitest assertions (TST-002) |
| §2 "tests initialize a temporary database file (`temp_e2e_akira.db`) stored under `src/persistence/`" | `vault.test.ts` uses `:memory:`; `scripts/validate-architecture.ts` uses `temp_test_phase2.db`. Three strategies (TST-005). |
| §2.1 example code imports `beforeAll`/`afterAll` from `vitest` | The files it documents do not use `vitest` at all |
| §3 RPC testing example with `describe/it/expect` | No RPC test exists anywhere in the repository |
| §4 "Wrap UI tests with TanStack Router's `RouterProvider` using memory history" | The one UI test that tries this fails on the unresolved `@/` alias (TST-002) |
| §5 four `npm run test*` commands | Three of four do not exist (DOC-001) |

---

## Documentation accuracy scorecard

| Document | Verdict |
| :--- | :--- |
| `ARCHITECTURE.md` §1–4 (platform topology, SQLite) | **Accurate** — the best technical document in the repository |
| `ARCHITECTURE.md` §5 (GENESIS flow) | Intent, not reality (DOC-007) |
| `ARCHITECTURE.md` §6 + `ROADMAP.md` (TITAN/FORGE/Analytics) | **Contradicts the project brief** (DOC-003) |
| `README.md` | Accurate prose; 25 broken links, placeholder sections, 80 docs unlinked (DOC-010) |
| `AGENTS.md` | Rules good; stack description two architectures stale (DOC-008) |
| `CONTRIBUTING.md` | Prescribes 2 non-existent commands and an unused branching model (DOC-001, DOC-009) |
| `TESTING.md` | Describes a framework the tests do not use (DOC-012) |
| `DIRECTORY_STRUCTURE.md` | Omits 188 files; asserts a build guarantee that is disabled (DOC-005) |
| `MODULE_CONTRACT.md` | Zero of ten modules conform (DOC-006) |
| `CODE_STYLE.md` | Consistent with the code; `prettier` enforces the formatting parts |
| `OWNERSHIP.md` + `CODEOWNERS` | **Accurate** and consistent with the actual tree |
| `docs/shared/releases/changelog.md` | **7 false test claims, 27 broken paths, 6 versions stale** (DOC-002) |
| `docs/AKIRA-OS/releases/README.md` | 7 minor versions stale (DOC-004) |
| `docs/adr/*` (21 files) | Design descriptions accurate; adoption status unstated (DOC-011) |
| `docs/GENESIS/architecture/*` (34 files) | Rich and internally coherent; describes the intended pipeline, not the wired one |
| `docs/AKIRA-OS/architecture/observability/*` (11 files) | Documents a subsystem that does not compile (QUA-004) |
| `docs/modules/*` (8 files), `docs/platform/*` (7 files) | Not individually verified line-by-line; spot checks matched the code |

---

## Drift pattern

Three distinct causes produced this drift, and they need different fixes:

1. **A directory rename that was never propagated** (`src/services/` → `src/genesis/`). Mechanical; affects `changelog.md` (27 paths) and parts of `MODULE_CONTRACT.md`. Cheap to fix, and a link-checker in CI would prevent recurrence.

2. **Documentation written ahead of, or instead of, verification.** `changelog.md`'s "passing 100%" claims for seven non-existent files; `CONTRIBUTING.md`'s `npm run type-check`; `DIRECTORY_STRUCTURE.md`'s build-time import guarantee. These are not stale — they were **never true**. This is the same root cause as QUA-002 (zero debt markers) and TST-001 (no CI): nothing ever checked, so documentation recorded intent as fact.

3. **Two parallel canons.** `ARCHITECTURE.md`/`ROADMAP.md` define TITAN and FORGE one way; the project brief defines them another. Root-level docs describe a five-directory `src/`; the code has nineteen. One canon has to be declared authoritative and the other retired.

**The single highest-value documentation action** is not rewriting any of these files. It is adding the CI gate from `CONTRIBUTING.md` §3.3 — creating `npm run typecheck`, changing `test` to `vitest run`, and running all four in a workflow. That makes the document true, and prevents category 2 from recurring.
