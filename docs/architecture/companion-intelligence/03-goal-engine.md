# Goal Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 03-goal-engine.md
>
> _This document defines the Goal Engine, the persistent intention and progress tracking subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

For a growth companion to guide a user effectively, it must understand not only the immediate workspace tasks but the broader objectives the user is working toward over time. A system that only logs past achievements or responds to active workspace clicks lacks a sense of direction, failing to maintain long-term alignment.

AKIRA establishes persistent, evolving intentions via the **Goal Engine**. This subsystem maintains a structured understanding of the user's objectives and progress, answering the question: _"What is the user working toward?"_

The relationship between architectural stages flows as follows:

```
 Identity
    │
    ▼
  Goals ◄─── Continuously shaped by long-term aspirations
    │
    ▼
Companion State
    │
    ▼
Conversation
```

- **Identity**: Captures long-term traits, values, and cognitive profiles.
- **Goals**: Persistent, structured intentions bridging identity aspirations and active focus.
- **Companion State**: The immediate working focus (e.g. active project, current task, discussion topic).
- **Conversation**: Active dialogue anchored by active goals and companion states.

### How Goals Differ from Other Systems:

- **Identity**: Identity represents _who_ the user is and how they work. Goals represent _what_ the user intends to achieve.
- **Memory (GENESIS)**: Memory logs _what happened_ in the past. Goals represent targeted milestones _intended for the future_.
- **Companion State**: State tracks _what is happening right now_ in the active session. Goals track progress _across multiple sessions_.

To prevent circular dependencies, **the Goal Engine is temporally decoupled from active Reflection consolidation**. It consumes only previously finalized Reflection Contexts (archived historical context) from previous sessions to refine long-term plans.

---

## 2. Responsibilities

The Goal Engine holds and refines the user's objectives:

- **Long-Term Goals**: Manages high-level aspirations spanning months or years (e.g., mastering compiler design).
- **Short-Term Goals**: Manages immediate milestones spanning days or weeks (e.g., parsing ASTs).
- **Goal Hierarchy**: Resolves relationships between minor milestones and major objectives.
- **Goal Progress Evaluation**: Measures progress based on session activities.
- **Goal Dependency Resolution**: Tracks prerequisite goals that must be resolved before proceeding.
- **State Management**: Evaluates which goals are active, inactive, paused, or completed.
- **Goal Evolution**: Records modifications to goals as user needs change.
- **Goal Confidence**: Computes certainty metrics reflecting how clearly a goal's objectives are defined.

---

## 3. Non-Responsibilities

The Goal Engine restricts its focus to modeling intention:

- **Create Memories**: It does not log persistent history event nodes.
- **Update Identity**: It does not modify emergent trait profiles.
- **Generate Responses**: It does not write greetings, summaries, or messages.
- **Trigger Initiative**: It does not decide if the companion should proactively speak.
- **Build AI Context**: It does not assemble context packages.
- **Manage Habits**: It does not track daily habits or streaks.
- **Rank Importance**: It does not score memory nodes.
- **Replace Project Management**: It does not serve as a task scheduler or issue tracker.

---

## 4. Goal Lifecycle

Goals transition through a conceptual progression during their tracking lifetime:

```
Goal Created
     │
     ▼
Goal Clarified ◄─── Intentions are defined and detailed
     │
     ▼
 Goal Active
     │
     ▼
  Progress     ◄─── Work metrics are captured during focus sessions
     │
     ├──────────────────────────┐
     ▼                          ▼
Completed / Archived      Paused / Modified
```

1. **Goal Created**: An intention is initialized by the user or inferred from an aspiration.
2. **Goal Clarified**: The scope, priority, and metrics of the goal are defined.
3. **Goal Active**: The goal is designated as an active target for upcoming focus sessions.
4. **Progress**: The engine registers milestone events, updating completion percentages.
5. **Paused / Modified**: The goal is suspended or restructured to align with focus shifts.
6. **Completed / Archived**: The goal is successfully resolved or archived.

---

## 5. Goal Context

The Goal Engine exposes a single primary conceptual output: the **Goal Context**. This model captures:

- **Active Goals**: List of goals currently marked as active targets.
- **Current Priorities**: The specific goal milestones holding highest priority.
- **Goal Hierarchy**: The logical tree linking minor tasks to major objectives.
- **Dependencies**: Blockers or prerequisites linking goals.
- **Progress**: Completion metrics for active goals.
- **Confidence**: Mathematical metric reflecting how well-defined the goal parameters are.
- **Blockers**: Identified friction points hindering goal progress.
- **Completion State**: Historic records of resolved intentions.

