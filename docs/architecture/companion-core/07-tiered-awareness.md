# Tiered Awareness Specification

> [!IMPORTANT]
> **Companion Core**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 07-tiered-awareness.md
>
> _This document defines the conceptual architecture for Tiered Awareness, describing how context is progressively assembled during a Companion Session to prevent cognitive context explosion while preserving relational accuracy._

---

## 1. Purpose

In a system built for multi-year daily use, the volume of semantic memories, historical events, and user preferences stored in the Brain will inevitably grow to a massive scale. Eagerly loading every potentially relevant memory at the beginning of a [Companion Session](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-lifecycle.md) is not scalable. It leads to **context explosion**, saturating the Companion's short-term attention window with irrelevant facts and degrading its cognitive effectiveness.

Furthermore, eager context loading is cognitively unrealistic. Humans do not recall every detail of their lives the moment they wake up or start a work session; rather, they hold a lightweight baseline of active goals and retrieve specific details only as the immediate focus demands.

**Tiered Awareness** introduces a progressive context assembly model, dividing cognitive ingestion into discrete, demand-driven tiers.

### Conceptual Tier Boundaries

Rather than treating working memory as a flat text buffer, the architecture structures context into three conceptual layers:

- **Baseline Awareness**: The minimal orientation context loaded immediately at startup (e.g., active daily mission, high-level user values).
- **Expanded Awareness**: The broader domain-specific context loaded once Session Intent is established (e.g., historical project notes, relevant preference rules).
- **Focused Awareness**: The highly concentrated context containing only the exact modules, files, and tasks currently active in the user's workspace.

These are conceptual layers of cognitive density rather than rigid implementation states.

### Awareness Contraction

Cognitive scaling requires that Awareness expands and contracts continuously. When the user transitions away from a topic, task, or project (demonstrated through workspace telemetry or dialogue), the corresponding Focused and Expanded Awareness contexts are naturally **contracted** (unloaded). This prevents memory bloat and ensures the Companion's focus window remains sized to the user's active attention span.

---

## 2. Baseline Awareness

When a session is initialized, the system constructs a minimal cognitive baseline. This baseline is designed to keep the initial working memory lightweight while providing immediate orientation.

Baseline Awareness conceptually includes:

- **Core Identity**: Essential user details and structural relationship parameters.
- **Daily Mission**: The primary target outcomes established for the current day.
- **Active Story**: The high-level narrative thread currently anchoring the user's life (e.g., writing a compiler, studying aviation).
- **High-Priority Goals**: Outstanding high-impact milestones due within the immediate tracking window.
- **Critical Constraints**: Immediate real-world limitations (e.g., restricted schedule, workspace locks).

By loading only these core parameters, the Companion gains immediate orientation without being overwhelmed by the thousands of semantic sub-nodes stored in the Brain.

---

## 3. Intent Discovery

Before detailed project memories can be responsibly fetched, the Companion must understand why the current session exists. **Intent Discovery** is the transitional cognitive phase that refines the initial Session Intent.

- **Observation Over Speculation**: The system monitors early conversational inputs and active workspace file changes to understand the user's immediate focus.
- **Dynamic Calibration**: The inferred [Session Intent](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md#4-session-intent) becomes increasingly accurate turn-by-turn.
- **Refinement Gate**: Conversation begins with open curiosity, allowing the user's focus to emerge naturally rather than forcing them into predefined modes.

---

## 4. Dynamic Awareness

Once the Session Intent is discovered or validated, the system triggers the progressive loading of **Dynamic Awareness**. This tier fetches deeper, task-specific details, grounding the Companion in the specific domain of the interaction.

Dynamic context is pulled proportionally to demonstrated relevance:

- **Project-Specific Memories**: Relevant logs, milestones, and blockages linked directly to the active project (e.g., specific parser specifications if building a compiler).
- **Study Material & Reference**: Concepts or facts the user is actively researching.
- **Coding Context**: IDE file trees, active module structures, and local build configurations.
- **Previous Decisions**: Conceptual design choices, trade-offs, and rules established in prior sessions.
- **Relevant Preferences**: Detailed, context-specific behavioral preferences (e.g., user prefers testing code with specific unit structures).

Dynamic Awareness remains restricted to the active domain. If the user pivots from writing code to scheduling calendar events, the system unloads the coding context and pulls in the schedule preferences.

---

## 5. Awareness Expansion Principles

The evolution of tiered context is governed by five core principles:

### I. Progressive Loading

We fetch context incrementally. Details are loaded only when the user's focus approaches the topic, keeping the cognitive channel clear.

### II. Relevance over Completeness

It is better to have ten highly relevant context nodes than a hundred tangential ones. The system filters aggressively, favoring depth in the active focus area over broad historical recall.

### III. Avoid Context Explosion

The size of the active Awareness Snapshot must remain within a defined cognitive limit. If new dynamic context is loaded, older, unused dynamic context is safely unloaded.

### IV. Expand Only When Justified

Dynamic context retrieval is triggered by clear semantic links (user prompts, file edits, goal pivots), preventing noise from accidental interactions from polluting the snapshot.

### V. Preserve Responsiveness

Cognitive context assembly must not lag. The tiered retrieval model ensures the interface remains fast and responsive by avoiding large, monolithic database queries at startup.

---

## 6. Relationship with Existing Awareness

Tiered Awareness does not replace the [Awareness Session](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md). Instead, it acts as the dynamic governance protocol for how the Awareness Session grows and shrinks:

- **Snapshot Modulator**: The Awareness Snapshot acts as the volatile target canvas. Tiered Awareness controls which elements are painted onto this canvas over time.
- **Evolution Driver**: It integrates directly with [Awareness Evolution](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/06-awareness-evolution.md), defining the rules for when new context updates trigger decay, replacement, or retrieval.
- **Temporary Bound**: Evolved context remains completely volatile within the session, ensuring it is discarded upon closure without polluting the authoritative Brain.

---

## 7. Design Philosophy

The architecture of Tiered Awareness is built upon four design tenets:

- **Progressive Understanding**: Depth is earned through interaction. We build context step-by-step as the relationship demands.
- **Curiosity Before Assumptions**: If intent is ambiguous, the system maintains a lightweight context state and asks questions rather than eagerly loading speculative memories.
- **Minimal Context First**: We start with the leanest possible baseline, maximizing focus and minimizing cognitive distraction.
- **Relevance Before Completeness**: We prioritize precise, action-oriented relevance over exhaustive historical records.
