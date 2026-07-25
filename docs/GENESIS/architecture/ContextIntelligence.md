# Context Intelligence Subsystem Specification

> [!IMPORTANT]
> **Companion Intelligence Layer**  
> **Version**: 2.21  
> **Status**: Approved Specification  
> **Document**: ContextIntelligence.md
>
> _This document defines the Context Intelligence subsystem, which retrieves candidate context from registered providers, scores their relevance using strategies, filters them via selection policies, and aggregates the final output into a deterministic, immutable assembly result._

---

## 1. Purpose

For the GENESIS AI companion to maintain a structured, coherent, and highly relevant understanding of the user's workflow, it must ingest contextual data dynamically. The **Context Intelligence** subsystem implements a pipeline that separates data retrieval, relevance analysis, selection, and packaging:

$$\text{Retrieve} \longrightarrow \text{Score} \longrightarrow \text{Select} \longrightarrow \text{Assemble}$$

By separating these steps:
- **Retrievers** do not need to know how their context is prioritized or parsed.
- **Strategies** score single relevance aspects (like workspace alignment or goals) independently.
- **Policies** define inclusion thresholds and limits without hardcoding business rules in the service.
- **Downstream consumer services** receive a clean, minimal package of contexts optimized for downstream consumption.

---

## 2. Subsystem Component Responsibilities

The Context Intelligence pipeline is composed of three sequential subsystems:

```
  ┌──────────────────────────────┐
  │ 1. Context Retrieval Stage   │ ──► [ContextCollection]
  └──────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │  2. Relevance Scoring Stage  │ ──► [ScoredContextCollection]
  └──────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │ 3. Selection & Assembly Stage│ ──► [ContextAssemblyResult]
  └──────────────────────────────┘
```

### 2.1. Context Retrieval Stage
- **ContextIntelligenceService**: Ingests a `ContextRequest`, fetches registered providers from the registry, executes them concurrently in a failure-isolated loop, aggregates outcomes, and returns a frozen `ContextCollection`.
- **ContextProviderRegistry**: Registers retrieval sources, rejects duplicate provider IDs, and exposes providers sorted alphabetically.
- **ContextProvider (Interface)**: Defines the retrieval interface (`id` and `retrieve(request)` method).

### 2.2. Relevance Scoring Stage
- **RelevanceEngine**: Receives a `ContextRequest` and a `ContextCollection`, iterates over the candidate contexts, runs them through active relevance strategies, aggregates scores, clamps them, and returns a sorted `ScoredContextCollection`.
- **RelevanceStrategyRegistry**: Manages active strategies, preventing duplicate strategy IDs and exposing them alphabetically.
- **RelevanceStrategy (Interface)**: Defines evaluation contract (`id` and `evaluate(request, candidate)`).
- **DefaultRelevanceStrategy**: A lexical substring match strategy, intended strictly for **architectural validation only** (not for production relevance calculation).
- **ScoreAggregator (Interface)**: Combines strategy scores. `AverageScoreAggregator` acts as the default arithmetic mean aggregator.

### 2.3. Selection & Assembly Stage
- **ContextAssemblyService**: Coordinates the final selection step. Ingests a `ScoredContextCollection`, delegates filtering to a `SelectionPolicy`, packages the selected subset, and returns an immutable `ContextAssemblyResult`. It preserves the exact ordering of candidate contexts from the scoring stage.
- **SelectionPolicy (Interface)**: Interface contract defining how scored items are selected (`select(scoredContexts)`).
- **ThresholdSelectionPolicy**: An implementation of `SelectionPolicy` that filters scored contexts based on a configurable minimum relevance threshold (`score >= threshold`).

---

## 3. Domain Models

All domain models are designed to be intentionally minimal. They contain no planning logic, token budgeting metrics, or prompt templates.

### 3.1. ContextRequest (Retrieval/Scoring input)
- `query` (string): Search query or conversational prompt.
- `options` (Record<string, unknown>, optional): Arbitrary provider arguments.

### 3.2. CandidateContext (Retrieval output)
- `id` (string): Unique context identifier.
- `providerId` (string): Originating provider ID.
- `type` (string): Category tag (e.g. `goal`, `habit`).
- `content` (string): Raw text/data payload.
- `metadata` (Record<string, unknown>, optional): Provider-specific details.

### 3.3. ContextCollection (Retrieval output / Scoring input)
- `contexts` (readonly CandidateContext[]): Frozen list of candidate contexts.

### 3.4. ScoredContext (Scoring output)
- `context` (CandidateContext): The underlying context candidate.
- `score` (number): Clamped, aggregated score `[0.0, 1.0]`.

