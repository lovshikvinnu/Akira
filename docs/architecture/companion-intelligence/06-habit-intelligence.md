# Habit Intelligence Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 06-habit-intelligence.md
>
> _This document defines the Habit Intelligence Engine, the behavioral pattern mapping and pattern observation subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

### 1. Purpose

For a growth companion to support a user responsibly, it must recognize the recurring patterns, focus cycles, and routines that dictate the user's daily life. Systems that rely on artificial rewards, gamified streaks, or rigid timers often create anxiety and superficial engagement. AKIRA rejects these models in favor of objective observation.

AKIRA establishes pattern-awareness via the **Habit Intelligence Engine**. This subsystem maintains an evolving map of the user's recurring behavioral patterns without judging, rewarding, or controlling the user, answering the question: _"What recurring behavioral patterns has the Companion observed with sufficient evidence?"_

The relationship between architectural stages flows as follows:

```
Experiences (GENESIS)
         │
         ▼
 Observed Behaviors
         │
         ▼
       Habits ◄─── Formulated over time from repeated evidence
         │
         ▼
       Goals
         │
         ▼
   Conversation
```

- **Experiences**: Raw database logs of workspace events and interactions.
- **Observed Behaviors**: Short-term repetitions of specific activities.
- **Habits**: Long-term, established behavioral patterns and routines.
- **Goals**: Milestones and aspirations that align with or challenge observed habits.
- **Conversation**: Active dialogue tailored to the user's observed patterns.

### How Habits Differ from Other Systems:

- **Memory (GENESIS)**: Memory logs _specific events_ that occurred in the past. Habits model the _recurring frequency and probability_ of those events over time.
- **Goals**: Goals define _what the user intends to achieve_. Habits represent the _actual behavioral patterns_ observed in daily execution.
- **Knowledge**: Knowledge tracks _what the user understands_. Habits track _how and when the user executes work_.
- **Identity**: Identity models _who_ the user is. Habits track the _behavioral routines_ that the user currently practices.

To prevent circular dependencies, **Habit Intelligence is temporally decoupled from active Reflection**. The Habit Intelligence Engine consumes only _previously finalized Reflection Contexts_ (archived historical context) from earlier sessions. It never consumes a Reflection Context currently being generated, ensuring all calculations follow a strict unidirectional flow.

---

## 2. Responsibilities

The Habit Intelligence Engine maps and evaluates behavioral patterns:

- **Pattern Observation**: Evaluates event intervals to identify repeated behaviors.
- **Habit Identification**: Classifies recurring patterns into established habit definitions.
- **Habit Confidence**: Calculates mathematical indicators reflecting the strength of evidence supporting a habit.
- **Habit Stability**: Measures the consistency and persistence of a habit over time.
- **Neutrality Preservation**: Observes patterns objectively without labeling them as positive or negative.
- **Emerging Habits**: Identifies new behavioral patterns showing increasing frequency.
- **Declining Habits**: Monitors established routines that are showing reduced frequency.
- **Habit Evolution**: Updates habit parameters as routines shift.
- **Contextual Habits**: Maps habits to specific contexts (e.g. time of day, active projects).

Habits require repeated evidence rather than isolated events. An action performed once or twice is an event; only consistent repetition over defined time thresholds qualifies as a habit.

---

## 3. Non-Responsibilities

The Habit Intelligence Engine avoids behavioral control and gamification:

- **Track Streaks**: It does not calculate consecutive day streaks or create completion scoreboards.
- **Gamification**: It does not award badges, points, levels, or visual trophies.
- **Judge User Behavior**: It does not lecture, shame, or penalize the user for missing routines.
- **Create Reminders**: It does not schedule alarms, push notifications, or alerts.
- **Generate Responses**: It does not write greetings, summaries, or messages.
- **Trigger Initiative**: It does not decide when the companion should speak.
- **Manage Goals**: It does not track user milestones or target deadlines.
- **Create Memories**: It does not log persistent history event nodes.
- **Modify Identity**: It does not alter user trait ratings.

---

## 4. Habit Lifecycle

User patterns transition through a conceptual progression based on evidence:

```
Behavior Observed
        │
        ▼
Repeated Evidence
        │
        ▼
Pattern Detected
        │
        ▼
Habit Established
        │
        ▼
  Habit Evolves
        │
        ├────────────────────────────┐
        ▼                            ▼
  Habit Weakens                Habit Archived
```

1. **Behavior Observed**: A specific activity or focus block is recorded.
2. **Repeated Evidence**: Multiple instances of the behavior are logged over a defined interval.
3. **Pattern Detected**: The engine identifies a correlation in time, context, or frequency.
4. **Habit Established**: The pattern reaches the confidence threshold and is marked as an active habit.
5. **Habit Evolves**: The engine adjusts parameters as the routine shifts (e.g., shifting from evening to morning).
6. **Habit Weakens**: The frequency of the pattern falls below the stability threshold.
7. **Habit Archived**: The habit is moved to history when evidence is no longer observed.

---

## 5. Habit Context

The Habit Intelligence Engine exposes a single primary conceptual output: the **Habit Context**. This model captures:

