# ADR-008: Event-Driven Timeline

## Status
Proposed / Accepted

## Context
Previously, the Timeline subsystem in AKIRA was coupled to the lifecycle of business modules. When changes occurred, modules communicated via in-memory custom handlers, and database triggers directly wrote audit entries to the `timeline_events` table (such as file creations and deletions). This direct DB trigger approach bypassed server-side validation layers, was difficult to test in isolation, and prevented other subsystems (like Analytics or GENESIS memory) from observing those events in a unified stream.

## Decision
We decouple the Timeline completely from all business modules by migrating it to be a pure, reactive subscriber on the newly introduced Instrumentation Event Bus.

Key details:
1. Business modules publish strongly-typed events to the Event Bus.
2. We implement a dedicated `TimelineSubscriber` (`EventSubscriber` contract) that observes the event stream.
3. The subscriber handles mapping supported events to timeline records and writes them to SQLite via the `TimelineRepository`.
4. We completely remove obsolete timeline-logging database triggers (`trg_vault_files_insert_audit`, `trg_vault_files_delete_audit`) from the SQLite initialization schema.

## Consequences
- **Loose Coupling**: Business modules and database triggers no longer have direct write dependencies on the timeline layout.
- **Single Source of Truth**: The Event Bus is the unified entrypoint for both Event Store persistence and Timeline tracking.
- **Duplicate Protection**: The subscriber maps `AkiraEvent.id` directly to `TimelineEvent.id`. SQLite primary key constraint checks prevent double logging of identical events automatically.
- **Extensibility**: Adding future modules (like Analytics or GENESIS) will require zero modifications to existing modules. They will simply register as new independent Event Bus subscribers.
