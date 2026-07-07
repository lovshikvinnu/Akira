# Memory Policy Specification

> [!IMPORTANT]
> **Companion Core**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 03-memory-policy.md
>
> _This document defines the conceptual policies and cognitive guidelines governing what the Companion remembers, what it forgets, and how trust is built and preserved through data stewardship over long-term use._

---

## 1. Purpose

For an AI companion to build a meaningful, growth-oriented partnership with a user, selective memory is not a limitation—it is a fundamental requirement. Storing everything a user says or does leads to cognitive noise, resource bloat, and a breakdown of privacy. Trust is established when the user knows the companion retains what is critical to their development, while letting transient details fade.

The architecture differentiates the lifecycle of interaction as follows:

```
┌────────────────────────────────────────────────────────┐
│                      CONVERSATION                      │
│     (Temporary exchange of text, voice, or action)     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                       EXPERIENCE                       │
│  (Recognized patterns, milestones, or core challenges) │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                         MEMORY                         │
│     (Consolidated facts, narrative anchors in Brain)    │
└────────────────────────────────────────────────────────┘
```

- **Conversation**: Transient exchange. The vast majority of conversational turns contain phrasing, logistics, or social formatting that are ephemerally necessary but structurally meaningless for long-term guidance.
- **Experience**: The conceptual layer. It identifies the core meaning, progress, or patterns within the session telemetry.
- **Memory**: The consolidated result. Only experiences that have long-term narrative utility or represent permanent truths are allowed to transition into long-term memories in the Brain.

---

## 2. Memory Worthiness

Information is only written to long-term memory if it holds structural value for the user's ongoing growth. Conceptual indicators of memory worthiness include:

- **Long-Term Goals**: Objectives the user actively sets (e.g., career milestones, learning paths, personal habits).
- **Personal Preferences**: Persistent working boundaries (e.g., preferred coding paradigms, peak productivity hours, guidance style preferences).
- **Repeated Behavioral Patterns**: Habits or focus drifts noticed across multiple sessions (e.g., writing code late at night, drifting to side projects when compiler bugs arise).
- **Significant Milestones**: Achievements and completions of projects or stories.
- **Important Decisions**: Choices that shape future work (e.g., choosing a local-first architecture over a cloud platform).
- **Relationships**: Mentioned professional contacts, collaborators, or personal relationships that impact goals.
- **Self-Declared Permanent Facts**: Invaluable personal details explicitly shared by the user.

**Emotional Significance vs. Long-Term Importance**: High emotional intensity does not automatically justify a memory's long-term importance. The system distinguishes transient emotional expressions (e.g., passing frustration with a compiler warning, temporary exhaustion, or brief excitement over a minor fix) from persistent, structural preferences or milestones, preventing temporary emotional reactions from polluting long-term memory.

---

## 3. Intentional Forgetting

Forgetting is an active design decision designed to keep context clean and reduce cognitive load. The system intentionally excludes the following from long-term memory:

- **Greetings & Politeness**: Conversational filler (_"Hello," "How are you," "Thanks"_).
- **Small Talk**: Superficial banter or remarks about external situations (_"The weather is nice today"_).
- **Temporary Humor**: Inside jokes, sarcastic statements, or passing humor that lacks factual utility.
- **Typographical & Syntax Mistakes**: Discarded text edits, corrected voice commands, or corrected wording.
- **Accidental Statements**: Utterances or actions quickly corrected by the user (_"Wait, don't look at that folder, I meant this one"_).
- **One-off Questions**: Temporary informational requests (_"What is the capital of France?"_).
- **Short-lived Logistics**: Fleeting administrative actions (_"Send this draft to my email," "Minimize this panel"_).

---

## 4. Memory Confidence

No semantic memory enters the Brain with absolute certainty. Every candidate memory begins with an assigned confidence score based on the clarity of the evidence. Confidence is dynamic and evolves over time:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONFIDENCE STRENGTHENING PATH                      │
├─────────────────────────────────────────────────────────────────────────┤
│ [Single Observation] ──► [Repetition] ──► [Cross-Validation] ──► [Confirm] │
│      (Uncertain)         (Reinforced)      (Multi-Source)       (Explicit)  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Repetition**: Seeing the same preference or pattern exhibited multiple times.
- **Reinforcement**: The user building upon or referencing previous concepts.
- **Cross-Validation**: Aligning conversational statements with actual workspace telemetry (e.g., user says they are learning Rust, and the system detects Rust projects being initialized).
- **Explicit Confirmation**: The user directly validating the system's assumption.

Conversely, if contradictory evidence occurs (e.g., the user declares they are strictly focusing on Backend engineering, but spends consecutive days working on Frontend styling), the confidence score of the original memory decreases, eventually triggering a revision process.

---

## 5. Explicit User Intent

User commands represent the ultimate authority over long-term memory. The Companion’s automatic inference engines must instantly yield to direct commands:

- **Forced Retention**: Instructions like _"Remember this"_ or _"This is important"_ bypass standard filtering and write the context directly to the validation stage as a high-importance item.
- **Forced Erasure**: Instructions like _"Forget this"_ or _"Delete our last conversation"_ trigger immediate removal from both active context and long-term stores.
- **Blacklisting**: Instructions like _"Don't remember this project"_ or _"Ignore my personal calls"_ place spatial boundaries on what the system is allowed to monitor.
- **Memory Consent**: The user must explicitly validate and consent to the storage of highly personal, sensitive, or high-impact semantic memory proposals before the Brain's consolidation engine officially commits them.
- **Memory Regret**: The user can command the immediate erasure of recent time blocks or topics (e.g., _"Forget the last 15 minutes"_ or _"Erase my comments about the compiler design"_), cascading an immediate teardown of those telemetry logs and candidates from the session memory.

---

## 6. Privacy and Respect

Memory exists solely to help the user become a better version of themselves, never to harvest data or build user-tracking models:

- **Minimalist Retention**: The system stores the minimum amount of information required to support active stories and goals.
- **No Unrequested Telemetry Stash**: Raw keystrokes, voice audio files, or screen telemetry must be processed for memory extraction and then immediately destroyed, rather than archived.
- **Local Sovereignty**: Long-term memory is locally owned by the user. It is never exposed, pooled, or transmitted to third parties for external analytics.
- **Volatile by Default**: If an interaction does not explicitly validate as worthy of long-term memory, its footprint remains strictly within the ephemeral session context.

---

## 7. Reflection and Revision

Memories are not static archives. As the user grows and shifts focus, long-term memory must adapt to avoid obsolescence. Under the guidance of the [Reflection Stage](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-lifecycle.md#3-conceptual-lifecycle-stages), memories undergo three evolutionary paths:

- **Merging**: Consolidating multiple overlapping observations into a single, cohesive fact (e.g., merging _"User works on Rust compiler"_ and _"User writes parser in Rust"_ into _"User is developing a compiler using Rust"_).
- **Refinement**: Updating memory details as habits change (e.g., changing _"User studies early in the morning"_ to _"User now studies late at night"_).
- **Decay & Archiving**: Moving memories with low reinforcement or completed narrative stories to an archive, where they remain indexed for historic search but are removed from standard active context pools.

---

## 8. Memory Boundaries

A clear architectural boundary separates the **Companion** (which generates the interface experience) from the **Brain** (which controls memory persistence).

```
┌───────────────────┐       ┌─────────────────┐       ┌─────────────┐
│     Companion     │ ───►  │ Memory Proposal │ ───►  │  The Brain  │
│  Identifies patterns      (Memory Candidate)        Evaluates and
│  during interaction                                  commits state
└───────────────────┘                                 └─────────────┘
```

The Companion does not write to the memory tables. Instead, it generates a **Memory Proposal** (a memory candidate). The Brain’s consolidation engine is the sole evaluator of this proposal, performing verification, checking graph dependencies, and officially committing the state.

**Memory Transparency**: The system provides clear conceptual visibility into the lifecycle state of all processed context. The user must easily understand whether an observation is treated as temporary/ephemeral (retained only inside the active session snapshot and discarded at closure) or has been proposed as a memory candidate for long-term storage in the Brain.

---

## 9. Design Philosophy

The memory architecture of AKIRA is anchored by six core tenets:

- **Trust Before Memory**: A companion that remembers too much feels like surveillance; a companion that remembers too little feels like a stranger. We prioritize establishing a safe, trust-based boundary above all else.
- **Quality Before Quantity**: One well-consolidated memory about a user's core motivation is more valuable than a thousand logs of raw chat history.
- **Meaning Before Chronology**: Relevance is determined by narrative impact, not calendar age.
- **User Agency Over Automation**: The user's direct corrections are absolute and final.
- **Forgetting as Intelligence**: The mark of intelligence is knowing what to discard to maintain focus.
- **Long-Term Understanding Over Complete Recording**: We build a companion, not a camera. We seek to understand the journey, not record every step.

---

## 10. Future Compatibility

This memory policy governs the behavior of all current and future input vectors:

- **Voice**: Spoken dialogues are parsed for semantic experiences and key milestones, while raw audio files and vocal filler are discarded post-processing.
- **Vision**: Captured frames are analyzed for environmental milestones (e.g., books on a desk, design layouts), extracting candidates and deleting raw images.
- **Calendar & Documents**: Extracted data is evaluated for long-term planning and goals, discarding transient invite coordinates and document formatting.
- **Desktop Activity**: Analyzes workspace tasks and active editors to reinforce story progress, ignoring private browser windows, background communications, and system utility activity.
- **Wearables**: Sensor signals are synthesized into behavioral habit streaks (e.g., sleep patterns, stress management), discarding raw physical telemetry streams.
