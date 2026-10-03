# Phase 3A Implementation Proposal: Capability Foundation & Vertical Slice

**Document Status:** Approved Architecture Proposal  
**Phase:** Phase 3A — Capability Boundaries & Foundation Slice  
**Baseline Commit:** `genesis/foundation-stabilization` @ `e58020f`  
**Governing Documents:**
- [AKIRA-TARGET-ARCHITECTURE.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-TARGET-ARCHITECTURE.md) (Frozen TA)
- [AKIRA-FOUNDATION-CONTRACTS.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-FOUNDATION-CONTRACTS.md) (Frozen FC)
- [AKIRA-N1-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N1-DECISION.md) (Rule N1: Bounded direct internal Commands)
- [AKIRA-N2-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N2-DECISION.md) (Rule N2: Non-VAJRA Tier-2 On-Demand Activation)
- [AKIRA-N3-DECISION.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-N3-DECISION.md) (Rule N3: GENESIS Command-Freedom)
- [AKIRA-ENGINEERING-HANDOFF.md](file:///c:/PROJECTS/Project%20Akira%20Master/AKIRA/docs/architecture/AKIRA-ENGINEERING-HANDOFF.md) (Engineering Handoff & Baseline)

---

## 1. Objective

The objective of Phase 3A is to establish the smallest valid, fully contract-compliant **capability foundation** for AKIRA without modifying existing source code, database schemas, UI route controllers, or GENESIS cognitive internals.

Specifically, Phase 3A will:
1. Define the formal TypeScript contracts for the **Capability Descriptor** (K7) and the **Capability Registry host** (K8, K14) under `src/contracts/capabilities/`.
2. Define the uniform **Result<T, E>** envelope (K5, K7, K18, K19) under `src/contracts/results/`.
3. Establish a single, production-grade **vertical slice capability implementation** (`project.read` and `project.list`) owned by `AKIRA OS · workspace`.
4. Adapt the existing, highly validated `SqliteProjectRepository` behind this capability slice.
5. Prove capability registration, Zod input validation, execution routing, and uniform Result envelope formatting through automated unit and integration tests.

---

## 2. Current Implementation Seam

Currently, domain queries and mutations in AKIRA bypass formal capability boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CURRENT PATH: Direct RPC & Local Store Hydration                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ UI Components / React Hooks                                                 │
│   │                                                                         │
│   ├── Reads: Reads from local reactive akira-store (hydrated at boot via     │
│   │          getInitialStateRpc)                                            │
│   │                                                                         │
│   └── Writes: Calls projectsService -> persistAddProject createServerFn RPC │
│               -> SqliteProjectRepository (direct SQLite call)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Adaptation Seam for Phase 3A
The adaptation seam connects the new Capability handler directly to `SqliteProjectRepository` (`src/persistence/repositories/SqliteProjectRepository.ts`), which is already loaded exclusively on the server side:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3A TARGET SEAM: Encapsulated Read Capability                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Authorized Caller (Internal Service, VAJRA, or MCP Read Query)             │
│   │                                                                         │
│   ▼                                                                         │
│ Capability Registry Host (AKIRA OS Platform Plane)                          │
│   │                                                                         │
│   ▼                                                                         │
│ Capability Handler: project.read / project.list                             │
│   │  • Validates input schema via Zod                                       │
│   │  • Delegates execution to SqliteProjectRepository.getById() / getAll()  │
│   │  • Wraps return value in uniform Result<T, E> envelope                  │
│   │                                                                         │
│   ▼                                                                         │
│ SqliteProjectRepository (Preserved & Protected Infrastructure)              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Target Contract Mapping

| Frozen Contract | Conceptual Specification | Target TypeScript Mapping |
| :--- | :--- | :--- |
| **K7 (Descriptor)** | Name, Version, Owner, Kind (`Command` \| `Query`), InputSchema, OutputSchema, Permissions, Activation, Availability, CostClass, ExecutionCharacteristics, Observability, FailureSemantics | `src/contracts/capabilities/descriptor.ts`<br>`interface CapabilityDescriptor<TInput, TOutput>` |
| **K2 (Query)** | "Tell me something." Does not change domain state; creates no Mission (D5); callable by authorized callers directly. | `kind: 'Query'`, implemented as pure read operation wrapping `SqliteProjectRepository.getById` / `getAll`. |
| **K5 / K18 (Result & Failure)** | Uniform Result envelope carrying outcome status, payload or typed failure category. | `src/contracts/results/result.ts`<br>`type Result<T, E = CapabilityFailure>` |
| **K8 / K14 (Registry & Activation)** | Registration and availability owned by AKIRA OS platform plane; selection/routing owned by VAJRA. | `src/contracts/capabilities/registry.ts`<br>`class CapabilityRegistry` |
| **K19 (Correlation)** | Identifiers: `requestId`, `correlationId`, `invocationId`, `causationId`. | Carried in `Result` envelope metadata. |

---

## 4. Proposed Capability (Vertical Slice)

The proposed capability vertical slice consists of two read Query capabilities owned by `AKIRA OS · workspace`:

### 4.1 `project.read`
- **Identifier:** `project.read`
- **Version:** `1.0.0`
- **Kind:** `Query` (Contract K2)
- **Owner:** `AKIRA OS · workspace` (Contract K8)
- **Input Schema:** Zod Schema `{ id: z.string().min(1) }`
- **Output Payload:** `Project | null`
- **Activation Tier:** Tier 1 (Warm at boot)
- **Permissions:** `{ allowInternal: true, allowVajra: true, allowExternalMcp: true }` (Externally readable in MCP v0 per Decision D4)
- **Cost Class:** `local_cheap`
- **Execution Characteristics:** Synchronous, Idempotent, Read-only, No side-effects.

### 4.2 `project.list`
- **Identifier:** `project.list`
- **Version:** `1.0.0`
- **Kind:** `Query` (Contract K2)
- **Owner:** `AKIRA OS · workspace` (Contract K8)
- **Input Schema:** Zod Schema `{}` (empty object)
- **Output Payload:** `Project[]`
- **Activation Tier:** Tier 1 (Warm at boot)
- **Permissions:** `{ allowInternal: true, allowVajra: true, allowExternalMcp: true }`
- **Cost Class:** `local_cheap`
- **Execution Characteristics:** Synchronous, Idempotent, Read-only, No side-effects.

---

## 5. Ownership

Per **Contract K8** and **Contract K14**:
- **Semantic Owner:** `AKIRA OS · workspace` (owns project domain entity definitions and SQLite storage semantics).
- **Registration Host:** `AKIRA OS` Platform Plane (hosts registration table and availability queries).
- **Selection & Routing Authority:** `VAJRA` (for mission-driven queries) / Direct caller invocation (for non-mission read queries per Decision D5 and Rule N2).
- **Execution Authority:** `AKIRA OS` (`SqliteProjectRepository`).

---

## 6. Lifecycle Implications

Per **Contract K9** and **Contract K22**:
- **Activation Tier:** Tier 1 (Platform core capability; registered and activated during AKIRA OS runtime boot).
- **Lifecycle Sequence:** `Defined` → `Registered` → `Available` → `Activated` → `Invoked` → `Result`.
- **Side Effects:** Zero domain state mutations. As a Query capability, invocation does not trigger mission creation (D5) or memory event generation.

---

## 7. Result Semantics Used

Per **FC §3** (line 225):
> *"Exact field names, encodings and catalogue format are deferred to implementation and are deliberately not specified."*

However, the conceptual categories are strictly specified by **Contract K5**, **Contract K18**, and **Contract K19**. Phase 3A will use ONLY these contract-specified categories:

```typescript
export type FailureCategory =
  | 'invalid_request'        // Input schema validation failed (K18)
  | 'capability_unavailable' // Capability not registered or inactive (K18)
  | 'command_rejection'      // Permissions or authorization check failed (K18)
  | 'execution_failure'      // Storage / SQLite engine failure (K18)
  | 'timeout';               // Constraint deadline passed (K18)

export interface CorrelationMetadata {
  requestId: string;
  correlationId: string;
  invocationId: string;
  causationId?: string;
}

export type Result<T, E = { category: FailureCategory; message: string; details?: unknown }> =
  | { ok: true; value: T; correlation: CorrelationMetadata }
  | { ok: false; error: E; correlation: CorrelationMetadata };
```

No unbacked or custom domain error types will be invented.

---

## 8. Files Expected to Change (Phase 3A Implementation)

Phase 3A implementation will create strictly additive files under `src/contracts/` and `src/akira-os/projects/capabilities/`:

### New Files to Create:
1. `src/contracts/capabilities/descriptor.ts` — Type definitions for `CapabilityDescriptor` and metadata.
2. `src/contracts/capabilities/registry.ts` — In-memory `CapabilityRegistry` host for AKIRA OS.
3. `src/contracts/capabilities/index.ts` — Barrel export for capability contracts.
4. `src/contracts/results/result.ts` — Definition of `Result<T, E>` envelope and factory functions (`Result.success`, `Result.failure`).
5. `src/contracts/results/index.ts` — Barrel export for result envelope.
6. `src/akira-os/projects/capabilities/project-read.ts` — Descriptors and execution handlers for `project.read` and `project.list`.
7. `tests/capabilities/project-read-capability.test.ts` — Unit & integration tests for project capability slice.
8. `tests/capabilities/capability-registry.test.ts` — Unit tests for registry registration and lookup.

Zero existing source files will be deleted or modified.

---

## 9. Files Explicitly Protected

Per **Engineering Handoff §12**, the following components are strictly protected and must NOT be modified or bypassed:

1. **SQLite Repository & Connection Layer:**
   - `src/persistence/repositories/SqliteProjectRepository.ts`
   - `src/persistence/connection.ts`
2. **Task Position Ordering Logic:**
   - `src/persistence/repositories/SqliteTaskRepository.ts`
   - `src/persistence/akira-store.ts` (`reorderTasks`)
3. **Session Retention Mechanism:**
   - `src/persistence/repositories/SqliteSessionRepository.ts`
4. **Reality Adapter & Deletion Handlers:**
   - `src/genesis/events/reality-adapter.ts`
   - `src/genesis/events/event-translation.ts`
5. **Hydration Guard in Habit Service:**
   - `src/genesis/context/habits/service.ts`
6. **Observability Build Guard:**
   - `package.json` (`sideEffects` declaration)
   - `scripts/verify-observability-reachability.ts`
7. **Historical Recall FTS5 Search:**
   - `src/persistence/repositories/SqliteConversationRepository.ts`
   - `src/contracts/historical-recall.ts`
8. **Module Boundary Linter:**
   - `scripts/claude/check-module-boundaries.mjs`
9. **Frozen Architecture Docs:**
   - `docs/architecture/AKIRA-TARGET-ARCHITECTURE.md`
   - `docs/architecture/AKIRA-FOUNDATION-CONTRACTS.md`
   - `docs/architecture/AKIRA-N1-DECISION.md`
   - `docs/architecture/AKIRA-N2-DECISION.md`
   - `docs/architecture/AKIRA-N3-DECISION.md`
10. **Master Canary Test:**
    - `tests/production-journey.test.ts`

---

## 10. Tests Required

The following dedicated test suite must be implemented and pass 100%:

1. `tests/capabilities/project-read-capability.test.ts`:
   - `project.read`: Returns `Result.success(Project)` when valid ID is provided.
   - `project.read`: Returns `Result.success(null)` when non-existent ID is provided.
   - `project.read`: Returns `Result.failure('invalid_request')` when malformed ID (e.g. number/object) is passed.
   - `project.list`: Returns `Result.success(Project[])` containing all active workspace projects.
   - `project.read`: Preserves correct correlation IDs (`requestId`, `correlationId`, `invocationId`) in Result envelope.
2. `tests/capabilities/capability-registry.test.ts`:
   - `registry.register()`: Correctly registers capability descriptor under AKIRA OS platform plane.
   - `registry.get('project.read')`: Retrieves exact registered descriptor.
   - `registry.list()`: Returns all registered capabilities.
   - `registry.register()`: Rejects duplicate capability registration with clear error.
3. System Regression Suite:
   - `npm run test:run` (130 test files / 1,366 vitest tests passing).
   - `npm run validate:architecture` (363 architectural assertions passing).
   - `npx vitest run tests/production-journey.test.ts` (Canary journey passing).

---

## 11. Architectural Invariants Being Exercised

| Invariant | Description | How Phase 3A Exercises It |
| :--- | :--- | :--- |
| **I16** | Every Command and Query is addressed to exactly one capability owner. | `project.read` descriptor explicitly specifies `owner: 'AKIRA OS · workspace'`. |
| **I14** | A Query never creates a Mission and never changes domain state. | `project.read` and `project.list` execute pure read queries against SQLite with zero mutations. |
| **I6** | AKIRA OS owns capability registration and activation; VAJRA states requirements. | Registration host is implemented in AKIRA OS platform plane (`src/contracts/capabilities/registry.ts`). |
| **I17** | Implementation location never changes ownership. | Capability contracts live under `src/contracts/`, maintaining subsystem ownership semantics regardless of module placement. |
| **I10** | Persistence never implies semantic ownership. | Capability handler interacts with `SqliteProjectRepository` as storage provider, enforcing domain schema validation. |

---

## 12. Rollback Strategy

Because Phase 3A is **100% additive**:
1. If any test failure or contract mismatch occurs, the newly added files under `src/contracts/capabilities/`, `src/contracts/results/`, and `src/akira-os/projects/capabilities/` can be deleted or reverted without leaving side effects.
2. No database migrations, table modifications, or schema changes are made to `akira.db`.
3. Existing server functions (`createServerFn`), client services (`projectsService`), and reactive store (`akira-store`) remain untouched and operational.

---

## 13. Unresolved Decisions (Open Questions Checklist)

| Open Question | Status | Impact on Phase 3A Implementation |
| :--- | :--- | :--- |
| **O1: Authoritative Runtime Placement** | UNRESOLVED | **Non-blocking.** Local server capability execution in Nitro/Node process operates cleanly. |
| **O2: Workspace Write Authority** | UNRESOLVED | **Non-blocking.** Phase 3A establishes read Query capabilities only (`project.read` / `project.list`). |
| **O3: Goal & Mission Schema** | UNRESOLVED | **Non-blocking.** Workspace project reads do not touch Goal or Mission entities. |
| **O4: Identity Consolidation** | UNRESOLVED | **Non-blocking.** Workspace project reads do not touch GENESIS identity stores. |
| **O6: Reset Semantics** | UNRESOLVED | **Non-blocking.** Does not alter capability descriptor contracts or read operations. |
| **O10: Registry Physical Location** | UNRESOLVED | **Non-blocking.** FC §4 (K8) explicitly states physical location does not alter registration authority (AKIRA OS) or selection authority (VAJRA). Placing contracts in `src/contracts/capabilities/` complies fully. |

**Verdict:** Zero unresolved architectural decisions block the Phase 3A capability foundation slice.

---

## 14. Exact Acceptance Criteria

Implementation of Phase 3A will be deemed complete and successful if and only if all of the following criteria are met:

1. **Contracts Established:** `src/contracts/capabilities/descriptor.ts`, `src/contracts/capabilities/registry.ts`, and `src/contracts/results/result.ts` exist and compile cleanly with `tsc --noEmit`.
2. **Vertical Slice Registered:** `project.read` and `project.list` are registered in the AKIRA OS Capability Registry with complete descriptor metadata.
3. **Execution Validated:** Invoking `project.read` and `project.list` returns uniform `Result<T, E>` envelopes wrapping actual SQLite data from `SqliteProjectRepository`.
4. **Input Validation Proven:** Invalid query inputs return `Result.failure({ category: 'invalid_request', ... })`.
5. **New Tests Green:** 100% pass rate on `tests/capabilities/project-read-capability.test.ts` and `tests/capabilities/capability-registry.test.ts`.
6. **Zero Code Regressions:** `npm run test:run` passes all 1,366 vitest tests across 130 test files.
7. **Zero Architecture Violations:** `npm run validate:architecture` passes all 363 assertions.
8. **Canary Journey Green:** `npx vitest run tests/production-journey.test.ts` passes cleanly.
9. **Zero Protected File Modifications:** `git status` verifies no changes to any protected file listed in Section 9.
