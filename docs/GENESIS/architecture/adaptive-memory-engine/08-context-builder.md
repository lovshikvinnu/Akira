# Context Builder Architecture Specification

This document defines the architectural specification and conceptual design of the **Context Builder** within **AKIRA**. The Context Builder acts as the bridge between stored user knowledge (the Adaptive Memory Engine) and any future reasoning engine, synthesizing relevant insights into temporary packages to guide companion interaction.

---

## 1. Purpose

The Context Builder is responsible for **assembling understanding** rather than storing information.

### Separation of Storage and Reasoning

In a clean, modular cognitive architecture, memory storage must remain decoupled from the active reasoning model.

- **The Adaptive Memory Engine** stores long-term facts, events, and narratives. It is static, persistent, and local-first.
- **The Reasoning Engine** (any future LLM or inference provider) processes active inputs to generate assistance. It is stateless and has no native concept of the user's history.
- **The Context Builder** is the mediator. It queries the memory layer, gathers active workspace telemetry, filters out irrelevant details, and prepares a temporary "context package" that gives the reasoning engine immediate, situational understanding.

By separating these systems, AKIRA avoids overloading reasoning models with raw data, stays database-agnostic, and ensures that the companion can easily adapt to different AI models or providers.

---

## 2. Responsibilities

The Context Builder is the central assembler of active context. Its key responsibilities include:

- **Selecting Relevant Memories**: Ingesting candidates provided by the Recall Engine (defined in [07-memory-retrieval-and-recall.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/adaptive-memory-engine/07-memory-retrieval-and-recall.md)) and choosing which ones align with the current session.
- **Selecting Active Stories**: Identifying which long-term narratives (defined in [05-story-model.md](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/adaptive-memory-engine/05-story-model.md)) are currently active to preserve story alignment.
- **Identifying Active Goals**: Extracting target milestones from active projects, daily missions, and current work tasks.
- **Gathering Recent Activity**: Fetching chronological event logs from the previous hours to establish immediate operational momentum.
- **Including User Preferences**: Pulling validated preferences (e.g., formatting styles, coding guidelines, tone preferences) to customize the tone and style of interactions.
- **Considering Unfinished Work**: Tracking incomplete sub-tasks or pending files to ensure continuity across workspace transitions.
- **Filtering Irrelevant Information**: Pruning candidate inputs that do not match the current focus to prevent cognitive noise.

---

## 3. Context Package

The output of the Context Builder is a **Context Package**—a conceptual, temporary container of synthesized data. It does not dictate format (such as JSON or markdown prompts) but represents the logical structure of active context:

```
┌────────────────────────────────────────────────────────┐
│                    CONTEXT PACKAGE                     │
├────────────────────────────────────────────────────────┤
│ • Active Story       : Major active journey identifier │
│ • Active Goals       : Current target milestones       │
│ • Relevant Memories  : AI-recalled relevant facts      │
│ • Recent Activity    : Latest chronological actions    │
│ • Pending Decisions  : Choices the user is balancing   │
│ • User Preferences   : Tailored behavior settings      │
│ • Important Constraints: Guardrails & formatting limits │
└────────────────────────────────────────────────────────┘
```

---

## 4. Context Types

Different situations require different context configurations. The Context Builder adjusts its assembly depending on the active mode:

### Working Context

- **Purpose**: Supports active, focused execution (e.g., coding, writing, debugging).
- **Focus**: High priority on immediate file telemetry, active project constraints, and related technical memories. Low priority on historical milestones.

### Planning Context

- **Purpose**: Helps the user structure their day, mission lists, or long-term goals.
- **Focus**: High priority on active Stories, pending goals, and recent activity levels. Low priority on immediate coding details.

### Reflection Context

- **Purpose**: Supports review periods, weekly updates, or progress checks.
- **Focus**: High priority on completed milestones, historical memories, and recent events across the week.

### Learning Context

- **Purpose**: Supports the user while they study a new skill or research a topic.
- **Focus**: High priority on previous educational memories, relevant notes, and related learning milestones.

### Conversation Context

- **Purpose**: General chat interactions with the companion.
- **Focus**: High priority on user preferences, conversational tone settings, and immediate chat history.

---

## 5. Design Principles

To ensure scalability and model interchangeability, the Context Builder adheres to six core principles:

### Assemble Only What is Relevant

Context is precious. The assembler must prune aggressively. Every piece of information added to a context package must prove its situational relevance.

### Avoid Information Overload

Too much context confuses reasoning models, leading to low-quality advice. The Context Builder enforces dynamic boundaries to ensure the context remains digestible.

### Selective Context

The Context Builder is responsible not only for deciding what information should be included in a Context Package, but also for determining what should be intentionally excluded. The quality of context depends as much on omission as inclusion.

- **Omission Examples**:
  - While studying, startup memories may remain inactive.
  - While coding, completed shopping lists should not occupy context.
  - During reflection, historical stories may become more relevant than active tasks.
    Intelligent omission is a core responsibility of the Context Builder. Reducing cognitive noise is one of the Context Builder's primary responsibilities, ensuring that reasoning systems receive focused, meaningful context.

### Keep AI Providers Interchangeable

The Context Builder does not format output for specific LLM APIs. It produces a logical package of structured data, which downstream translators can format into specific model prompts (e.g., Gemini-specific messages or OpenAI system parameters).

### Context is Temporary

Context packages are ephemeral. They are assembled on the fly, used for a single reasoning cycle, and discarded. They are never written back to database tables.

### Memory Remains the Source of Truth

The Context Builder reads from memory and workspace state but does not modify it. Any modifications or learnings extracted during reasoning must be written back to the Adaptive Memory Engine as new event logs or consolidated facts, rather than updating the context package itself.

---

## 6. Relationship with Other Systems

The Context Builder occupies a distinct position in the cognitive pipeline. The interaction flows sequentially, maintaining loose coupling and implementation independence:

```
[ Adaptive Memory Engine ] (Persistent storage of facts/stories)
          │
          ▼
   [ Recall Engine ]       (Selects candidate memory nodes)
          │
          ▼
  [ Context Builder ]      (Assembles memories, preferences, and telemetry)
          │
          ▼
[ Future AI Context Engine ] (Translates the logical Package to provider prompts)
          │
          ▼
   [ Reasoning Model ]     (Executes prompt and returns response)
```

1. **Adaptive Memory Engine** hosts the records.
2. **Recall Engine** identifies relevant memory nodes based on context cues, delivering them as _candidates_.
3. **Context Builder** ingests these candidates and combines them with other signals (active projects, unfinished work, user preferences) to assemble the logical **Context Package**.
4. **Future AI Context Engine** (provider-specific adapter) translates this logical package into the exact schema required by the selected model.
5. **Reasoning Model** processes the prompt and generates a response.

---

## 7. Future Considerations

As AKIRA’s capabilities expand, the Context Builder will evolve to support more advanced reasoning scenarios:

- **Multi-Story Reasoning**: Assembling context from multiple active or historical stories simultaneously to assist in cross-disciplinary projects (e.g., combining insights from a _Fitness Journey_ and _Vocation_ project).
- **Dynamic Context Adaptation**: Monitoring user interaction speed and task switching to automatically adjust the size and type of the assembled context packages.
- **Identity-Aware Context**: Adjusting context prioritization based on the user's active role (e.g., student vs. developer vs. pilot).
- **Personalized Context Assembly**: Machine-learning adapters that study which context components yield the most helpful AI responses for this specific user, adjusting the assembler filters accordingly.
