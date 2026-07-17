# Knowledge Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 04-knowledge-engine.md
>
> _This document defines the Knowledge Engine, the user competency and skill mapping subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

### 1. Purpose

For a growth companion to act as an effective mentor, it must understand what the user knows, what skills they are actively developing, and where their understanding is incomplete. Without a structured knowledge tracker, a companion cannot distinguish between concepts the user has mastered and subjects they are exploring for the first time, leading to repetitive or misaligned guidance.

AKIRA establishes a structured model of user competencies via the **Knowledge Engine**. This subsystem maintains an evolving map of the user's skills, concepts, and learning progress, answering the question: _"What does the Companion currently understand about the user's knowledge?"_

The relationship between architectural stages flows as follows:

```
Experiences (GENESIS)
         │
         ▼
     Knowledge ◄─── Inferred from event history and user performance
         │
         ▼
       Goals
         │
         ▼
   Conversation
```

- **Experiences**: Raw event logs and validated memories of past activities.
- **Knowledge**: Evolving representation of the user's skills, concepts, and learning progress.
- **Goals**: Milestones and intentions (informed by what is known and what needs to be learned).
- **Conversation**: Active dialogue tailored to the user's verified competency level.

### How Knowledge Differs from Other Systems:

- **Memory (GENESIS)**: Memory records _specific events_ that occurred in the past. Knowledge models the _abstract understanding_ synthesized from those events.
- **Identity**: Identity tracks _who_ the user is and how they work. Knowledge tracks _what_ skills and concepts they understand.
- **Goals**: Goals define _what the user wants to achieve_. Knowledge defines the _foundation of what they currently understand_ to help them get there.

To prevent circular dependencies, **Knowledge is temporally decoupled from active Reflection**. The Knowledge Engine consumes only _previously finalized Reflection Contexts_ (archived historical context) from earlier sessions. It never consumes a Reflection Context currently being generated, ensuring all calculations follow a strict unidirectional flow.

---

## 2. Responsibilities

The Knowledge Engine models and maps user competencies:

- **Knowledge Domains**: Tracks high-level technical or personal areas of expertise (e.g., systems programming, compiler design).
- **Skills**: Models specific execution capabilities (e.g., writing parsers, debugging memory allocations).
- **Concepts**: Maps theoretical understanding of specific topics (e.g., AST structures, recursive descent parsing).
- **Competencies**: Computes verified skill levels based on evidence.
- **Knowledge Confidence**: Calculates certainty values reflecting how reliably a user's mastery has been verified.
- **Knowledge Evolution**: Manages changes in comprehension as the user learns or corrects errors.
- **Knowledge Gaps**: Identifies missing prerequisites needed for active goals.
- **Learning Progression**: Tracks milestones along the educational path.
- **Concept Relationships**: Maps dependencies and connections between different domains.

---

## 3. Non-Responsibilities

The Knowledge Engine restricts its scope to modeling competency:

- **Create Memories**: It does not log persistent history event nodes.
- **Update Identity**: It does not modify emergent trait profiles.
- **Generate Responses**: It does not write greetings, tutorials, or dialogue.
- **Teach Automatically**: It does not generate educational curriculum or lesson slides.
- **Trigger Initiative**: It does not decide when to prompt the user.
- **Manage Goals**: It does not track user milestones or target deadlines.
- **Infer Habits**: It does not calculate routines or streaks.
- **Rank Importance**: It does not score memory nodes.

---

## 4. Knowledge Lifecycle

User knowledge states transition through a conceptual progression based on evidence:

```
Knowledge Observed
        │
        ▼
Knowledge Inferred
        │
        ▼
Knowledge Refined
        │
        ├────────────────────────────┐
        ▼                            ▼
Knowledge Reinforced        Knowledge Deprecated
```

1. **Knowledge Observed**: A concept or skill is mentioned or used during a focus session.
2. **Knowledge Inferred**: The engine assumes a baseline level of understanding based on initial actions.
3. **Knowledge Refined**: Verification checks and repeat interactions clarify the exact level of skill.
4. **Knowledge Reinforced**: Continued successful execution increases confidence in user mastery.
5. **Knowledge Deprecated**: If contradictions or errors are observed, the engine updates the state to reflect a knowledge gap.

---

## 5. Knowledge Context

The Knowledge Engine exposes a single primary conceptual output: the **Knowledge Context**. This model captures:

- **Known Domains**: Evaluated areas of user understanding.
- **Skills**: Specific verified capabilties.
- **Concepts**: Theoretical topics the user understands.
- **Confidence**: Mathematical metric representing the certainty of verified mastery.
- **Knowledge Gaps**: Missing skills or concepts identified as prerequisites for goals.
- **Relationships**: Dependency connections linking domains and concepts.
- **Learning Progress**: Metrics showing development across active domains.
- **Areas Requiring Clarification**: Flags identifying domains where evidence is contradictory or incomplete.

