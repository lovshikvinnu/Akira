# ADR-001: Separation of Memory and AI Models

## Status

Accepted

## Context

Personal AI companions often tightly couple their memory storage systems with specific Large Language Model (LLM) APIs or prompt structures. This approach limits portability, compromises local-first privacy, and makes the system vulnerable to provider lock-in or API breaking changes.

## Decision

The **Adaptive Memory Engine** must never communicate directly with AI models. The system must operate through a strictly decoupled, unidirectional cognitive pipeline:

```
[ Adaptive Memory Engine ] (Persistent Storage)
          │
          ▼
   [ Recall Engine ]       (Relevance Selector)
          │
          ▼
  [ Context Builder ]      (Understanding Assembler)
          │
          ▼
 [ AI Context Engine ]     (API/Prompt Translator)
          │
          ▼
   [ Reasoning Model ]     (Stateless Inference Core)
```

## Reasoning

- **Long-Term Portability**: By ensuring the memory engine remains agnostic of downstream inference engines, AKIRA can switch between local offline models (e.g., local SQLite-vec + ONNX models) and remote cloud APIs without modifying core memory storage schemas.
- **Separation of Concerns**: Storing user history (database state) and reasoning over it (inference runtime) are distinct concerns. Decoupling them keeps the code modular, maintainable, and readable.
- **Privacy Controls**: Standardizing memory representation in local primitive schemas allows user data to be encrypted or managed locally before any reasoning client processes it.

## Consequences

- The Memory Engine and Recall Engine are solely responsible for selecting and delivering primitive candidate models.
- The system requires the intermediate **Context Builder** and **AI Context Engine** to format logical data into specific API payloads.
- Downstream reasoning failures or provider switches will have zero impact on the integrity of the persistent memory database.
