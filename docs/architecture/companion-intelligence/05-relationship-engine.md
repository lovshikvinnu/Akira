# Relationship Engine Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 05-relationship-engine.md
>
> _This document defines the Relationship Engine, the interpersonal mapping and relationship context subsystem belonging to the Companion Intelligence Layer of AKIRA._

---

### 1. Purpose

For a growth companion to act as an effective partner, it must understand the social and professional landscape of the user's life. A system that only logs work milestones or answers prompts without recognizing the key people in the user's life will lack social context, failing to provide relevant support during collaborative challenges, team efforts, or personal milestones.

AKIRA establishes a structured model of the user's social environment via the **Relationship Engine**. This subsystem maintains an evolving understanding of key human connections, answering the question: _"Who are the important people in the user's life, and what does the Companion understand about those relationships?"_

The relationship between architectural stages flows as follows:

```
Experiences (GENESIS)
         │
         ▼
     Relationships ◄─── Inferred from conversation and activity history
         │
         ▼
     Conversation
```

- **Experiences**: Raw event logs and validated memories of user interactions.
- **Relationships**: Evolving structured models of the key people in the user's life.
- **Conversation**: Active dialogue tailored to the user's social context.

### How Relationships Differ from Other Systems:

- **Memory (GENESIS)**: Memory logs _specific events_ that occurred in the past. Relationships model the _abstract structures and context_ of key human connections synthesized from those events.
- **Identity**: Identity models _who_ the user is. Relationships model the _external connections_ between the user and others.
- **Knowledge**: Knowledge tracks _what skills and concepts the user understands_. Relationships track _who is connected to those activities_.

To prevent circular dependencies, **the Relationship Engine is temporally decoupled from active Reflection consolidation**. It consumes only previously finalized Reflection Contexts (archived historical context) from previous sessions to update relationship parameters.

---

## 2. Responsibilities

The Relationship Engine models and maps user connections:

- **Important People**: Identifies and logs key individuals (e.g., mentors, collaborators, family members).
- **Relationship Significance**: Assigns significance ratings reflecting the impact of each connection.
- **Relationship Context**: Maps the role and shared domains associated with each person.
- **Relationship Continuity**: Evaluates the stability and frequency of interactions.
- **Shared History**: Links specific memories and achievements to specific people.
- **Open Topics**: Tracks unresolved questions, plans, or follow-ups relating to key connections.
- **Relationship Confidence**: Computes certainty metrics reflecting the accuracy of relationship details.
- **Relationship Evolution**: Updates roles and significance values as interactions change.

---

## 3. Non-Responsibilities

The Relationship Engine restricts its focus to modeling connections:

- **Create Memories**: It does not log persistent history event nodes.
- **Infer Emotions**: It does not guess the user's or others' feelings or moods.
- **Judge Relationships**: It does not evaluate the health or quality of user connections.
- **Give Relationship Advice**: It does not output therapeutic or personal advice.
- **Generate Responses**: It does not write greetings, email replies, or dialogue.
- **Trigger Initiative**: It does not decide when the companion should speak.
- **Modify Identity**: It does not alter user trait ratings.

---

## 4. Relationship Lifecycle

User connections transition through a conceptual progression based on evidence:

```
Person Introduced
        │
        ▼
Relationship Observed
        │
        ▼
Relationship Understood
        │
        ▼
Relationship Refined
        │
        ├────────────────────────────┐
        ▼                            ▼
Relationship Evolves        Relationship Archived
```

1. **Person Introduced**: A name or contact is observed in conversation or project data.
2. **Relationship Observed**: Initial connections, roles, and contexts are identified.
3. **Relationship Understood**: Repeated interactions confirm significance and establish baseline parameters.
4. **Relationship Refined**: Roles, dependencies, and shared history are detailed.
5. **Relationship Evolves**: The engine adjusts parameters as interaction patterns shift.
6. **Relationship Archived**: Connections that lose significance over long periods are archived.

---

## 5. Relationship Context

The Relationship Engine exposes a single primary conceptual output: the **Relationship Context**. This model captures:

- **Important People**: List of key individuals.
- **Relationship Significance**: Significance classifications for active connections.
- **Shared Context**: Projects, goals, and skill domains shared with each person.
- **Recent Developments**: Summaries of recent milestones involving key connections.
- **Open Discussions**: List of unresolved details or plans involving others.
- **Confidence**: Mathematical metric reflecting the certainty of relationship details.
- **Continuity**: Interaction frequencies and return states for active relationships.

