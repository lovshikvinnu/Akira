# Reflection Engine Subsystem Specification

> [!IMPORTANT]
> **Relevance & Reflection Layer**  
> **Version**: 2.22  
> **Status**: Approved Specification  
> **Document**: ReflectionEngine.md
>
> _This document defines the foundational infrastructure for the Reflection Engine, which orchestrates pluggable strategies to generate retrospective insights from assembled context collections, packages them into stable immutable results, and exposes them to downstream capabilities._

---

## 1. Purpose

To build a companion that helps users improve themselves, GENESIS must not only react to current context but also reflect on it. The **Reflection Engine** is the orchestration layer that executes pluggable reflection strategies. It processes raw contextual observations packaged as a `ContextAssemblyResult` and yields aggregated insights.

By structuring the engine around an orchestration and packaging pattern:
- **Strategy Decoupling**: Each reflection strategy executes independently, evaluating specific conceptual dimensions (e.g. goals progress, routine changes) without needing awareness of other strategies.
- **Pure Orchestration**: The engine does not interpret, merge, rank, or transform reflections; it only coordinates executions and aggregates outputs.
- **Stable Consumption Contract**: Downstream consumers (like reasoning engines) consume only a packaged, minimal output wrapper (`ReflectionResult`), shielding them from internal strategy registries and orchestration logic.

---

## 2. Subsystem Component Responsibilities

The subsystem comprises four primary classes/interfaces:

```
  ┌─────────────────────────────────────────────────────────────┐
  │                       ReflectionEngine                      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
        ┌────────────────────────┴────────────────────────┐
        ▼ (Retrieve Strategies)                           ▼ (Orchestrate & Aggregates)
  ┌───────────────────────────┐                     ┌──────────────────────────┐
  │ReflectionStrategyRegistry │                     │ ContextAssemblyResult    │
  └───────────────────────────┘                     └──────────────────────────┘
                                                                  │
                                                                  ▼ (Concatenate Outputs)
  ┌────────────────────────────────────────────────────────────────────────────────────┐
  │                       Registered Pluggable Reflection Strategies                   │
  │     [ Strategy A ]              [ Strategy B ]              [ Strategy C ]         │
  └────────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (ReflectionCollection)
  ┌─────────────────────────────────────────────────────────────┐
  │                  ReflectionAssemblyService                  │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼ (Exposes)
  ┌─────────────────────────────────────────────────────────────┐
  │                       ReflectionResult                      │
  │           (Public downstream consumption boundary)          │
  └─────────────────────────────────────────────────────────────┘
```

### 2.1. ReflectionEngine
- **Coordinates Execution**: Accepts a `ContextAssemblyResult`, requests active strategies from the registry, and invokes them sequentially.
- **Aggregates Results**: Concatenates produced reflection items into a single, unified `ReflectionCollection`.
- **Isolates Failures**: Ensures strategy errors do not crash the engine or affect other strategy executions.
- **Maintains Purity**: Acts as a strict orchestrator without evaluating, parsing, or altering generated insights.

### 2.2. ReflectionStrategyRegistry
- **Manages Plugs**: Registers reflection strategies, rejecting duplicate strategy IDs.
- **Maintains Registry Order**: Exposes registered strategies sorted alphabetically by ID.

### 2.3. ReflectionStrategy (Interface)
- **Defines reflective contract**: Exposes `id` and `reflect(context): readonly Reflection[]`.
- **Abstracts AI details**: The signature does not assume or require LLM execution, allowing rule-based, database-spliced, or external service strategies.

### 2.4. ReflectionAssemblyService
- **Packages reflections**: Ingests a raw `ReflectionCollection` and packages it into a `ReflectionResult`.
- **Preserves Ordering**: Ensures that reflection ordering is strictly preserved exactly as aggregated by the Reflection Engine.
- **No Transformations**: Performs no filtering, sorting, or content modification.

---

## 3. Domain Models & Taxonomy

All models remain intentionally minimal. Extensible containers and generic metadata fields are excluded to maintain strict boundaries.

### 3.1. ReflectionType
A strongly typed taxonomy classification representing the nature of the generated insight:
- **`Observation`**: Factual statement directly extracted from individual context items.
- **`Pattern`**: Multi-item grouping identifying repeated themes or recurring structures.
- **`Contradiction`**: Directly conflicting information detected between context items.

