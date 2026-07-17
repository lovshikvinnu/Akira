# Architecture Decision Records (ADRs)

This directory contains the **Architecture Decision Records (ADRs)** for Project AKIRA.

## Purpose

ADRs serve as a lightweight, chronological log of the critical design decisions made during the evolution of the AKIRA platform.

### Why We Document Architectural Decisions

While code files and architecture specifications define _what_ we built and _how_ it is implemented, they do not record the contextual trade-offs, constraints, and debates that occurred during the design phase. ADRs preserve the core reasoning behind our decisions so future contributors and AI agents understand **why** choices were made, rather than just what was built.

### Why Decisions are Stored Separately from Specifications

- **Historical Reference**: Specifications describe the _current_ target state of the system. In contrast, ADRs are a chronological history. They document decisions at a specific point in time under specific constraints.
- **Separation of History and Status**: Specifications evolve and get updated (until frozen), whereas ADRs are immutable historical logs.

---

## Guidelines for Contributors

### ADRs Record "Why", Not "How"

ADRs must focus on the architectural reasoning and trade-offs. They should remain implementation-independent. Do not include database schemas, API specs, coding patterns, or UI designs in an ADR.

### Immutable History

Once an ADR is accepted, **it must never be edited to change historical decisions**.

- If a previous architectural decision is changed, create a new ADR (e.g., `ADR-006`).
- The new ADR must state that it **supersedes** the previous one (e.g., _"This ADR supersedes ADR-002"_).
- Update the status of the original ADR to `Superceded` and link it to the new one.
- This preserves the architectural history of AKIRA and ensures complete traceability for future engineers.

### Creating a New ADR

1. Assign the next sequential number (e.g., `ADR-006-descriptive-name.md`).
2. Follow the standard sections: **Status**, **Context**, **Decision**, **Reasoning**, and **Consequences**.
3. Submit the ADR for team/community review. Once accepted, change its status to `Accepted` and add it to the index below.

---

## Index of Decisions

- [ADR-001: Separation of Memory and AI Models](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/decisions/ADR-001-memory-and-ai-separation.md)
- [ADR-002: Story-First Memory Architecture](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/decisions/ADR-002-story-first-memory.md)
- [ADR-003: Emergent Identity Discovery](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/decisions/ADR-003-emergent-identity.md)
- [ADR-004: Decoupled Context Builder](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/decisions/ADR-004-context-builder.md)
- [ADR-005: Companion Core Behavioral Model](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/decisions/ADR-005-companion-philosophy.md)
