# Capability Registry Documentation

## Overview
The **Capability Registry** is a central service‑discovery layer for AKIRA OS. Modules declare the capabilities they provide in their manifest. Other modules request capabilities by ID, and the runtime resolves a concrete provider instance.

## Capability Model
```ts
export interface Capability {
  /** Unique identifier for the capability */
  id: string;
  /** Human readable name */
  name: string;
  /** Short description */
  description: string;
  /** Semantic version of the capability */
  version: string;
  /** Module that provides this capability */
  providerModule: string;
  /** Priority – higher wins when multiple providers exist */
  priority: number;
  /** Arbitrary tags for filtering */
  tags: string[];
  /** Runtime status – mostly for UI */
  status: "active" | "deprecated";
}
```
* `id` is the contract name (e.g. `storage`).
* `providerModule` ties the capability to a loaded module instance.
* `priority` resolves conflicts – the highest numeric priority is chosen.
* In the event of a tie, the registry falls back to **alphabetical ordering of `providerModule`** for deterministic selection.

## Provider Registration Lifecycle
| Phase | Action | Registry Effect |
|------|--------|-----------------|
| **Discovery** | Module manifest is read; `capabilities` array extracted. | No immediate change – just metadata stored. |
| **Startup** | `LifecycleManager` transitions a module to `RUNNING`. | `CapabilityRegistry.register()` is called for each declared capability. |
| **Shutdown** | `LifecycleManager` transitions a module to `UNLOADED`. | `CapabilityRegistry.unregister()` removes all capabilities belonging to that module. |
| **Reload / Restart** | Same as shutdown → startup. | Registry updates automatically, keeping the latest provider instance. |

## Priority Selection Strategy
1. **Collect all providers** for a requested capability ID.
2. **Filter by optional version range** (SemVer satisfies check).
3. **Pick the provider with the highest `priority`**.
4. **Tie‑break**: sort remaining providers by `providerModule` (lexicographically) and pick the first.

The algorithm guarantees **deterministic** results regardless of registration order, which is crucial for reproducible boot sequences.

## Usage Example
```ts
// Somewhere in a consumer module
import { RuntimeManager } from "../src/runtime";

const runtime = RuntimeManager.getInstance();
const storage = runtime.capabilityRegistry.resolve("storage", "^1.0.0");

// `storage` is the concrete service instance exported by the provider module
storage.save({ key: "user", value: "Alice" });
```

## Event Bus Integration
The registry publishes two events via the shared `eventBus`:
* `CapabilityEvents.REGISTERED` – payload `{ capability: Capability }`
* `CapabilityEvents.REMOVED` – payload `{ capabilityId: string, providerModule: string }`

Consumers can subscribe to react to dynamic capability changes, enabling hot‑swap scenarios.

## Error Types
* `DuplicateCapabilityRegistrationError` – same module tries to register the same ID twice.
* `InvalidCapabilityPriorityError` – priority is not a positive integer.
* `InvalidCapabilityMetadataError` – missing required fields (empty `id` or `version`).
* `CapabilityNotFoundError` – lookup fails because no provider matches.
* `CapabilityVersionMismatchError` – version constraint cannot be satisfied.

---
*Documentation generated for Sprint 3.1 – Capability Registry*
