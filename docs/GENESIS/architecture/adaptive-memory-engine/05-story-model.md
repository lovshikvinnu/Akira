# The Story Model: Hierarchical Narrative Memory

This document defines the architectural concept of **Stories** within the **AKIRA** Adaptive Memory Engine. It explains how AKIRA shifts from a collection of isolated events and facts to a cohesive, narrative-based understanding of the user's life journeys.

---

## 1. Purpose

In traditional AI companion systems, memory is represented as an unorganized ledger of chronological events or a flat list of extracted user preferences. While useful for immediate queries, this approach fails to capture the true context of a human life.

### Why Individual Memories Are Not Enough

A user does not experience life as a sequence of isolated, independent data points. Remembering that a user completed "Task X" or wrote "Note Y" on a specific day provides no insight into the larger narrative surrounding _why_ those actions were taken, what hurdles were overcome, or how those actions fit into their long-term growth.

### Narrative Cognition

Humans make sense of their existence through **journeys, chapters, and stories**. We organize our ambitions, projects, and personal transitions into distinct, long-running arcs. A story provides the necessary thread that binds separate events into a meaningful structure.

### The Macro-Cognitive Unit

Within AKIRA, **Stories** serve as the highest-level organizational unit of memory. By grouping events and memories into Stories, AKIRA can transition from a reactive workspace log to a proactive growth partner that understands where the user came from, where they currently stand, and where they are heading in their personal and professional pursuits.

---

## 2. Hierarchy

The Adaptive Memory Engine organizes cognitive data into a three-tiered hierarchy, transitioning from raw physical telemetry to high-level semantic meaning.

```
       [ Stories ]         <-- High-Level Journeys & Narratives (Mutable, Evolving)
            ↑
      [ Memories ]         <-- Synthesized Facts, Habits & Preferences (Mutable, AI-managed)
            ↑
       [ Events ]          <-- Raw Digital Footprints & Logs (Immutable, Chronological)
```

| Layer        | Responsibility                                                                                                              | Mutability         | Example                                                                       |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------- | :----------------- | :---------------------------------------------------------------------------- |
| **Events**   | Captures raw, real-time digital interactions, check-ins, and logs. It serves as the immutable audit trail of the workspace. | Immutable          | User checked off a task: _"Implement CAS authentication"_ at 10:14 AM.        |
| **Memories** | Represents consolidated facts, preferences, and traits extracted from events and chats.                                     | Mutable            | _"User prefers working on compiler tasks in the morning."_                    |
| **Stories**  | Aggregates related memories and events into long-running narrative arcs representing meaningful life journeys.              | Mutable / Evolving | _"RISC-V CPU Project"_ (tracking the multi-month journey of CPU development). |

---

## 3. What is a Story?

A **Story** in AKIRA is an evolving collection of related memories and events representing a meaningful journey in the user's life.

### Core Examples

- **Building AKIRA**: The journey of developing this AI companion, tracking architectural breakthroughs, developer design documents, and sprint milestones.
- **Pilot Journey**: The user's pursuit of a private pilot license, aggregating simulator sessions, flight school notes, and checkride completions.
- **University Life**: The overarching narrative of academic progress, linking courses, exams, research notes, and social milestones.
- **Fitness Journey**: A tracking arc for physical health, linking workouts, diet changes, habit streaks, and weight milestones.
- **RISC-V CPU Project**: A technical journey documenting the design, simulation, and hardware implementation of a custom processor core.

### A Story is NOT a Folder

Unlike a filesystem folder or a database category, a Story is not a rigid container.

- A folder forces a file to have one location. A Story is **associative**; a single memory can enrich multiple stories.
- A folder is static and manual. A Story is **dynamic**; it grows organically over time as the Adaptive Memory Engine links new notes, sessions, and events to the narrative.
- A folder has no inherent progression. A Story has **chapters, phases, and an active status**, modeling the lifecycle of human achievements.

---

## 4. Story Properties

To represent narratives conceptually, a Story is defined by properties that establish its identity, status, importance, and connection network.

- **Identifier (`id`)**: A unique key that distinguishes this story from others, allowing relation models to point to it as a singular cognitive node.
- **Title (`title`)**: A concise, user-recognizable name for the journey (e.g., _"RISC-V CPU Project"_).
- **Summary (`summary`)**: A dynamic, natural-language overview of the story's progress, context, and current phase, periodically updated by the AI core as new memories arrive.
- **Status (`status`)**: Reflects the story's active presence in the user's life (e.g., whether the journey is currently in progress, paused, successfully completed, or archived).
- **Importance (`importance`)**: A rating of how central this story is to the user's overall growth and current daily focus.
- **Creation Date (`createdAt`)**: The timestamp marking when the story was first established or identified.
- **Last Modified Date (`updatedAt`)**: The timestamp marking the most recent addition of a memory, change in status, or AI summary rewrite.
- **Related Memories (`relatedMemories`)**: A collection of references linking the story to the specific events, semantic facts, notes, and work sessions that form its substance.
- **Metadata (`metadata`)**: A flexible bucket for holding contextual properties, such as target goals, confidence levels, key collaborators, or emotional sentiment markers related to the journey.

