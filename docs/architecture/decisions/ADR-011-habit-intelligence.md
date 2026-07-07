# ADR-011: Evidence-Based Habit Subsystem

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a model of the user's recurring routines and behavioral patterns.

We need to decide whether to implement habits using traditional gamification mechanisms (such as daily streaks, badges, and scoreboards), proactive reminder systems, or a dedicated, evidence-based pattern observation engine.

---

## Alternatives Considered

### Alternative A: Gamified Streaks and Scoreboards (Engagement Maximization)

Implement streaks, scoring points, and visual achievements (e.g. "10-day coding streak!") to encourage routine adherence.

- **Pros**: High initial user engagement; familiar mechanism.
- **Cons**: Fosters unhealthy pressure and guilt. If the user breaks a streak due to real-world interruptions, they feel demotivated. This prioritizes app engagement over actual real-world growth, violating AKIRA's philosophy.

### Alternative B: Proactive Alert & Reminder Schedulers

Allow the system to send automatic notifications, alarms, and reminders when the user drifts from scheduled work hours.

- **Pros**: Simple scheduling; keeps the user immediately accountable.
- **Cons**: Becomes intrusive and annoying. Proactive prompts often disrupt deep focus, and scheduling automated reminders behaves like a micro-managing boss rather than a teammate.

### Alternative C: Evidence-Based Pattern Observer Subsystem (Selected)

Establish a separate Habit Intelligence Engine that compiles evidence from memories, states, and reflections into a structured Habit Context. Other engines consume this output model directly.

- **Pros**: Focuses on neutral observation, preserves user autonomy, fends off anxiety, keeps database logs clean, and provides a clear, explainable record of verified patterns.
- **Cons**: Requires building logic pipelines to map event updates to pattern models.

---

## Decision

We will implement the Habit Intelligence Engine as a dedicated, evidence-based pattern observation subsystem (Alternative C).

---

## Rationale

### 1. Building Long-Term Trust

Traditional systems use streaks to maximize screen time. AKIRA is designed to support real-world execution. By modeling habits as neutral, evidence-based patterns rather than streaks, the companion remains a supportive, non-judgmental partner.

### 2. Preserving User Autonomy and Decoupling

The companion observes routines but never enforces them. If a user changes their schedule, the companion adapts to the new pattern rather than generating alert warnings or shaming the user for "breaking a streak," honoring the principles defined in [01-companion-philosophy.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-philosophy.md). Additionally, the Habit Intelligence Engine is temporally decoupled from active Reflection consolidation; it consumes only previously finalized Reflection Contexts (archived historical context) from previous sessions to prevent circular dependencies.

### 3. Clear Explainability and Provenance

By linking habits to specific database events (e.g., verifying a "late-evening focus routine" using recorded work sessions), the system remains transparent. The user can view exactly what evidence supports the companion's understanding of their routines. The Habit Context preserves its originating subsystem, supporting evidence, and confidence rating (Provenance Preservation).

### 4. Separation of Concerns

Isolating Habits from raw Memory logs ensures that events represent history while the Habit engine models abstract frequency and probability distributions.

### 5. Evidence Verification

When the user explicitly corrects an inferred habit or routine understanding, this correction is treated as verified evidence. The Habit Intelligence Engine refines its model and updates confidence ratings accordingly, prioritizing this verified evidence in future reasoning while keeping previous inferences explainable.

---

## Consequences

- Other systems must interact with the Habit Intelligence Engine using the primary `Habit Context` output.
- Downstream engines do not need to query historical memory logs to resolve user routines.
- We must define interfaces mapping event categories to corresponding pattern models.
- Habit Engine initialization must load previously archived Reflection Contexts rather than active reflection states.
