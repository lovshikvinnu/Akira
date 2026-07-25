# AKIRA OS Observability Package Structure

This document outlines the codebase package structure, module hierarchy, and responsibilities for the Observability Platform under the `src/observability/` directory.

---

## 1. Directory Tree Representation

```text
src/observability/
├── api/                   # Public interfaces and facades
│   ├── index.ts
│   ├── TelemetryService.ts
│   └── Facades.ts
├── contracts/             # Shared API types and contracts
├── models/                # Immutable telemetry data structures
├── services/              # Core implementations of TelemetryService
│   ├── TelemetryServiceImpl.ts
│   └── context/           # AsyncLocalStorage context managers
├── metrics/               # Metric capture and aggregators
├── logging/               # Structured logging implementations
├── tracing/               # Trace spans and execution context tracking
├── diagnostics/           # Snapshot capture providers
├── health/                # Health checks registry and runner
├── audit/                 # Secure audit trail handlers
├── resources/             # System resource monitors
├── storage/               # SQLite database schemas and connections
├── repository/            # SQLite read/write repositories
├── exporters/             # File, Console, and OpenTelemetry exporters
├── dashboards/            # Presentation dashboards service layers
├── events/                # Subscribers listening to Event Bus lifecycle
├── utils/                 # Clock helpers, UUID generators, ring buffers
└── index.ts               # Core entry point / exports
```

---

## 2. Package Responsibilities

| Package | Responsibility | Detailed Description |
| :--- | :--- | :--- |
| **`api/`** | Public Facades & Interfaces | Defines the interfaces that AKIRA OS modules import to report telemetry. Contains zero runtime implementation code. |
| **`contracts/`** | Shared Contracts | Houses common schemas, types, and string constants used across different layers. |
| **`models/`** | Immutable Telemetry Records | Declares standard structures for Metrics, Logs, Spans, Audits, Diagnostics, and Health checks. Enforces strict read-only parameters. |
| **`services/`** | Facade Orchestration | Concrete classes that coordinate facade interactions. Manages the execution context via thread-safe managers. |
| **`metrics/`** | Metric tracking & aggregation | Manages counters, gauges, histograms, and performs simple in-memory metrics aggregation (e.g. rate limit counters). |
| **`logging/`** | Structured Logger | Implements Winston or custom structured console and file outputs, linking active context tags. |
| **`tracing/`** | Spans & Context Propagation | Tracks tracing spans, computes elapsed milliseconds, and propagates execution identifiers using Node.js `AsyncLocalStorage`. |
| **`diagnostics/`** | System Diagnostics Dumper | Gathers modular memory dumps and runtime state information during debugging or crash cycles. |
| **`health/`** | Health Rules Engine | Manages component health registrations and coordinates health checks evaluation. |
| **`audit/`** | Tamper-Evident Security Log | Writes highly critical access events to files using secure cryptographic chaining (HMAC-SHA256). |
| **`resources/`** | Physical Resource Trackers | Polls operating system variables to track CPU cycles, memory allocations, handles count, and file system boundaries. |
| **`storage/`** | Schema Definition | Establishes the telemetry SQLite table schemas, initialization routines, and connection managers. |
| **`repository/`** | Telemetry Repositories | Implements the repository pattern, managing bulk inserts into the telemetry SQLite database and reading records for queries. |
| **`exporters/`** | Export Adapters | Formats and sends records to targets (e.g. CLI console, local files, or external OpenTelemetry collectors). |
| **`dashboards/`** | Presentation APIs | Provides read-only query layers to slice, filter, and fetch telemetry trends for display in local admin views. |
| **`events/`** | Integration Subscribers | Hooks into the system `EventBus` to capture module lifecycles, permissions changes, and capability registrations. |
| **`utils/`** | Shared Utilities | Contains ring buffers, monotonic time wrappers, and safe string UUID generation functions. |

---

## 3. Package Invariants
* **Strict API Isolation**: Subsystems outside of `src/observability/` are forbidden from importing files from packages other than `api/`, `contracts/`, or `models/`.
* **Zero Business Domain Dependency**: No package under `src/observability/` may import code from outside its folder (except for core contracts/event definitions like `src/contracts/events.ts` and core primitives). It operates purely as a platform service.
* **Separation of Read/Write**: Query logic (used for Presentation) resides in `dashboards/` and `repository/` and must remain completely isolated from high-speed ingestion components in `metrics/`, `logging/`, and `tracing/`.
