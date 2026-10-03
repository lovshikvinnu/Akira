# Authority Hierarchy & Contracts Reference

This document defines the governing order of precedence and escalation protocols when implementing features or evaluating architecture in Project AKIRA.

---

## 1. Authority Hierarchy

All implementation choices, code modifications, and technical decisions must strictly observe the following hierarchy of authority:

```
Tier 1: Frozen AKIRA Target Architecture (Phase 2 Specifications)
   │
   ▼
Tier 2: Frozen AKIRA Foundation Contracts
   │
   ▼
Tier 3: N1 / N2 / N3 Decision Records
   │
   ▼
Tier 4: Current Repository Contracts & Documentation (e.g. MODULE_CONTRACT.md, OWNERSHIP.md)
   │
   ▼
Tier 5: Existing Implementation Patterns & Legacy Conventions
```

### Hierarchy Rules:
1. **Strict Downward Override:** Higher tiers strictly supersede lower tiers. If an existing codebase file or a Tier 4 document contradicts Tier 1 or Tier 2 specifications, the higher-tier frozen architecture governs.
2. **Current-Repository Guidance:** Tier 4 documents (`MODULE_CONTRACT.md`, `OWNERSHIP.md`, etc.) provide valuable current-state guidance where applicable, but they are subordinate to frozen Phase 2 architecture decisions.
3. **No Unilateral Redesign:** The agent is not authorized to alter Tier 1, Tier 2, or Tier 3 decisions under the guise of an implementation task.

---

## 2. Escalation Protocol for Architectural Contradictions

When an implementation task encounters:
- A direct conflict between codebase reality and frozen architecture specifications,
- An ambiguous or missing architectural decision record, or
- A requirement that appears to require violating a frozen contract,

The agent must follow this 5-step escalation protocol:

1. **Halt Execution:** Stop immediately at the boundary of the conflict before writing or modifying code.
2. **Document Evidence:** Identify the exact code path, data structure, or interface that demonstrates the mismatch.
3. **Identify Contract/Decision:** Cite the specific tier, contract, or decision record involved (e.g., Tier 2 Foundation Contract, N2 decision).
4. **Formulate Explicit Question:** State the concrete trade-offs and options clearly for human review.
5. **Awaiting Decision:** Do not unilaterally pick an architectural direction, introduce bridge shims, or bypass the contract.

---

## 3. Decision Records (N1 / N2 / N3)

- **N1: Subsystem Separation:** Clear division of responsibilities between reality-tracking operations and cognitive/interpretive operations.
- **N2: Boundary Flow:** Explicit data-flow directions between client presentation, orchestrating services, and underlying storage.
- **N3: Persistence Invariants:** Separation of server-side data operations from client presentation assets.

Always verify that proposed implementations conform with established decision records rather than introducing competing architectural paradigms.
