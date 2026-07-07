# Session Continuity Specification

> [!IMPORTANT]
> **Companion Core**  
> **Version**: 1.0  
> **Status**: Proposed Specification  
> **Document**: 08-session-continuity.md
>
> _This document defines the conceptual architecture for Session Continuity, detailing how Companion Sessions preserve user flow and active understanding across interruptions, unexpected terminations, and natural pauses while maintaining the ephemeral design of sessions._

---

## 1. Purpose

Human focus is fragmented. In a real-world environment, a user will be interrupted by phone calls, browser tasks, client restarts, or power losses. If a Companion Session treats these routine interruptions as catastrophic failures—resulting in complete loss of immediate context or forcing the user to re-explain their goals—the partnership breaks down.

**Session Continuity** is the architectural bridge that preserves active user flow through interruptions. It views interruptions not as exceptional system errors, but as normal aspects of human life.

```
┌────────────────────────────────────────────────────────┐
│                   TEMPORARY SESSION                    │
│   (Active interaction, dialogue, and workspace work)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                      INTERRUPTION                      │
│   (Unplanned shutdown, pause, or brief context swap)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                      CONTINUATION                      │
│   (Graceful restoration of flow grounded in memory)    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Session Continuity

Session Continuity is defined as the temporary preservation of the Companion's active situational snapshot during an interruption. Its scope is strictly bounded:

- **Experience-Driven**: It exists solely to preserve the flow of user focus, not to permanently archive intermediate session execution logs.
- **Volatile**: The preserved state remains temporary and is subject to expiration.
- **Decoupled from Memory**: Continuity does not write new consolidated nodes into long-term tables. It merely holds the active session parameters until the user resumes or the continuity window expires.

---

## 3. Types of Interruption

The system adapts its restoration behavior naturally to fit the context of the interruption:

- **Brief Pause**: The user switches windows or stops interacting for a short period. The session remains open, holding the exact [Awareness Snapshot](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/02-awareness-session.md#6-awareness-snapshot).
- **Application Close**: The user closes the client intentionally. The system registers the departure, triggers the reflection sequence, and preserves a restoration marker.
- **Device Restart / System Failure**: Unplanned system shutdown. The system restores the last validated state journal upon reboot, allowing the user to resume their flow immediately.
- **User Intentionally Leaving**: The user explicitly closes the session. The system proceeds directly through [Closure](file:///C:/Users/lovsh/Desktop/Project%20Akira%20Master/AKIRA/docs/architecture/companion-core/01-companion-lifecycle.md#3-conceptual-lifecycle-stages) and dissolves the active session.

---

## 4. Continuity Window

Continuity is not indefinite. It is governed by a **Continuity Window**—a proportional time boundary that determines how a session is restored:

```
                  ┌─────────────────────────────┐
                  │     Session Interrupted     │
                  └──────────────┬──────────────┘
                                 │
                   Time Elapsed  │
               ──────────────────┴──────────────────
               │                                   │
               ▼ (< Window Threshold)              ▼ (>= Window Threshold)
   ┌───────────────────────┐           ┌───────────────────────┐
   │    Natural Resume     │           │     Fresh Startup     │
   │ (Restores Snapshot &  │           │  (Initializes Clean   │
   │  Conversational Flow) │           │   Context from Brain) │
   └───────────────────────┘           └───────────────────────┘
