# ADR-018: Dependency Resolution Engine

## Status
Accepted

## Context
With the introduction of the Module Manifest System (Sprint 1.2), modules are now self-describing. However, modules often depend on one another (e.g. `Trading` requires `Analytics`, which requires `Database`). Loading modules arbitrarily based on filesystem directory sorting leads to race conditions, reference errors during startup, and unhandled system crashes.

To ensure correct startup/shutdown ordering, we need a deterministic dependency resolution engine to analyze module relations and enforce execution bounds.

## Decision
We will implement an in-memory **Dependency Resolution Engine** inside the Platform Runtime.

Key decisions:
1. **Directed Acyclic Graph (DAG) Representation**: We will represent module relations as a graph of nodes and directed edges, separating this mathematical structure from the `RuntimeManager`.
2. **Depth-First Search (DFS) for Sorting and Cycles**: We will use a DFS traversal algorithm with dual-marking (temporary and permanent marks) to perform topological sorting and cycle detection in linear $O(V + E)$ complexity.
3. **Explicit Cycle Tracing**: If a cycle is detected, the resolver will capture the recursion stack to produce a detailed path (e.g. `Trading -> Portfolio -> Trading`) for developer diagnostics, rather than raising a generic "cycle found" error.
4. **Deterministic Ordering**: We will enforce alphabetical pre-sorting on all module ID inputs before sorting the graph to ensure that the startup sequence is 100% deterministic, regardless of filesystem read variations.
5. **Transitive Skipping (Fault Isolation)**: If a module fails validation (missing or circular dependency), the resolver will transitively propagate the failure, skipping all affected dependents, while letting the remaining independent modules load and boot safely.

## Consequences
* **Stable Booting**: Low-level database and logging services are guaranteed to start before client-facing user interfaces.
* **Fault Isolation**: A single broken module with a circular loop or missing reference will be blocked, but the host platform and other modules will boot successfully.
* **Scalability**: Graph operations are optimized to run in $O(V + E)$ time, allowing the system to scale to hundreds of modules effortlessly.

## Future Extensibility
* **Capability Registry Integration**: In future sprints, dependencies can be expressed as abstract capability claims (e.g. requiring `storage` or `messaging`) instead of hardcoded module IDs. The resolver will map these abstract demands to concrete modules using the same topological graph algorithms.
* **Security & Permissions**: The resolver can verify that a dependent module has a subset of permissions compatible with its parent node.
