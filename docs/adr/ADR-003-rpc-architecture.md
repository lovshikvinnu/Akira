# Architecture Decision Record: ADR-003 SSR & RPC Serialization

## Status
Accepted

## Context
AKIRA OS uses a local SQLite database file (`akira.db`). The client UI runs inside standard browser threads, but the database connection (`better-sqlite3`) relies on native C bindings that must execute in a Node.js/Bun server-side environment.

## Problem
Frontend components must be able to request database mutations without leaking server-only modules (`better-sqlite3`, `fs`, `path`) into client-side JS bundles, which would break building the application.

## Decision
Use TanStack Start's `createServerFn` to build a serialization layer. All database mutations and queries run as server functions. The browser client calls these functions as standardized HTTP POST/GET requests. We enforce dynamic repository imports inside these handlers to prevent server-side imports from leaking into client files.

```typescript
export const persistAddNote = createServerFn({ method: "POST" })
  .validator((input: AddNoteInput) => input)
  .handler(async ({ data: input }) => {
    // Dynamic import isolates native DB packages
    const { noteRepository } = await import("../../persistence/repositories");
    return noteRepository.add(input);
  });
```

## Alternatives Considered
*   **WebSQL/IndexedDB Client Store**: Saving data inside the browser's IndexedDB engine. This was rejected because it lacks the SQL capabilities (FTS5 search, database triggers, constraints) needed for complex data modeling.
*   **Local REST API Server**: Bootstrapping an Express/FastAPI server on a separate port. This was rejected because it introduces port conflicts, process management overhead, and complex local network configurations.

## Trade-offs
*   *Pros*: Complete code isolation, secure database executions, and simplified build steps.
*   *Cons*: Every database transaction must be serialized through the RPC layer, adding a minor serialization step.

## Consequences
Components must fetch initial data via RPC queries (such as `getInitialState`) and request writes through RPC mutations.

## Future Implications
This RPC layout can be adapted to support remote servers or cloud databases in the future without changing client-side code.
