# ADR 020 – Capability Registry

**Status:** Accepted

## Context
AKIRA OS needs a decoupled mechanism for modules to expose and consume services without hard‑coded imports. Early iterations tied capabilities directly to module code, making testing and hot‑reloading fragile. A central registry provides a clear contract and deterministic provider selection.

## Decision
Introduce a **Capability Registry** service that:
1. Stores capability metadata extracted from module manifests.
2. Allows modules to register/unregister capabilities on lifecycle events.
3. Resolves a capability request to a concrete provider instance based on priority and optional SemVer constraints.
4. Emits registration/removal events through the shared `eventBus` for observers.

### Rationale
* **Loose coupling:** Consumers depend only on the capability ID, not the provider implementation.
* **Determinism:** Priority ranking with alphabetical tie‑break ensures reproducible resolution order.
* **Extensibility:** New capabilities can be added without altering existing modules.
* **Observability:** Event bus integration enables runtime monitoring and dynamic reconfiguration.

## Consequences
* Modules must declare `capabilities` in their manifest.
* `RuntimeManager` must invoke `CapabilityRegistry.register` when a module reaches the `RUNNING` state and `unregister` on `UNLOADED`.
* Tests must cover registration lifecycle, priority selection, version constraints, and event emission.
* Future sprints can build on this foundation for permission enforcement and capability‑based dependency injection.

---
*Architectural Decision Record for Sprint 3.1 – Capability Registry*
