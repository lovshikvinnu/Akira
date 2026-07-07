# Reflection Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 07-reflection-engine.md
>
> _This document defines the Reflection Engine, the retrospective progress synthesis and growth evaluation subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

## 1. Purpose

For a growth companion to support long-term development, it must help the user review their progress and understand their patterns over time. A system that only reacts to immediate commands or logs events without retrospective synthesis remains shallow, failing to reveal longitudinal developments, learning accomplishments, or habit shifts.

AKIRA establishes retrospective analysis via the **Reflection Engine**. This subsystem evaluates the user's longer-term growth and progress using evidence produced by Companion Intelligence and the memory database, answering the question: _"What meaningful patterns, progress, and changes can the Companion objectively reflect back to the user?"_

The relationship between architectural stages flows as follows:

```
Active Contexts (Goals, Habits, Knowledge)
         │
         ▼ (Finalized at session end)
 Reflection Engine
         │
         ▼ (Produces immutable context)
Archived Reflection Context
         │
         ▼ (Ingested at next boot)
Future Companion Sessions
```

- **Active Contexts**: Evolving goal states, observed routines, and technical skill maps finalized during interaction.
- **Reflection**: The retrospective engine that integrates all finalized layers to compile growth reports.
- **Archived Reflection Context**: The immutable database record produced by the Reflection Engine.
- **Future Companion Sessions**: Subsequent initialization routines that consume finalized records.

To prevent circular dependencies, **Reflection is temporally decoupled from active Companion Intelligence**. The Reflection Engine always consumes finalized active contexts at session end and writes an immutable `Reflection Context` to the database. Downstream subsystems (Knowledge, Habits, Goals) may only consume previously finalized, archived Reflection Contexts during their next initialization phase. They are strictly prohibited from consuming a Reflection Context that is currently being generated.

### How Reflection Differs from Other Systems:

- **Memory (GENESIS)**: Memory stores _discrete historical facts_. Reflection _synthesizes_ those facts to analyze long-term trends.
- **Stories**: Stories link _related events_ into narrative arcs. Reflection evaluates the _user's progress and capability changes_ across those arcs.
- **Identity**: Identity models _who_ the user is. Reflection tracks _how_ the user is progressing over time.
- **Conversation**: Conversation is the _active dialogue_. Reflection occurs _retrospectively after interaction_, ensuring the dialogue is not interrupted.

---

## 2. Responsibilities

The Reflection Engine synthesizes long-term progress:

- **Periodic Reflections**: Compiles growth overviews for defined time windows (weekly, monthly, annual).
- **Progress Summaries**: Evaluates active work metrics to describe progress.
- **Growth Summaries**: Tracks skill development and learning progress.
- **Pattern Summaries**: Highlights changes in work habits and routines.
- **Milestone Recognition**: Identifies when goals or key learning steps are completed.
- **Goal Progress Reflection**: Compares actual execution against target milestones.
- **Knowledge Development Reflection**: Highlights new skills acquired and concepts understood.
- **Habit Evolution Reflection**: Identifies shifts in routines (e.g. focus durations).
- **Reflection Confidence**: Computes certainty metrics reflecting the strength of evidence supporting each reflection.

Reflections summarize evidence rather than create new facts. They report what has already occurred, avoiding speculative interpretations.

---

## 3. Non-Responsibilities

The Reflection Engine maintains retrospective boundaries:

- **Create Memories**: It does not write new event nodes.
- **Modify Identity**: It does not adjust trait ratings.
- **Generate Responses**: It does not formulate greetings or conversation dialogue.
- **Trigger Initiative**: It does not decide when the companion should speak.
- **Judge User Behavior**: It does not criticize the user or make moral evaluations.
- **Give Unsolicited Advice**: It does not direct the user's future actions.
- **Predict the Future**: It does not attempt to forecast user success or setbacks.
- **Replace Journaling**: It does not act as a diary, remaining focused on evidence-based growth metrics.

---

## 4. Reflection Lifecycle

Reflections transition through a conceptual progression during consolidation:

```
Finalized Active Contexts Ingested
                 │
                 ▼
        Patterns Identified  ◄─── Synthesizes goals, habits, and knowledge delta
                 │
                 ▼
        Reflection Prepared
                 │
                 ▼
  Archived Reflection Context (Immutable) ──► Saved to long-term memory
                 │
                 ▼
      Hydrates Next Session Boot
```

1. **Active Contexts Ingested**: The engine gathers finalized inputs at session close.
2. **Patterns Identified**: Evaluates changes in goals, habits, and skills.
3. **Reflection Prepared**: Formulates a structured representation of progress.
4. **Archived**: Stores the compiled reflection in the database, rendering it immutable.
5. **Future Session Boot**: The archived context is made available as a read-only input for the next companion initialization lifecycle.