### 3.5. ScoredContextCollection (Scoring output / Assembly input)
- `scoredContexts` (readonly ScoredContext[]): Frozen, sorted list of scored contexts.

### 3.6. SelectedContext (Assembly output item)
- `context` (CandidateContext): The selected context item.
- `score` (number): The relevance score.

### 3.7. ContextAssemblyResult (Assembly output)
- `items` (readonly SelectedContext[]): Frozen list of selected contexts, maintaining the Relevance Engine's sorting.
- Renamed from `ContextPackage` to prevent name clashes with legacy, unrelated packages in GENESIS.

---

## 4. Architectural Boundaries & Purity

Both service implementations, registries, policies, and aggregators are architectural pure-functions:
- **No Database Queries**: All context originates strictly from the registry-provided interfaces.
- **No Caching / Memoization**: Every call computes outcomes fresh to maintain deterministic outputs.
- **No Telemetry, Metrics, or Logging**: Provider/strategy exceptions are caught and suppressed at boundaries.
- **No Prompt Assembly or Token Budgeting**: No templates, token counts, or truncation calculations.
- **No Event Publication**: Does not write to event queues or trigger downstream event handlers.

---

## 5. Flow Diagram

The complete end-to-end Context Retrieval, Relevance, and Selection/Assembly pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Caller / Composition Root
    participant CIS as ContextIntelligenceService
    participant CPR as ContextProviderRegistry
    participant RE as RelevanceEngine
    participant RSR as RelevanceStrategyRegistry
    participant CP as ContextProvider
    participant RS as RelevanceStrategy
    participant SA as ScoreAggregator
    participant CAS as ContextAssemblyService
    participant SP as SelectionPolicy

    Caller->>CIS: retrieveContext(request)
    CIS->>CPR: getProviders()
    CPR-->>CIS: sorted providers
    loop For each provider
        CIS->>CP: retrieve(request)
        alt Success
            CP-->>CIS: CandidateContext[]
        else Exception
            Note over CIS: Isolate error; exclude results
        end
    end
    Note over CIS: Sort alphabetically & freeze
    CIS-->>Caller: ContextCollection (Immutable)

    Caller->>RE: scoreContext(request, ContextCollection)
    RE->>RSR: getStrategies()
    RSR-->>RE: sorted strategies
    loop For each candidate in ContextCollection
        loop For each strategy
            RE->>RS: evaluate(request, candidate)
            alt Success
                RS-->>RE: score (number)
            else Exception
                Note over RE: Isolate error; default to 0.0
            end
        end
        RE->>SA: aggregate(scores)
        SA-->>RE: aggregated score
        Note over RE: Clamp score to [0.0, 1.0]
    end
    Note over RE: Sort by score (desc), providerId (asc), id (asc)
    RE-->>Caller: ScoredContextCollection (Immutable)

    Caller->>CAS: assemble(ScoredContextCollection)
    Note over CAS: Delegate filtering to injected policy
    CAS->>SP: select(scoredContexts)
    SP-->>CAS: filtered scoredContexts (retains order)
    Note over CAS: Map to SelectedContext & Object.freeze
    CAS-->>Caller: ContextAssemblyResult (Immutable)
```

---

## 6. Implementation Policies & Guarantees

### 6.1. Determinism & Ordering Policy
Given identical requests, active registries, and provider outputs, the `ContextAssemblyResult` is mathematically guaranteed to be identical.

The sorting order is strictly established at the **Relevance Engine** stage and preserved exactly by the **Selection & Assembly** stage (which must never reorder items):
1. **Score**: Sorted descending.
2. **Provider ID**: Sorted alphabetically (ascending).
3. **Context ID**: Sorted alphabetically (ascending).

### 6.2. Threshold Validation
The `ThresholdSelectionPolicy` validates its input threshold parameter in its constructor:
- Values must reside inside the normalized `[0.0, 1.0]` range.
- Out-of-bounds numbers or `NaN`s throw explicit runtime validation errors.

### 6.3. Empty Registry Behavior
- **Providers**: If no retrieval providers are registered, the retrieval pipeline successfully returns an empty `ContextCollection`.
- **Strategies**: If no relevance strategies are registered, all candidates are scored `0.0` by the engine. The sorting policy is maintained using tie-breakers.

### 6.4. Failure Isolation
- **Provider level**: Failures are isolated. The pipeline discards the crashed provider's output and finishes executing remaining providers.
- **Strategy level**: Crashed strategy evaluations are caught and assigned a `0.0` score contribution.

### 6.5. Immutability
Immutability is guaranteed by compile-time `readonly` modifiers and runtime `Object.freeze` applied to the returning collections, internal arrays, and nested item wrappers.
