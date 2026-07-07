# Companion Intelligence System Overview

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Overview  
> **Document**: 00-system-overview.md
>
> _This document serves as the entry point and definitive system overview of the Companion Intelligence Layer of AKIRA, detailing its architecture, subsystems, and structural invariants independently of implementation technologies._

---

## 1. Purpose of the Companion Intelligence Layer

The **Companion Intelligence Layer** provides the core reasoning, situational awareness, and proactivity logic of AKIRA. Unlike traditional AI applications that rely on stateless prompt calls or ad-hoc memory search, AKIRA models the user’s life, progress, routines, and collaborative networks as structured, deterministic cognitive states.

The main objective of this layer is to compile, prioritize, and reconcile these structured states into a unified context (Resolved Context) to ground active interaction, and to retrospectively evaluate growth (Reflection Context) at session close. This architecture ensures that the companion remains a supportive, explainable, and non-intrusive growth partner.

---

## 2. Subsystems and Responsibilities

The layer is divided into nine specialized subsystems, each responsible for modeling a single domain:

1. **Presence Engine**: Evaluates temporal returns, gap durations, and continuity confidence based on a consistent temporal reference.
2. **Companion State Engine**: Manages the volatile, session-scoped active working context and user focus transitions.
3. **Goal Engine**: Tracks persistent, hierarchical intention progression and blockers across multiple sessions.
4. **Knowledge Engine**: Models user competencies, mastery levels, and learning gaps across technical and conceptual domains.
5. **Relationship Engine**: Maps external contacts, shared project contexts, and collaborative histories.
6. **Habit Intelligence Engine**: Observes recurring routines and behavioral patterns neutrally without gamification.
7. **Reflection Engine**: Retrospectively synthesizes user progress, growth, and milestone achievements at session end to build archived historical records.
8. **Context Resolution Engine (CRE)**: Orchestrates context resolution by aggregating, prioritizing, and reconciling all subsystem contexts into a unified situation model.
9. **Initiative Engine**: Evaluates opportunities to decide conservative proactive suggestions, questions, or check-ins.

---

## 3. Dependency Graph

The subsystem hierarchy is strictly unidirectional. To prevent circular references, active engines (Goals, Knowledge, Habits, Relationships) only consume **archived historical reflections** from previous sessions. The retrospective Reflection Engine runs only after active sessions close.

```mermaid
flowchart TD
    subgraph Persistent Database (GENESIS)
        DB[(Archived Reflections & Memories)]
    end

    subgraph Baseline Translation
        Presence[Presence Engine]
    end

    subgraph Active Tracking & Intention
        State[Companion State Engine]
        Goals[Goal Engine]
        Knowledge[Knowledge Engine]
        Relationship[Relationship Engine]
        Habits[Habit Intelligence]
    end

    subgraph Retrospective Consolidation
        Reflection[Reflection Engine]
    end

    subgraph Orchestration & Decision
        CRE[Context Resolution Engine]
        Initiative[Initiative Engine]
    end

    DB -.->|Ingest on Boot| State
    DB -.->|Ingest on Boot| Goals
    DB -.->|Ingest on Boot| Knowledge
    DB -.->|Ingest on Boot| Relationship
    DB -.->|Ingest on Boot| Habits

    Presence --> State
    State --> Goals
    State --> Habits
    Goals --> Habits
    Knowledge --> Habits
    Relationship --> Habits

    Goals --> Reflection
    Habits --> Reflection
    Knowledge --> Reflection
    Relationship --> Reflection
    Presence --> Reflection
    State --> Reflection

    Reflection -->|Write Immutable Context| DB

    Presence --> CRE
    State --> CRE
    Goals --> CRE
    Knowledge --> CRE
    Relationship --> CRE
    Habits --> CRE
    Reflection --> CRE

    CRE -->|Resolved Context| Initiative
    CRE -->|Resolved Context| Prompt[AI Context Engine]
    Initiative -->|Initiative Decision| Dialogue[Conversation Lifecycle]
```

---

## 4. Primary Conceptual Outputs

To ensure decoupling, subsystems communicate exclusively by exposing exactly one primary conceptual read-only context output model. Subsystems are prohibited from reading or modifying the internal reasoning of other engines.

