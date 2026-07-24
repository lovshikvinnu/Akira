# AKIRA OS — Premium AI Companion for Growth

AKIRA is a desktop-first, offline-first personal operating system and AI companion built to help individuals track their daily missions, projects, deep focus sessions, and ideas. Designed with a high-fidelity glassmorphic aesthetic, it functions as a local cognitive assistant that records reality, builds memory graphs, and suggests proactive initiatives.

---

## 🌌 The Vision
Modern productivity tools are scattered, online-dependent, and lack integrated cognitive assistance. AKIRA is built around the principle of **unified awareness**. It leverages a secure local SQLite database as a single source of truth, synchronizes it in real-time with an optimistic React client cache, and feeds a local memory architecture (GENESIS) that models cognitive context, reflections, and habits.

---

## 🚀 Key Features

*   **Daily Mission Control**: Track your focus tasks, prioritize objectives, and manage streaks.
*   **Logical File Vault**: A local file vault with magic number MIME verification, SHA-256 content hashing, and automatic logical deduplication to optimize local disk usage.
*   **Universal Workspace Search**: Full-Text Search (FTS5) index inside SQLite that updates instantly via database triggers to search projects, tasks, notes, sessions, and files.
*   **Presence & Session Tracking**: Focus timers and session records mapping back to active projects.
*   **GENESIS AI Subsystem**: Cognitive engine structure including memory graph networks, recall builders, habit trackers, and importance signals.
*   **Integrated Command Palette**: Instant navigation and action dispatcher accessible workspace-wide.

---

## 🛠️ Architecture Overview

AKIRA operates on a decoupled multi-layered architecture:

```
[ User Interaction ] 
        │
        ▼
[ React Pages & Components ] ◄───► [ Reactive Store Cache ] (useAkira)
        │                                  ▲
        ▼ (Calls Services)                 │ (Startup Hydration)
[ Client-side Domain Services ]            │
        │                                  │
        ▼ (Serialized POST/GET)            │
[ RPC Server Functions (createServerFn) ]  │
        │                                  │
        ▼ (Instantiates)                   │
[ Domain Repository Contracts ] ───────────┘
        │
        ▼ (SQL execution)
[ SQLite Database (better-sqlite3) ] ◄───► [ FTS5 & Audit Triggers ]
```

---

## 📸 Interface Screenshots

*Placeholder sections for visual interfaces:*
*   **Dashboard View**: `C:/Users/lovsh/Desktop/Project Akira Master/AKIRA/docs/assets/dashboard.png`
*   **File Vault Browser**: `C:/Users/lovsh/Desktop/Project Akira Master/AKIRA/docs/assets/vault.png`
*   **Brain Inspector Panel**: `C:/Users/lovsh/Desktop/Project Akira Master/AKIRA/docs/assets/inspector.png`

---

## 🏁 Getting Started

### Prerequisites
*   Node.js (v18 or higher)
*   Bun or npm (Bun recommended)

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/lovshikvinnu/AKIRA.git
    cd AKIRA
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    bun install
    ```

---

## 💻 Development Workflow

Start the Vite development server locally:
```bash
npm run dev
# or
bun dev
```

Run tests to verify changes:
```bash
npm run test
# or
bun test
```

---

## 📖 Documentation Index

For comprehensive engineering references, navigate to the following documents:

### Core References
*   [Architecture Blueprint](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/ARCHITECTURE.md) - Deep dive into systems, data flows, and design paradigms.
*   [Module Contract Code of Conduct](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/MODULE_CONTRACT.md) - Mandatory directory structure and dependency rules.
*   [Directory Layout Reference](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/DIRECTORY_STRUCTURE.md) - Ownership and folder boundaries.
*   [Contribution Standards](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/CONTRIBUTING.md) - Branching, PR guidelines, and workflows.
*   [Code Style Guide](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/CODE_STYLE.md) - TypeScript, React conventions, and error handling.
*   [Testing Guidelines](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/TESTING.md) - Testing boundaries, mocking database connections, and unit tests.
*   [System Roadmap](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/ROADMAP.md) - Implemented milestones and planned initiatives.

### Platform Subsystems
*   [Workspace Shell Subsystem](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/platform/SHELL.md)
*   [TanStack File Routing](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/platform/ROUTING.md)
*   [RPC Serialization Interface](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/platform/RPC.md)
*   [SQLite DB & Repository Schemas](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/platform/DATABASE.md)
*   [Sidebar Tool Registry](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/platform/TOOL_REGISTRY.md)

### Module Guides
*   [File Vault](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Vault.md)
*   [Search Engine](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Search.md)
*   [Timeline Logs](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Timeline.md)
*   [Settings Dashboard](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Settings.md)
*   [Projects Module](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Projects.md)
*   [Daily Tasks Tracker](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Tasks.md)
*   [Notes/Brain Dump](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Notes.md)
*   [Focus Sessions](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/modules/Sessions.md)

### Architectural Decisions (ADR)
*   [ADR-001: Workspace Canvas Shell](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-001-workspace-shell.md)
*   [ADR-002: Dynamic Tool Registry](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-002-tool-registry.md)
*   [ADR-003: SSR & RPC Serialization](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-003-rpc-architecture.md)
*   [ADR-004: Server-Isolated Repositories](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-004-repository-pattern.md)
*   [ADR-005: Scroll vs Fit Containers](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-005-container-layout.md)
*   [ADR-006: Module Structure Standards](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/adr/ADR-006-module-contract.md)
