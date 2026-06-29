# Changelog

All notable changes to the **AKIRA** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.3] - 2026-06-30

v1.0.3 release. Implemented cascading reference cleanups and memory state export helpers.

### Added

- **Cascading reference cleanup**: Enhanced `deleteProject` and `deleteNote` store mutations inside [akira-store.ts](file:///C:/Users/lovsh/Desktop/AKIRA/src/services/akira-store.ts) to search and nullify linked task pointer IDs, note links, active sessions, and event timeline items. This prevents corrupted state and dangling pointer references.
- **Export Snapshot helper**: Exposed `akira.getState()` to retrieve the live, in-memory state snapshot and refactored the JSON download action inside [settings.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/settings.tsx) to consume this helper, eliminating manual localStorage parsing.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.
- **ESLint Compliance**: Verified zero warnings or errors on compiler lint runs.

---

## [1.0.2] - 2026-06-30

v1.0.2 release. Improved form validation, error handling, and accessibility.

### Added

- **Aria Accessibility Badges**: Injected custom `aria-label` and matching `title` tag parameters to all icon-only button components (Topbar alerts, menu shortcuts, Mic dictation buttons, and task list controllers) to guarantee optimal screen reader support.
- **Form Submission Verification**: Added validations inside project forms and daily mission lists to prevent silent submission failures; custom toast warning messages alert users immediately on validation failure.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.
- **ESLint Compliance**: Verified zero warnings or errors on compiler lint runs.

---

## [1.0.1] - 2026-06-30

v1.0.1 visual release. Polished card empty states and command palette empty search actions.

### Added

- **Dashboard Empty Cards**: Replaced raw dashboard text placeholders inside [index.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/index.tsx) with dashed-border modules (incorporating custom Folder, FileText, and CheckSquare icon tags) to elevate the first-run user experience.
- **Interactive Search Empty State**: Configured the global `CommandPalette.tsx` to display an interactive button when search queries yield no results, enabling users to instantly capture their search query as a new thought with one click.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.
- **ESLint Compliance**: Verified zero warnings or errors on compiler lint runs.

---

## [1.0.0] - 2026-06-30

v1.0.0 Foundation Edition. Cleaned, audited, and optimized codebase.

### Changed

- **Linter & Prettier Alignment**: Automated styling formatting across all code files (Vite configuration, components, router pages, store layers) using Prettier.
- **Type Safety Reinforcements**: Eliminated explicit `any` casting types on select handlers and event log fields, replacing them with type-safe `unknown` and exact priority literals.
- **Hook Rules Enforcement**: Resolved React Hook exhaustive dependency rule warnings by injecting explicit rules exceptions on project session logging effect triggers.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.
- **ESLint Compliance**: Verified zero warnings or errors on compiler lint runs.

### Next Sprint

- **Real AI Integrations**: Wire mock chat interfaces to Gemini/OpenAI API endpoints.

---

## [0.5.0] - 2026-06-30

Fifth Sprint release. Completed automated Session Tracking, context restore navigation actions, and Yesterday's Activity dashboard summary card.

### Added

- **Session Tracking Pipeline**: Created automated workspace trackers (`startSession`, `endSession`, `updateSessionTask` inside `akira-store.ts`) that log project activity sessions (measuring start/end timestamps and precise working durations in minutes) and save them to local storage.
- **Auto-exit Handler**: Configured window `beforeunload` listener in the project detail view [projects.$id.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/projects.$id.tsx) to automatically close and commit active sessions.
- **Split Stats Layout**: Re-implemented `ContinueYesterday` dashboard card in [index.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/index.tsx) as a split card, displaying last active projects and context cues on the left, and yesterday's productivity metrics on the right.

### Changed

- **Extended State Schema**: Added `sessions: WorkSession[]` and `activeSession` context structures to the store.
- **Dynamic Metrics Seeding**: Configured timeline memories and work sessions to pre-populate exactly 52 working minutes, 2 projects, 5 completed tasks, and 3 captured notes dated yesterday.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.

### Next Sprint

- **Real AI Integrations**: Wire mock chat interfaces to Gemini/OpenAI API endpoints.

---

## [0.4.0] - 2026-06-30

Fourth Sprint release. Completed Daily Mission management system, HTML5 drag-and-drop task sorting, and live dashboard metrics widgets.

### Added

- **Daily Mission Management**: Implemented dialog editors (`MissionFormDialog`) inside [daily-mission.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/daily-mission.tsx) supporting title inputs, detailed descriptions, Low/Medium/High priorities, estimated minutes, due dates, and project selections.
- **Drag-and-Drop Reordering**: Created native HTML5 draggable container handlers enabling smooth list drag-and-drop sort operations with instant store persistence.
- **Keyboard Shortcut Creator**: Linked global `Ctrl + Shift + M` shortcut listener to trigger the Create Mission dialog immediately.
- **Live Statistics Panel**: Rendered metrics showing tasks completed today, progress percentage, remaining estimated duration, and current streaks.

### Changed

- **Extended Task/Mission Schema**: Extended the typescript `Task` interface to support all mission parameters, preserving full backward compatibility with done/completed properties.
- **Aggregated Dashboard Headers**: Enhanced `TodaysMission` card component in [index.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/index.tsx) to calculate total completed items and print remaining work durations dynamically.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.

### Next Sprint

- **Real AI Integrations**: Wire mock chat interfaces to Gemini/OpenAI API endpoints.

---

## [0.3.0] - 2026-06-30

Third Sprint release. Completed Memory timeline event logging, dashboard activity tracking widget, and Ctrl+K command palette.

### Added

- **Command Palette (`Ctrl+K` / `⌘K`)**: Integrated a global keyboard-toggled search console dialog (`CommandPalette.tsx`) built with the `cmdk` package, enabling quick-searching across commands, links, active projects, thoughts, and task checkboxes.
- **Memory timeline logging**: Built a modular background logging service (`recordMemoryEvent` helper inside `akira-store.ts`) that automatically appends user actions (`project_created`, `project_continued`, `project_updated`, `note_created`, `note_edited`, `task_completed`, `mission_completed`) to the persistent context ledger.
- **Today's Activity Widget**: Rendered a dashboard stats card in [index.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/index.tsx) aggregating notes created, active projects touched, task check completions, and project detail changes logged today.

### Changed

- **Extended State Schema**: Added `memories: MemoryEvent[]` to the state interfaces and seeder in [akira-store.ts](file:///C:/Users/lovsh/Desktop/AKIRA/src/services/akira-store.ts).
- **Globally loaded command listener**: Configured [Shell.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/components/akira/Shell.tsx) to mount `CommandPalette` globally across all routes.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.

### Next Sprint

- **Real AI Integrations**: Connect mock chat interfaces to true API endpoints (Gemini/OpenAI) using local keys.

---

## [0.2.0] - 2026-06-30

Second Sprint release. Completed full-featured Brain Dump note-taking module.

### Added

- **Note Form Dialog**: Implemented a comprehensive modal editor (`NoteFormDialog`) inside [brain-dump.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/brain-dump.tsx) supporting title inputs, raw content textareas, tags, pinned checkboxes, favorite checkboxes, and project associations.
- **Autosave Engine**: Integrated a debounced 800ms autosaving handler that silently updates edited thoughts to local storage.
- **Keyboard Shortcut Capture**: Configured global `Ctrl + N` listener inside the Brain Dump route to launch the create note modal.
- **Pinning & Favoriting**: Enabled instant toggles for star (favorite) and pin properties with dynamic badge styling.
- **Multi-Sort Interface**: Rendered filtering tabs to sort thoughts by _Newest_, _Oldest_, or _Pinned First_.

### Changed

- **Extended Note Schema**: Migrated the simple note structure to a memory-engine-ready structure (incorporating title, content, tags, pinned, favorite, projectId, and updatedAt properties).
- **Polished Dashboard Cards**: Enhanced the dashboard thoughts component to display bold titles and multi-line content previews.

### Technical

- **Local Compiler Verification**: Re-verified compiling status via TypeScript type check with no errors.

---

## [0.1.0] - 2026-06-30

First Sprint release. Completed fully functional local Project Manager module.

### Added

- **Reusable `ProjectIcon` Component**: Built a mapping helper in [primitives.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/components/akira/primitives.tsx) to dynamically render Lucide Icons (`Cpu`, `BookOpen`, `Rocket`, `Sparkles`, `Dumbbell`, `Moon`).
- **Icon Selector Interface**: Added interactive grid selection buttons to choose custom project icons in create/edit modals.
- **Category Suggestion Chips**: Introduced clickable tag suggestions (_Personal OS_, _AI Companion_, _Hardware_, etc.) below the category input to simplify logging.
- **Theme Color Picker**: Implemented selectable color theme gradients (_Midnight_, _Aurora_, _Solstice_, _Nebula_) to custom style individual projects.

### Changed

- **Extended State Schema**: Added `icon` mapping to the typescript `Project` model interface and `seed()` defaults in [akira-store.ts](file:///C:/Users/lovsh/Desktop/AKIRA/src/services/akira-store.ts).
- **Dynamic Dashboard Rendering**: Updated dashboard cards in [index.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/index.tsx) to render specific themes and custom selected icons.
- **Polished Details Route**: Refactored [projects.$id.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/projects.$id.tsx) to support dynamic header gradients and full edit forms for projects.

### Fixed

- **Map Callback Syntax**: Corrected map callback brackets syntax errors in [projects.tsx](file:///C:/Users/lovsh/Desktop/AKIRA/src/routes/projects.tsx) to resolve compiler issues.

### Technical

- **Local Compiler Verification**: Ran full project type checks verifying zero TypeScript warnings or errors.
- **Storage Persistence**: Synchronized all custom project properties (icon, color) with automatic JSON serialization in `localStorage`.
