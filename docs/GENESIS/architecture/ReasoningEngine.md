# Reasoning Engine Architecture Specification

> [!IMPORTANT]
> **Reasoning Subsystem Layer**  
> **Version**: 2.23 (Milestone 3)  
> **Status**: Approved Specification  
> **Document**: ReasoningEngine.md  
>
> _This document defines the complete architecture for the GENESIS Reasoning Engine, establishing immutable domain models, pluggable deterministic reasoning strategies, strategy registry, failure-isolated orchestration, assembly packaging layer, and public output contracts for downstream cognitive capabilities._

---

## 1. Purpose

The **Reasoning subsystem** provides the foundational cognitive capability for deriving structured reasoning conclusions from retrospective reflections. Downstream cognitive subsystems depend on stable reasoning outputs without needing direct coupling to reflection strategies, orchestration engines, or context assembly mechanisms.

The subsystem processes a `ReflectionResult` produced upstream by the Reflection subsystem, executes registered reasoning strategies, aggregates results into a `ReasoningCollection`, and packages them via `ReasoningAssemblyService` into the official public contract: **`ReasoningResult`**.

```text
ReflectionResult
       ↓
ReasoningEngine
       ↓
Reasoning Strategies
       ↓
ReasoningCollection
       ↓
ReasoningAssemblyService
       ↓
ReasoningResult
```

> [!NOTE]
> **Foundational Deterministic Strategies**: The built-in strategies (`DeductiveReasoningStrategy`, `ImplicationReasoningStrategy`, `SynthesisReasoningStrategy`) are foundational deterministic rule-based strategies operating directly over normalized reflection structures. They are **not** an LLM-powered general reasoning system or natural-language guesser.

Key architectural principles:
- **Strict Pipeline Decoupling**: Reasoning consumes only `ReflectionResult`. It does not retrieve memories, context, conversations, workspace state, goals, or database entities directly.
- **Pure Orchestration**: The engine does not interpret reflections, rank outputs, merge artifacts, filter conclusions, rewrite text, or execute LLM calls. It solely orchestrates strategy execution and aggregates outputs.
- **Packaging Boundary**: `ReasoningAssemblyService` acts as a pure packaging layer converting `ReasoningCollection` into `ReasoningResult`.
- **Public Output Contract**: Future downstream capabilities consume `ReasoningResult` only, remaining decoupled from internal strategy registries and engines.
- **Failure Isolation**: Strategy execution failures are caught and isolated to ensure pipeline stability.
- **Deterministic Execution & Ordering**: Strategy execution order and artifact aggregation strictly preserve sequence without sorting or ranking.
- **Immutability**: Domain models and public output contracts are runtime-frozen.

---

## 2. Architectural Boundary & Complete Subsystem Pipeline

The Reasoning Engine sits strictly downstream from the Reflection subsystem and exposes its output contract to downstream capabilities.

```text
ReflectionResult
        │
        ▼
ReasoningEngine
        │
 ┌──────┼──────────────┐
 ▼      ▼              ▼
Deduction  Implication  Synthesis
 Strategy   Strategy    Strategy
 └──────┬──────┴────────┘
        ▼
ReasoningCollection
        │
        ▼
ReasoningAssemblyService
        │
        ▼
ReasoningResult
        │
        ▼
Future Downstream Cognitive Capability
```

### Direct Boundary Rules:
- **Consumes**: `ReflectionResult` (packaged output from Reflection Engine).
- **Exposes Public Contract**: `ReasoningResult` (packaged output from `ReasoningAssemblyService`).
- **Public Consumption Boundary**: Downstream cognitive capabilities must consume `ReasoningResult`. They must NOT depend directly on `ReasoningEngine`, `ReasoningStrategy`, `ReasoningStrategyRegistry`, or individual strategy implementations.
- **Prohibited Data Sources**: Must NOT directly access databases, vector stores, memory graphs, user history, workspace files, active plans, or external APIs. All contextual information and retrospective observations have already been synthesized upstream.

---

## 3. Domain Models & Public Contract

The domain models remain minimal and free of premature concepts (e.g., confidence scores, probabilities, rankings, explanations, timestamps, token counts, or LLM metadata).

### 3.1. `ReasoningType`
A strongly typed taxonomy classification representing the nature of the generated reasoning conclusion:
- **`Deduction`**: Direct conclusion deterministically derived from structured reflection artifacts.
- **`Implication`**: Explicit implication derived directly from relationships present in normalized reflection data.
- **`Synthesis`**: Higher-level conclusion combining multiple related reflections with explicit shared domain keys.

### 3.2. `Reasoning`
Represents one structured reasoning artifact.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier for the reasoning artifact |
| `strategyId` | `string` | ID of the strategy that generated this artifact |
| `type` | `ReasoningType` | Taxonomy classification (`Deduction`, `Implication`, or `Synthesis`) |
| `conclusion` | `string` | Structured, machine-readable conclusion statement |

