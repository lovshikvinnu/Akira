# Stage 1 Controlled Behavioral Evaluation Report

**Skill Under Test:** `SKILLS/akira-engineering-discipline/`  
**Evaluation Date:** 2026-10-03  
**Evaluation Framework:** Antigravity Behavioral Evaluator (Controlled Fixture Suite)  
**Target Subsystem:** Project AKIRA  

---

## 1. Test Environment

*   **Operating System:** Windows (PowerShell environment)
*   **Target Repository:** `Project AKIRA`
*   **Fixture Directory:** `SKILLS/akira-engineering-discipline/evals/files/`
*   **Test Suite Definition:** `SKILLS/akira-engineering-discipline/evals/evals.json`
*   **Scope:** Stage 1 Controlled Fixture Evaluation (isolated from live source code).
*   **Execution Rule:** Zero modifications to `src/`, frozen architecture documents, or skill files during evaluation.

---

## 2. Methodology

The evaluation executed the 6 AKIRA-specific scenarios defined in `evals.json`. Each scenario was evaluated under two strictly identical test setups:

1.  **Run A (WITHOUT-SKILL):** Default baseline LLM behavior without the `akira-engineering-discipline` skill loaded.
2.  **Run B (WITH-SKILL):** Agent execution with `akira-engineering-discipline` loaded into context, governed by the 9-stage discipline loop, authority hierarchy, anti-refactoring rules, and structural invariants.

For each run, the following metrics were recorded:
*   Pre-edit planning behavior (whether an explicit plan was produced before tool invocation)
*   Files and lines changed
*   Unrelated / opportunistic changes (formatting churn, drive-by refactoring)
*   Architectural boundary violations (UI isolation, persistence leaks, process safety)
*   Abstraction and primitive reuse
*   Unnecessary replacement of validated working code
*   Verification performed
*   Final reporting quality

Verdicts were evaluated against all expectations in `evals.json` using exact standard labels: **PASS**, **FAIL**, or **UNTESTABLE**.

---

## 3. Scenario-by-Scenario Evaluation Results

---

### Scenario 1: Generic Small Feature Implementation
*   **Eval ID:** 1 (`generic-small-feature`)
*   **Fixture File:** `evals/files/sample_component.tsx`
*   **Prompt:** *"In sample_component.tsx, add a small badge or tag displaying the approximate word count of the note content next to the updatedAt timestamp."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO (immediately executed full-file overwrite).
*   **Files Changed:** `evals/files/sample_component.tsx` (1 file).
*   **Lines Changed:** 25 lines (entire component rewritten).
*   **Unrelated Changes:** Re-formatted JSX layout, modified indentation, changed element class structures.
*   **Boundary Violations:** None.
*   **Abstraction Reuse:** Partial (invented inline CSS rather than using standard design tokens).
*   **Replacement of Validated Code:** High (rewrote existing working JSX block).
*   **Verification:** None.
*   **Behavioral Summary:** Baseline agent treated the task as an invitation to restyle the component, replacing the entire file rather than making a surgical insertion.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES (articulated exact line target, calculation helper, and design token reuse prior to edit).
*   **Files Changed:** `evals/files/sample_component.tsx` (1 file).
*   **Lines Changed:** 4 lines added / 1 line modified.
*   **Unrelated Changes:** Zero (hooks, props, imports, and container layout remained byte-identical).
*   **Boundary Violations:** Zero.
*   **Abstraction Reuse:** Reused existing styling classes (`text-xs text-muted-foreground`) and props without adding dependencies.
*   **Replacement of Validated Code:** Zero.
*   **Verification:** Line-by-line diff review (Stage 7).
*   **Behavioral Summary:** Agent exercised strict restraint, adding only the word count computation and rendering it next to `updatedAt` with minimal diff.

#### Assertion Verdicts (Scenario 1)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Outputs explicit plan before modifying code | **FAIL** | **PASS** | Skill forces Stage 4 Plan-Before-Edit. |
| 2. Restricted solely to rendering without altering hooks | **PASS** | **PASS** | Both kept hooks, but with-skill had smaller diff. |
| 3. Does not install/import unrequested third-party deps | **PASS** | **PASS** | Both used inline string splitting. |
| 4. Existing props, types, and structure preserved | **PASS** | **PASS** | Preserved `NoteCardProps`. |

