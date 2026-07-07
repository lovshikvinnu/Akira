# Companion State Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 02-companion-state-engine.md
>
> _This document defines the Companion State Engine, the conceptual working context aggregator belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

The companion's ability to engage in a coherent, goal-aligned interaction requires a real-time understanding of what is currently occurring. Without an active state manager, a dialogue system must reconstruct the context from scratch at every turn or treat the conversation as a stateless sequence, losing track of active work threads, pending questions, and focal pivots.

AKIRA establishes real-time tracking via the **Companion State Engine**. This subsystem maintains the active working model of the current Companion Session, answering the question: _"What is the Companion currently working on with the user?"_

The relationship between architectural components flows as follows:

```
Companion Session Initialization (Awareness Session)
      │
      ▼ (Hydrates initial snapshot)
Companion State Engine (Active Working Context Owner)
      │
      ▼
   Presence
      │
      ▼
Companion State ◄─── Continuous refinement during active dialogue
      │
      ▼
 Conversation
      │
      ▼
  Reflection
```

- **Companion Session Initialization**: Managed by the **Awareness Session**, which exists solely during initialization to construct the initial static `Awareness Snapshot`. Once the Companion State Engine is initialized, this snapshot becomes immutable, the Companion State Engine becomes the sole owner of the active working context, and the Awareness Session ceases to own any runtime interaction state.
- **Presence**: Temporal relationship characteristics evaluated using a consistent temporal reference.
- **Companion State**: The active, dynamically evolving working context. It captures the focus shift, active goals, and conversational threads.
- **Conversation**: Active dialogue anchored by the Companion State.
- **Reflection**: End-of-session evaluation comparing state changes to formulate permanent records.

### How State Differs from Other Systems:

- **Memory (GENESIS)**: Memory is a permanent record of past facts, relationships, and events. State is volatile, representing only the present moment.
- **Presence**: Presence determines the temporal parameters of the user's entry. State tracks active work focus during the interaction.
- **Identity**: Identity observes long-term user patterns and values. State represents temporary focus areas of the current conversation.

---

## 2. Responsibilities

The Companion State Engine tracks the dynamic working context:

- **Current Working Context**: Assembles a representation of what is being discussed or built.
- **Active Project Tracking**: Resolves which project is the primary focus of the active session.
- **Active Goal Tracking**: Identifies the specific milestones the user is attempting to resolve.
- **Current Conversation Topic**: Captures the immediate topic of the dialogue thread.
- **Session Focus Resolution**: Synthesizes workspace metrics (e.g. current task) and user input to define active focus.
- **Pending Follow-up Topics**: Tracks questions or reminders raised during the session that have not yet been resolved.
- **Temporary Contextual Understanding**: Maintains transitory information that is relevant only to the immediate dialogue.
- **Active Interaction State**: Monitors engagement levels and context shifts.

---

## 3. Non-Responsibilities

The Companion State Engine is isolated from downstream reasoning:

- **Create Memories**: It does not write persistent event or candidate nodes.
- **Update Identity**: It does not adjust trait ratings or modify hypothesis models.
- **Generate Responses**: It does not formulate greetings, answers, or text outputs.
- **Trigger Reflection**: It does not execute end-of-session consolidations.
- **Infer Habits**: It does not calculate routines or streaks.
- **Rank Importance**: It does not evaluate historical memory weights.
- **Decide Initiative**: It does not determine if or when the companion should speak.
- **Resolve Context Priority**: It does not filter prompt package components.
- **Store Permanent Information**: It does not persist local session data beyond session bounds.
- **Replace GENESIS**: It does not bypass memory structures, serving only as a temporary layer.

---

## 4. State Lifecycle

The Companion State exists as an ephemeral runtime construct:

```
Companion Session Begins (Initialization)
          │
          ▼
   Initialize State   ◄─── Loads snapshot from Awareness Session & Presence Context
          │
          ▼
 Observe Conversation ◄─── Monitors dialogue and user actions
          │
          ▼
 Refine Current State ───► Evaluates shifts in focus or goals
          │
          ▼
Maintain Active Context
          │
          ▼
State Updates
          │
          ▼
  Conversation Ends
          │
          ▼
State Naturally Expires ──► Handoff to Reflection; discard transient state
```

1. **Companion Session Begins**: The session starts, and the state initializes using loaded data from the Awareness Session and Presence Context.
2. **Initialize State**: Establishes baseline goals, the initial project, and temporal parameters using a consistent temporal reference.
3. **Observe Conversation**: Evaluates message changes, task updates, and workspace indicators.
4. **Refine Current State**: Detects if focus has shifted or if topics have evolved.
5. **Maintain Active Context**: Makes the updated state package available to downstream systems.
6. **State Updates**: Updates values as the user completes tasks or shifts targets.
7. **Conversation Ends**: The interface terminates.
8. **State Naturally Expires**: The final state is passed to the Reflection engine and the temporary memory footprint is discarded.

---

## 5. Companion State

The engine maintains a volatile, data model during the session:

- **Active Project**: The project currently receiving focus.
- **Active Goal**: The immediate milestone target.
- **Current Discussion**: The primary subject of the dialogue thread.
- **Current Focus**: The immediate focus area (e.g. planning, debugging, building).
- **Working Context**: A temporary cache of details mentioned by the user.
- **Pending Questions**: List of unanswered questions raised by the companion or user.
- **Active Tasks**: Checklist items relevant to the current conversation.
- **Context Confidence**: Numeric certainty indicator representing how clearly the engine understands the user's current situation.

---

## 6. Inputs

The State Engine ingests the following parameters:

- **Presence Context**: The temporal evaluation output (from [01-presence-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-intelligence/01-presence-engine.md)).
- **Awareness Session**: The pre-assembled workspace and story snapshot (from [02-awareness-session.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md)).
- **Conversation Progression**: Text or voice message sequences.
- **User Interactions**: Real-time checklist modifications or project selections.
- **Relevant GENESIS Context**: Historically recalled facts that become relevant as topics change.
- **Session Continuity State**: Information on recovered states following an unexpected restart.

---

## 7. Outputs

The sole output is the **Companion State** package.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Companion State Engine)
- Supporting evidence (interaction logs and workspace events)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

It is consumed by:

- **The Context Resolution Engine**: To inject the active focus, project, and unresolved questions into prompt contexts.
- **The Initiative Engine**: To adjust conversational postures (e.g., quiet tracking during focus, active participation during planning).
- **The Reflection Engine**: To compare initial expectations against active execution metrics.

---

## 8. Integration Points

The engine integrates with surrounding architecture domains:

- **Companion Core**: Follows baseline guidelines for session continuity (defined in [08-session-continuity.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/08-session-continuity.md)) and conversational boundaries (defined in [05-conversation-lifecycle.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/05-conversation-lifecycle.md)).
- **Presence Engine**: Consumes presence parameters to adjust initial state variables.
- **GENESIS**: Ingests background knowledge when the user shifts topics, keeping the active state grounded in historical evidence.
- **Context Resolution Engine (future)**: Supplies active focus variables to build prompt packages.
- **Goal Engine (future)**: Resolves milestone completions and goal state shifts.
- **Initiative Engine (future)**: Provides focus status to help decide when to speak.
- **Reflection Engine (future)**: Supplies the final state snapshot to compute post-session summaries.

---

## 9. State Evolution

The Companion State changes dynamically during an active session:

- **Focus Shifts**: As the user moves from writing code to debugging, the engine shifts focus from "building" to "problem-solving."
- **Goal Clarification**: When goals are detailed during dialogue, the engine refines the active goal representation.
- **Topic Changes**: As dialogue branches, the current discussion topic updates.
- **Context Replacement**: New workspace data replaces outdated states.
- **Ambiguity Decrease**: Clarifying questions refine the context, increasing confidence.
- **Understanding Improvement**: The state model converges toward alignment with the user's actual progress.

---

## 10. Failure Modes

The engine handles anomalous runtime conditions safely:

- **Insufficient Context**: If the session starts without baseline data, the engine defaults to a low-confidence state and flags the need for clarification.
- **Ambiguous Discussion**: If the user's intent is unclear, the engine preserves the uncertainty by lowering context confidence.
- **Rapid Topic Changes**: If the topic shifts repeatedly, the engine holds the most recent stable topic and increases topic transition flags.
- **Interrupted Conversations**: If the user closes the app mid-dialogue, the state engine captures the last active state, saving it via continuity handlers for the next session startup.
- **Conflicting Information**: If workspace events contradict user statements, the engine flags the contradiction and lowers context confidence.

---

## 11. Architectural Principles

The engine adheres to the following core guidelines:

- **Ephemeral by Design**: Exists only in runtime memory during the session; discarded immediately after.
- **Deterministic**: Pure logic handles the transition rules mapping inputs to state values.
- **Explainable**: The derivation of active focus and topics from user actions is traceable.
- **Evidence-Based**: Transitions are driven by explicit interaction logs.
- **Evidence Verification**: When the user explicitly corrects an inferred understanding, the engine must refine its understanding rather than silently replacing previous conclusions. Explicit user corrections become verified evidence, confidence is updated accordingly, previous inferences remain explainable, and future reasoning prioritizes verified evidence.
- **Continuously Evolving**: Re-evaluates state values dynamically.
- **Technology Independent**: Free of platform-specific code, libraries, or network protocols.
- **Single Responsibility**: Computes and holds active state variables.
- **Separation of Concerns**: Kept distinct from response generation and long-term memory creation.

---

## 12. Future Compatibility

The specification supports future extensions:

- **Voice Conversations**: Tracks conversation flow dynamically to manage pause thresholds.
- **Vision-Assisted Interactions**: Screen changes update focus metrics.
- **Desktop Companion**: Runs in local process space.
- **Mobile Companion**: Handover events preserve active states across device transitions.
- **Coding Assistance**: Active tasks match code workspace indices.
- **Calendar Planning**: Adjusts active goals dynamically as scheduled windows arrive.
- **Long-Running Projects**: Tracks long-term sub-goals across several sessions.
- **Cross-Device Continuity**: Synchronized state packages preserve continuity during active shifts between devices.
