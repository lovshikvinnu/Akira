# AKIRA OS Roadmap

This document outlines the current status, upcoming release features, and the long-term design roadmap for the AKIRA OS personal assistant platform.

---

## 1. Implemented Subsystems (Current Foundation)

The following components are fully functional and tested:
*   **Workspace Shell & Layout Canvas**: High-fidelity glassmorphic dashboard (`Shell.tsx`) supporting scrolling and viewport-fit modes.
*   **Decoupled State Architecture**: Optimistic client-side state machine (`akira-store`) synchronized with backend repositories.
*   **SQLite Persistence & Triggers**: Relational tables backed by `better-sqlite3`. Updates automatically refresh the SQLite FTS5 search virtual index and record timeline logs using database triggers.
*   **File Vault**: Local storage directories. Logical file creation uses SHA-256 deduplication and MIME type magic-byte validation.
*   **Daily Mission Control**: Priority tracking, task grouping, focus sessions timers, and streak managers.
*   **Cognitive Infrastructure (GENESIS)**: Abstract `WorkspaceProvider` with read-only memory graphs, recall, story, context, and reflection loops.

---

## 2. Planned Features (Next Release Cycles)

The following features are scheduled for development:

### 2.1. Dynamic Analytics Dashboard
*   **Status**: Planned (UI structures exist in `toolsRegistry` as coming-soon).
*   **Scope**: Integrate charting components to visualize focus duration trends, project workloads, and daily task completion.

### 2.2. TITAN Background Processor
*   **Status**: Planned.
*   **Scope**: Create a unified queue worker for managing sync schedules, data backups, and slow database optimizations without blocking client threads.

### 2.3. Migration Hub Client
*   **Status**: Planned.
*   **Scope**: A UI manager that lets users backup database files, restore legacy states, and run system diagnostics schema health tests.

---

## 3. Long-term Vision & Advanced Subsystems

These items represent the future conceptual path for the platform:

### 3.1. GENESIS AI Personality Core
*   **Status**: Future Vision.
*   **Scope**: Fully local LLM orchestrator running on-device models. Includes memory graph networks that grow dynamically based on the user's focus patterns.

### 3.2. FORGE Sandbox Execution
*   **Status**: Future Vision.
*   **Scope**: Sandbox script compiler. Allows the AI companion to write, test, and run shell commands or scripts safely to perform automated workspace actions.

### 3.3. Voice Brain Dump Integration
*   **Status**: Future Vision (Mock panel exists).
*   **Scope**: Continuous speech-to-text translation that converts voice recordings into structured notes or tasks.
