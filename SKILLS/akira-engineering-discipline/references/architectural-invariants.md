# Architectural Invariants Reference

This document outlines the core structural invariants and boundary constraints that govern all modules and subsystems across Project AKIRA.

---

## 1. Domain Separation Invariant

AKIRA is divided into distinct logical subsystems that must maintain clean conceptual separation:

1. **Reality Layer (AKIRA OS):**
   - Answers: *"What exists in the user's world?"*
   - Manages physical workspaces, projects, notes, timeline sessions, local persistence, shell layouts, and system utilities.
   - Operates with deterministic local storage and clear schema definitions.

2. **Interpretation Layer (GENESIS):**
   - Answers: *"What does it all mean?"*
   - Manages cognitive engines, memory consolidation, narrative arcs, pattern synthesis, and AI context assembly.
   - Consumes reality data through defined contracts and events; does not mutate raw OS storage tables directly without going through proper service contracts.

---

## 2. Structural Layer Invariants

```
┌──────────────────────────────────────────────┐
│  Presentation Layer (Components, Hooks)      │  <-- Pure UI & User Interactions
└──────────────────────┬───────────────────────┘
                       │ (Uses Services)
                       ▼
┌──────────────────────────────────────────────┐
│  Service Orchestration Layer (Client/Server) │  <-- Coordinates state, RPC, bus signals
└──────────────────────┬───────────────────────┘
                       │ (Invokes Handlers / Server RPC)
                       ▼
┌──────────────────────────────────────────────┐
│  Persistence Layer (Repositories, DB Driver) │  <-- Server / Backend context only
└──────────────────────────────────────────────┘
```

### Invariant 2.1: UI Isolation
- **Rule:** UI Components and presentation Hooks must never import raw database repositories or database drivers directly.
- **Why:** Bypassing services breaks caching, audit trails, event emission, and leaks backend persistence dependencies into client bundles.
- **Allowed:** Components dispatch actions through client services or query hooks.

### Invariant 2.2: Service Dominance
- **Rule:** Services are the single point of entry for client-initiated domain operations.
- **Why:** Ensures consistent validation, state synchronization, and predictable event dispatching across the system.

### Invariant 2.3: Server/Persistence Isolation
- **Rule:** Repositories, raw SQL executions, and database connections are strictly isolated to server contexts and RPC handlers.
- **Why:** Client bundles must remain lightweight and secure, with no raw SQL driver footprints.

### Invariant 2.4: Single Authority of Truth
- **Rule:** Avoid duplicate or competing state authorities for the same domain entity.
- **Why:** Synchronizing split-brain state models inevitably causes race conditions and stale UI views.

---

## 3. Implementation Boundary Guidelines

- **No Premature Physical Locking:** Do not treat tentative or open file locations as immutable dogma if the Phase 3 implementation plan has not finalized them. Focus on architectural responsibility and interface adherence rather than hardcoded file paths.
- **Process Safety Invariant:** Client and core application source files must never invoke `process.exit()`. Process termination is strictly reserved for command-line entry points.
