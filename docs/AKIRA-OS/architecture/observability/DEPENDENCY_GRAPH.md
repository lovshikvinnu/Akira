# AKIRA OS Observability Dependency Graph

This document details the compile-time and runtime dependency boundaries, allowed import paths, forbidden dependencies, and architectural invariants for the Observability Platform.

---

## 1. Visual Dependency Hierarchy

The diagram below represents the allowed import directions. Dependencies must flow strictly downwards. No child layer is permitted to import components from its parent layer.

```text
       ┌─────────────────────────────────────────────────────────┐
       │                  Business Modules / App                 │ (e.g. Workspace, Tasks, GENESIS)
       └────────────────────────────┬────────────────────────────┘
                                    │ (Imports only API layer)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               Observability API & Models                │ (src/observability/api/, models/)
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                  Collection Processors                  │ (src/observability/metrics/, logging/, tracing/, context/)
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                Storage & Repositories                   │ (src/observability/storage/, repository/, exporters/)
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │                  Presentation Service                   │ (src/observability/dashboards/)
       └─────────────────────────────────────────────────────────┘
```

---

## 2. Dependency Rules Matrix

The table below indicates which observability packages are allowed to import from other packages.

| Package | Can Import From | Must NOT Import From |
| :--- | :--- | :--- |
| **`api/`** | `models/`, `contracts/` | `services/`, `storage/`, `repository/`, `exporters/`, `dashboards/` |
| **`models/`** | None (Leaf types) | Any package (Must contain types only) |
| **`services/`** | `api/`, `models/`, `contracts/`, `utils/` | `storage/`, `repository/`, `exporters/`, `dashboards/` (Uses DI to resolve adapters) |
| **`metrics/`** / **`tracing/`** | `api/`, `models/`, `utils/` | `storage/`, `repository/`, `exporters/`, `dashboards/` |
| **`storage/`** / **`repository/`**| `models/`, `contracts/`, `utils/` | `api/`, `services/`, `dashboards/` |
| **`exporters/`** | `models/`, `contracts/` | `api/`, `services/`, `storage/`, `dashboards/` |
| **`dashboards/`** | `models/`, `repository/` | `api/`, `services/`, `metrics/`, `tracing/`, `exporters/` |

---

## 3. Forbidden Subsystem Imports (Architectural Invariants)

These constraints are automatically enforced. Violating any of these rules will result in compilation and lint failures.

### 3.1. Observability into Core Domain
* **Rule**: Subsystems under `src/observability/` are strictly prohibited from importing any business domain modules.
* **Forbidden Imports Example**:
  ```typescript
  // ILLEGAL: Observability must not contain domain context
  import { TaskService } from "../../tasks/services/TaskService"; 
  ```

### 3.2. Direct Database Access by Caller Code
* **Rule**: Modules wishing to log telemetry must never bypass the API to talk directly to the SQLite databases or write raw files.
* **Forbidden Imports Example**:
  ```typescript
  // ILLEGAL: Business modules must only import from the API facade
  import { SQLiteTelemetryRepository } from "../observability/repository/SQLiteTelemetryRepository"; 
  ```

### 3.3. Layer Violation (Circular References)
* **Rule**: Lower layers (like Storage or Collection) must never import from upper layers (like presentation dashboards or orchestration facades).
* **Forbidden Imports Example**:
  ```typescript
  // ILLEGAL: Storage must not import the high-level orchestration service
  import { TelemetryServiceImpl } from "../services/TelemetryServiceImpl"; 
  ```

---

## 4. Extension Points (Dependency Injection)

To ensure the storage and presentation layers can be swapped without affecting the instrumentation, dependencies are resolved using the Dependency Injection (DI) pattern:

```text
                  [ api/TelemetryService ]
                             ▲
                             │ (Implements)
                 [ services/TelemetryServiceImpl ]
                             │
            ┌────────────────┴────────────────┐
            ▼ (Uses)                          ▼ (Uses)
[ api/TelemetryExporter ]            [ repository/TelemetryRepository ]
            ▲                                 ▲
            │ (Implements)                    │ (Implements)
 [ exporters/OTelExporter ]         [ repository/SQLiteTelemetryRepo ]
```

* **Exporters**: Any custom export adapter (e.g. OpenTelemetry, File-System Exporter) implements `TelemetryExporter` and is injected during bootstrap.
* **Repositories**: The database engine implements `TelemetryRepository`. Testing mocks can be swapped easily during unit execution.
