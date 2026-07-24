# ADR-016: Platform Runtime Module Core

## Status
Accepted

## Context
As AKIRA OS expands from an application framework into an extensible operating platform, it requires a mechanism to load, manage, execute, and isolate independent modules. In earlier versions, features were compiled directly as static source folders. While simple, this static design prevented modules from being loaded dynamically, ran into direct cross-module coupling anti-patterns, and lacked a unified execution boundary. 

To support a future-proof, pluggable architecture, we require a dedicated runtime layer capable of controlling module execution lifecycle stages and sandboxing resource access.

## Decision
We will establish a centralized **Platform Runtime Core** to orchestrate module execution. 

Key decisions:
1. **Modules as Managed Runtime Objects**: Every module is represented at runtime by a `ModuleInstance` wrapper. A module is no longer simply static code; it has an active lifecycle state, unique runtime configurations, and dedicated resource boundaries.
2. **Centralized Lifecycle Management**: All transitions (loading, starting, pausing, resuming, stopping, and unloading) are managed by `RuntimeManager` and validated against a deterministic state transition matrix. This prevents race conditions and dangling resources.
3. **Dependency Injection via Context**: Modules are isolated from global platform references. Shared platform resources (like logger, eventBus, and configuration settings) are explicitly injected through a lightweight `ModuleContext` object during startup.
4. **Resilient Initialization (Fault Isolation)**: If a module fails to load or throw an exception during its startup routine, it is marked as `FAILED` (and cleaned up to `UNLOADED`). The runtime catches the failure, logs detailed diagnostics, and continues booting other modules. A single module failure must never block the platform.

## Consequences
* **Improved System Stability**: Fault isolation prevents buggy third-party modules from crashing the AKIRA OS core runtime during startup or operation.
* **Loose Coupling**: Modules cannot import core databases or other modules directly. They must communicate asynchronously via the event bus or query metadata through the platform runtime.
* **Deterministic Behavior**: Invalid lifecycle triggers (e.g. attempting to resume a stopped module) are rejected immediately at the runtime manager layer, keeping the application state consistent.
* **Testability**: Decoupling the module loader and introducing runtime configuration contexts allows executing isolated integration tests on virtual/mock modules without loading physical filesystem packages.

## Future Integrations
This Module Runtime Core establishes the groundwork for subsequent sprints:
* **Manifest System (Sprint 1.2)**: Module loaders will validate `manifest.json` metadata (version compatibility, authorship, entry-points) before instantiating modules.
* **Capability Registry & Permissions (Sprint 1.3)**: Centralized checks will restrict a module's capabilities (e.g. filesystem write access, notifications) based on a security policy file.
* **Platform SDK (Sprint 1.5)**: High-level hooks will be injected into `ModuleContext` so modules can register UI routes, custom sidebars, database schemas, and search providers.