### 3.2. Reflection
Represents a single reflection insight.
- `id` (string): Unique reflection identifier.
- `strategyId` (string): Strategy that generated the reflection.
- `type` (ReflectionType): Taxonomy classification.
- `insight` (string): A structured tag or payload (e.g. `pattern:type-recurrence:goal` or `conflict:prov-a:prov-b`).

> [!IMPORTANT]
> **No Natural-Language Formatting**: Insights are stored as structured domain keys or raw values. Natural-language formatting and presentation templates are strictly the responsibility of downstream presentation and reasoning layers.

### 3.3. ReflectionCollection
The raw output of the engine orchestration.
- `reflections` (readonly Reflection[]): A frozen list of reflections.

### 3.4. ReflectionResult
The final packaged output of the Reflection subsystem.
- `items` (readonly Reflection[]): The packaged array of reflections.
- Exposes only the reflections list; no metadata, telemetry, diagnostics, or statistics.

---

## 4. Built-in Pluggable Strategies

To validate the reflection pipeline architecture, GENESIS implements three built-in deterministic strategies:

### 4.1. ObservationReflectionStrategy
- **Strategy ID**: `observation-strategy`
- **Responsibility**: Maps individual context items directly into structured reflections of type `Observation`. It records facts exactly as presented in each candidate's normalized fields without natural-language summary or semantic mutation.

### 4.2. PatternReflectionStrategy
- **Strategy ID**: `pattern-strategy`
- **Responsibility**: Evaluates the complete `ContextAssemblyResult` to identify matching attributes or duplicate categories. For this milestone, it groups candidate contexts by their type, flagging a pattern of type recurrence if a context type appears two or more times.

### 4.3. ContradictionReflectionStrategy
- **Strategy ID**: `contradiction-strategy`
- **Responsibility**: Detects directly conflicting content between context items. It compares candidates sharing matching normalized `id` fields. If their contents are different, it flags a deterministic contradiction and exposes the conflicting source provider IDs.

---

## 5. Public Subsystem Boundary & Consumption Contract

To prevent architectural leakage, GENESIS defines a strict boundary for the Reflection subsystem:

- **Official Output Contract**: `ReflectionResult` is the official output contract exposed to future subsystems.
- **Reasoning Isolation**: Downstream systems (e.g., a Reasoning Engine) must consume only `ReflectionResult` and must **not** depend on `ReflectionEngine`, `ReflectionStrategy`, `ReflectionStrategyRegistry`, or individual built-in strategies.

---

## 6. Flow Diagram

The complete end-to-end Reflection pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Caller / Reasoning Engine
    participant RE as ReflectionEngine
    participant RSR as ReflectionStrategyRegistry
    participant RS as ReflectionStrategy
    participant RAS as ReflectionAssemblyService

    Caller->>RE: execute(ContextAssemblyResult)
    RE->>RSR: getStrategies()
    RSR-->>RE: sorted strategies (by strategy id)
    
    loop For each strategy
        RE->>RS: reflect(ContextAssemblyResult)
        alt Success
            RS-->>RE: Reflection[]
            Note over RE: Validate and Object.freeze each item
        else Strategy Exception / Crash
            Note over RE: Isolate error; ignore crash; omit output
        end
    end

    Note over RE: Concatenate all items in registry execution order
    RE-->>Caller: ReflectionCollection (Immutable)

    Caller->>RAS: assemble(ReflectionCollection)
    Note over RAS: Package without recreating Reflection instances
    Note over RAS: Object.freeze(ReflectionResult)
    RAS-->>Caller: ReflectionResult (Immutable Contract)
```

---

## 7. Subsystem Guarantees

### 7.1. Execution & Ordering Preservation
The order of reflection items is guaranteed to be completely deterministic:
1. Active strategies are executed alphabetically by their unique strategy ID.
2. The outputs from each strategy are appended sequentially.
3. No sorting or ranking is applied to the final aggregated collection.
4. `ReflectionAssemblyService` packages this collection directly into the `ReflectionResult`, preserving the exact order without modification.

### 7.2. Failure Isolation
If any strategy throws an exception:
1. The error is intercepted and isolated.
2. The failing strategy's reflections are omitted (no placeholder error objects are created).
3. The remaining strategies execute and compile their insights normally.

### 7.3. Runtime Immutability
Immutability is enforced at runtime by deep compile-time `readonly` constraints and runtime `Object.freeze` applied to the `ReflectionCollection` container, `ReflectionResult`, arrays, and individual `Reflection` item objects.
