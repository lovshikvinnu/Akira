# Decision Engine Architecture Specification

> [!IMPORTANT]
> **Decision Subsystem Layer**  
> **Version**: 2.24 (Milestone 1)  
> **Status**: Approved Specification  
> **Document**: DecisionEngine.md  
>
> _This document defines the foundational architecture for the GENESIS Decision Engine, establishing immutable domain models, pluggable decision strategies, a deterministic strategy registry, failure-isolated orchestration, and internal contracts for consuming reasoning results._

---

## 1. Purpose

The **Decision subsystem** provides the foundational cognitive capability for deriving structured decision artifacts from reasoning conclusions. Downstream action and capability layers depend on stable decision outputs without needing direct coupling to reasoning strategies, reflection engines, or context assembly mechanisms.

The **Decision Engine** operates purely as an orchestration layer executing pluggable decision strategies. It processes a `ReasoningResult` produced upstream by the Reasoning subsystem and yields an aggregated `DecisionCollection`.

Key architectural principles:
- **Strict Pipeline Decoupling**: Decision consumes only `ReasoningResult`. It does not retrieve context, memories, conversations, databases, workspace state, or planning state directly.
- **Pure Orchestration**: The engine does not make decisions itself, rank outputs, merge artifacts, filter decisions, execute actions, modify plans, or execute LLM calls. It solely orchestrates strategy execution and aggregates outputs.
- **Failure Isolation**: Strategy execution failures are caught and isolated to ensure pipeline stability.
- **Deterministic Execution**: Strategy execution order and artifact aggregation are strictly deterministic.
- **Immutability**: Domain models and output collections are runtime-frozen.

---

## 2. Architectural Boundary & Subsystem Pipeline

The Decision Engine sits strictly downstream from the Reasoning subsystem.

```text
ReasoningResult
      │
      ▼
DecisionEngine
      │
 ┌──────┼──────────────┐
 ▼      ▼              ▼
Strategy Strategy   Strategy
   A        B          C
 └──────┬──────┴────────┘
        ▼
DecisionCollection
```

### Direct Boundary Rules:
- **Consumes**: `ReasoningResult` (packaged output from Reasoning Assembly Service).
- **Produces**: `DecisionCollection` (frozen container of `Decision` objects).
- **Prohibited Data Sources**: Must NOT directly access databases, vector stores, memory graphs, user history, workspace files, active plans, or external APIs. All cognitive insights and conclusions have already been synthesized upstream.

---

## 3. Domain Models & Taxonomy

The domain models are intentionally minimal and free of premature concepts (e.g., confidence scores, probabilities, priorities, timestamps, telemetry, or execution state).

### 3.1. `DecisionType`
A strongly typed taxonomy classification representing the nature of the generated decision:
- **`Recommendation`**: Suggested option or advisory guidance derived from reasoning conclusions.
- **`Choice`**: Specific selection made between evaluated cognitive alternatives.
- **`Deferral`**: Explicit determination to postpone action or await further evidence.

### 3.2. `Decision`
Represents one structured decision artifact.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier for the decision artifact |
| `strategyId` | `string` | ID of the strategy that generated this artifact |
| `type` | `DecisionType` | Taxonomy classification (`Recommendation`, `Choice`, or `Deferral`) |
| `decision` | `string` | The structured decision statement |

### 3.3. `DecisionCollection`
Represents the immutable collection of generated decision artifacts.

| Field | Type | Description |
| :--- | :--- | :--- |
| `decisions` | `readonly Decision[]` | Runtime-frozen array of aggregated `Decision` artifacts |

---

## 4. `DecisionStrategy` Abstraction

`DecisionStrategy` defines a pluggable domain interface for decision algorithms.

```typescript
export interface DecisionStrategy {
  readonly id: string;
  decide(reasoningResult: ReasoningResult): readonly Decision[];
}
```

### Strategy Requirements:
- Must maintain a unique, stable `id`.
- Accepts an immutable `ReasoningResult`.
- Returns zero or more `Decision` objects.
- Does not assume LLM usage, prompt templates, external network calls, or persistence.

---

## 5. `DecisionStrategyRegistry`

`DecisionStrategyRegistry` handles strategy management and ordering without containing any decision logic.

### Responsibilities:
- **Registration**: Registers strategies via `register(strategy: DecisionStrategy)`.
- **Validation**: Rejects null/undefined strategies and strategy instances missing a valid ID.
- **Duplicate Prevention**: Throws an error (`Duplicate strategy ID registered: ${strategy.id}`) if a duplicate strategy ID is registered.
- **Deterministic Ordering**: Exposes registered strategies via `getStrategies()` sorted alphabetically by `id`.
- **Immutability**: Returns a runtime-frozen array of strategy instances (`Object.freeze(sorted)`).

---

## 6. DecisionEngine Orchestration

`DecisionEngine` acts strictly as an orchestration layer.

```typescript
export class DecisionEngine {
  constructor(private readonly registry: DecisionStrategyRegistry) {}

  public execute(reasoningResult: ReasoningResult): DecisionCollection {
    if (!reasoningResult) {
      throw new Error("ReasoningResult is required");
    }

    const strategies = this.registry.getStrategies();
    const aggregated: Decision[] = [];

    for (const strategy of strategies) {
      try {
        const results = strategy.decide(reasoningResult);
        if (results && Array.isArray(results)) {
          for (const item of results) {
            if (item && typeof item === "object" && item.id) {
              const validatedItem: Decision = Object.freeze({
                id: String(item.id),
                strategyId: String(item.strategyId || strategy.id),
                type: item.type as DecisionType,
                decision: String(item.decision || ""),
              });
              aggregated.push(validatedItem);
            }
          }
        }
      } catch (error) {
        // Strategy failure isolation
      }
    }

    return Object.freeze({
      decisions: Object.freeze(aggregated),
    });
  }
}
```

---

## 7. Failure Isolation

If a registered strategy throws an unhandled exception during `decide()` execution:
- Execution continues immediately with the remaining registered strategies.
- The failing strategy's output is omitted from the final collection.
- No error placeholders, dummy objects, or synthetic error artifacts are injected.
- The engine execution pipeline is never terminated by individual strategy failures.

---

## 8. Determinism & Immutability Guarantees

- **Deterministic Execution**: Given identical `ReasoningResult` inputs and strategy configurations, `DecisionEngine` will always yield an identical `DecisionCollection`.
- **Immutability**: Domain properties are defined with TypeScript `readonly` modifiers. Output arrays and decision collection objects are frozen at runtime using `Object.freeze()`. The engine and strategies never mutate the input `ReasoningResult`.

---

## 9. Current Scope & Explicit Non-Responsibilities

### In Scope (Milestone 1 Foundation):
- Immutable Decision domain models (`Decision`, `DecisionCollection`).
- `DecisionType` taxonomy (`Recommendation`, `Choice`, `Deferral`).
- Pluggable `DecisionStrategy` interface.
- Deterministic `DecisionStrategyRegistry`.
- Pure orchestration `DecisionEngine` with failure isolation.
- Unit test suite & architectural documentation.

### Explicitly Out of Scope:
- Concrete decision-making algorithms or rules.
- Action execution, task creation, or goal modification.
- Decision ranking, filtering, or confidence scoring.
- LLM prompt generation or model invocation.
- Database persistence, event emission, or telemetry logging.
