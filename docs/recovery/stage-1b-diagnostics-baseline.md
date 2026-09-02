# Stage 1B — Diagnostics Baseline (pre-modification)

**Recorded:** 2026-09-02, before any modification in this stage.
**HEAD:** `b561730` (`audit`) on `main`.
**Nothing was fixed to produce these numbers.** No compiler, lint, or dependency configuration was changed.

---

## 1. Git status at baseline

Carried forward from Stage 1A (Phase A build recovery), unchanged:

```
 M src/analytics/tests/analytics.test.ts
 M src/diagnostics/core/diagnostics-context.ts          ← Stage 1A: import path + init-order fix
 M src/diagnostics/core/diagnostics-manager.ts          ← Stage 1A: import path fix only
 M src/genesis/identity/repositories/IdentityRepository.ts
 M src/genesis/index.ts
 M src/genesis/insights/reflection/engine/engine.ts
 M src/genesis/insights/reflection/engine/strategies/ContradictionReflectionStrategy.ts
 M src/genesis/insights/reflection/engine/strategies/ObservationReflectionStrategy.ts
 M src/genesis/insights/reflection/engine/strategies/PatternReflectionStrategy.ts
 M src/genesis/planning/health/HealthRuleEngine.ts
 M src/genesis/planning/health/rules/CompletedRule.ts
 M src/genesis/planning/health/rules/DerivedCompletionRule.ts
 M src/genesis/planning/health/rules/InactiveRule.ts
 M src/genesis/planning/health/rules/StalledRule.ts
 M src/genesis/planning/services/PlanningService.ts
 M src/genesis/reasoning/engine.ts
 M src/instrumentation/event-store/tests/event-store.test.ts
 M src/observability/diagnostics/diagnostics-service.ts ← Stage 1A: import path fix
 M src/observability/logging/logger.ts
 M src/observability/metrics/metrics.test.ts
 M src/observability/services/abstract-telemetry-service.ts
 M src/observability/tracing/trace-service.ts
 M src/observability/tracing/tracing-validator.ts
 M src/observability/validation/diagnostics-validator.ts
 M src/runtime/manifest/manifest-schema.ts
 M src/runtime/manifest/manifest.ts
 M src/runtime/module-instance.ts
 M src/sdk/core/akira-sdk.ts
 M src/sdk/core/sdk-context.ts
 M vite.config.ts
?? docs/recovery/phase-a-build-recovery.md
?? docs/recovery/phase-b-event-architecture-reconciliation.md
?? src/compatibility/adapters/event-adapter.ts
?? src/genesis/planning/health/createHealthRuleEngine.ts
?? src/genesis/planning/health/rules/HealthyRule.ts
```

---

## 2. Exact commands

`package.json` provides no type-check script, so TypeScript is invoked directly. `test` is bare `vitest` (watch mode), so `vitest run` is used to obtain a terminating result.

| Purpose | Command |
| :--- | :--- |
| Type checking | `npx tsc --noEmit` — **no project script exists** |
| Testing | `npx vitest run` (`npm run test` = `vitest`, watch mode) |
| Production build | `npx vite build` (= `npm run build`) |
| Lint | `npx eslint .` (= `npm run lint`) |
| Architecture validation | `npx tsx scripts/validate-architecture.ts` (= `npm run validate:architecture`) |

```json
{
  "dev": "vite dev",
  "build": "vite build",
  "build:dev": "vite build --mode development",
  "preview": "vite preview",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "vitest",
  "validate:architecture": "npx tsx scripts/validate-architecture.ts"
}
```

---

## 3. Total remaining errors

```
$ npx tsc --noEmit | grep -c "error TS"
9
```

Two groups, both deliberately left by Stage 1A:

| # | Group | Count | Status |
| :--- | :--- | ---: | :--- |
| 1 | `src/contracts/events.ts` duplicate keys (`TS1117` ×2) | 2 | Reserved for Phase B / event reconciliation — *not in Stage 1B scope* |
| 2 | **`src/diagnostics/core/diagnostics-manager.ts`** | **7** | **This stage's subject** |

**All 7 diagnostics errors are in a single file.**

---

## 4. Verbatim diagnostics errors

```
src/diagnostics/core/diagnostics-manager.ts(3,31): error TS2307: Cannot find module '../health/health-checker' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(4,36): error TS2307: Cannot find module '../performance/performance-monitor' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(5,33): error TS2307: Cannot find module '../performance/startup-profiler' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(6,37): error TS2307: Cannot find module '../reporting/diagnostics-exporter' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(8,34): error TS2307: Cannot find module '../metrics/metrics-collector' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(9,30): error TS2307: Cannot find module '../metrics/event-metrics' or its corresponding type declarations.
src/diagnostics/core/diagnostics-manager.ts(101,23): error TS2693: 'DiagnosticError' only refers to a type, but is being used as a value here.
```

### 4.1 Affected file

Exactly one: `src/diagnostics/core/diagnostics-manager.ts` (104 lines).

