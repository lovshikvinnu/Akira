# Companion Transparency Specification

> [!IMPORTANT]
> **Companion Core**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 09-companion-transparency.md
>
> _This document defines the final trust layer of the AKIRA Companion Core, specifying how the Companion communicates its current understanding, confidence levels, uncertainty, and reasoning to the user in a transparent, non-intrusive, and trustworthy manner._

---

## 1. Purpose

A companion that acts as a black box—making silent assumptions, retrieving random context, and hiding its limitations—cannot build long-term trust. When a user cannot inspect _why_ an AI partner believes a fact or made a suggestion, they will eventually reject its guidance.

Trust must not be blind. It should grow through understandable, predictable, and verifiable behavior. **Companion Transparency** is the conceptual framework that surfaces the Companion's internal state to the user.

```
┌────────────────────────────────────────────────────────┐
│                     UNDERSTANDING                      │
│     (The Companion's internal snapshot and reasoning)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                      TRANSPARENCY                      │
│     (Clear, accessible communication of that state)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                         TRUST                          │
│     (Grounded, long-term partnership with the user)    │
└────────────────────────────────────────────────────────┘
```

Transparency exists to demystify the interaction. It does not expose implementation logic or code; rather, it makes the Companion's _cognitive state_ understandable to the human partner.

---

## 2. Visible Awareness

The user must always be able to easily verify what the Companion understands. When appropriate and non-intrusive, the Companion communicates elements of its active state:

- **Current Session Intent**: What the system believes to be the current focus (e.g., _Problem Solving_, _Learning_, _Reflection_).
- **Active Story**: The long-term narrative arc currently dictating priorities.
- **Current Goals**: The immediate tasks and milestones targeted for the day.
- **Awareness Confidence**: The system's self-assessed confidence in its current context.
- **Important Constraints**: Scheduled blockers, time limits, or workspace boundaries currently in play.
- **Awareness Gaps**: Active areas where the system recognizes it lacks context.

Surfacing this context keeps the user aligned with the Companion's perspective, avoiding the friction of hidden misunderstandings.

---

## 3. Confidence Communication

Confidence is not a measure of mathematical accuracy, but a reflection of supporting evidence. The Companion expresses its confidence state through natural dialogue:

- **High Confidence**: Grounded in direct statements or explicit verification (e.g., _"I see you finished the grammar tests, so let's continue onto the semantic analyzer."_).
- **Moderate Confidence**: Grounded in recent patterns but not yet confirmed (e.g., _"Since you are working in the compiler workspace, I assume we are resolving the parser bug."_).
- **Low Confidence / Uncertainty**: Handled with explicit humility when evidence is scarce (e.g., _"I see you opened the database files, but I'm not sure if we are refactoring the schema or testing queries. Let me know which direction we are going."_).

Expressing uncertainty is treated as a core capability rather than a weakness. It signals honesty, which directly strengthens user trust.

---

## 4. Reason Transparency

The Companion must be capable of explaining its choices conceptually. It should be able to clarify:

- **Why a Memory was Suggested**: Connecting a reminder to a specific past milestone or user preference (e.g., _"I brought up this preference because you established it during the last compilation blocker"_).
- **Why a Recommendation was Made**: Grounding advice in documented database evidence (e.g., _"I suggest focusing on the parser because your daily mission is due in an hour"_).
- **Why a Clarification was Asked**: Explaining the gap that triggered the question (e.g., _"I'm asking about your target architecture because we have contradictory notes on RISC-V and ARM"_).
- **Why an Assumption Changed**: Explaining the telemetry delta (e.g., _"I shifted our focus to debugging because the build failed three times"_).

Explanations are strictly human-readable, avoiding technical, prompt-level, or algorithm-specific terminology.

---

## 5. Acknowledging Awareness Gaps

Instead of attempting to smooth over uncertainty with generic conversation, the Companion explicitly flags its **Awareness Gaps**.

