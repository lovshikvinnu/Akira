# ADR-012: Dedicated Retrospective Reflection Subsystem

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a model of user progress, growth, and routine shifts over time (weekly reviews, annual reports, goal completions, etc.).

We need to decide whether to embed reflection logic within the active conversation loop, attach it to memory database write triggers, or isolate it within a dedicated retrospective Reflection Engine subsystem.

---

## Alternatives Considered

### Alternative A: In-Conversation Reflection (Dynamic Evaluation)

Compute progress summaries and trend analysis on-the-fly during active dialogue turns.

- **Pros**: Simple architecture; no background processes needed.
- **Cons**: Introduces severe latency during active conversation. Downstream engines must perform heavy queries across multiple databases (Goals, Habits, Knowledge, Memory) mid-sentence, which slows down the chat interface and degrades the user experience.

### Alternative B: Memory-Triggered Reflection (Database Triggers)

Trigger reflection updates automatically whenever a new memory, event, or checklist item is written to the GENESIS database.

- **Pros**: Keeps reflection context constantly up-to-date.
- **Cons**: Leads to excessive compute overhead. Recalculating long-term trend lines, skill dependencies, and habit stability metrics for every minor task completion wastes processor cycles and slows database write actions.

### Alternative C: Dedicated Retrospective Reflection Engine (Selected)

Establish a separate Reflection Engine that executes asynchronously after active sessions close, consolidating evidence from memories, states, goals, habits, and knowledge into a structured Reflection Context.

- **Pros**: Strict separation of concerns, zero impact on conversation latency, prevents write amplification, ensures consistent summaries, and provides an explainable growth model.
- **Cons**: Requires building triggers to execute reflection cycles at session end.

---

## Decision

We will implement the Reflection Engine as a dedicated retrospective subsystem (Alternative C).

---

## Rationale

### 1. Zero Conversation Latency

Separating reflection from active dialogue ensures that the companion chat remains fast and responsive. Heavy trend queries run after the user finishes their workspace tasks, ensuring that the working context is prepared before the next interaction starts.

### 2. High Explainability, Trust, and Provenance

A dedicated subsystem makes it easy to trace how progress metrics were derived. Citations link observations back to specific, verified events (e.g. confirming a "3-week focus routine" by referencing actual work sessions in the GENESIS database), eliminating speculation or hallucinated claims. The output preserves its originating subsystem, supporting evidence, and confidence rating (Provenance Preservation) for downstream orchestration.

### 3. Long-Term Scalability and Decoupling

As database event logs grow, parsing them at every chat turn is unsustainable. An asynchronous engine runs during downtime and caches summaries, ensuring that downstream engines can read a compact `Reflection Context` instantly. Crucially, **Reflection is temporally decoupled** from active Companion Intelligence: the engine consumes finalized active contexts at session close to produce an immutable archived record. Other subsystems can only consume previously finalized records on subsequent session startups, preventing circular dependency loops.

### 4. Non-Manipulative Design

Reflections are retrospective and evidence-based. By isolating the engine, we ensure that AKIRA reports progress neutrally without injecting gamified badges, pop-up metrics, or attention-grabbing alerts.

### 5. Consistent Temporal Reference

All retrospective intervals and durations are evaluated using a consistent temporal reference supplied by the Companion Platform rather than local clocks, preventing synchronization drift across devices.

---

## Consequences

- Other systems must interact with the Reflection Engine using the primary `Reflection Context` output.
- Downstream engines do not need to parse raw database tables to find trend summaries.
- Downstream subsystems must ingest only previously finalized, archived Reflection Contexts at boot.
- We must establish triggers to run reflection consolidation loops after active sessions close.