- **Observed Habits**: List of active behavioral patterns.
- **Habit Confidence**: Numeric indicators representing the certainty of each observed pattern.
- **Habit Stability**: Ratings reflecting the consistency of active habits.
- **Supporting Evidence**: Summarized metadata pointing to the event logs that validate the habit.
- **Habit Evolution**: Logs tracking updates to active patterns.
- **Context Dependence**: Active filters showing where habits depend on specific projects or times.
- **Emerging Habits**: List of newly detected patterns that have not yet reached baseline thresholds.
- **Weakening Habits**: List of declining patterns showing reduced frequency.

---

## 6. Inputs

The Habit Intelligence Engine consolidates inputs from:

- **GENESIS**: Historical event logs and validated memories showing work timings and completions.
- **Presence Context**: Time of day and return state parameters.
- **Companion State**: Active task focus and workspace metrics.
- **Goal Context**: Active priorities and milestones.
- **Knowledge Context**: Target competency domains.
- **Archived Reflection Outcomes**: Previously finalized summaries from earlier sessions. The engine is prohibited from consuming Reflection Contexts during active generation.
- **Long-Term Interaction History**: Aggregated metrics spanning multiple weeks.

---

## 7. Outputs

The sole output is the **Habit Context**.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Habit Intelligence Engine)
- Supporting evidence (pattern counts and frequency parameters)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

Downstream subsystems consume this output:

- **The Context Resolution Engine**: Integrates observed habits and stability metrics into prompt packages.
- **The Initiative Engine**: Evaluates habit changes (e.g., a declining habit or a new routine) to trigger supportive check-ins.
- **The Reflection Engine**: Evaluates session outcomes against habit baselines to update stability metrics.

---

## 8. Integration Points

The Habit Intelligence Engine links to other domains in the companion layer:

- **GENESIS**: Queries historical memories to extract evidence of routine behaviors.
- **Goal Engine**: Correlates behavioral habits with goal progression rates.
- **Knowledge Engine**: Maps learning routines to concept mastery rates.
- **Relationship Engine**: Integrates collaborative habits involving specific contacts.
- **Reflection Engine (future)**: Evaluates completed session metrics to update habit states.
- **Context Resolution Engine (future)**: Appends habit models to context packages.
- **Initiative Engine (future)**: Evaluates habit changes to prompt timely check-ins.

---

## 9. Habit Evolution

Habits change dynamically based on evidence:

- **Emergence**: New patterns are identified as interaction frequency increases.
- **Strengthening**: Consistent execution boosts stability and confidence ratings.
- **Weakening**: Missing events or changing schedules lower confidence.
- **Disappearance**: Unvisited patterns are archived.
- **Seasonal Patterns**: Adapts to long-term cyclical changes in routines.
- **Context-Specific Habits**: Habits linked to specific projects or locations update as environments change.
- **Corrected Observations**: Feedback loops resolve incorrect assumptions about user routines.

---

## 10. Failure Modes

The engine resolves ambiguous states using explicit fallbacks:

- **Insufficient Evidence**: If data is sparse, the engine does not assume a pattern exists, maintaining low confidence values.
- **Temporary Routines**: Short-term changes (e.g., working late for one week to meet a deadline) are prevented from overriding long-term habits by requiring extended verification windows.
- **Contradictory Behavior**: If behaviors fluctuate wildly, the engine lowers stability metrics and flags the contradiction.
- **Sparse Interaction History**: Fresh states return baseline empty context models.
- **Lifestyle Changes**: Sudden shifts in user schedules lower confidence temporarily until a new stable pattern is established.

---

## 11. Architectural Principles

The Habit Intelligence Engine is built upon the following tenets:

- **Evidence-Based**: Patterns are derived strictly from verified event logs.
- **Non-Judgmental**: Treats routines neutrally, avoiding labels like "good" or "bad."
- **Non-Manipulative**: Excludes engagement-maximizing loops, streaks, or gamification.
- **Explainable**: The path from event completion to habit identification is traceable.
- **Evidence Verification**: When the user explicitly corrects an inferred understanding, the engine must refine its understanding rather than silently replacing previous conclusions. Explicit user corrections become verified evidence, confidence is updated accordingly, previous inferences remain explainable, and future reasoning prioritizes verified evidence.
- **Preserve Uncertainty**: Exposes gaps and low confidence values rather than forcing conclusions.
- **Continuously Evolving**: Adjusts pattern models dynamically.
- **Deterministic**: Logical check gates evaluate inputs consistently.
- **Technology Independent**: Independent of databases, languages, or notification protocols.
- **Single Responsibility**: Focuses exclusively on mapping user behavioral patterns.

---

## 12. Future Compatibility

The system scales to support upcoming interaction modes:

- **Voice**: Ingests spoken updates to identify changes in user routines.
- **Vision-Assisted Understanding**: Uses physical workspace signals to verify routines.
- **Calendar Planning**: Correlates calendar events with actual behavioral patterns to evaluate schedule alignment.
- **Daily Mission**: Feeds focus pattern data to suggest optimal times for tasks.
- **Wellness Support**: Maps breaks and work sessions to identify fatigue patterns.
- **Productivity Assistance**: Provides neutral observations on focus durations.
- **Cross-Device Usage**: Uses a consistent temporal reference to keep habit models aligned across all user platforms.
- **Ambient Companion**: Adapts companion presence (active vs. quiet tracking) based on observed user focus patterns.
