# ADR-003: Emergent Identity Discovery

## Status

Accepted

## Context

AI personalization typically relies on static configuration forms where users manually input their preferences, roles, and values. This approach requires ongoing manual curation, fails to capture changing user habits, and often reflects self-declared aspirations rather than actual observed behavior.

## Decision

The **Identity Layer** of AKIRA will never be manually configured. Instead, the user's identity (traits, work styles, learning styles, values, and strengths) must emerge and be discovered continuously from long-term patterns across Events, Memories, Stories, and physical behaviors.

## Reasoning

- **Observation Over Self-Declaration**: Actual behavior is the most reliable source of truth. By deriving identity from observed patterns, the companion gains an accurate representation of who the user is and how they actually work.
- **Reduced User Friction**: The user is spared from filling out, updating, and managing a static profile; the companion adapts silently as habits evolve.
- **Traceable Lineage (Provenance)**: Because identity is inferred, the system can trace every trait back to specific, observable events, establishing explainability and building long-term trust.

## Consequences

- The companion must run background processes to analyze patterns across memory nodes, extracting traits only when significant cross-story evidence accumulates.
- Trait inferences must include confidence ratings and explicit references to supporting memories (provenance) so they can be inspected or corrected.
- The system must allow identity traits to dynamically strengthen, weaken, or evolve as user focus changes.