| Subsystem                     | Primary Conceptual Output | Description                                                                     |
| :---------------------------- | :------------------------ | :------------------------------------------------------------------------------ |
| **Presence Engine**           | `Presence Context`        | Temporal return states, gap durations, and continuity confidence values.        |
| **Companion State Engine**    | `Companion State`         | Volatile active focus, project, checklist, and topic parameters.                |
| **Goal Engine**               | `Goal Context`            | Active goal hierarchy, priorities, milestones, and blockers.                    |
| **Knowledge Engine**          | `Knowledge Context`       | Evolving skill mastery levels, concepts, and prerequisite learning gaps.        |
| **Relationship Engine**       | `Relationship Context`    | Core contacts list, shared project contexts, and collaborative history indexes. |
| **Habit Intelligence**        | `Habit Context`           | Observed routines, pattern confidence values, and stability metrics.            |
| **Reflection Engine**         | `Reflection Context`      | Retrospective progress, learning milestones, and habit changes.                 |
| **Context Resolution Engine** | `Resolved Context`        | Reconciled situation model with prioritized priorities and unified confidence.  |
| **Initiative Engine**         | `Initiative Decision`     | Selected proactive action (Silence, Suggestion, Question, or Reminder).         |

---

## 5. Data Flow Lifecycle

1. **Session Bootstrapping**: The short-lived `Awareness Session` compiles the initial snapshot from database inputs and historical reflections, immediately handovers active context ownership to the `Companion State Engine`, and becomes immutable.
2. **Presence Evaluation**: The `Presence Engine` reads the temporal references to evaluate the return state and Continuity Confidence.
3. **Active Loop**: As user workspace events and chat dialogues occur, the `Companion State Engine` updates focus states. This feeds details downstream to Goals, Knowledge, Relationships, and Habits.
4. **Context Orchestration**: The `Context Resolution Engine` aggregates all context models, applies prioritization rules, and publishes the `Resolved Context`.
5. **Proactivity Evaluation**: The `Initiative Engine` reads the `Resolved Context` to determine if a proactive suggestion is appropriate, defaulting to silence.
6. **Retrospective Evaluation**: At session close, active contexts are frozen and evaluated by the `Reflection Engine`. It writes an immutable `Reflection Context` back to long-term memory, which will be loaded during the next session's bootstrap.

---

## 6. Cross-Cutting Principles

### Evidence Verification

When the user explicitly corrects an inferred understanding of their state, goals, or competencies, the originating subsystem must update its understanding. Explicit user corrections are recorded as verified evidence. Subsystem confidence values are updated accordingly, previous inferences remain explainable in history, and future reasoning prioritizes the verified evidence.

### Provenance Preservation

Every primary conceptual output produced by a subsystem must preserve its originating subsystem identification, supporting evidence (links back to specific event logs), and confidence rating. The Context Resolution Engine coordinates and prioritization context details without removing this metadata, ensuring every resolved fact remains traceable and auditable.

### Consistent Temporal Reference

All temporal and chronology calculations—such as absence durations, return cycles, and habit frequencies—are evaluated using a consistent temporal reference supplied by the Companion Platform. The architecture does not define how temporal consistency is achieved, removing local clock synchronization anomalies across devices.

---

## 7. Architectural Invariants

Developers must preserve the following architectural boundaries:

1. **Strict Unidirectional Decoupling**: Active engines must never consume active reflection states. Active engines only read archived historical reflection databases.
2. **Ephemerality of Working Context**: The active Companion State exists only in volatile runtime memory during the session. It must be completely dissolved at session closure.
3. **Boundary Isolation**: Subsystems must only access other subsystems' information via their primary conceptual outputs. Directly querying another engine's database tables or internal properties is strictly forbidden.
4. **No Direct Writes during Sessions**: Active tracking engines are prohibited from writing updates directly to the persistent database. State mutations are held in memory and committed retrospectively via the Reflection and Closure lifecycle phases.
5. **Silence-by-Default**: The Initiative Engine must default to "No Action" (Silence) when context confidence is low or when workspace activity indicates deep focus. Proactivity is treated as a conservative support feature, never an engagement-maximizing mechanism.
6. **Technology Independence**: Specifications, interfaces, and specifications within this domain must remain entirely independent of programming languages, libraries, platforms, databases, and AI model providers.
