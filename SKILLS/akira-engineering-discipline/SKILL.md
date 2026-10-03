---
name: akira-engineering-discipline
description: Enforces AKIRA's engineering discipline, architectural boundaries, and minimal-diff change philosophy. Use whenever implementing features, fixing bugs, performing refactoring, executing migrations, conducting performance optimization, modifying tests, debugging, undertaking architecture-sensitive changes, or performing investigations that may lead to code changes in AKIRA. This skill strictly enforces safe implementation behavior and does not grant permission to redesign the frozen architecture.
compatibility: Full AKIRA repo
---

# AKIRA Engineering Discipline

A skill for enforcing architectural boundaries, disciplined change mechanics, and contract preservation when working on Project AKIRA.

---

## Authority Hierarchy

When resolving decisions, requirements, or potential contradictions during any implementation task, apply this strict order of precedence:

1. **Frozen AKIRA Target Architecture** (Phase 2 Specifications)
2. **Frozen AKIRA Foundation Contracts**
3. **N1 / N2 / N3 Decision Records**
4. **Current Repository Contracts & Documentation** (e.g., `MODULE_CONTRACT.md`, `OWNERSHIP.md` where still applicable)
5. **Existing Implementation Patterns**

> Higher tiers strictly override lower tiers. Current repository documents or legacy code patterns must not override the frozen Phase 2 architecture or foundation contracts.

---

## Core Principle

> **"Existing validated behavior is presumed intentional until evidence shows otherwise."**

Working code, existing tests, and established component behaviors represent validated requirements. They must not be rewritten, restructured, or cleaned up based on speculative preferences, aesthetic desires, or untested assumptions.

---

## The 9-Stage Execution Workflow

Every implementation or modification task in AKIRA must proceed through these 9 sequential stages:

### Stage 1: UNDERSTAND
- Dissect the user prompt to identify the exact functional requirements.
- Distinguish whether the task targets the **Reality Layer** (AKIRA OS workspace, local storage, persistence) or the **Interpretation Layer** (GENESIS context, memory, cognitive engine).
- Establish explicit non-goals to avoid scope creep.

### Stage 2: INSPECT
- Read existing implementations and trace callers/callees before planning edits.
- Identify existing shared UI primitives, services, or repository handlers to reuse.
- Never assume an abstraction is missing without thoroughly checking the codebase first.

### Stage 3: CHECK FROZEN ARCHITECTURE & CONTRACTS
- Verify that the planned task respects the **Authority Hierarchy**.
- Check relevant structural invariants (e.g., UI isolation, server-only persistence boundaries). Consult [architectural-invariants.md](references/architectural-invariants.md) and [authority-and-contracts.md](references/authority-and-contracts.md).
- **Architectural Boundary Escalation Rule:**
  If implementation reveals a genuine conflict, a missing architectural decision, or a direct contradiction with the frozen architecture:
  1. **Stop at that boundary.**
  2. **Document the concrete evidence** demonstrating the conflict.
  3. **Identify the affected frozen contract or decision record.**
  4. **Request an explicit architectural decision from the human lead.**
  5. **Do NOT silently reinterpret, bypass, or modify the frozen architecture.**

### Stage 4: PLAN BEFORE EDIT
- Produce a clear, concise implementation plan before modifying any code.
- Explicitly list:
  - Target files to create or modify
  - Existing components/services to reuse
  - Contract invariants to verify
  - Potential boundary risks

### Stage 5: SMALLEST VALID CHANGE
- Make atomic, surgical edits that fulfill the requirement and nothing more.
- Prohibit drive-by refactoring, formatting overhaul of untouched code, or speculative utility extractions.
- Follow [change-discipline-guide.md](references/change-discipline-guide.md).

### Stage 6: TEST
- Run relevant unit, integration, or contract tests.
- Verify both positive cases and edge cases.
- *Reminder:* Passing tests are a necessary baseline, not a complete proof of architectural correctness.

### Stage 7: DIFF REVIEW
- Inspect the git diff line-by-line before reporting completion.
- Verify that every modified line directly maps to the user's explicit request.
- Ensure no accidental whitespace churn, deleted comments, or unnecessary dependency additions exist.

### Stage 8: ARCHITECTURAL VERIFICATION
- Run the boundary verifier script to validate mechanical constraints:
  ```bash
  python SKILLS/akira-engineering-discipline/scripts/verify_boundaries.py
  ```
- Confirm zero direct persistence imports in UI presentation components and zero unauthorized `process.exit` invocations in application code.

### Stage 9: REPORT
- Present concise proof of task completion:
  - Summary of the minimal changes made
  - Test/verification results
  - Explicit confirmation that frozen boundaries and contracts were preserved

---

## Prohibited Behaviors (Hard Defenses)

1. **No Unsolicited Refactoring:** Do not clean up, rename, or re-architect adjacent code that is working.
2. **No Premature File Path Hardcoding:** Do not make unresolved physical implementation locations authoritative.
3. **No Contract Bypassing:** Never import database repositories directly into UI components for convenience.
4. **No Duplicate Authorities:** Do not introduce competing state stores or parallel sources of truth.
5. **No Replacing Validated Work Without Evidence:** Never discard working logic without reproducing and documenting a concrete failure.
6. **No Silent Reinterpretation:** Never work around an architectural contradiction without stopping and escalating.

---

## Reference Material

Consult the following bundled references as needed during execution:
- [authority-and-contracts.md](references/authority-and-contracts.md) — Authority hierarchy, contract resolution, decision records.
- [architectural-invariants.md](references/architectural-invariants.md) — Structural boundaries, UI/server isolation, domain ownership.
- [change-discipline-guide.md](references/change-discipline-guide.md) — Evidence-first rules, minimal-diff checklist, anti-refactor patterns.
