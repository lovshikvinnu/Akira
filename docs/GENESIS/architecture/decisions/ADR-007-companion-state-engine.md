# ADR-007: Ephemeral Session-Scoped Companion State Layer

## Status

Proposed

## Context

During an active companion session, the system must maintain a representation of the user's immediate working context (such as the active project, current focus, and unresolved conversational topics).

We need to decide where this active context is modeled and maintained.

---

## Alternatives Considered

### Alternative A: Extending GENESIS (Persistent Event Logs)

Write every change in conversational topic, focus shift, and workspace event directly to the long-term memory engine (GENESIS) as persistent history logs. Downstream context builders would query these historical tables to reconstruct the active state.

- **Pros**: Simple write path; leverages existing database structures.
- **Cons**: Introduces high database write amplification, recording transient shifts (e.g., brief focus pivots) that have no long-term value. This results in database bloat and slows down semantic recall queries.

### Alternative B: Maintaining No State (Stateless Prompting)

Do not maintain an active state layer. Each user turn is evaluated independently. Context builders assemble data from scratch at every turn by querying the event log and workspace indices.

- **Pros**: Simple runtime architecture; zero state synchronization issues.
- **Cons**: Dialogue systems become contextually blind between turns. It becomes extremely difficult to track unresolved questions, follow-up topics, or focus shifts without passing massive event logs to reasoning engines, which increases processing latency.

### Alternative C: Ephemeral Session-Scoped State Layer (Selected)

Establish a volatile, session-scoped runtime state engine. This engine initializes at session start, evolves dynamically in memory during interactions, and expires naturally when the session terminates. Only the final summary is passed to the database via Reflection.

- **Pros**: Keeps database logs clean, prevents write amplification, ensures fast context evaluations, and isolates runtime variables from long-term memory.
- **Cons**: Requires synchronization between workspace inputs, dialogue streams, and the active state model.

---

## Decision

We will implement the Companion State Engine as an ephemeral, session-scoped runtime layer (Alternative C).

---

## Rationale

### 1. Separation of Concerns

Long-term memory (GENESIS) stores what the user _has achieved_ over days, weeks, and months. The Companion State Engine tracks what the user is _doing right now_. Keeping these concerns separate ensures that runtime state updates do not pollute historical databases.

### 2. Long-Term Scalability

Storing transient, minute-by-minute focus shifts as permanent database records would degrade performance over time. An ephemeral memory layer ensures that only consolidated session summaries are committed to long-term memory during Reflection, keeping the database slim and quick to query.

### 3. Maintainability & Explainability

An isolated, volatile model makes debugging simple. Developers and diagnostic systems can inspect the companion's current working context directly without parsing through historic databases or analyzing complex logs.

### 4. Dynamic Refinement

A volatile layer allows the active context to adapt quickly. As the user pivots focus, the state updates in memory instantly. If the session is interrupted, continuity rules restore the state, providing a smooth user experience.

---

## Consequences

- Downstream context builders can query the ephemeral State Engine directly.
- All data inside the State Engine is volatile and will be lost upon session termination unless explicitly summarized and committed during the Reflection phase.
- Systems must handle state initialization and recovery patterns cleanly.
