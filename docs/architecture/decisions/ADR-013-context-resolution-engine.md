# ADR-013: Dedicated Context Resolution Subsystem

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a unified model of the user's situation (Resolved Context) compiled from multiple specialized subsystems (Presence, State, Goals, Knowledge, Habits, Relationships, Reflection).

We need to decide whether to distribute the prioritization logic across the individual engines, embed it within the downstream AI Context Engine (the prompt compiler), or isolate it within a dedicated Context Resolution Engine (CRE) orchestration layer.

---

## Alternatives Considered

### Alternative A: Distributed Prioritization (Self-Prioritization)

Each individual engine (e.g. Goal, Knowledge, Habit) determines its own relevance and priority, pushing updates directly to a global context buffer.

- **Pros**: Simple engine-level design; avoids building a centralized coordinator.
- **Cons**: Leads to conflict resolution failures. Without a central coordinator, individual engines have no knowledge of other engines' contexts. This results in bloated, conflicting, and uncoordinated context updates (e.g. goals contradicting active focus states) that confuse downstream dialogue systems.

### Alternative B: Embedded in the AI Context Engine

The AI Context Engine (which compiles prompts for the conversational models) queries all specialized subsystems directly, resolving conflicts and prioritizing parameters dynamically during prompt construction.

- **Pros**: Consolidates context resolution and formatting in a single prompt layer.
- **Cons**: Violates the separation of concerns. The AI Context Engine should focus on prompt construction and provider communication. Blending context resolution logic into this layer makes it difficult to audit, test, or update resolution rules without modifying prompt code. It also limits compatibility with non-LLM engines (e.g. local automation systems) that need access to resolved priorities.

### Alternative C: Centralized Orchestration Subsystem (Selected)

Establish a separate Context Resolution Engine (CRE) that ingests the primary conceptual outputs of all subsystems, applies central prioritization and reconciliation rules, and exports a unified Resolved Context model.

- **Pros**: Keeps specialized engines decoupled, isolates resolution logic for easy testing, simplifies prompt formatting code, and supports integration with both LLM prompt engines and local background automation systems.
- **Cons**: Requires managing data flow updates across multiple subsystems.

---

## Decision

We will implement the Context Resolution Engine as a dedicated centralized orchestration subsystem (Alternative C).

---

## Rationale

### 1. High Modularity and Separation of Concerns

Specialized engines (e.g. Knowledge, Relationship, Habit) should remain focused on modeling their specific domains. They should not need to know about other engines' states. By routing all outputs to a central CRE, the individual engines remain decoupled, improving maintainability.

### 2. Explainability, Auditing, and Provenance Preservation

Having a single orchestration point makes it easy to trace how context priorities were resolved. Developers and diagnostic tools can inspect the exact input metrics, conflict resolution overrides, and prioritization rules that formed the final Resolved Context. Crucially, in accordance with the **Provenance Preservation** principle, the CRE resolves context without removing provenance metadata; every resolved detail remains traceable to its originating subsystem, supporting evidence, and confidence rating.

### 3. Long-Term Scalability

As new intelligence subsystems are added (e.g. schedule trackers, local workspace activity monitors), they can plug directly into the CRE as fresh input sources without requiring modifications to existing engines or prompt formatting files.

### 4. Downstream Flexibility

Exposing a single, unified `Resolved Context` output ensures that any downstream subsystem—whether it is the AI prompt formatter, a local notification dispatcher, or an initiative evaluator—can read the same structured situation model.

### 5. Consistent Temporal Reference

The engine resolves temporal context variables using a consistent temporal reference supplied by the Companion Platform rather than local clocks, guaranteeing that chronological sequencing is preserved across multi-device synchronizations.

---

## Consequences

- Other systems must interact with the CRE using the primary `Resolved Context` output.
- Subsystems are prohibited from querying other subsystems' internal states directly.
- Downstream prompt compilers do not need to handle context reconciliation rules.
- The CRE must preserve and expose full provenance metadata (originating subsystem, evidence, confidence) for all resolved context items.
- We must establish triggers to update the CRE whenever specialized subsystems publish context changes.