---

## 6. Inputs

The Relationship Engine consolidates inputs from:

- **GENESIS**: Historical event logs and validated memories showing collaborative actions.
- **Conversation Evolution**: Shift in social references and people discussed.
- **Companion State**: Active project tasks and session metrics.
- **Presence Context**: Temporal parameters reflecting user return patterns.
- **Archived Reflection Outcomes**: Previously finalized summaries from earlier sessions.

---

## 7. Outputs

The sole output is the **Relationship Context**.

In accordance with the Provenance Preservation principle, the output preserves:

- Originating subsystem (Relationship Engine)
- Supporting evidence (collaborative logs and communication references)
- Confidence rating

This ensures that the downstream Context Resolution Engine can orchestrate the context without stripping away the metadata required to trace and audit every resolved understanding.

Downstream subsystems consume this output:

- **The Context Resolution Engine**: Integrates relationship context (e.g. active collaborators, open plans) into prompt packages.
- **The Initiative Engine**: Evaluates milestone completions or unvisited open topics to suggest check-ins.
- **The Reflection Engine**: Reviews session activities involving others to update relationship states.

---

## 8. Integration Points

The Relationship Engine links to other domains in the companion layer:

- **GENESIS**: Queries historical memories to extract evidence of collaboration.
- **Knowledge Engine**: Links collaborators to specific skill domains or teaching roles.
- **Goal Engine**: Integrates collaborative goals and shared milestones.
- **Reflection Engine (future)**: Evaluates completed session metrics to update relationship states.
- **Context Resolution Engine (future)**: Appends social models to context packages.
- **Initiative Engine (future)**: Evaluates open plans or birthdays to prompt timely check-ins.

---

## 9. Relationship Evolution

Relationship states change dynamically based on evidence:

- **New People**: Ingesting events updates the social model tree.
- **Changing Importance**: Increased collaboration frequency boosts significance ratings.
- **Corrected Understanding**: Feedback loops resolve ambiguous roles or names.
- **New Shared Experiences**: Attaches new memories to the corresponding person model.
- **Reduced Relevance**: If a contact is unvisited for long periods, significance decay occurs.

---

## 10. Failure Modes

The engine resolves ambiguous states using explicit fallbacks:

- **Ambiguous Identity**: If two contacts share similar names, the engine marks the record with low confidence and requests clarification.
- **Conflicting Information**: If roles or contexts contradict, the engine lowers confidence and flags the conflict.
- **Insufficient Evidence**: Vague references are held as unverified until positive evidence occurs.
- **Similar People**: Names are mapped to unique conceptual entities to prevent overlap.
- **Changing Relationships**: Sudden shifts in roles are updated slowly to prevent context thrashing.

---

## 11. Architectural Principles

The Relationship Engine is built upon the following tenets:

- **Evidence-Based**: Social models are updated based on verified inputs.
- **Non-Judgmental**: Reports connections neutrally, avoiding evaluation.
- **Explainable**: The path from event completion to relationship update is traceable.
- **Evidence Verification**: When the user explicitly corrects an inferred relationship understanding, the engine must refine its understanding rather than silently replacing previous conclusions. Explicit user corrections become verified evidence, confidence is updated accordingly, previous inferences remain explainable, and future reasoning prioritizes verified evidence.
- **Privacy-First**: No social data is shared; all models run locally offline.
- **Continuously Evolving**: Adjusts parameters dynamically.
- **Deterministic**: Logical checks process inputs consistently.
- **Technology Independent**: Independent of databases, languages, or social networks.
- **Single Responsibility**: Focuses exclusively on mapping user connections.

---

## 12. Future Compatibility

The system scales to support upcoming interaction modes:

- **Voice**: Ingests spoken references to identify contacts.
- **Vision**: Identifies collaborators in visual media or project charts.
- **Calendar**: Ingests meetings and events to schedule context updates.
- **Collaborative Work**: Links project collaborators directly to goals.
- **Family Assistance**: Tracks personal relationships and milestones.
- **Team Projects**: Maps structured team directories to project context packages.
- **Cross-Device Usage**: Syncs temporal metrics using a consistent temporal reference to keep relationship metrics aligned across all platforms.
