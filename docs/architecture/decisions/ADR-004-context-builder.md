# ADR-004: Decoupled Context Builder

## Status

Accepted

## Context

Downstream Large Language Models (LLMs) operate under strict constraints regarding token processing, context limits, and cost. Feeding raw databases or unstructured memories directly into reasoning models causes low-quality responses, high query costs, and dependency on provider-specific APIs.

## Decision

All system, user, and memory telemetry must be assembled into a logical, unified **Context Package** by the **Context Builder** before reaching any downstream reasoning model.

## Reasoning

- **Separation of Concerns**: Decoupling context assembly from AI inference ensures that the logic for selecting memories, filtering out noise (Selective Context), and structuring priorities is fully managed locally.
- **Provider Interchangeability**: Because context packages are formatted as logical structured data rather than LLM-specific prompts, downstream adapters can easily translate the same package for Gemini, OpenAI, or local offline models.
- **Optimization & Selective Omission**: The Context Builder enforces dynamic constraints and prunes irrelevant context (e.g., omitting completed chores during coding tasks) to prevent cognitive noise and control costs.

## Consequences

- The Context Builder must support multiple situational context types (e.g., Working Context, Reflection Context, Planning Context).
- It must act as a filter that ingests candidate memories from the Recall Engine and strips out unrelated details.
- The system remains offline-ready, as context assembly occurs entirely on the local device prior to prompt translation.