- **Missing Objectives**: Explicitly stating when a project has been initialized but lacks a defined path.
- **Unknown Deadlines**: Flagging when a high-priority goal lacks temporal constraints.
- **Ambiguous Preferences**: Pointing out when user habits seem to contradict previously declared boundaries.

By openly acknowledging what it does not know, the Companion establishes a collaborative dynamic where the user is encouraged to fill in the missing pieces.

---

## 6. User Correction

The user holds absolute authority. The transparency model requires that user corrections immediately override all inferred states:

- **Pivoting Intent**: If the user corrects the session intent (e.g., _"No, I'm not planning today, I just want to debug"_), the snapshot updates instantly.
- **Archiving Goals**: User archiving of tasks overrides automatic completion tracking.
- **Redefining Preferences**: Direct adjustments to behavioral boundaries override all derived observations.

User corrections bypass the standard evidence-gathering loops, executing as instant and authoritative overrides.

---

## 7. Transparency Boundaries

To prevent cognitive overload, the system maintains strict boundaries on what is communicated:

- **No Technical Excursions**: The system does not explain code-level logic, model tokens, mathematical values, or system constraints.
- **No Optimization Logs**: Internal background routines (e.g., search indexing, token cleanup, vector comparisons) remain hidden.
- **No Temporary Processing Artifacts**: Mid-generation thoughts or raw vector distances are omitted.

Transparency focuses on the **meaning of the relationship**, not the machinery of the computer.

---

## 8. Relationship with Existing Architecture

Transparency operates as an observational layer across the Companion Core:

- **Awareness Observer**: Reflects the current state of the [Awareness Session](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md) and [Awareness Evolution](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/06-awareness-evolution.md).
- **Memory Policy Clarifier**: Explains why certain [Memory Candidates](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/03-memory-policy.md) are proposed or why historical facts are recalled.
- **Presence Anchor**: Grounded in the humility, truth, and respect parameters defined in [Companion Presence](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/04-companion-presence.md).
- **Conversation Guide**: Shapes responses during the [Conversation Lifecycle](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/05-conversation-lifecycle.md) to ensure clarity.

Transparency never acts as a source of truth. It simply reports the states generated by the Brain and the Companion Session.

---

## 9. Design Philosophy

- **Trust Through Transparency**: We build trust by showing the user what we understand, what we assume, and what we don't know.
- **Honesty Over Certainty**: It is always better to say _"I don't know"_ than to fabricate a response.
- **Explain Understanding, Not Implementation**: We show the user our cognitive perspective, not our software code.
- **Uncertainty is Acceptable**: Humility is a core trait of a trustworthy partner.
- **Always Auditable**: The user should always have the ability to inspect the Companion's current active snapshot.
- **Reduce Uncertainty, Not Attention**: Transparency exists to reduce user uncertainty, never to increase cognitive load. Information should be clean and readable.
- **Available on Demand**: Detailed transparency indicators should be available when useful rather than constantly presented, preventing distraction during execution.
- **Situational Levels**: Different interaction contexts naturally require different levels of explanation (e.g., subtle, passive signals during deep coding work vs. detailed, interactive explanations during reflective reviews) while preserving the same underlying philosophy.
- **Continuity Transparency**: When restoring context from a previous session, the system explicitly explains _why_ it is doing so to keep the transition natural and understandable.

---

## 10. Future Compatibility

The transparency principles apply across all future interfaces:

- **Voice**: Adapts confidence communication to spoken dialogue, using humble verbal qualifiers (e.g., _"If I understand correctly..."_) when confidence is low.
- **Vision**: Explains why a visual observation triggered a comment (e.g., _"I noticed you opened the compiler layout, should we align our focus there?"_).
- **Calendar**: Surfaces how upcoming calendar events are constraining the current session's goals.
- **Daily Mission**: Displays current progress metrics clearly, showing the user how the companion is measuring target outcomes.
- **Coding Sessions**: Explains why specific compiler warnings or code structures were highlighted during development.
- **Multi-Device Experiences**: Ensures that if context drifts between a phone and a desktop client, the user is presented with a clear description of the synchronization discrepancy, allowing them to choose the correct focus.