### 4.2 Missing modules — 6

| Line | Specifier | Symbol imported | Resolves to | Exists? |
| ---: | :--- | :--- | :--- | :--- |
| 3 | `../health/health-checker` | `HealthChecker` | `src/diagnostics/health/health-checker` | **No** |
| 4 | `../performance/performance-monitor` | `PerformanceMonitor` | `src/diagnostics/performance/performance-monitor` | **No** |
| 5 | `../performance/startup-profiler` | `StartupProfiler` | `src/diagnostics/performance/startup-profiler` | **No** |
| 6 | `../reporting/diagnostics-exporter` | `DiagnosticsExporter` | `src/diagnostics/reporting/diagnostics-exporter` | **No** |
| 8 | `../metrics/metrics-collector` | `MetricsCollector` | `src/diagnostics/metrics/metrics-collector` | **No** |
| 9 | `../metrics/event-metrics` | `EventMetrics` | `src/diagnostics/metrics/event-metrics` | **No** |

The parent directories `src/diagnostics/{health,performance,reporting,metrics}/` **do not exist**. `src/diagnostics/` contains only `core/`:

```
src/diagnostics/core/diagnostics-context.ts
src/diagnostics/core/diagnostics-errors.ts
src/diagnostics/core/diagnostics-manager.ts
src/diagnostics/core/diagnostics-report.ts
```

### 4.3 Missing exports — 1

| Line | Symbol | Imported from | Problem |
| ---: | :--- | :--- | :--- |
| 101 | `DiagnosticError` | `../core/diagnostics-report` (line 2) | It is an **`interface`**, used as a constructor: `const err = new DiagnosticError();` |

Near-miss note: `src/diagnostics/core/diagnostics-errors.ts` exports a **class** named `DiagnosticsError` (plural), whose constructor requires a `message: string`. The manager references `DiagnosticError` (singular), which is the interface from `diagnostics-report.ts`. The assignment target `const err` is **never used**, inside an otherwise-empty `catch` block.

### 4.4 Broken imports — 0 remaining

Stage 1A already corrected the only wrong-path import in this subsystem:

| File | Was | Now |
| :--- | :--- | :--- |
| `diagnostics-manager.ts:1` | `../interfaces/runtime-adapter` | `../../compatibility/interfaces/runtime-adapter` |
| `diagnostics-context.ts:1` | `../interfaces/runtime-adapter` | `../../compatibility/interfaces/runtime-adapter` |

`src/diagnostics/core/diagnostics-context.ts`, `diagnostics-errors.ts` and `diagnostics-report.ts` now compile clean. Stage 1A also fixed a genuine `TS2729` runtime defect in `diagnostics-context.ts` (a class-field initializer reading a parameter property, which under ES2022 class-fields semantics evaluates before the parameter property is assigned).

---

## 5. Production code vs tooling/tests

| Error | Location | Production code? | Reaches an entry point? | Affects build? | Affects tests? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| All 7 | `src/diagnostics/core/diagnostics-manager.ts` | Yes, it is under `src/` | **No** | **No** | **No** |

Evidence for "does not reach an entry point":

```
$ grep -rn "diagnostics" src/routes src/app src/server.ts src/router.tsx src/start.ts
NO reference from any entry point

$ # any importer of src/diagnostics anywhere in the repo:
$ grep -rn "src/diagnostics\|diagnostics/core" src tests scripts --include=*.ts --include=*.tsx | grep -v "^src/diagnostics/"
(no matches)
```

The only two repo-wide hits for the word "diagnostics" outside `src/diagnostics/` and `src/observability/` are a **different** module:

```
src/analytics/tests/analytics.test.ts:26:  import { DiagnosticsService } from "../validation/diagnostics";
src/analytics/validation/index.ts:5:       export * from "./diagnostics";
```

Those refer to `src/analytics/validation/diagnostics.ts`, an unrelated analytics health reporter (see the investigation report §3).

**Therefore `src/diagnostics/` has zero importers.** `rolldown` never resolves it, which is why the production build passes at exit 0 while these 7 errors are outstanding.

### Current gate status at baseline

| Gate | Result |
| :--- | :--- |
| `npx tsc --noEmit` | **FAIL** — 9 errors (7 diagnostics, 2 event contract) |
| `npx vite build` | **PASS** — exit 0 (client 2,336 / server 435 / SSR 2,092 modules) |
| `npx vitest run` | 42 files: 23 passed, 19 failed to load; **327 tests passed, 0 failed** |
| `npx eslint .` | 22 errors + 1 warning (all `prettier/prettier` formatting) |
| `npx tsx scripts/validate-architecture.ts` | **PASS** — 360/360 assertions |

Test coverage of the subsystem under investigation:

```
src/diagnostics        in test files: (none)
observability/diagnostics in test files: (none)
DiagnosticsManager     in test files: (none)
DiagnosticRegistry     in test files: (none)
```

**Nothing was fixed in this step.** Investigation follows in `stage-1b-diagnostics-investigation.md`.
