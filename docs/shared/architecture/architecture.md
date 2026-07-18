# AKIRA Architecture Constitution

This document defines the engineering constitution and architectural principles for Project AKIRA. Every change, refactor, and new feature must adhere to these rules.

---

## The Two Pillars

AKIRA is architecturally split into two parallel pillars:

### 1. AKIRA OS (Reality)

- **Question Answered**: "What exists in the user's world?"
- **Responsibility**: Manages the physical workspace (projects, tasks, notes, sessions, file metadata, search index, local settings) and provides the database/persistence layers.
- **Ownership**: Owns SQLite/localStorage state, search indexing, status trackers, and UI-facing business logic.

### 2. GENESIS (Interpretation)

- **Question Answered**: "What does it all mean?"
- **Responsibility**: Manages the cognitive and context engines (memories, stories, understanding, insights, relationships, active focus, prompt preparation).
- **Ownership**: Owns Memory consolidation, Validation, Narrative arcs, User profiling, and AI Provider calls.

---

## Core Principles

1. **AKIRA OS owns reality**: Only AKIRA OS updates the core workspace data (projects, tasks, notes, sessions).
2. **GENESIS owns interpretation**: Only GENESIS processes narrative arcs, consolidates memories, deduces user preferences, and structures cognitive context.
3. **One responsibility per subsystem**: Each subfolder in `akira-os/` or `genesis/` owns exactly one concern. Implementation details must remain hidden.
4. **No circular dependencies**: Subsystems must not import each other recursively. Always use the shared provider interfaces.
5. **Communication through contracts**: Subsystems communicate using interfaces and event definitions defined in `src/contracts/`.
6. **Event-driven architecture**: AKIRA OS emits domain events using the generic `eventBus`. GENESIS subscribes to these events asynchronously to build cognitive graphs.
7. **LLM is the final consumer**: The AI model is a reader of context and interpreter of meaning, never the primary source of truth or owner of the persistent workspace state.
8. **Subsystems expose only public APIs**: All communication across directories must go through public entries (e.g. `src/akira-os/index.ts` and `src/genesis/index.ts`). No deep internal file imports.
9. **Infrastructure never contains business logic**: The `shared/infrastructure/` components (Event Bus, logger, feature flags) are generic and domain-agnostic.
10. **New modules must explicitly declare ownership**: Any new code must fit cleanly into either AKIRA OS or GENESIS, publishing its public surface to the respective API layer.
11. **Every persistent read or write must flow through a Repository**: Direct SQL, direct SQLite client imports, direct database access, and storage access outside the persistence layer are prohibited.

---

## Deployment & Native Dependencies

### Desktop-First Architecture

AKIRA is designed exclusively as a desktop-first application. It leverages a local SQLite database engine to maintain user privacy, low latency, and offline capability.

### Native Dependency Constraint

- **SQLite Engine**: The persistence layer uses `better-sqlite3`, which is an intentional native C++ Node.js dependency.
- **Runtime Support**: Due to this native dependency and local filesystem writes, stateless Serverless or Edge runtimes (such as Cloudflare Workers or Vercel Edge functions) are currently **unsupported**. The backend server must be hosted on a persistent Node.js/Bun execution runtime (such as a local client machine or persistent VPS).
