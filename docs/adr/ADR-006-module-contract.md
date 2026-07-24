# Architecture Decision Record: ADR-006 Module Contract

## Status
Accepted

## Context
AKIRA OS is built by multiple developers and will expand in the future to include advanced modules like Analytics, TITAN, and FORGE. We need to enforce a consistent directory layout to keep the codebase clean and maintainable.

## Problem
Without clear modular boundaries, developers write code in different styles. This leads to mixed client/server imports, database query leakage into UI components, and circular dependencies between features.

## Decision
Enforce a standard layout for all modules in `src/akira-os/`:
```
components/  -> UI elements only
hooks/       -> React hooks (useSyncExternalStore selectors)
services/    -> Client-side entry points
server/      -> Server functions (TanStack Start RPCs)
repositories/-> SQLite operations only
types/       -> TypeScript interfaces
tests/       -> Vitest test suites
index.ts     -> Public barrel export
```
We also enforce strict rules: UI files cannot import repository modules, and database operations must run server-side.

## Alternatives Considered
*   **Feature-First Layout**: Storing components, repositories, and routes in flat folders. This was rejected because it makes it difficult to separate client-side and server-side code.
*   **Layer-First Layout**: Grouping all components in one global folder and all repositories in another. This was rejected because it scatters feature files across the project.

## Trade-offs
*   *Pros*: Standardizes directory layouts, isolates server-side and client-side code, and simplifies onboarding.
*   *Cons*: Requires creating several subfolders for each new feature module.

## Consequences
Modules must organize their code according to the contract structure. Build tasks verify import boundaries to block incorrect client/server imports.

## Future Implications
New tools (such as Analytics or TITAN) will automatically be organized under the correct directories, ensuring the codebase remains clean as the project grows.
