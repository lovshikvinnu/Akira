# ADR-002: Story-First Memory Architecture

## Status

Accepted

## Context

Standard memory storage in AI systems focuses on flat chronological logs or simple vector similarity matching on raw text chunks. This leaves the companion unaware of the larger life journeys, vocational milestones, and personal chapters the user is navigating, resulting in fragmented feedback and loss of context.

## Decision

AKIRA will organize long-term user understanding using **Stories** rather than isolated, flat memories. Stories serve as the primary narrative structure of the Adaptive Memory Engine, acting as dynamic, associative grouping anchors that represent meaningful user journeys.

## Reasoning

- **Cognitive Alignment**: Humans naturally perceive and organize their experiences, ambitions, and growth through narratives, chapters, and journeys (e.g., flight training, starting a startup) rather than isolated timeline logs.
- **Context Preservation**: A story-centric model provides a unifying thread. When a memory linked to a specific story is recalled, it raises the retrieval probability of related milestones in that same journey, ensuring narrative consistency.
- **De-Siloing Data**: Unlike physical folders, Stories are poly-hierarchical. A single memory node can contribute to multiple stories simultaneously, capturing multi-dimensional relationships without rigid constraints.

## Consequences

- The memory engine must support an explicit `Story` entity that groups `Memory` nodes and updates dynamic summaries as the user works.
- Timelines, goal tracking, and daily mission suggestions must be computed with awareness of active story priorities.
- Historical memories connected to completed stories are preserved as high-importance experiential context rather than decaying out of the system.