---

## 5. Reflection Context

The Reflection Engine exposes a single primary conceptual output: the **Reflection Context**. This model captures:

- **Progress**: Summarized metrics of goals and milestones.
- **Growth**: Analyzed changes in user skills and competencies.
- **Patterns**: Summarized routine and habit shifts.
- **Achievements**: List of completed targets.
- **Challenges**: Documented blockers and stagnated goals.
- **Supporting Evidence**: Citations linking back to memories and event logs.
- **Reflection Confidence**: Mathematical metric representing the certainty of observations.
- **Time Period**: The duration spanned by the evaluation, mapped against the consistent temporal reference.

---

## 6. Inputs

The Reflection Engine consolidates inputs from:

- **GENESIS**: Historical memories and event logs.
- **Stories**: Active and archived narrative arcs.
- **Goal Context**: Milestone structures and progress metrics.
- **Knowledge Context**: Competency maps and skill levels.
- **Habit Context**: Observed routines and stability metrics.
- **Relationship Context**: Key contact interactions and collaborative details.
- **Presence Context**: Temporal return patterns.

---

## 7. Outputs

The sole output is the **Reflection Context**.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Reflection Engine)
- Supporting evidence (synthesized milestones and capability deltas)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

Downstream subsystems consume this output:

- **The Context Resolution Engine**: Integrates reflection summaries into prompt packages, giving the companion memory of recent progress.
- **The Initiative Engine**: Uses reflection milestones or challenges to prompt user-driven review sessions.
- **The Goal Engine**: Ingests progress data to adjust milestone priorities.

---

## 8. Integration Points

The engine links to surrounding architectural layers:

- **GENESIS**: Reads memories to extract evidence of achievements.
- **Goal Engine**: Compares goals against execution logs to verify progress.
- **Knowledge Engine**: Evaluates concept mastery rates to build growth summaries.
- **Habit Intelligence**: Monitors routines to track habit shifts.
- **Relationship Engine**: Integrates collaborative work achievements.
- **Context Resolution Engine (future)**: Supplies progress contexts for prompt assembly.
- **Initiative Engine (future)**: Uses reflection data to decide when to prompt user reviews.

---

## 9. Reflection Evolution

Reflections improve as data accumulates:

- **More Evidence**: Growth trends become clearer as focus logs increase.
- **Longer History**: Enables longitudinal analysis across weeks, months, and years.
- **Better Understanding**: Adapts context models as patterns stabilize.
- **Corrected Interpretations**: Updates observations if new evidence contradicts past assumptions.
- **Richer Insights**: Connects multiple domains (e.g. habits, learning, goals) to show complex growth.

---

## 10. Failure Modes

The engine handles anomalous conditions predictably:

- **Insufficient Evidence**: If interaction is minimal, the engine lowers confidence and does not generate a reflection.
- **Contradictory Evidence**: If work logs contradict user assertions, the engine flags the conflict.
- **Sparse Interaction History**: Fresh states default to empty baseline context models.
- **Missing Historical Periods**: If gaps exist in work history, the engine limits the time window of the reflection.
- **Weak Confidence**: Low-confidence reflections are hidden from the user, prioritizing accuracy over speculation.

---

## 11. Architectural Principles

The engine is built upon the following tenets:

- **Evidence-Based**: Derived strictly from verified database events.
- **Honest**: Reports achievements and challenges transparently.
- **Explainable**: Citations link observations back to specific logs.
- **Retrospective**: Runs only after interactions close, preventing dialogue interruptions.
- **Non-Judgmental**: Reports metrics neutrally.
- **Non-Manipulative**: Avoids arbitrary performance scores or forced productivity metrics.
- **Preserve Uncertainty**: Prefers no reflection over speculative or misleading summaries.
- **Technology Independent**: Independent of databases, languages, or notification protocols.
- **Single Responsibility**: Focuses exclusively on retrospective progress synthesis.

---

## 12. Future Compatibility

The system scales to support upcoming features:

- **Weekly Reviews**: Automates weekly summaries.
- **Monthly Reviews**: Compiles monthly patterns.
- **Annual Reviews**: Synthesizes annual growth reports.
- **Voice Conversations**: Feeds progress reviews into voice check-ins.
- **Coaching Sessions**: Supports collaborative reviews.
- **Career Development**: Maps growth progress against professional goals.
- **Learning Journeys**: Visualizes skill acquisition paths.
- **Cross-Device Usage**: Keeps temporal alignment consistent across devices using a consistent temporal reference.