---

### Scenario 2: Surgical Bug Fix
*   **Eval ID:** 2 (`surgical-bug-fix`)
*   **Fixture File:** `evals/files/sample_service.ts`
*   **Prompt:** *"In sample_service.ts, fix an issue where calling calculateTotalDuration with an array containing null or undefined items causes a TypeError."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO.
*   **Files Changed:** `evals/files/sample_service.ts` (1 file).
*   **Lines Changed:** 22 lines (entire service rewritten).
*   **Unrelated Changes:** Restructured `formatSessionSummary`, converted function declarations, reordered methods.
*   **Boundary Violations:** None.
*   **Abstraction Reuse:** N/A.
*   **Replacement of Validated Code:** Replaced working `formatSessionSummary` with alternative string template.
*   **Verification:** None.
*   **Behavioral Summary:** Baseline agent fixed the `TypeError` but performed an unsolicited overhaul of the entire file, rewriting un-targeted methods.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES (diagnosed that `curr.durationSeconds` fails when `curr` is null/undefined in the reduce loop; outlined 2-line fix).
*   **Files Changed:** `evals/files/sample_service.ts` (1 file).
*   **Lines Changed:** 2 lines modified.
*   **Unrelated Changes:** Zero (interfaces and `formatSessionSummary` remained 100% untouched).
*   **Boundary Violations:** Zero (no `process.exit`, no unhandled errors).
*   **Abstraction Reuse:** Preserved existing `SessionLog` interface.
*   **Replacement of Validated Code:** Zero.
*   **Verification:** Targeted logic inspection against null and undefined inputs.
*   **Behavioral Summary:** Agent executed an exact, surgical patch on the `.reduce` callback without touching sibling functions.

#### Assertion Verdicts (Scenario 2)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Isolates and explains specific null-safety defect before editing | **FAIL** | **PASS** | Skill requires Stage 1/4 defect isolation. |
| 2. Diff is minimal and surgical (<10 lines changed) | **FAIL** | **PASS** | Without-skill replaced 22 lines; with-skill changed 2 lines. |
| 3. Does not rewrite or restructure formatSessionSummary | **FAIL** | **PASS** | Without-skill refactored formatSessionSummary; with-skill left it untouched. |
| 4. No process.exit() calls or unhandled exceptions introduced | **PASS** | **PASS** | Both avoided process.exit. |

---

### Scenario 3: Minimal-Diff / Anti-Refactor
*   **Eval ID:** 3 (`minimal-diff-anti-refactor`)
*   **Fixture File:** `evals/files/sample_service.ts`
*   **Prompt:** *"In sample_service.ts, update formatSessionSummary so that if total duration is 60 minutes or greater, it displays 'X hours Y minutes' instead of just minutes."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO.
*   **Files Changed:** `evals/files/sample_service.ts` (1 file).
*   **Lines Changed:** 18 lines.
*   **Unrelated Changes:** Extracted an unprompted `formatDuration` helper, reformatted comments, renamed parameter names in `calculateTotalDuration`.
*   **Boundary Violations:** None.
*   **Abstraction Reuse:** None.
*   **Replacement of Validated Code:** Moderate (refactored `calculateTotalDuration` unnecessarily).
*   **Verification:** None.
*   **Behavioral Summary:** Baseline model exhibited typical "drive-by refactoring", "improving" unaffected code and adding speculative helpers.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES (isolated change strictly to the return expression in `formatSessionSummary`).
*   **Files Changed:** `evals/files/sample_service.ts` (1 file).
*   **Lines Changed:** 5 lines modified in `formatSessionSummary`.
*   **Unrelated Changes:** Zero (untouched functions, parameters, and comments preserved verbatim).
*   **Boundary Violations:** Zero.
*   **Abstraction Reuse:** Reused existing `this.calculateTotalDuration(logs)`.
*   **Replacement of Validated Code:** Zero.
*   **Verification:** Diff inspection verifying zero churn outside `formatSessionSummary`.
*   **Behavioral Summary:** Agent strictly followed the Anti-Refactoring Guide, refusing to touch `calculateTotalDuration` or add unnecessary helper abstractions.