---

## 6. Inputs

The Goal Engine consolidates inputs from:

- **Companion State**: Real-time focus metrics, active tasks, and session summaries (from [02-companion-state-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-state-engine.md)).
- **Presence Context**: Absence gaps and return state parameters (from [01-presence-engine.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/presence-engine.md)).
- **Conversation Evolution**: Structural shifts in conversation topics.
- **GENESIS**: Historical event logs verifying milestone achievements.
- **Identity**: Asserted values, aspirations, and preference profiles.
- **Archived Reflection Outcomes**: Previously finalized summaries from earlier sessions.

---

## 7. Outputs

The sole output is the **Goal Context**.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Goal Engine)
- Supporting evidence (milestone verifications and project associations)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

Downstream subsystems consume this output:

- **The Context Resolution Engine**: Integrates priority goals and blocker details directly into context packages.
- **The Initiative Engine**: Evaluates goal stagnation or blockers to trigger check-ins.
- **The Reflection Engine**: Evaluates session outcomes against target goals to summarize progress.

---

## 8. Integration Points

The Goal Engine links to other domains in the companion layer:

- **GENESIS**: Queries historical memory to verify task logs and milestones.
- **Presence Engine**: Inspects return patterns to adjust active focus priorities.
- **State Engine**: Receives workspace updates and checklist events to evaluate progress metrics.
- **Knowledge Engine (future)**: Resolves vocabulary or technical milestones against goal targets.
- **Habit Intelligence (future)**: Correlates consistent routines with goal progression rates.
- **Context Resolution Engine (future)**: Supplies active goal blocks for prompt assembly.
- **Initiative Engine (future)**: Uses goal blockers to decide when to prompt user reflections.
- **Reflection Engine (future)**: Reviews goal progression at session end to write narrative reports.

---

## 9. Goal Evolution

Goals are not static; they evolve through interaction:

- **Specification**: Vague goals (e.g. "learn compilers") become specific (e.g. "implement parser").
- **Merging**: Redundant or overlapping intentions consolidate.
- **Splitting**: Broad goals divide into manageable sub-goals.
- **Pausing & Resuming**: Goals suspend during focus shifts and reactivate when focus returns.
- **Completion & Abandonment**: Goals archive when successfully finished or closed.

---

## 10. Failure Modes

The engine resolves anomalies using explicit fallbacks:

- **Conflicting Goals**: If two active goals propose contradictory directions, the engine lowers goal confidence and flags the conflict.
- **Ambiguous Goals**: Vague intentions are marked with low confidence scores to trigger clarification dialogue.
- **Missing Priorities**: If goals have no assigned priorities, the engine treats them as equal weight and requests ranking.
- **Changing Intentions**: If the user pivots frequently, the engine dampens transition rates to prevent context thrashing.
- **Incomplete Understanding**: If data is missing, the engine preserves uncertainty rather than fabricating details.

---

## 11. Architectural Principles

The Goal Engine is built upon the following tenets:

- **Long-Term Orientation**: Evaluates intentions across multiple weeks and months.
- **Explainable**: The path from event completion to goal progress is traceable.
- **Evidence-Based**: Goal updates are triggered only by verified workspace events or user inputs.
- **Evidence Verification**: When the user explicitly corrects an inferred goal understanding, the engine must refine its understanding rather than silently replacing previous conclusions. Explicit user corrections become verified evidence, confidence is updated accordingly, previous inferences remain explainable, and future reasoning prioritizes verified evidence.
- **User-Directed**: The user maintains final control over goals; the engine suggests but never forces.
- **Non-Manipulative**: The engine does not use pressure tactics or arbitrary scoring loops.
- **Deterministic**: Logical checks map input completions to progress metrics consistently.
- **Technology Independent**: Free of database schemas, platform libraries, or compiler frameworks.
- **Single Responsibility**: Models intention and goal states exclusively.

---

## 12. Future Compatibility

The system scales to support upcoming interaction modes:

- **Voice**: Spoken check-ins automatically register topic updates to verify goals.
- **Vision**: Document or UI checks verify milestone progress indicators.
- **Calendar Planning**: Links goals to scheduled focus blocks.
- **Daily Mission**: Feeds immediate goal milestones into daily task checklists.
- **Project Management**: Maps external project structures to internal goal hierarchies.
- **Coding Assistance**: Matches code commit structures to goal checklist completions.
- **Cross-Device Usage**: Goal Context is synchronized using a consistent temporal reference to keep progress metrics aligned across all interfaces.
