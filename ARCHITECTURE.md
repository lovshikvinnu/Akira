# AKIRA OS Architecture Blueprint

This document defines the architecture of the **AKIRA OS** platform. It serves as the primary system manual for engineers and architects contributing to the platform.

---

## 1. System Overview & Architecture Topology
AKIRA OS is built on a local-first, offline-first paradigm. It separates UI presentation, runtime reactive state cache, network-less serialized server RPCs, abstract database repositories, and database execution.

```
       [ Client Runtime Sandbox ]              │         [ Server Runtime Sandbox ]
                                              │
  ┌────────────────────────────────────────┐  │  ┌──────────────────────────────────────┐
  │         React View UI Component        │  │  │        RPC Server Function           │
  │     (Fired on User Interactions)       │  │  │   (TanStack Start createServerFn)    │
  └──────────────────┬─────────────────────┘  │  └──────────────────┬───────────────────┘
                     │ (Updates state via     │                     │ (Resolves and call)
                     ▼  optimistic dispatch)  │                     ▼
  ┌────────────────────────────────────────┐  │  ┌──────────────────────────────────────┐
  │         Reactive Client Cache          │  │  │      Domain Repository Contract      │
  │    (useSyncExternalStore / selectors)  │  │  │      (Defined as TS Interfaces)      │
  └──────────────────┬─────────────────────┘  │  └──────────────────┬───────────────────┘
                     │ (Spawns lazy           │                     │ (Executes sql)
                     ▼  service worker call)  │                     ▼
  ┌────────────────────────────────────────┐  │  ┌──────────────────────────────────────┐
  │         Client Domain Service          │  │  │         SQLite DB Instance           │
  │        (Invokes serialized RPC)        │──┼─►│     (better-sqlite3 / WAL Mode)      │
  └────────────────────────────────────────┘  │  └──────────────────────────────────────┘
                                              │
```

---

## 2. Design Philosophy & Core Principles

AKIRA conforms to the following guidelines:
1.  **Strict Local-First Reality**: Network latency does not exist for core platform workflows. All database reads and writes occur against a local SQLite instance (`akira.db`) stored on the user's hard drive.
2.  **Optimistic State Mutation**: The UI does not await network or file handles to finish rendering. It instantly writes changes to the memory cache, dispatching database mutations lazily.
3.  **Client-Server Decoupling**: Frontend components must never make raw queries or touch database connection libraries directly. Communication is mediated strictly via service boundaries.
4.  **No Event Loop Blocking**: Heavy tasks (such as hash calculations or binary streams) are handled asynchronously on the server.

---

## 3. Core Architectural Subsystems

### 3.1. Workspace Shell
The global workspace shell (`Shell.tsx`) acts as the top-level app wrapper. It provides:
*   A premium glassmorphic visual canvas using custom gradient animations.
*   Central layout grid container managing the layout dimensions of child routes (using `fit` or `scroll` layout modes).
*   Integrations of the **Topbar** (exposing search triggers), **Sidebar** (primary system navigation), and **CommandPalette** (interactive search/dispatch panel).

### 3.2. Sidebar & Tool Registry
The sidebar navigation is populated dynamically using the `toolsRegistry` configured in `registry.ts`.
*   Modules register metadata (id, label, route, category, status) with the registry.
*   The Sidebar filters registered tools using:
    *   `enabled: boolean` - prevents unreleased features from loading.
    *   `requiresDevMode: boolean` - filters advanced tools (e.g., *Brain Inspector*) unless Developer Mode is activated in local settings.

### 3.3. File-Based Routing
Routing is managed via **TanStack Router**, implementing a strict layout hierarchy:
*   `__root.tsx`: Mounts the React Query Provider, Sonner Toast Container, and Boot Sequence. It hydrates `akira-store` from the SQLite database, starts and shuts down key AI and Presence engines during mount/unmount.
*   `/index`: Default workspace dashboard containing daily activity overview, streak counters, and AI companion status.
*   `/projects`, `/tasks`, `/notes`, `/vault`, `/settings`: Feature-specific route entry points.

### 3.4. RPC & Repository Patterns
To bridge the client and server:
1.  **RPC Layer (`createServerFn`)**: Expresses RPC functions. It handles inputs, parses parameters safely, and runs server-side routines.
2.  **Repository Interface Contracts**: Abstract interfaces (e.g. `NoteRepository`) define what queries can be made.
3.  **Repository Implementations (`Sqlite*Repository`)**: Contain SQL statements executed via `better-sqlite3`. They only import from `better-sqlite3` and run inside server environments.

---

## 4. SQLite Database Architecture & Schema Constraints

The local database (`akira.db`) utilizes WAL journal mode for parallel reading and writing, auto-vacuuming for space conservation, and foreign keys.

### Core Database Tables
*   `projects`: Stores project profiles, color configurations, and metadata.
*   `tasks`: Manages items and priority keys ('Low', 'Medium', 'High') linked to projects.
*   `notes`: Houses rich text contents and JSON-serialized tag arrays.
*   `sessions`: Logs focus timer metrics and durations.
*   `timeline_events`: Database audit log table documenting user-created events.
*   `fts_workspace`: An FTS5 virtual table indexing entity titles and descriptions for fast universal workspace search.

### Automated Database Triggers
```
           ┌──────────────┐
           │ Write Query  │
           └──────┬───────┘
                  │ (Fires trigger)
                  ▼
      ┌───────────────────────┐
      │  fts_workspace Table  │ ◄─── (FTS5 search results matched instantly)
      └───────────────────────┘
                  │ (Fires audit trigger)
                  ▼
     ┌─────────────────────────┐
     │  timeline_events Table  │ ◄─── (Populates global audit timeline logs)
     └─────────────────────────┘
```

---

## 5. GENESIS AI Context & Memory Flow
The AI companion system (GENESIS) runs in a separate cognitive loop from the core workspace shell:

```
[ Reality Data Store ] (akira-store)
       │
       ▼ (Implemented via WorkspaceProvider)
[ Read-Only Workspace Provider Interface ]
       │
       ▼ (Ingested by Context Engine)
[ Context Builder & Recall Service ]
       │
       ▼ (Formulates prompt context)
[ Adaptive Memory Graph ] ──► [ AI Model Provider ] ──► [ Proactive Initiative Suggestions ]
```
1.  **Reality Isolation**: GENESIS has no write access to the workspace database. It ingests data using the `WorkspaceProvider` read-only wrapper.
2.  **Narrative Arc Processing**: System modifications publish messages via the `eventBus`, which GENESIS maps to adaptive memory stories.

---

## 6. Future Expansion Points
*   **ANALYTICS Module**: Integrating charts and visualizations to display focus patterns.
*   **TITAN Background Processor**: Standardized service worker queue for handling sync actions and backups.
*   **FORGE Developer Interface**: Code compilation and command executions in local Sandboxes.
