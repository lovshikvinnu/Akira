# Context Resolution Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 08-context-resolution-engine.md
>
> _This document defines the Context Resolution Engine (CRE), the orchestration and prioritization subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

For a growth companion to interact effectively, it must not only gather metrics from individual subsystems (Presence, State, Goals, Knowledge, Habits, Relationships, Reflection) but synthesize them into a coherent, focused understanding. If each engine outputs its own priority without central coordination, the resulting context package becomes cluttered, contradictory, and unfocused.

AKIRA establishes a unified coordination layer via the **Context Resolution Engine (CRE)**. This subsystem prioritizes and resolves the outputs of all Companion Intelligence subsystems, answering the question: _"Given everything the Companion currently understands, what information is most relevant right now?"_

The relationship between architectural components flows as follows:

```
 Presence Context ─────────┐
 Companion State ──────────┼──► Context Resolution Engine (CRE)
 Goal Context ─────────────┤                 │
 Knowledge Context ────────┤                 ▼
 Relationship Context ─────┤         Resolved Context
 Habit Context ────────────┤                 │
 Reflection Context ───────┘                 ▼
                                     AI Context Engine
```

- **Presence, State, Goal, Knowledge, Relationship, Habit, and Reflection Contexts**: Individual, specialized output models from each intelligence subsystem.
- **Context Resolution Engine (CRE)**: The orchestrator that filters, reconciles, and aggregates these specialized models.
- **Resolved Context**: The unified, prioritized output of the CRE.
- **AI Context Engine**: The downstream prompt compiler that formats the Resolved Context for conversational models.

By separating context resolution into a dedicated subsystem, AKIRA prevents individual engines from requiring knowledge of other engines' states, maintaining strict modularity.

The CRE enforces **Provenance Preservation**. While it prioritizing and reconciling active contexts, the engine never strips away originating metadata. Every resolved understanding in the output remains traceable back to the specialized subsystem that produced it.

---

## 2. Responsibilities

The Context Resolution Engine orchestrates and reconciles specialized contexts:

- **Context Aggregation**: Collects the primary conceptual outputs of all active intelligence subsystems.
- **Context Prioritization**: Analyzes all inputs to rank which factors (e.g., active goals vs. pressing habits) are most relevant to the immediate interaction.
- **Context Reconciliation**: Synthesizes inputs into a single, cohesive model of the user's situation.
- **Conflict Resolution**: Resolves contradictions between subsystems (e.g., workspace task updates contradicting conversational focus states).
- **Context Relevance Filter**: Discards low-relevance or redundant information to keep prompt context focused.
- **Context Confidence Synthesis**: Combines confidence values from all subsystems to determine overall context certainty.
- **Context Coherence Verification**: Ensures that the compiled context package has logical integrity and continuity.
- **Current Interaction Relevance**: Evaluates relevance dynamically as user focus shifts.

The CRE resolves context but never creates it. It organizes evidence provided by specialized subsystems, avoiding independent context generation.

---

## 3. Non-Responsibilities

The Context Resolution Engine acts strictly as an orchestrator:

- **Create Memories**: It does not log persistent history event nodes.
- **Update Identity**: It does not adjust trait ratings or modify personality profiles.
- **Generate Responses**: It does not write greetings, summaries, or messages.
- **Trigger Initiative**: It does not decide when the companion should speak.
- **Infer Knowledge**: It does not calculate user competencies or skill levels.
- **Manage Goals**: It does not track user milestones or target deadlines.
- **Detect Habits**: It does not identify user routines.
- **Replace AI Context Engine**: It does not handle prompt formatting or manage LLM requests.
- **Make User Decisions**: It does not suggest or automate task choices on behalf of the user.

---

## 4. Context Resolution Lifecycle

The context resolution process runs dynamically during active sessions:

```
Receive Contexts  ◄─── Ingests outputs from all active engines
        │
        ▼
Validate Contexts ◄─── Verifies integrity and checks confidence scores
        │
        ▼
Resolve Conflicts ───► Applies reconciliation rules to contradictions
        │
        ▼
Prioritize Relevance
        │
        ▼
Construct Unified Context
        │
        ▼
Expose Resolved Context ─► Downstream engines consume the resolved output
        │
        ▼
Repeat As Context Evolves
```

1. **Receive Contexts**: The engine reads the primary conceptual outputs of all active subsystems.
2. **Validate Contexts**: Verifies that the ingested contexts are structurally intact and checks confidence scores.
3. **Resolve Conflicts**: Compares subsystem metrics to identify and resolve contradictions.
4. **Prioritize Relevance**: Ranks context elements based on immediate relevance factors.
5. **Construct Unified Context**: Assembles prioritized context elements into an immutable Resolved Context model.
6. **Expose Resolved Context**: Publishes the resolved context for consumption by downstream prompt systems.
7. **Repeat As Context Evolves**: As user interactions trigger updates in individual engines, the CRE compiles fresh resolutions.

---

## 5. Resolved Context

The engine exposes a single read-only model representing resolved context:

