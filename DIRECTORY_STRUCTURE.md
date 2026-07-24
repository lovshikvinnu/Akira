# AKIRA OS Directory Structure Reference

This document maps out directory purposes, module ownerships, and import policies inside the AKIRA codebase.

---

## 1. Top-Level Directory Layout

```
/
├── .github/             # GitHub workflow pipelines & issue templates
├── docs/                # Architectural writeups, design records (ADRs), and guides
│   ├── adr/             # Architecture Decision Records
│   ├── modules/         # Feature module documentation
│   └── platform/        # Subsystem platform specifications
├── src/                 # Main TypeScript Source Directory
│   ├── akira-os/        # Core OS operations (Vault, Timeline, Search, Presence)
│   ├── app/             # Application framework, Shell layouts, and design systems
│   ├── contracts/       # Codebase interfaces, repositories, and structures
│   ├── genesis/         # Cognitive AI companion and memory graph systems
│   ├── lib/             # Third-party wrappers and error handlers
│   ├── persistence/     # SQLite configuration, store initializations, and repositories
│   ├── routes/          # TanStack Router page routing controller definitions
│   └── shared/          # Shared interfaces, event bus, and utilities
└── tests/               # Global configuration files, mock databases, and settings
```

---

## 2. Directory Reference Detail

### 2.1. `src/akira-os/`
*   **Purpose**: Houses core OS domain feature modules.
*   **Responsibilities**: Defines operations for Vault files, Sessions, Search, and Tasks. Exposes services that call database RPCs and dispatch changes to the reactive store.
*   **Ownership**: Platform Core Team.
*   **Import expectations**: May import from `shared/`, `contracts/`, and `persistence/` (server-side only). May *not* import page-level layouts or routes.

### 2.2. `src/app/`
*   **Purpose**: The user interface wrapper and design layout boundary.
*   **Responsibilities**: Includes `BootSequence.tsx`, the workspace-wide navigation `Sidebar.tsx`, search bar headers, and global theme configurations.
*   **Ownership**: UI Design & UX Team.
*   **Import expectations**: May import hooks and services from `akira-os/` and `genesis/`. May *not* import repository implementations or database preparation functions.

### 2.3. `src/contracts/`
*   **Purpose**: Pure interface structures and contracts.
*   **Responsibilities**: Declares system contracts (e.g. `NoteRepository.ts`, `workspace-provider.ts`). Contains no execution code.
*   **Ownership**: Architecture Design Board.
*   **Import expectations**: Pure typescript files. May only import types from `shared/types/`.

### 2.4. `src/genesis/`
*   **Purpose**: The AI companion engine.
*   **Responsibilities**: Focuses on memory networks, story narratives, habit loops, and identity modeling.
*   **Ownership**: Cognitive Intelligence & AI Team.
*   **Import expectations**: Ingests workspace data strictly via the read-only `WorkspaceProvider`. Must *never* make database mutations or imports from repositories directly.

### 2.5. `src/persistence/`
*   **Purpose**: SQLite database connector and SQL executor.
*   **Responsibilities**: Configures WAL parameters, executes database migrations, handles hydration on startup, and implements concrete repository contracts.
*   **Ownership**: Database Operations Team.
*   **Import expectations**: Has access to `better-sqlite3`. Must *never* be loaded on the client side (prevented via window checks).

### 2.6. `src/routes/`
*   **Purpose**: Routing controller pages.
*   **Responsibilities**: Connects paths (e.g. `/projects`) to shell layouts and pages.
*   **Ownership**: Application Routing Team.
*   **Import expectations**: Imports components and services. No raw business logic allowed.

---

## 3. Import Restriction Policy

```
┌─────────────────┐      Imports      ┌─────────────────┐
│   src/routes/   ├──────────────────►│  src/akira-os/  │
└────────┬────────┘                   └────────┬────────┘
         │                                     │
         │ Imports                             │ Imports
         ▼                                     ▼
┌─────────────────┐                   ┌─────────────────┐
│    src/app/     │                   │ src/contracts/  │
└─────────────────┘                   └────────┬────────┘
                                               ▲
                                       Imports │
                                               │
                                      ┌────────┴────────┐
                                      │src/persistence/ │ (Isolated on Server)
                                      └─────────────────┘
```

*   **Boundary Restriction**: Ensure that `persistence/` imports are isolated to server functions. Imports to database prepared statements from any file loaded by the browser (such as components) will throw an import-boundary error at build-time.
