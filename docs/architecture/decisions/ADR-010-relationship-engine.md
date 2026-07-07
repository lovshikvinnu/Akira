# ADR-010: Dedicated Relationship Subsystem

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a model of the key people in the user's life (collaborators, mentors, family members, etc.).

We need to decide whether to embed relationship data within existing structures (like Memory or Identity) or isolate it within a dedicated Relationship Engine subsystem.

---

## Alternatives Considered

### Alternative A: Embedding in Memory (GENESIS)

Treat relationships as raw semantic tags or text mentions within the GENESIS database. Social context would be queried on-the-fly by parsing historical memory nodes.

- **Pros**: Simple schema design; avoids building a new subsystem.
- **Cons**: As memory logs grow, parsing thousands of events to extract active relationships, roles, and open plans at every turn becomes slow. This increases query latency and makes it difficult to maintain structured profiles of contacts.

### Alternative B: Embedding in Identity

Model key contacts as part of the user's emergent social identity traits.

- **Pros**: Captures the alignment between user values and social circles.
- **Cons**: Identity models user traits and behavior patterns, which evolve slowly. Contacts, roles, and collaborative goals update frequently, and blending them violates the single responsibility principle.

### Alternative C: Dedicated Relationship Engine Subsystem (Selected)

Establish a separate Relationship Engine that compiles evidence from memories, states, and reflections into a structured Relationship Context. Other engines consume this output model directly.

- **Pros**: Strict separation of concerns, keeps memory queries fast, provides an explainable and auditable social model, and isolates relationship context cleanly.
- **Cons**: Requires building pipelines mapping workspace and dialogue updates to relationship profiles.

---

## Decision

We will implement the Relationship Engine as a dedicated architectural subsystem (Alternative C).

---

## Rationale

### 1. Separation of Concerns

Isolating Relationships from Memory and Identity ensures that each engine remains focused on its core responsibility:

- Memory (GENESIS) stores historical _events_.
- Identity models the _user's character_.
- Relationship Engine models the _external social network_.

### 2. Privacy-First Boundaries

Social data is sensitive. A dedicated Relationship Engine makes it easy to isolate, inspect, or clear social records without affecting the rest of the database, ensuring high user trust.

### 3. Clear Integration Depth

A separate engine makes it easy to integrate with other subsystems. The Initiative Engine can evaluate open plans to trigger check-ins, the Reflection Engine can evaluate session metrics against collaborative tasks, and the Context Resolution Engine can inject active collaborators into prompt context packages.

### 4. High Explainability

A dedicated subsystem makes it easy to trace how a specific workspace action contributed to relationship updates, improving transparency.

---

## Consequences

- Other systems must interact with the Relationship Engine using the primary `Relationship Context` output.
- Downstream engines do not need to query historical memory logs to resolve contact profiles.
- We must define interfaces mapping workspace updates to relationship profile calculations.