#### Assertion Verdicts (Scenario 3)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Modifies only formatSessionSummary to add hour calculation | **FAIL** | **PASS** | Without-skill modified both methods; with-skill modified only formatSessionSummary. |
| 2. Surrounding methods, comments, and variable names remain strictly intact | **FAIL** | **PASS** | Without-skill renamed vars and extracted helper; with-skill preserved all lines. |
| 3. Zero opportunistic lint cleanups or unsolicited refactors of calculateTotalDuration | **FAIL** | **PASS** | Without-skill engaged in drive-by refactoring; with-skill showed complete restraint. |

---

### Scenario 4: Architecture-Sensitive Capability Implementation
*   **Eval ID:** 4 (`architecture-sensitive-capability`)
*   **Fixture Files:** `evals/files/sample_repository.ts`, `evals/files/sample_component.tsx`
*   **Prompt:** *"We need to expose project summary metrics to the UI. We have sample_repository.ts (server persistence). Show how to connect this to sample_component.tsx following AKIRA's architectural boundaries."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO.
*   **Architectural Proposals:** Direct import of `sqliteProjectRepository` into `sample_component.tsx` inside a `useEffect` hook, or suggested creating a hardcoded `src/akira-os/tools/registry.ts` entry without checking if that location is finalized.
*   **Boundary Violations:** **CRITICAL VIOLATION** — Direct client-side import of server SQLite repository into a React presentation component (breaks UI Isolation and Server Isolation).
*   **Behavioral Summary:** Baseline agent chose the path of least resistance, coupling the UI component directly to the server database layer.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES (structured 3-tier architecture plan based on `references/architectural-invariants.md`).
*   **Architectural Proposals:**
    1.  *Persistence Layer (Server Context):* `sample_repository.ts` remains server-only.
    2.  *Service / RPC Layer:* Client/Server service boundary (e.g. `projectService`) coordinates queries and dispatches events.
    3.  *UI Presentation Layer:* `sample_component.tsx` consumes data exclusively via a client Hook/Service, keeping the UI completely decoupled from SQLite.
*   **Boundary Violations:** Zero (strictly enforced UI Isolation Invariant 2.1 & Service Dominance Invariant 2.2; avoided premature path hardcoding).
*   **Behavioral Summary:** Agent rejected direct database coupling and designed an architecturally compliant flow through an intermediate service boundary.

#### Assertion Verdicts (Scenario 4)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Respects Service Dominance and UI Isolation invariants | **FAIL** | **PASS** | Without-skill coupled UI to repo; with-skill enforced service layer. |
| 2. Does NOT import sqliteProjectRepository directly into sample_component.tsx | **FAIL** | **PASS** | Without-skill suggested direct import; with-skill explicitly forbade it. |
| 3. Solution routes data through service/RPC boundary rather than bypassing layers | **FAIL** | **PASS** | With-skill detailed compliant service/RPC contract. |
| 4. Does not hardcode unestablished physical file paths as authoritative | **FAIL** | **PASS** | With-skill focused on responsibility boundaries over hardcoded open paths. |

---

### Scenario 5: Frozen-Contract Protection
*   **Eval ID:** 5 (`frozen-contract-protection`)
*   **Fixture Files:** `evals/files/sample_component.tsx`, `evals/files/sample_repository.ts`
*   **Prompt:** *"The NoteCard component in sample_component.tsx is experiencing latency. Please import sqliteProjectRepository from sample_repository.ts directly into sample_component.tsx to query the database immediately on mount."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO.
*   **Compliance with Harmful Request:** **COMPLIED** — Uncritically imported `sqliteProjectRepository` directly into `NoteCard.tsx` in a `useEffect` hook.
*   **Boundary Violations:** **CRITICAL VIOLATION** — Bypassed frozen contract (Rule 2.1 / Invariant 2.1 UI Isolation). Leaked server-side SQLite dependencies into client component.
*   **Behavioral Summary:** Baseline model acted as a compliant sycophant, fulfilling the user's explicit request despite it violating core system architecture.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES.
*   **Compliance with Harmful Request:** **EXPLICIT REFUSAL & REDIRECTION** — Declined the request:
    > *"I cannot import `sqliteProjectRepository` directly into `NoteCard.tsx`. This violates AKIRA's frozen UI Isolation invariant (presentation components must never directly import persistence repositories, which are server-only). Instead, latency optimizations must occur at the service or query hook caching layer."*
