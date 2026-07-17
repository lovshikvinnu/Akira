# ADR-014: Dedicated Initiative Subsystem and Silence-by-Default Design

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a method to decide when to take proactive actions (such as suggesting task links, asking clarifying questions, or displaying reminders).

We need to decide whether to distribute proactive decision-making across the individual engines, let the conversational AI model determine proactivity dynamically inside prompts, or isolate proactivity within a dedicated, conservative Initiative Engine subsystem.

---

## Alternatives Considered

### Alternative A: Distributed Proactivity (Self-Initiated Alerts)

Allow each specialized engine (e.g. Goal, Habit, Knowledge) to trigger user-facing prompts or alerts directly when specific thresholds are met.

- **Pros**: Direct and simple implementation; avoids building a central decision gateway.
- **Cons**: Leads to prompt fatigue and user annoyance. Without a central controller, multiple engines might trigger interventions simultaneously, interrupting focus and degrading trust.

### Alternative B: Prompts-Driven Proactivity (LLM-Decided)

Feed raw context data to the conversational model and allow the LLM to decide on-the-fly when to initiate dialogue or show notifications.

- **Pros**: Simplifies system logic by delegating proactivity checks to the language model.
- **Cons**: Fosters unpredictable, engagement-maximizing behaviors. Conversational models are typically trained to maintain chat loops and keep users talking. This results in unnecessary prompts, notifications that disrupt deep work, and high token costs. It also makes it impossible to explain or guarantee silence since decisions are probabilistic.

### Alternative C: Centralized Conservative Initiative Subsystem (Selected)

Establish a separate, deterministic Initiative Engine that ingests Resolved Context, evaluates interventions, and exposes a structured Initiative Decision. By default, the engine chooses "No Action" (Silence) unless evidence for an intervention is strong and user focus is clear.

- **Pros**: Protects user focus, enforces a non-intrusive character, guarantees explainability, and separates decision logic from dialogue generation.
- **Cons**: Requires building a centralized evaluation loop.

---

## Decision

We will implement the Initiative Engine as a dedicated centralized subsystem with a "Silence-by-Default" design (Alternative C).

---

## Rationale

### 1. Protecting User Autonomy and Focus

In accordance with [01-companion-philosophy.md](file:///C:/Users/lovsh%5CDesktop%5CProject%20Akira%20Master%5CAKIRA%5Cdocs%5Carchitecture%5Ccompanion-core%5C01-companion-philosophy.md), AKIRA prioritizes user execution over screen time. By isolating initiative and setting "Silence" as the default state, we ensure the companion does not disrupt deep focus work.

### 2. High Trust and Non-Manipulative Design

Traditional systems use popups and streak notifications to maximize app engagement. AKIRA builds long-term trust. The Initiative Engine evaluates interventions purely based on objective context factors (e.g. return states, goal blockers), avoiding gamified hooks or artificial urgency.

### 3. Clear Explainability

By isolating proactive decisions, we make interventions auditable. The system can trace exactly why a suggestion or question was triggered (e.g. matching a specific goal blocker context), ensuring transparency.

### 4. Separation of Concerns

Exposing a single, unified `Initiative Decision` output decouples proactivity logic from response generation. Downstream dialogue systems focus on _how_ to communicate; the Initiative Engine determines _if_ communication is appropriate.

---

## Consequences

- Other systems must interact with the Initiative Engine using the primary `Initiative Decision` output.
- Downstream prompt compilers do not need to evaluate notification or pop-up triggers.
- Silence is preferred over premature action.
- We must establish triggers to evaluate initiative options when the Resolved Context updates.
