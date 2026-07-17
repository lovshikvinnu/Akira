# Presence Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 01-presence-engine.md
>
> _This document defines the Presence Engine, the conceptual temporal and interaction continuity system belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

A companion's ability to act as a supportive partner in growth depends on its understanding of the user's temporal situation and continuity. Reactive systems treat each session as a clean slate or query long-term logs with no awareness of the immediate transition.

AKIRA establishes temporal structure via the **Presence Engine**. This subsystem sits between active user execution and the companion's dialogue systems, answering the question: _"Given the current session and recent interaction history, what is the user's present interaction context?"_

The conceptual relationship flows as follows:

```
┌───────────────────┐     ┌─────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ Companion Session │ ──► │    Awareness    │ ──► │  Presence Engine  │ ──► │   Conversation   │
└───────────────────┘     └─────────────────┘     └───────────────────┘     └──────────────────┘
  Parent Interface          Workspace State,        Temporal & Continuity     Active Dialogue,
  Lifecycle Boundaries      Goals, & Stories        Context Aggregator        Grounded in Context
```

- **Companion Session**: Manages the overarching runtime boundary (active workspace usage or window focus).
- **Awareness**: Represents the immediate workspace situation, active goals, constraints, and narrative stories.
- **Presence**: Computes the exact temporal relation of this session compared to past interactions, assessing gap durations, first-session flags, and conversation resumption states.
- **Conversation**: Active interaction grounded by both Awareness and the computed Presence Context.
- **Reflection**: Consolidates session outputs post-interaction, writing to memory and closing the loop.

By separating Presence from general Awareness and Memory, the system isolates raw temporal calculation from semantic reasoning. The Presence Engine does not think, retrieve records, or construct memories; it objectively characterizes the temporal interface transition.

---

## 2. Responsibilities

The Presence Engine is responsible for capturing temporal facts. It must observe and calculate:

- **Time Period Awareness**: Classifies the interaction into general time categories (Morning, Afternoon, Evening, Night) based on the user's local cycle.
- **Return Awareness**: Evaluates the duration elapsed since the last session closed, categorizing the return state (New, Same Day Return, Next Day Return, or Long Absence).
- **Session Type Categorization**: Resolves the modality of the session (such as active focus work, open chat dialogue, passive idle states, or unknown status).
- **Continuity Detection**: Determines whether the current session is a direct continuation of a recently interrupted focus block or conversation thread.
- **First Session Today Delineation**: Identifies if this is the user's first engagement of the calendar day.
- **Confidence Computation**: Computes quantitative metrics for context decay:
  - **Presence Confidence**: The likelihood that the user is actively present, decaying as time passes since the last user action.
  - **Continuity Confidence**: The strength of semantic connection to the previous session, decaying as the absence gap increases.
- **Current Interaction Context**: Assembles these parameters into an objective snapshot, preserving its originating subsystem identification, supporting evidence, and confidence rating in accordance with the Provenance Preservation principle.

The Presence Engine observes but never interprets. It records that "the user returned after 14 hours," but does not judge whether this indicates fatigue or high productivity.

---

## 3. Non-Responsibilities

The Presence Engine maintains a strict separation of concerns. It is prohibited from executing the following behaviors:

- **Generate Responses**: It does not formulate greetings, text replies, or conversational content.
- **Infer Emotions**: It does not attempt to deduce the user's feelings, moods, or mental states.
- **Analyze Habits**: It does not model long-term routine shifts or evaluate habit streak quality.
- **Create Memories**: It does not compile or write new memory nodes to the persistent database.
- **Modify Identity**: It does not refine user personality hypotheses or alter preference logs.
- **Trigger Reminders**: It does not decide when to prompt the user or schedule alarm notifications.
- **Make Recommendations**: It does not suggest task changes, schedule adjustments, or project redirections.
- **Rank Importance**: It does not evaluate the relative weight of past memory candidates.
- **Decide Initiative**: It does not determine whether the companion should proactively speak or maintain silence.

---

## 4. Presence Lifecycle

The conceptual lifecycle of a presence evaluation runs alongside the active companion interface:

```
    Session Starts
          │
          ▼
   Ingest Inputs  ◄─── Consistent Temporal Reference, Store Updates, event records
          │
          ▼
    Evaluate Rules
          │
          ▼
    Compile Context
          │
          ▼
    Publish Context ───► Broadcasts PresenceUpdated payload
          │
          ▼
  Monitor Activity ◄─── Listens for timeline edits or idle decay
          │
          ▼
     Session Ends
```

1. **Session Starts**: The parent companion interface initiates or recovers from a shutdown state.
2. **Ingest Inputs**: The engine reads the consistent temporal reference, recent message logs, and session history records.
3. **Evaluate Rules**: Pure, deterministic rules evaluate temporal deltas and categorize return states.
4. **Compile Context**: An immutable, structured model representing current presence metrics is constructed.
5. **Publish Context**: The engine broadcasts the context update payload to registered companion subsystems.
6. **Monitor Activity**: During active sessions, the engine periodically updates decay metrics as events occur or idle time passes.
7. **Session Ends**: The active context is discarded upon interface closure.

---

## 5. Presence Context

The engine exposes a single, read-only context data model containing the following conceptual parameters:

- **Session Type**: Categorizes the active workspace modality (e.g. Focus, Chat, Idle, or Unknown).
- **Return State**: Denotes the temporal distance classification since the user last interacted (e.g. New User, Same Day Return, Next Day Return, or Long Absence).
- **Time Period**: The current local time block (e.g. Morning, Afternoon, Evening, Night).
- **Absence Duration**: The precise duration since the preceding session ended, measured against a consistent temporal reference.
- **First Session Today**: A boolean indicating if this session marks the user's initial interaction of the current calendar day.
- **Resumed Conversation**: A boolean indicating if this session resumed a conversation thread within the continuity boundary.
- **Recent Project Reference**: The identifier of the project most recently worked on, if active.
- **Unusual Access Time**: A boolean flagged if the session falls within atypical hours (e.g. late-night sleep windows).
- **Continuity Confidence**: A score from 0.0 to 1.0 representing how strongly this session connects to the previous one.
- **Presence Confidence**: A score from 0.0 to 1.0 tracking active engagement decay.
- **Generated At**: The precise generation moment based on the consistent temporal reference.

---

## 6. Inputs

The Presence Engine consumes the following conceptual input streams:

- **Session Lifecycle Events**: Signals indicating when focus sessions start, update, or terminate.
- **Awareness Session State**: The current situation snapshot, including the active project ID and task tags.
- **Recent Interaction History**: Temporal indices of the last recorded system events and user chat messages.
- **Consistent Temporal Reference**: The timeline reference supplied by the Companion Platform.
- **Conversation State**: Information showing whether dialogue history is populated.
- **Session Continuity Data**: Recovery state details indicating whether the app is resuming from an unexpected crash or system shutdown.

---

## 7. Outputs

The single conceptual output of the engine is the **Presence Context**.

This context is consumed by:

- **The Greeting Subsystem**: To shape initial messages based on return state and time of day.
- **The Context Resolution Engine**: To weigh how heavily previous goals and focus topics should influence the current prompt package.
- **The Initiative Engine**: To evaluate confidence scores when deciding whether the companion should speak, suggest, or remain in ambient silent mode.

---

## 8. Integration Points

The Presence Engine links to surrounding architectural layers:

```
                  ┌────────────────────────┐
                  │      GENESIS Core      │
                  └───────────┬────────────┘
                              │
                      Ingests event logs
                              │
                              ▼
 ┌───────────┐        ┌───────────────┐        ┌─────────────────────┐
 │ Companion │ ─────► │   Presence    │ ─────► │ Context Resolution  │
 │   Core    │        │    Engine     │        │    Engine (Future)  │
 └───────────┘        └───────┬───────┘        └─────────────────────┘
   Provides                   │
  boundaries                  │ Publishes updates
                              ▼
                      ┌───────────────┐
                      │  Initiative   │
                      │Engine (Future)│
                      └───────────────┘
```

- **Companion Core**: Grounded in lifecycle bounds defined in [01-companion-lifecycle.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-lifecycle.md) and continuity guidelines in [08-session-continuity.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/08-session-continuity.md).
- **GENESIS**: Queries local timeline events to calculate absence durations and activity decays without modifying memory.
- **Companion State Engine (future)**: Receives presence updates to align active state variables.
- **Context Resolution Engine (future)**: Integrates presence metrics (e.g. Return State) to decide how much prior context is appended to conversational tasks.
- **Initiative Engine (future)**: Evaluates Presence and Continuity Confidence scores to decide if a proactive prompt is appropriate.
- **Reflection Engine (future)**: Consumes the context at session end to calculate activity logs.

---

## 9. Failure Modes

The engine implements safe, predictable fallbacks for data anomalies:

- **Missing Historical Context**: If no prior sessions or messages are recorded, the engine defaults to a `"new"` return state, zero continuity, and default confidence levels.
- **Uncertain Continuity**: If temporal references are ambiguous or missing, continuity confidence is set to `0.0`.
- **Corrupted Session Information**: If stored session data is incomplete or invalid, the engine treats the state as empty and falls back to a clean initialization state.
- **Temporal Inconsistencies**: Variations or updates in the temporal reference that generate negative differences are caught and clamped to zero, ensuring relative elapsed metrics never return negative values.

---

## 10. Architectural Principles

The construction of the Presence Engine is governed by these principles:

- **Deterministic**: Given identical state parameters and temporal reference, outputs are identical.
- **Explainable**: The logic mapping temporal inputs to categories (e.g. Return State) is traceable and documented.
- **Observational**: The engine reports facts; it never speculates about user intent or feelings.
- **Emotionally Neutral**: Metrics and classifications are represented objectively.
- **Evidence-Based**: Context is compiled solely from verifiable local logs and temporal states.
- **Technology Independent**: Independent of programming languages, databases, or platform architectures.
- **Single Responsibility**: Computes only temporal presence metrics.
- **Separation of Concerns**: Kept distinct from downstream cognitive reasoning and dialogue generation.

---

## 11. Future Compatibility

The Presence Engine supports upcoming interaction styles:

- **Voice Conversations**: Presence metrics keep vocal interactions context-aware, preventing the companion from speaking or interrupting during deep focus.
- **Vision**: Real-time camera or frame analysis provides activity signals to feed the presence confidence decay calculation.
- **Desktop Companion**: Runs in local desktop processes.
- **Mobile Companion**: Evaluates handovers across mobile interfaces.
- **Wearables**: Bio-metric or movement activity references feed active presence calculations.
- **Cross-Device Synchronization**: Time-gaps are evaluated using a consistent temporal reference, ensuring correct return states regardless of device swaps.
- **Ambient Presence**: Low-confidence states allow the companion to enter quiet, non-obtrusive monitoring modes.

---

## 12. Non-Goals

The following areas are excluded from this specification:

- User interface layouts or screen designs.
- Prompt structures, variables, or system instructions.
- Dynamic response templates or speech synthesis rules.
- Cognitive clustering models for long-term memory.
- Goal setting, prioritization, or checklist calculations.
- Habit analyses or streak evaluations.
