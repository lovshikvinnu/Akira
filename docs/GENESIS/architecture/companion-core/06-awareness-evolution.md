# Awareness Evolution Specification

> [!IMPORTANT]
> **Companion Core**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 06-awareness-evolution.md
>
> _This document defines the process of Awareness Evolution within a Companion Session, specifying how the temporary situational model adapts and refines itself dynamically as the interaction unfolds._

---

## 1. Purpose

During a [Companion Session](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-lifecycle.md), context is not static. If the Companion’s situational understanding remains frozen at the moment of initialization, its responses quickly become irrelevant or repetitive.

Awareness must evolve. As a conversation unfolds and workspace events occur, the Companion continuously collects new observations, integrating them into a dynamically updated snapshot.

```
┌────────────────────────────────────────────────────────┐
│                   INITIAL AWARENESS                    │
│      (Assembled at initialization from the Brain)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                      CONVERSATION                      │
│     (Dynamic exchange of ideas, goals, and actions)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   REFINED AWARENESS                    │
│    (Continuously updated temporary situational model)  │
└────────────────────────────────────────────────────────┘
```

Every meaningful exchange has the potential to refine this temporary understanding without immediately committing changes to the Brain's long-term tables. This protects the Brain from raw conversational noise while ensuring the Companion remains fully aligned with the current moment.

---

## 2. Awareness Evolution

Awareness Evolution is the process of adjusting the temporary situational snapshot based on active interaction. Rather than relying on guesswork or assumptions, evolution is strictly driven by new evidence.

Conceptual examples of evolution include:

- **Goals Becoming Clearer**: An initial broad objective (e.g., _"Finish the project draft"_) narrows into concrete tasks (e.g., _"Refactor the database schema specification"_).
- **Intent Shifting**: The session intent transitions naturally based on flow (e.g., from _Problem Solving_ when debugging a parser error, to _Building_ once the compile succeeds, and finally to _Reflection_).
- **New Constraints Appearing**: The user introduces new boundaries during interaction (e.g., _"I only have fifteen minutes before a meeting"_ or _"I must write this script without external libraries"_).
- **Misunderstandings Being Corrected**: The user corrects the Companion's initial situational model, instantly recalibrating the active constraints.
- **New Priorities Emerging**: An unexpected workspace blocker shifts the session's immediate focus.

---

## 3. Awareness Stability

