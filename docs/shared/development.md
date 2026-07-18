# AKIRA Development Documentation

This document serves as a technical overview and roadmap for future contributors and AI agents working on the **AKIRA** desktop-first personal growth companion.

---

## 1. Current Architecture

AKIRA is built with a lightweight, high-performance, and offline-first frontend stack:

- **Full-Stack/SSR Framework**: **TanStack Start** (React 19 + Vite 8 + Nitro engine). Server routing and client builds are dynamically compiled from directory files.
- **Routing Engine**: **TanStack Router**. File-based routing with static parameter validation (compiled into [routeTree.gen.ts](file:///C:/Users/lovsh/Desktop/AKIRA/src/routeTree.gen.ts)).
- **State Management**: **Local Storage External Store**. Managed via a customized vanilla state object in [akira-store.ts](file:///C:/Users/lovsh/Desktop/AKIRA/src/services/akira-store.ts). It implements React 19's `useSyncExternalStore` for reactive UI propagation, and serializes state directly to `window.localStorage` (key: `akira:state:v1`).
- **Styling System**: **Tailwind CSS v4**. Implements utility styling coupled with native oklch color gradients and glassmorphic designs defined inside [styles.css](file:///C:/Users/lovsh/Desktop/AKIRA/src/styles.css).
- **Component Foundations**: Radix UI primitives bundled with **shadcn/ui** default exports.

---

## 2. Folder Responsibilities

```text
src/
├── akira-os/            # AKIRA OS Pillar (Reality core logic: sessions, notes, projects, search, tasks)
├── genesis/             # GENESIS Pillar (Interpretation cognitive core logic: memory, stories, insights, AI context)
├── contracts/           # Shared subsystem interfaces, event names, and repository contracts
├── persistence/         # SQLite DB, Migrations, schemas, seed data, and Repository implementations
├── shared/              # Shared utilities, Event Bus, feature flags, infrastructure components
├── app/                 # UI setup, routing client setup, layout Shell, Sidebar, Topbar, and base UI primitives
└── routes/              # TanStack file-based client route views (Dashboard, Chat, Brain Dump, etc.)
```

---

## 3. Completed Milestones

- [x] **Project Shell & Core Layout**: Clean, dark-first grid alignment with a futuristic glassmorphic UI.
- [x] **Ambient Visual Core**: Custom particle-rendering HTML5 Canvas combined with spinning concentric SVG gradients ([AiCore.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/components/akira/AiCore.tsx)).
- [x] **Project Manager (Sprint 1 Completed)**: Fully operational CRUD workflows, customizable icons (Cpu, BookOpen, Rocket, Sparks, Dumbbell, Moon), selectable gradient colors, quick category suggestions, active project tracking (`touchProject` stored to `localStorage`), note persistence, and integrated search matching.
- [x] **Brain Dump (Sprint 2 Completed)**: Complete note manager supporting detailed fields (id, title, content, tags, pinned, favorite, projectId, createdAt, updatedAt), search matching, sorting (Newest, Oldest, Pinned), full-featured edit modals, autosave-while-typing triggers, and `Ctrl+N` keyboard shortcut.
- [x] **Memory & Command Palette (Sprint 3 Completed)**: Standalone memory timeline logging service capturing core workflow actions (`project_created`, `project_continued`, `project_updated`, `note_created`, `note_edited`, `task_completed`, `mission_completed`), dashboard Today's Activity metrics card, and global keyboard command palette launcher dialog (`Ctrl+K` / `⌘K`) matching commands, routes, projects, thoughts, and task check toggles.
- [x] **Daily Mission (Sprint 3b Completed)**: Complete daily mission manager supporting metadata properties (priority levels, estimated duration, project linkages, due dates), native HTML5 drag-and-drop sorting, live status widgets, priority badge colors, empty states, and `Ctrl+Shift+M` keyboard shortcut.
- [x] **Continue Yesterday (Sprint 4 Completed)**: Automated session-tracking logging pipeline capturing work durations and active project states; redesigned the Continue Yesterday dashboard section into a split metrics card showing previous active projects, last completed milestones, next suggested tasks, and yesterday's productivity summaries.
- [x] **v1.0.0 Foundation Edition Audit (Sprint 5 Completed)**: Complete clean-up audit formatting all files using Prettier, resolving typescript explicit any casting errors, adding React Hook dependency rule bypass comments, and certifying zero compilation or linter errors.
- [x] **Validation & Keyboard Usability (Sprint 5b Completed)**: Enforced title existence checks and positive numeric duration validations in forms; added clear error toast popups on submissions; injected descriptive `aria-label` and `title` attributes on all icon-only buttons (bell alerts, micro-toggles, edit/delete buttons, settings badges) to guarantee high screen-reader accessibility.
- [x] **Dangling Reference Integrity & Export Safety (Sprint 5c Completed)**: Redefined `deleteProject` and `deleteNote` store mutations to recursively check and nullify pointer ID linkages across all task, note, session, activeSession, and memory logs, ensuring zero orphaned references remain in local state; exposed `akira.getState()` to feed the settings page data export utility directly from live memory instead of raw localstorage queries.
- [x] **Offline Cache Syncing**: Fully offline state tracking that seeds, loads, and writes models into localstorage.
- [x] **Data Export & Portability**: Ability to download the current state as a JSON file and wipe local storage cleanly via [settings.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/settings.tsx).

---

## 4. Current Sprint Plan (Sprint 6)

Aligning with the priority list in [AGENTS.md](file:///C:/Users/lovsh/Desktop/AKIRA/AGENTS.md):

- **Goal: Real AI Integrations**
  - Replace mock replies inside [chat.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/chat.tsx) with direct API queries targeting Gemini/OpenAI endpoints.

---

## 4b. Next Sprint Plan (Sprint 7)

- **Goal: Voice Capture & Audio Streams**
  - Connect browser Web Audio API inside [brain-dump.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/brain-dump.tsx) to record speech, transcribe via backend, and log thoughts.

---

## 5. Pending Features

### AI & API Connector

- Wire frontend pages to external API endpoints for text generation, mission recommendations, and summary extractions.

### Voice Capture

- Connect the browser's Web Audio API to capture microphone inputs, with speech-to-text endpoints to convert spoken thoughts directly into the Brain Dump.

### Adaptive Mobile Views

- Create a mobile sidebar trigger and navigation drawer layout using [use-mobile.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/hooks/use-mobile.tsx) to prevent empty screen views on smaller viewports.

### Dynamic Theme Engine

- Implement a theme toggle in settings that updates CSS variables on the `:root` element to support custom variations like _Aurora_ or _Solstice_.