### 3.3. `ReasoningCollection`
Represents the intermediate immutable collection of generated reasoning artifacts produced by `ReasoningEngine`.

| Field | Type | Description |
| :--- | :--- | :--- |
| `reasoning` | `readonly Reasoning[]` | Runtime-frozen array of aggregated `Reasoning` artifacts |

### 3.4. `ReasoningResult` (Public Output Contract)
Represents the official public output contract exposed to downstream cognitive capabilities.

| Field | Type | Description |
| :--- | :--- | :--- |
| `items` | `readonly Reasoning[]` | Runtime-frozen array of public `Reasoning` artifacts |

---

## 4. `ReasoningAssemblyService`

`ReasoningAssemblyService` is responsible for packaging a `ReasoningCollection` into a `ReasoningResult`.

```typescript
export class ReasoningAssemblyService {
  public assemble(collection: ReasoningCollection): ReasoningResult {
    if (!collection) {
      throw new Error("ReasoningCollection is required");
    }

    const items = collection.reasoning ? collection.reasoning : Object.freeze([]);

    return Object.freeze({
      items: Object.isFrozen(items) ? items : Object.freeze([...items]),
    });
  }
}
```

### Packaging Responsibilities & Constraints:
- **Ordering Preservation**: Preserves the exact ordering generated by `ReasoningEngine`.
- **Instance Reuse**: Reuses existing `Reasoning` object instances directly (reference equality).
- **No Transformations**: Performs **no** filtering, ranking, deduplication, reordering, merging, interpretation, or summarization.
- **Immutability**: Produces a runtime-frozen `ReasoningResult` object containing a frozen `items` array.
- **Decoupled Architecture**: Exported as a standard class. Dependency injection and wiring remain the responsibility of the composition root.

---

## 5. `ReasoningStrategy` Abstraction & Built-in Strategies

`ReasoningStrategy` defines a pluggable domain interface for reasoning algorithms.

```typescript
export interface ReasoningStrategy {
  readonly id: string;
  reason(reflectionResult: ReflectionResult): readonly Reasoning[];
}
```

### Built-in Deterministic Strategies:

1. **`DeductiveReasoningStrategy`** (`deductive-strategy`):
   - Derives direct conclusions from structured `Pattern` reflections (`deduction:pattern:<payload>`). Returns empty array if evidence is insufficient.
2. **`ImplicationReasoningStrategy`** (`implication-strategy`):
   - Identifies explicit implications directly from normalized `Contradiction` reflections (`implication:divergence:<providers>`). Does not introduce planning/action semantics.
3. **`SynthesisReasoningStrategy`** (`synthesis-strategy`):
   - Synthesizes 2 or more reflections sharing explicit domain key tokens (`synthesis:co-occurrence:<key>:<sorted_ref_ids>`).

---

## 6. Strategy Registry & `createDefaultStrategyRegistry`

`ReasoningStrategyRegistry` handles strategy management and deterministic ordering.

`createDefaultStrategyRegistry()` instantiates a registry pre-populated with:
1. `DeductiveReasoningStrategy` (`id`: `deductive-strategy`)
2. `ImplicationReasoningStrategy` (`id`: `implication-strategy`)
3. `SynthesisReasoningStrategy` (`id`: `synthesis-strategy`)

Strategies are sorted alphabetically by `id` upon retrieval via `getStrategies()`, ensuring deterministic execution order.

---

## 7. Failure Isolation

If a registered strategy throws an unhandled exception during `reason()` execution:
- Execution continues immediately with remaining registered strategies.
- The failing strategy's output is omitted from the final collection.
- No error placeholders or synthetic artifacts are injected.
- Pipeline execution is never halted by strategy failures.

---

## 8. Determinism & Immutability Guarantees

- **Deterministic Execution**: Given identical `ReflectionResult` inputs and strategy configurations, the pipeline produces identical `ReasoningResult` outputs with stable IDs and sequence.
- **Immutability**: All domain properties use `readonly` keywords, and output arrays, collections, and result wrappers are frozen using `Object.freeze()`. Input `ReflectionResult` objects are never mutated.

---

## 9. Current Scope & Explicit Non-Responsibilities

### In Scope (Milestone 3 Complete):
- Immutable Reasoning domain models, `ReasoningType`, and public `ReasoningResult` contract.
- Pluggable `ReasoningStrategy` interface.
- Deterministic `ReasoningStrategyRegistry` and `createDefaultStrategyRegistry()`.
- Built-in `DeductiveReasoningStrategy`, `ImplicationReasoningStrategy`, and `SynthesisReasoningStrategy`.
- Pure orchestration `ReasoningEngine` with failure isolation.
- Packaging `ReasoningAssemblyService`.
- Full unit test suite & architecture documentation.

### Explicitly Out of Scope:
- Reasoning ranking, confidence scoring, or deduplication.
- LLM reasoning, prompt generation, or vector search embeddings.
- Planning, decision execution, or action selection.
- Database persistence, event emission, or telemetry logging.