Different components of the [Awareness Snapshot](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md#6-awareness-snapshot) evolve at different speeds. The architecture respects these natural timescales to ensure stability:

| Component                 | Evolution Speed | Primary Drivers of Change                                                     |
| :------------------------ | :-------------- | :---------------------------------------------------------------------------- |
| **Current Task**          | Rapid           | Workspace actions, compiler states, immediate commands.                       |
| **Session Intent**        | Moderate        | Shift in interaction style, problem resolution, task completion.              |
| **Active Goals**          | Slow            | Completion of milestones, explicit pivoting of priorities.                    |
| **Identity Observations** | Very Slow       | Repetitive behaviors across multiple sessions, explicit preference overrides. |
| **Core Values**           | Rare / Static   | Major structural life pivots, long-term behavior redirection.                 |

By separating these rates of change, the Companion prevents small workspace actions (e.g., compiling a file) from causing erratic fluctuations in long-term goals or identity context.

**Intent Stability**: Temporary digressions or off-topic conversational tangents (e.g., a brief question about the weather or scheduling a calendar meeting) do not immediately replace the active Session Intent. The system isolates temporary digressions in a sub-context, maintaining the primary Session Intent until sufficient persistent evidence (e.g., multiple conversational turns or prolonged workspace focus shifts) indicates a genuine, intentional shift in the user's focus.

---

## 4. Awareness Confidence

Every element within the active Awareness Snapshot carries a conceptual confidence rating. This rating is based on the quality and depth of available evidence rather than binary certainty:

- **High Confidence**: Grounded in multiple independent observations or explicit user confirmation (e.g., user states: _"My goal is to finish the parser today"_).
- **Moderate Confidence**: Inferred from recent patterns or context clues, but not yet explicitly verified.
- **Low Confidence**: Speculative or extrapolated context, or a newly introduced topic where evidence is scarce.

Confidence ratings dynamically adjust (increasing with reinforcement, decreasing with contradictory evidence), ensuring the Companion adjusts its tone and guidance proportionality.

**Awareness Recovery**: Incomplete, out-of-date, or incorrect initial assumptions do not permanently damage the system's confidence metrics. If the Companion acts on incorrect assumptions and is subsequently corrected by the user, the corresponding Awareness Gaps are resolved, and the snapshot's confidence recovers to reflect the newly confirmed evidence.

---

## 5. Awareness Gaps

A crucial dimension of evolution is recognizing what is _not_ understood. An **Awareness Gap** represents an essential piece of information that the Companion identifies as missing or ambiguous.

Examples include:

- **Missing Project Objective**: The user initializes a new workspace directory without defining the project's goal.
- **Unknown Deadline**: The user sets a priority goal but does not state the time constraint.
- **Ambiguous Preference**: The user specifies a constraint but doesn't clarify if it applies permanently or only for the current session.
- **Unclear Emotional Context**: The user exhibits signs of frustration or fatigue without clear attribution to a specific task.

Identifying an Awareness Gap is an architectural asset. It directs the Companion to ask targeted, proactive clarifying questions instead of generating ungrounded responses.

---

## 6. Awareness Refinement

Refinement is the mechanism that processes new inputs to update the snapshot. This occurs through:

- **User Clarification**: Direct answers to validation questions.
- **Contradictory Evidence**: Observational mismatch (e.g., the user says they are taking a break, but begins editing code).
- **New Observations**: Real-time telemetry events from the workspace.
- **Goal Changes**: Explicit declaration of new objectives.
- **Project Progression**: Completing sub-tasks, triggering build results, or updating documentation.

Refinement must remain **proportional**. A single outlier event (e.g., closing a text file) should not cause the system to assume a project is abandoned. The system applies a dampening threshold, updating high-level goals and identity observations only when evidence is persistent.

---

## 7. Relationship with Conversation

The relationship between Conversation and Awareness is bidirectional and isolated:

```
                  ┌───────────────────────────┐
                  │     Awareness Session     │
                  └─────────────┬─────────────┘
                                │
                      Guides    │   Refines
                   Conversation │ Awareness
                                ▼
                  ┌───────────────────────────┐
                  │    Active Conversation    │
                  └───────────────────────────┘
```

Every exchange has the potential to refine active awareness. Conversely, this evolved awareness immediately shapes the Companion's next conversational turn. Neither interaction directly alters the long-term Brain, preserving the security and integrity of persistent memory.

---

## 8. Relationship with Reflection

Upon session completion, the final, fully evolved state of the Awareness Snapshot is handed over to the [Reflection Stage](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/05-conversation-lifecycle.md#7-reflection-trigger).

- **Comparison Analysis**: The Reflection engine reviews the evolution path—comparing initial awareness, intermediate goal changes, and final outcomes.
- **Data Synthesis**: Using this path, Reflection accurately extracts:
  - What workspace milestones were truly completed (Events).
  - What habits or preferences were solidified (Memory Candidates).
  - Which narrative structures changed (Story Progress).
  - What communication boundaries were adjusted (Identity Refinement).
- **Permanent Learning**: This handoff ensures that temporary session evolution is safely distilled into long-term learning within the Brain, directly informing the initial awareness of the next session.

---

## 9. Design Philosophy

The evolution of awareness is governed by six core tenets:

- **Awareness Evolves Through Evidence**: We do not speculate or extrapolate without observable data.
- **Understanding is Iterative**: Context is built turn-by-turn; first assumptions are refined as work progresses.
- **Confidence Follows Observation**: We modulate our suggestions based on the density of supporting evidence.
- **Questions Reduce Uncertainty**: A targeted question is better than a generic, uncertain answer.
- **Temporary Understanding Precedes Permanent Learning**: Evolving awareness remains volatile during the session, allowing it to adapt freely before being locked into the Brain.
- **Adaptive Without Becoming Unstable**: The system adapts immediately to workspace changes while maintaining the stability of high-level goals.

---

## 10. Future Compatibility

Awareness Evolution is designed to support future capabilities without modifying the underlying architecture:

- **Voice conversations**: Speech pacing and vocal cues are processed in real time to update the confidence and emotional context fields of the snapshot.
- **Vision**: Real-time video or screen capture telemetry continuously refines the _Current Situation_ field of the snapshot as the user shifts windows or changes tasks.
- **Multi-Hour Work Sessions**: Handles long-term focus changes gracefully, transitioning the _Session Intent_ through multiple cycles as the user works.
- **Calendar Planning**: Adjusts constraints dynamically as calendar events approach, warning the user of time limitations.
- **Daily Mission**: Refines target milestones as tasks are completed in the workspace.
- **Coding Assistance**: Continuous IDE integration updates the _Current Task_ and _Unfinished Work_ modules, ensuring that code analysis matches the active file state.
- **Future Modalities**: Any new telemetry stream (e.g., wearables, external feeds) acts as an input to the refinement engine, updating the snapshot according to the established stability timescales.