---

## 6. Inputs

The Knowledge Engine consolidates inputs from:

- **GENESIS**: Historical event logs and validated memories showing completed tasks.
- **Conversation Evolution**: Shift in technical vocabulary or topics discussed.
- **Companion State**: Active project tasks and focus session metrics.
- **Goal Context**: Active priorities and target milestones.
- **Archived Reflection Outcomes**: Previously finalized summaries from earlier sessions. The engine is prohibited from consuming Reflection Contexts during active generation.

---

## 7. Outputs

The sole output is the **Knowledge Context**.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Knowledge Engine)
- Supporting evidence (concept validations and skill checks)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

Downstream subsystems consume this output:

- **The Context Resolution Engine**: Integrates known domains and knowledge gaps into prompt contexts, ensuring companion explanations match user level.
- **The Initiative Engine**: Uses knowledge gaps to suggest learning milestones.
- **The Reflection Engine**: Evaluates session outcomes against knowledge goals to update progress.

---

## 8. Integration Points

The Knowledge Engine links to other domains in the companion layer:

- **GENESIS**: Analyzes historical memories to extract evidence of concept mastery.
- **Goal Engine**: Integrates with goal milestones to identify knowledge prerequisites.
- **State Engine**: Inspects active tasks to monitor real-time skill usage.
- **Reflection Engine (future)**: Evaluates completed session metrics to update knowledge states.
- **Habit Intelligence (future)**: Maps study routines to progression rates.
- **Context Resolution Engine (future)**: Appends competency models to context packages.
- **Initiative Engine (future)**: Evaluates knowledge gaps to prompt timely educational reflections.

---

## 9. Knowledge Evolution

Knowledge states change dynamically based on evidence:

- **New Concepts Learned**: Ingesting events updates the known domains tree.
- **Confidence Increases**: Successful completion of dependent tasks confirms mastery, increasing confidence.
- **Misunderstandings Corrected**: Feedback loops identify errors and adjust skill ratings downward.
- **Skills Improve**: Tracking durations and task completions updates competency levels.
- **Outdated Knowledge**: If a domain is unvisited for long periods, confidence slightly decays.
- **Evolving Relationships**: The logical map linking skills and concepts updates as complexity grows.

---

## 10. Failure Modes

The engine resolves ambiguous states using explicit fallbacks:

- **Insufficient Evidence**: If evidence is missing, the engine marks the domain with low confidence and does not assume mastery.
- **Contradictory Evidence**: If a user completes a task but fails a dependent task, the engine lowers confidence and flags the domain for clarification.
- **Ambiguous Understanding**: Vague references default to unverified status.
- **Rapid Learning Changes**: The engine dampens transition rates to prevent rapid changes in verified competency.
- **Obsolete Knowledge**: Outdated skills are preserved but marked with low confidence metrics.

---

## 11. Architectural Principles

The Knowledge Engine is built upon the following tenets:

- **Evidence-Based**: Knowledge states are driven strictly by verified accomplishments.
- **Explainable**: The path from completed work session to verified skill mastery is traceable.
- **Evidence Verification**: When the user explicitly corrects an inferred understanding, the engine must refine its understanding rather than silently replacing previous conclusions. Explicit user corrections become verified evidence, confidence is updated accordingly, previous inferences remain explainable, and future reasoning prioritizes verified evidence.
- **Continuously Evolving**: Adjusts competence models dynamically.
- **Never Assume Mastery**: Requires positive evidence before marking a concept as known.
- **Preserve Uncertainty**: Exposes gaps and low confidence values rather than guessing.
- **Deterministic**: Logical check gates evaluate inputs consistently.
- **Technology Independent**: Independent of databases, languages, or educational frameworks.
- **Single Responsibility**: Focuses exclusively on modeling user comprehension.

---

## 12. Future Compatibility

The system scales to support upcoming interaction modes:

- **Personalized Tutoring**: Supplies competency maps to tailor explanations.
- **Coding Assistance**: Matches code complexity metrics to user skill levels.
- **Voice**: Ingests verbal dialogue to identify technical vocabulary usage.
- **Vision-Assisted Learning**: Recognizes diagram completions or visual checks to verify skills.
- **Long-Term Education**: Tracks multi-year progress across complex academic domains.
- **Career Development**: Maps goals and skills to professional benchmarks.
- **Cross-Device Usage**: Syncs temporal metrics using a consistent temporal reference to keep competency maps aligned across all user platforms.