- **Current Priorities**: The top-ranked focus areas (projects, goals) for the current turn.
- **Relevant Context**: Key context details chosen for prompt inclusion.
- **Supporting Evidence**: Citations linking selected parameters back to historical database events.
- **Active Goals**: The prioritized subset of goals relevant to the current task.
- **Current Focus**: The resolved active focus area (e.g. debugging, planning).
- **Important Relationships**: Key contact details relevant to active projects.
- **Relevant Habits**: Active user routines that align with or challenge current goals.
- **Knowledge Relevance**: Competency details related to the active topic.
- **Reflection Relevance**: Recent progress evaluations relevant to the current session.
- **Overall Confidence**: Aggregated context certainty score.

---

## 6. Inputs

The CRE consumes only the primary conceptual outputs of the intelligence subsystems:

- **Presence Context**: Temporal parameters (from [01-presence-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/01-presence-engine.md)).
- **Companion State**: Active focus and session parameters (from [02-companion-state-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/02-companion-state-engine.md)).
- **Goal Context**: Active priorities and milestones (from [03-goal-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/03-goal-engine.md)).
- **Knowledge Context**: Competencies and skill gaps (from [04-knowledge-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/04-knowledge-engine.md)).
- **Relationship Context**: Active collaborators and social details (from [05-relationship-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/05-relationship-engine.md)).
- **Habit Context**: Active user routines and patterns (from [06-habit-intelligence.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/06-habit-intelligence.md)).
- **Reflection Context**: Retrospective progress evaluations (from [07-reflection-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/07-reflection-engine.md)).

The CRE is prohibited from querying internal subsystem states or database tables directly.

---

## 7. Outputs

The sole output is the **Resolved Context**.

In accordance with the Provenance Preservation principle, the output resolved context contains and exposes the provenance metadata (originating subsystem, supporting evidence, and confidence rating) of all consolidated parts.

Downstream subsystems consume this output:

- **The AI Context Engine**: Appends the Resolved Context directly to prompt structures.
- **The Initiative Engine**: Ingests priorities and blockers to decide when the companion should proactively speak.
- **The Reflection Engine**: Evaluates session outcomes against resolved priorities.

---

## 8. Integration Points

The CRE coordinates data flows across the companion layer:

- **Presence, State, Goal, Knowledge, Relationship, Habit, and Reflection Engines**: Act as primary context suppliers.
- **AI Context Engine**: Formats the compiled Resolved Context for LLM queries.
- **Initiative Engine (future)**: Inspects resolved priorities and confidence scores to evaluate proactive triggers.

---

## 9. Context Resolution Principles

The CRE applies the following rules when resolving inputs:

- **Relevance over Quantity**: Limit context size to keep prompts focused.
- **Evidence over Assumptions**: Prioritize verified event logs over inferred states.
- **Current over Stale**: Prioritize immediate session state over historical indicators.
- **Resolve Conflict without Discarding**: If contradictions exist, include both perspectives with a note on the conflict rather than throwing out data.
- **Preserve Uncertainty**: If confidence values are low, propagate the uncertainty to downstream engines.
- **Minimize Unnecessary Context**: Exclude parameters that do not relate to the current active project or task.
- **Maintain Explainability**: Ensure that every selected context element preserves its source references.

---

## 10. Failure Modes

The CRE resolves anomalous inputs predictably:

- **Missing Context**: If a subsystem context is unavailable, the CRE ignores that domain and resolves using the remaining inputs.
- **Conflicting Contexts**: If subsystems conflict, the CRE resolves using the state engine (present behavior) as the tie-breaker and lowers context confidence.
- **Weak Confidence**: If overall confidence falls below the baseline threshold, the CRE flags the context as unverified.
- **Sparse Interaction History**: Defaults to an empty baseline context.
- **Ambiguous Priorities**: Resolves priorities equally and logs the ambiguity.
- **Simultaneous Competing Goals**: Ranks goals based on workspace logs and task listings.

---

## 11. Architectural Principles

The Context Resolution Engine is built upon the following tenets:

- **Single Orchestration Responsibility**: Coordinates and reconciles without duplicating specialized logic.
- **Provenance Preservation**: Never strips or discards provenance metadata (originating subsystem, evidence, confidence) from resolved items, ensuring traceability.
- **Explainable**: The path from raw inputs to resolved priorities is traceable.
- **Evidence-Based**: Prioritization rules are driven by objective interaction history.
- **Deterministic**: Logical checks process identical inputs consistently.
- **Context, Not Behavior**: Focuses exclusively on context compilation; does not define dialogue output.
- **Preserve Uncertainty**: Propagates low-confidence parameters downstream.
- **Separation of Concerns**: Kept distinct from prompt generation and database mutation.
- **Technology Independent**: Independent of databases, languages, or prompt engines.

---

## 12. Future Compatibility

The system scales to support upcoming features:

- **Voice**: Limits resolved context size to keep vocal prompts short and conversational.
- **Vision**: Ingests visual workspace coordinates to refine active priorities.
- **Calendar**: Ingests scheduled events to evaluate active constraints.
- **Desktop Automation**: Supplies context parameters to guide background automation tasks.
- **Email & Notifications**: Ingests incoming alerts to update active context priorities.
- **Mobile & Wearables**: Matches context filters to screen limits.
- **Cross-Device Continuity**: Temporal synchronization using the consistent temporal reference keeps context priorities aligned during active device swaps.
- **Future Companion Intelligence Subsystems**: New subsystems plug directly into the CRE input list without affecting other engines.