```

- **Within the Window**: If the user returns quickly (e.g., within a few hours), the system resumes the same session. It preserves the session intent, recent conversational turns, and active goals, greeting the user with immediate continuity (e.g., _"We were just compiling the parser. Let's finish the tests."_).
- **Beyond the Window**: If the user returns after a long delay (e.g., the next day), the previous session context is discarded. The system initializes a fresh Companion Session, utilizing the Brain to orient itself to the new day's priorities.

---

## 5. Relationship with Awareness

When a session resumes within the Continuity Window, the system evaluates the state of the workspace:

- **Snapshot Restoration**: If no major workspace changes occurred during the pause, the system restores the exact previous Awareness Snapshot.
- **Delta Awareness**: If the user modified files or checked off tasks while the companion was disconnected, the evolution engine merges these events into the restored snapshot, updating the goals and tasks.
- **Fresh Start**: If the workspace state has drifted completely, the system abandons the old snapshot and triggers a fresh Awareness Session.

---

## 6. Relationship with Reflection

Interruptions must not cause the loss of intermediate learning or result in duplicate updates:

- **Incremental Reflection**: During a session, key milestones are logged incrementally to a temporary session journal.
- **Double-Commit Prevention**: The Reflection engine tracks which event logs and memory candidates have already been processed, ensuring that a restored session does not write duplicate records to the Brain.
- **Graceful Consolidation**: In the event of a catastrophic crash where closure was bypassed, the system recovers the journal during the next startup, running the reflection sequence on the recovered data before initializing the new session.

---

## 7. Relationship with the Brain

Session Continuity operates independently of the Brain:

- **The Brain is Authoritative**: The persistent database remains the single source of truth.
- **Ephemeral Bridge**: Continuity state exists outside the core memory tables, acting as a transient cache that maps across session boundaries. If the continuity state is lost or corrupted, the system simply falls back to standard Brain initialization, guaranteeing data integrity.

---

## 8. Continuity Principles

The preservation of flow is governed by eight core principles:

- **Preserve Flow, Not Tech State**: We focus on keeping the user in their creative state rather than matching low-level software variables.
- **Resume Naturally**: Resumption greetings must show awareness of the interruption (e.g., _"Welcome back. Let's pick up where we left off on the database test."_).
- **Respect User Intent**: If the user indicates they want to switch topics completely after returning, the system discards the preserved context immediately.
- **Avoid Duplicated Work**: The system ensures no tasks, memory candidates, or telemetry logs are processed twice due to restoration.
- **Temporary Continuity Before Permanent Learning**: Ephemeral session journals are held in volatile buffers until final reflection validation.
- **Human Interruptions Are Expected**: The architecture treats window swaps, app closures, and focus shifts as normal behavior to be integrated, not exceptions to be logged.
- **Graceful Abandonment**: Unfinished sessions are never flagged as failures or deficits. The Companion must never guilt or pressure the user to resume unfinished work from a previous session.
- **Continuity Transparency**: When restoring a session, the Companion must naturally explain _why_ it is bringing up the previous context, ensuring the user is aware that continuity is active.

---

## 9. Design Philosophy

- **Conversations Should Survive Life**: A user shouldn't have to restart their train of thought because they stepped away to grab a coffee.
- **Effortless Restoration**: Returning to work should feel seamless. The Companion should remember the immediate tasks without the user needing to summarize.
- **Graceful Recovery of Temporary Experiences**: Ephemeral runs deserve stable continuity, ensuring a clean interface does not mean a forgetful interface.
- **Presence Across Interruptions**: The Companion's character remains stable across disconnects, maintaining trust through reliability.

---

## 10. Future Compatibility

This continuity framework naturally accommodates future capabilities:

- **Voice**: Spoken sessions can be paused mid-sentence. If the user disconnects, the system holds the transcript snapshot, allowing the user to resume by speaking naturally.
- **Multi-Hour Deep Work**: Gracefully handles long pauses where the user remains focused on writing code, keeping the Companion silent but aware.
- **Calendar Integration**: Ingests calendar triggers to predict interruptions, preparing the Companion to say: _"I see you have a meeting in five minutes. Should we lock in these updates before you go?"_
- **Coding Sessions**: Preserves build results, compiler diagnostics, and editor line bookmarks across application restarts.
- **Mobile Interactions**: Handles erratic cell connectivity and background application suspensions on mobile devices, ensuring the user can step away from their desktop and resume focus on their phone seamlessly.
