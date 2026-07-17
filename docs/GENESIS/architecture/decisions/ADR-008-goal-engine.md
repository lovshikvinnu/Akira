# ADR-008: Dedicated Goal Subsystem

## Status

Proposed

## Context

In building the Companion Intelligence Layer for AKIRA, we must maintain a structured model of the user's objectives (goals, milestones, progress, and dependencies).

We need to decide whether to embed goals within existing architecture structures (such as Memory, Identity, or Projects) or isolate them as a dedicated architectural subsystem.

---

## Alternatives Considered

### Alternative A: Embedding Goals in Memory (GENESIS)

Treat goals as standard semantic event logs or memory nodes in the GENESIS database. Progress tracking would query the memory timeline to extract active goals.

- **Pros**: Simple schema design; avoids introducing a new engine.
- **Cons**: Memory is historical and immutable, whereas goals are future-oriented, hierarchical, and dynamic. Querying and updating hierarchies in a flat memory log is inefficient and error-prone.

### Alternative B: Embedding Goals in Identity

Treat goals as static character traits or aspirations stored in the Identity Layer.

- **Pros**: Captures the alignment between user values and goals.
- **Cons**: Identity traits evolve slowly based on long-term patterns, whereas goals change frequently. Blending them makes it difficult to track immediate milestone completions and progress metrics.

### Alternative C: Embedding Goals in Projects

Associate goals strictly with workspace project entries (e.g. treating goals as project checklists).

- **Pros**: Direct integration with project workspaces.
- **Cons**: Goals often span multiple projects or exist independent of a workspace (e.g. learning a language, physical training). Projects are workspace containers; goals represent user intention.

### Alternative D: Dedicated Goal Engine Subsystem (Selected)

Establish a separate Goal Engine subsystem. The engine maintains a dedicated Goal Context that consumes state variables, matches them against historical memories, and exports an intention model to downstream engines.

- **Pros**: Strict separation of concerns, supports cross-project goals, enables clear progress calculations, and isolates intention from both history (Memory) and character (Identity).
- **Cons**: Requires mapping inputs from multiple subsystems (State, Identity, Memory).

---

## Decision

We will implement the Goal Engine as a dedicated architectural subsystem (Alternative D).

---

## Rationale

### 1. Separation of Concerns

Isolating Goals from Memory and Identity ensures that each engine remains focused on its core responsibility:

- Memory (GENESIS) stores the _past_.
- Companion State tracks the _present_.
- Goal Engine tracks the _future path_.
- Identity models the _user's character_.

### 2. Multi-Project & Workspace Independence

Goals are not always limited to a single workspace project. A dedicated Goal Engine allows the companion to track goals that cross project boundaries or address personal habits, maintaining a unified view of user progress.

### 3. Clear Integration Depth

A separate engine makes it easy to integrate with other subsystems. The Initiative Engine can evaluate goal blockers to trigger check-ins, the Reflection Engine can evaluate session metrics against active goals, and the Context Builder can inject priority goals into prompt context packages.

### 4. Explainable Progress

A dedicated subsystem makes it easy to trace how a specific workspace action contributed to goal completion, improving system transparency.

---

## Consequences

- Other systems must interact with the Goal Engine using the primary `Goal Context` output.
- Downstream engines do not need to query project or memory tables to find goals.
- We must define interfaces mapping workspace updates to goal progress calculations.
