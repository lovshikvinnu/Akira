# ADR-009: Module Event Integration

## Status
Proposed / Accepted

## Context
While Sprints 1.1, 1.2, and 2.1 established the publisher pipeline, event store, and timeline subscriber, the business modules (Projects, Tasks, Notes, Sessions, Settings, Search, and Vault) were still utilizing legacy namespaced event publishing. To complete the adoption of the unified Instrumentation framework, we need to migrate these modules to call the new strongly-typed `publish` API directly while ensuring zero regressions and preserving strict client-server SSR boundaries.

## Decision
We migrate all targeted business modules (Projects, Tasks, Notes, Sessions, Settings, Search, and Vault) to use the unified Instrumentation `publish` API:

1. **Direct Integration**: Replace legacy `eventBus.publish` calls with the direct client-safe `publish()` function from `src/instrumentation`.
2. **Server-Side RPC Bridging**: To avoid leakage of server-only database drivers (`better-sqlite3` and repository modules) to the client bundle, the client-side `publish()` function performs local validation and then broadcasts asynchronously via a server function RPC (`persistPublishEvent`) to save to SQLite on the server.
3. **Fact-Based Ordering**: Events are published only after persistence operations successfully complete in their respective repositories.
4. **Lightweight Payloads**: Payloads are restricted to lightweight JSON-serializable structures containing only essential domain data rather than full DB objects.
5. **Correlation ID preservation**: Modules maintain correlation context during sequential workflows (like starting and completing sessions).

## Consequences
- **Decoupled Architecture**: Subsystems operate independently, communicating solely via the Event Bus.
- **Type Safety**: TypeScript compile-time checks validate that all events published contain valid properties, source origins, and serializable payloads.
- **SSR/Client Safety**: The dynamic browser-to-server RPC bridge ensures that browser-based store updates do not trigger native DB compilation errors.