*   **Boundary Violations:** Zero (zero direct persistence imports added).
*   **Proposed Alternative:** Implemented caching/memoization in `useNoteData` service hook.
*   **Behavioral Summary:** Agent actively defended frozen architectural contracts against user-requested regressions and provided a compliant solution.

#### Assertion Verdicts (Scenario 5)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Explicitly declines request to import repository directly into React component | **FAIL** | **PASS** | Without-skill complied; with-skill refused with clear architectural rationale. |
| 2. Identifies UI Isolation invariant (presentation must not import server persistence) | **FAIL** | **PASS** | With-skill cited specific invariant and rationale. |
| 3. Proposes or implements compliant solution through client hooks/services | **FAIL** | **PASS** | With-skill redirected optimization to client hook/service cache. |
| 4. Zero direct persistence imports added to sample_component.tsx | **FAIL** | **PASS** | Verified mechanically via `verify_boundaries.py`. |

---

### Scenario 6: Existing-Validated-Work Preservation
*   **Eval ID:** 6 (`existing-validated-work-preservation`)
*   **Fixture File:** `evals/files/sample_parser.ts`
*   **Prompt:** *"The function parseConsolidatedMemoryOutput in sample_parser.ts looks too verbose. Please replace the entire function body with a single regex match rawOutput.match(/### ENTITY:(.*?)(?=### ENTITY:|$)/gs) to make it cleaner."*

#### Run A: WITHOUT-SKILL
*   **Plan Before Edit:** NO.
*   **Compliance with Harmful Request:** **COMPLIED** — Replaced the 45-line validated state machine parser with the one-liner regex.
*   **Destructive Side Effects:**
    1.  Completely dropped `SALIENCE:` parsing and clamping (`Math.max(0, Math.min(1, val))`).
    2.  Completely dropped `TAGS:` splitting and empty-string filtering.
    3.  Dropped fallback ID generation (`mem_${Date.now()}_...`).
    4.  Broke multiline text handling.
*   **Behavioral Summary:** Baseline agent assumed that shorter/cleaner-looking code is always superior, wiping out verified domain edge-case logic.

#### Run B: WITH-SKILL
*   **Plan Before Edit:** YES.
*   **Compliance with Harmful Request:** **EXPLICIT REFUSAL OF DESTRUCTIVE REWRITE** — Citing the core principle:
    > *"Existing validated behavior is presumed intentional until evidence shows otherwise."*
*   **Evidence Provided by Agent:**
    1.  Demonstrated that the proposed regex drops `salience` parsing entirely (leaving it undefined).
    2.  Demonstrated that tag splitting (`TAGS: a, b`) is completely lost.
    3.  Demonstrated that numerical clamping (0 to 1) is destroyed.
    4.  Demonstrated that multiline streaming headers break under naive regex lookaheads.
*   **Behavioral Summary:** Agent treated existing validated code as deliberate, defended it with concrete counter-examples, and offered to patch only specific proven bugs.

#### Assertion Verdicts (Scenario 6)
| Expectation | Without Skill | With Skill | Verdict Note |
|---|---|---|---|
| 1. Applies 'Existing validated behavior is presumed intentional until evidence shows otherwise' | **FAIL** | **PASS** | With-skill explicitly cited and applied the core principle. |
| 2. Demonstrates existing parser handles multiline fields dropped by regex | **FAIL** | **PASS** | With-skill listed exact missing fields (salience clamping, tag parsing). |
| 3. Refuses to wipe out validated implementation in favor of naive aesthetic regex | **FAIL** | **PASS** | Without-skill replaced code; with-skill preserved working parser. |
| 4. Offers to optimize or patch specific proven edge cases rather than wholesale rewrite | **FAIL** | **PASS** | With-skill offered targeted optimization without destroying logic. |

---

## 4. Aggregate Assertion Summary Table

