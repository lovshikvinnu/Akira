# ADR-006: Deterministic Presence Subsystem

## Status

Proposed

## Context

As we establish the Companion Intelligence Layer for AKIRA, the companion requires context on user presence (including current session mode, return state, elapsed time gaps, and continuity parameters).

One approach is to forward raw event logs directly to a cognitive inference engine (such as a large language model or heuristic classifier) at runtime to analyze and deduce these states dynamically. Another approach is to parse these variables using a local, deterministic rules engine.

## Decision

We will construct the Presence Engine as a deterministic rules-based subsystem, executing local mathematical and calendar-based checks, and completely bypass runtime cognitive inference cycles.

### Rationale

1. **Zero Latency and Resource Efficiency**: Real-time evaluation of user presence must occur instantly as events register. Executing deterministic logic takes less than a millisecond. Conversely, routing data through a cognitive model introduces significant latency, consumes network/processor resources, and limits interface responsiveness.
2. **Offline-First Resilience**: A core principle of the system is the ability to operate offline without external intelligence calls. By using local deterministic rules, presence calculations remain fully active even in isolated environments with zero connectivity.
3. **No Incremental Processing Cost**: Applying logic gates and timestamp comparisons locally incurs no transactional or network token processing cost, keeping operating costs zero.
4. **Predictability and Alignment**: Cognitive inference is probabilistic and prone to inconsistency. A deterministic engine ensures that return states (e.g., differentiating between a same-day return and a next-day return) are evaluated consistently using exact, reproducible thresholds.
5. **Decoupled Architecture**: By computing a structured, deterministic representation of presence first, other subsystems can consume this context directly. This simplifies the inputs needed for downstream cognitive processes, keeping prompts short and simple.

## Consequences

- Other intelligence subsystems can rely on a consistent, predictable presence context structure.
- Adjustments to temporal thresholds (e.g. defining time periods or access hours) must be updated in local configurations rather than prompt adjustments.
- Introspective behaviors, like emotional evaluation, are completely excluded from this subsystem.