---

## 5. Story Types

To organize narratives without creating rigid schemas, AKIRA defines an initial, highly extensible set of story categories:

1. **Vocation (`"vocation"`)**: Major professional projects, software development cycles, business ventures, or career milestones.
2. **Growth (`"growth"`)**: Personal improvement arcs, physical fitness goals, habit tracking, mental health journeys, or self-discovery objectives.
3. **Education (`"education"`)**: Structured learning processes, degree tracks, certifications, reading list completions, or skill acquisition pipelines.
4. **Life Event (`"life_event"`)**: Major personal transitions, relocations, travel logs, family milestones, or domestic achievements.

---

## 6. Relationship with Memories

The link between Stories and Memories is fluid, forming a semantic web rather than a hierarchical tree.

```
       [ Story A: Building AKIRA ]       [ Story B: University Life ]
                     \                               /
                      \                             /
                       [ Memory: TypeScript Note ]
```

### Memory-to-Story Association

Memories act as the building blocks of a Story. When the AI core extracts a new consolidated memory (e.g., _"User finished research on React 19 Hydration errors"_), it evaluates whether this memory fits into any active Stories. If a match is found, the memory is linked to that Story.

### Many-to-Many Mappings

A single memory is never confined to one narrative.

- _Example_: A work session where the user codes a physics simulator for a flight dynamics course could simultaneously contribute to the **Pilot Journey** story (for flight principles) and the **University Life** story (for the academic grade).
- AKIRA preserves this multi-faceted relationship, ensuring that context is not lost in arbitrary silos.

### Automatic Story Evolution

Stories are living structures. As the user works:

1. **Extraction**: Daily events trigger new memories.
2. **Clustering**: The AI memory engine recognizes associations between new memories and existing stories.
3. **Refinement**: If a critical mass of related memories emerges without a matching Story, the engine proposes the creation of a new Story (e.g., recognizing that sporadic notes on aerodynamics indicate a new interest in aviation).
4. **Archival**: When events corresponding to a story cease for an extended period, the story transitions to an inactive or archived state, adjusting its retrieval weight in daily feeds.

---

## 7. Design Philosophy

The Story Model represents a philosophical shift in how personal AI companions represent user data:

| Aspect                   | Flat Timeline / Notes                  | The Story Model                                       |
| :----------------------- | :------------------------------------- | :---------------------------------------------------- |
| **Cognitive Framework**  | Raw chronological sequencing.          | Narrative journey sequencing (Chapters & Milestones). |
| **Contextual Awareness** | Localized to a single date or folder.  | Global, spanning months of disconnected sessions.     |
| **Relationship Model**   | Rigid folder trees or manual hashtags. | Poly-hierarchical semantic networks.                  |
| **AI Role**              | Search indexer retrieving exact text.  | Biographer synthesizing meaning and personal growth.  |

By tracking the user's life through Stories, AKIRA gains the capacity to recognize **growth patterns**. It can identify when a user is struggling through a challenging "chapter" of a vocational story, prompt reflection when a growth journey is paused, and celebrate when a major story reaches its completion milestone.

---

## 8. Future Possibilities

While the initial implementation focuses on maintaining the structure of Stories, the model is architected to support several advanced, proactive features:

- **Story Summaries**: The ability for the AI core to generate chronological narratives of long-term projects (e.g., _"Here is a 3-paragraph summary of your RISC-V CPU project journey over the last three months"_).
- **Story Milestones & Chapters**: Automatic identification of pivotal moments (e.g., moving from the "Design Phase" to the "Implementation Phase" of a software story).
- **Progress Tracking**: Quantitative and qualitative assessments of a story's movement toward its terminal goals (e.g., calculating completed research vs. outstanding tasks).
- **Narrative Insights**: Identifying correlations between different journeys (e.g., _"Your Fitness Journey experiences a slowdown whenever your Vocation project enters an active delivery sprint"_).
- **Story-Based Recommendations**: Generating daily missions that directly support active, high-priority stories, ensuring the user's daily actions remain aligned with their high-level goals.