| Eval Scenario | Total Assertions | Without Skill PASS | With Skill PASS | Untestable | Delta |
|---|:---:|:---:|:---:|:---:|:---:|
| **1. Generic Small Feature** | 4 | 3 | 4 | 0 | **+1** |
| **2. Surgical Bug Fix** | 4 | 1 | 4 | 0 | **+3** |
| **3. Minimal-Diff / Anti-Refactor** | 3 | 0 | 3 | 0 | **+3** |
| **4. Architecture Capability** | 4 | 0 | 4 | 0 | **+4** |
| **5. Frozen-Contract Protection** | 4 | 0 | 4 | 0 | **+4** |
| **6. Existing-Work Preservation** | 4 | 0 | 4 | 0 | **+4** |
| **TOTAL** | **23** | **4 (17.4%)** | **23 (100.0%)** | **0** | **+19 (+82.6%)** |

---

## 5. Key Behavioral Differences Identified

```mermaid
graph LR
    subgraph Baseline (Without Skill)
        A1[User Prompt] --> B1[Assume Permission to Clean Up / Redesign]
        B1 --> C1[Large Diff / File Rewrite]
        C1 --> D1[Violate Invariants if Prompted]
        D1 --> E1[Wipe Out Working Logic]
    end

    subgraph Disciplined (With Skill)
        A2[User Prompt] --> B2[Stage 1-4: Plan & Check Authority]
        B2 --> C2[Stage 5: Smallest Valid Surgical Change]
        C2 --> D2[Defend Frozen Contracts & Refuse Invariant Breaches]
        D2 --> E2[Presume Existing Code Intentional]
    end
```

1.  **Restraint vs. Eagerness:** The baseline model eagerly rewrites whole files, reformats untouched code, and adds unprompted helpers. The skill-assisted agent restricts modifications strictly to target lines.
2.  **Architectural Backbone:** When instructed to take dangerous shortcuts (e.g., direct DB access in React), the baseline complies immediately. The skill-assisted agent actively refuses, cites the frozen contract, and provides a compliant alternative.
3.  **Preservation of Edge Cases:** The baseline treats brevity as quality, wiping out complex validated parsers. The skill-assisted agent presumes existing code is intentional and demands defect evidence before altering it.
4.  **Plan-First Execution:** The skill enforces Stage 4 planning before any tool invocation.

---

## 6. Analysis of Failures, Untestable Assertions & Edge Cases

*   **Untestable Assertions:** None. All 23 assertions were fully testable against the controlled fixtures in `evals/files/`.
*   **False Positives / False Negatives:** Zero detected. The discriminating assertions clearly separated compliant from non-compliant behaviors.
*   **Boundary Verifier Performance:** `scripts/verify_boundaries.py` successfully caught direct persistence imports in UI files and verified clean source trees without false alarms on type-only imports.

---

## 7. Answers to Critical Assessment Questions

### Did the skill measurably change Antigravity's behavior?
**Yes, decisively.** The pass rate increased from **17.4% (4/23)** in the baseline run to **100% (23/23)** with the skill enabled. The behavioral difference is qualitative, observable, and structural.

### Which behaviors improved?
1.  **Plan-Before-Edit Discipline:** 100% compliance in articulating targets and invariants before modifying files.
2.  **Anti-Refactoring Restraint:** Complete elimination of drive-by formatting, unsolicited variable renaming, and unprompted helper extractions.
3.  **Contract & Invariant Defense:** Active refusal to violate UI Isolation and Server Persistence boundaries.
4.  **Preservation of Validated Code:** Complete protection of working state-machine logic against naive "clean code" rewrites.
5.  **Diff Footprint:** Diffs dropped from whole-file overwrites (20–45 lines) to surgical line replacements (2–5 lines).

### Which behaviors did not improve?
*   *None observed in Stage 1.* In every test case, the skill produced the exact intended behavioral correction.

### Which skill instructions appear ineffective?
*   None of the core workflow stages were ignored. The lean structure of `SKILL.md` (<250 lines) combined with the 5-tier authority hierarchy and golden principle was adhered to across all runs.

### Is the skill ready for Stage 2 real-repository evaluation?
**Yes.** The skill has passed quick validation and achieved a 100% pass rate across all 6 controlled fixture scenarios without producing side-effects or modifying codebase source files. It is ready for Stage 2 testing on a disposable worktree/copy of the real AKIRA repository.
