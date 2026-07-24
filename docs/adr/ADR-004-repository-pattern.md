# Architecture Decision Record: ADR-004 Repository Pattern

## Status
Accepted

## Context
Data storage needs to stay decoupled from business logic in AKIRA OS. The app needs to support both client-side simulation (e.g. testing) and server-side SQLite persistence.

## Problem
Mixing SQL statements directly inside RPC handlers or client services makes it difficult to swap out storage engines, mock databases during testing, or keep code readable.

## Decision
Implement the Repository Pattern. We define abstract repository interfaces (e.g. `NoteRepository.ts`) inside `src/contracts/repositories/` to represent data tables, and create concrete SQL implementations (e.g. `SqliteNoteRepository.ts`) inside `src/persistence/repositories/`. Server functions interact only with these interface classes.

## Alternatives Considered
*   **Active Record ORM (e.g., Prisma, Drizzle)**: Integrating a Javascript ORM. This was rejected because it adds dependency overhead, requires complex build setups, and limits our control over custom SQLite features like FTS5 virtual tables and raw triggers.
*   **Direct SQL inside RPCs**: Writing raw query strings directly inside `createServerFn` handlers. This was rejected because it makes testing difficult.

## Trade-offs
*   *Pros*: Standardizes table schemas, simplifies unit testing, and isolates raw SQL statements.
*   *Cons*: Developers must write both interface definitions and repository implementation code.

## Consequences
All SQL queries are centralized inside repository implementation files under `src/persistence/repositories/`.

## Future Implications
If we decide to support cloud syncing or alternative local file databases, we can do so by writing new repository implementations that adhere to the existing contracts.
