# ADR-009: Dedicated Knowledge Subsystem

## Status

Proposed

## Context

As we build the Companion Intelligence Layer for AKIRA, the companion requires a model of what the user currently knows (their skills, concepts understood, and learning progress).

We need to decide whether to compute these parameters on-the-fly from memory logs and conversational histories, or establish a dedicated Knowledge Engine subsystem.

---

## Alternatives Considered

### Alternative A: Ad-Hoc Retrieval from Memory (GENESIS)

Directly query validated memory records and event logs on-the-fly to infer user skills when compiling context packages.

- **Pros**: Simple storage; avoids building a dedicated state compiler.
- **Cons**: Querying flat, historical memory logs to reconstruct structured skill dependencies is slow. As memory logs grow, parsing through them at every turn to find concept matches introduces severe latency and limits system response times.

### Alternative B: Conversational Extraction (In-Prompt Inference)

Pass recent dialogue logs to downstream reasoning engines and let them infer the user's competency level dynamically within the active prompt loop.

- **Pros**: Zero storage overhead; highly adaptive to immediate dialogue shifts.
- **Cons**: Leads to inconsistent companion behavior. Without a structured knowledge model, the companion might alternate between explaining basic terms and assuming advanced mastery. It also inflates prompt context lengths, resulting in higher processing costs and latency.

### Alternative C: Dedicated Knowledge Engine Subsystem (Selected)

Establish a separate Knowledge Engine that consolidates evidence from memories, states, and reflections into a structured Knowledge Context. Other systems consume this compiled context model directly.

- **Pros**: Decouples skill mapping from dialogue logic, prevents prompt inflation, ensures consistent personalization, and provides a clear, explainable record of verified competencies.
- **Cons**: Requires building logic pipelines to map event updates to skill trees.

---

## Decision

We will implement the Knowledge Engine as a dedicated architectural subsystem (Alternative C).

---

## Rationale

### 1. Enhanced Personalization

Having a structured `Knowledge Context` ensures that the companion's explanations are tailored to the user's skill level. The companion can explain complex concepts without repeating basic terms the user has already mastered.

### 2. High Explainability and Provenance

A dedicated subsystem makes it easy to audit verified competencies. The user and developers can view exactly what skills the companion believes have been learned, and trace each skill back to the specific evidence (completed tasks, focus sessions) in the GENESIS database. The Knowledge Context preserves its originating subsystem, supporting evidence, and confidence rating (Provenance Preservation).

### 3. Long-Term Scalability

Compiling evidence into a structured knowledge tree prevents the need to search through growing memory databases. This reduces prompt size and ensures that context packages remain compact and fast to process.

### 4. Separation of Concerns and Decoupling

Isolating Knowledge from raw Memory logs ensures that semantic events represent history while the Knowledge engine models abstract user capabilities. Additionally, the Knowledge Engine is temporally decoupled from active Reflection consolidation; it consumes only previously finalized Reflection Contexts (archived historical context) from previous sessions to prevent circular dependencies.

### 5. Evidence Verification

When the user explicitly corrects an inferred knowledge level, this correction is treated as verified evidence. The Knowledge Engine refines its model and updates confidence ratings accordingly, prioritizing this verified evidence in future reasoning while keeping previous inferences explainable.

---

## Consequences

- Other systems must interact with the Knowledge Engine using the primary `Knowledge Context` output.
- Downstream engines do not need to query historical memory logs to resolve user skill levels.
- We must define models mapping event categories to corresponding skill domains.
- Knowledge Engine initialization must load previously archived Reflection Contexts rather than active reflection states.
