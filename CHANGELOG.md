# Changelog

All notable changes to the **AKIRA** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-06-30

Status: Release Completed (Brain v1.0 Foundation)

Description:

This release marks the completion of AKIRA Brain v1.0, the cognitive foundation upon which all future companion capabilities will be built. It represents the full implementation, validation, and integration of the Adaptive Memory Engine and AI Context Engine.

### Highlights

- **Complete Adaptive Memory Engine**: Unidirectional cognitive pipeline structuring user context.
- **Event Layer**: Decoupled store mutations from memory validation, making the core fully event-driven.
- **Memory Candidate Engine**: Intermediate buffering layer evaluating deterministic promotion rules.
- **Memory Validation Engine**: Promotion of candidates to permanent memories with explainability metadata.
- **Relationship Engine**: Dynamic relationship building between memory nodes.
- **Story Engine**: Clustering of related memories and links into long-running project and reflection narratives.
- **Identity Engine**: Synthesizing traits, values, learning styles, and aspirations from active story evidence, with support for onboarding hypothesis validation and historical confidence logging.
- **Importance Engine**: Evaluating recency, milestone, density, user intent, and reinforcement signals.
- **Recall Engine**: Context-based candidate selection matching active story lines and significance.
- **Context Builder**: ephemerally building Context Packages to feed down prompts.
- **AI Context Engine**: Standardized provider-agnostic request/response normalizers with dynamic registry adapters, shipping Gemini REST integrations with mock fallbacks.
- **Explainability & Provenance**: End-to-end trace mapping, logging reasons and origins of all cognitive transformations.

---

## [2.10.0-sprint-10] - 2026-06-30

Status: Implementation Completed (Sprint 10)

Description:

This milestone marks the implementation of the AI Context Engine, establishing a provider-independent interface and dynamic provider registry to dispatch rich, structured requests.

### Added

- **AI Subsystem**: Created `src/services/ai/` containing types, registry, context engines, providers, and normalization adapters.
- **Provider-Independent API**: Defined the `AIRequest` and `StandardAIResponse` models in `ai/types.ts` and the standard `AIProvider` contract in `ai/provider-interface.ts`.
- **Response Normalization Layer**: Created `response-normalizer.ts` defining modular `ResponseAdapter` and `responseNormalizer` registry to translate diverse provider outputs into standardized format.
- **Dynamic Provider Registry**: Created `providerRegistry` to dynamically register AI providers and swap the active provider at runtime, registering `GeminiProvider` as the initial active backend.
- **AI Context Engine**: Implemented `aiContextEngine` to receive context packages, transform them into provider-agnostic system instructions, attach context metadata, and dispatch them to the active provider.
- **Gemini Provider REST Implementation**: Built `GeminiProvider` implementing the provider interface, converting standard requests to Gemini API payloads, and including a local mock fallback for testing when API keys are not present.

### Changed

- **StandardAIResponse Adoption**: Updated both `GeminiProvider` and `aiContextEngine` to communicate exclusively via `StandardAIResponse`, eliminating raw provider-specific JSON leaks.
- **Context Package Session ID Refinement**: Extended the `ContextPackage` model to carry an immutable, unique `contextSessionId` for debugging.
- **Context Item Provenance**: Refactored `ContextPackage` properties into wrapped `ContextItem<T>` structures carrying the specific, explainable inclusion reasons for every context node.
- **Context Lifecycle Events**: Extended `contextService` to publish explicit `"Created" | "Updated" | "Expired"` lifecycle events.
- **Subsystem Integration**: Loaded the AI context engine in `akira-store.ts` to trigger default provider registrations.

---

## [2.9.0-sprint-9] - 2026-06-30

Status: Implementation Completed (Sprint 9)

Description:

This milestone marks the implementation of the Context Builder, enabling the assembly of transient, ephemeral Context Packages from active recall candidates, active stories, identity observations, and onboarding goals.

### Added

- **Context Subsystem**: Created `src/services/context/` containing types, rules, services, and builder modules.
- **Context Package Model**: Defined the `ContextPackage` schema in `context/types.ts` capturing active recall nodes, active story lines, emergent identity observations, goals, user preferences, constraints, and recent activity summaries.
- **Context Rules Engine**: Implemented deterministic context assembly and filtering rules in `context/context-rules.ts` (Active Story prioritization, Active Recall Candidate selective filtering, Identity Observation confidence thresholds, goal mapping, and preference extraction).
- **Context Service**: Manages the transient, active context package view in memory and dispatches `"Updated"` notifications to subscribers.
- **Context Builder**: Listens to Recall updates, Story changes, and Identity updates to automatically assemble and update the active Context Package.

### Changed

- **Recall Session Identifiers**: Updated `RecallCandidate` and `recallService` to support unique, immutable Recall Session identifiers per cycle to track activation runs.
- **Recall Audit Trail**: Implemented lightweight audit logging to record activation reasons and timestamped deactivation logs.
- **Recall Candidate Lifecycle**: Added `Active` and `Inactive` state transitions to the recall cache pipeline to prevent stale candidates from remaining active indefinitely.
- **Subsystem Integration**: Loaded the context module in `akira-store.ts` to trigger automatic evaluations.

---

## [2.8.0-sprint-8] - 2026-06-30

Status: Implementation Completed (Sprint 8)

Description:

This milestone marks the implementation of the Recall & Retrieval Engine, managing context-based memory activation based on active stories and importance signals.

### Added

- **Recall Subsystem**: Created `src/services/recall/` containing models, rules, services, and builder modules.
- **Recall Candidates Model**: Defined the `RecallCandidate` structure in `recall/types.ts` capturing memory reference, supporting story IDs, active importance signals, recall reasons, and timestamps.
- **Recall Rules Engine**: Implemented deterministic recall check rules in `recall/recall-rules.ts` evaluating criteria (Active Story association, high recency, explicit user capture intent, dense relationship nodes, and activity reinforcement logs).
- **Recall Service**: Tracks active recall candidates and dispatches updates to subscribers.
- **Recall Builder**: Orchestrates automatic background evaluation by listening to Memory promotions, Story changes, and Importance updates.

### Changed

- **Importance Observations Signal History**: Refactored `MemoryImportance` schema in `importance/types.ts` and `importance-service.ts` to store `signalHistory` tracking historical importance signal changes.
- **Importance Provenance & Lifecycles**: Configured the importance service to record explicit reasons for signal recalculations (e.g. Memory Promoted, Story Updated) and to publish distinct event types (`Updated` | `Increased` | `Decreased` | `Recalculated`).
- **Subsystem Integration**: Loaded the recall module in `akira-store.ts` to trigger automatic evaluations.

---

## [2.7.0-sprint-7] - 2026-06-30

Status: Implementation Completed (Sprint 7)

Description:

This milestone marks the implementation of the Memory Importance Engine, providing a decoupled, explainable signals pipeline evaluating the cognitive relevance of stored memories.

### Added

- **Memory Importance Subsystem**: Created `src/services/importance/` containing models, rules, and builder modules.
- **Importance Signals Model**: Defined the `ImportanceSignal` and `MemoryImportance` structures in `importance/types.ts` capturing signal types (`User Intent`, `Reinforcement`, `Story Influence`, `Milestone`, `Recency`, `Relationships`) with individual strengths and verbal explanations.
- **Importance Rules Engine**: Implemented deterministic check rules in `importance/importance-rules.ts` calculating raw signal indicators for recency, milestone tags, relationship links, story active focus states, user capture actions, and structural graph reinforcement links (preventing circular coupling to the Identity Engine).
- **Importance Service**: Tracks signal values per memory node, manages memory caches, and dispatches `"Updated"` notifications to registered subscribers.
- **Importance Builder**: Automatically orchestrates background evaluation by listening only to Memory promotions and Story changes.

### Changed

- **Identity Observation Confidence History**: Refactored `IdentityObservation` schema in `identity/types.ts` and `identity-service.ts` to store `confidenceHistory` arrays, capturing historical confidence adjustments.
- **Identity Merger Provenance**: Refactored observation merging to append descriptive, explainable text indicating the reasons and new evidence behind observation mergers.
- **Identity Event Broadcasting**: Expanded the identity service listener system to publish explicit `"Updated" | "Confirmed" | "Refined"` lifecycle events.
- **Subsystem Decoupling**: Configured the Importance Engine to remain independent from the Identity Engine, ensuring that Identity is a consumer of understanding rather than an input to importance.
- **Subsystem Integration**: Loaded the importance module in `akira-store.ts` to trigger automatic evaluations.

---

## [2.6.0-sprint-6] - 2026-06-30

Status: Implementation Completed (Sprint 6)

Description:

This milestone marks the implementation of the Emergent Identity Engine, closing the loop on our cognitive memory pipeline where user traits and values emerge exclusively from Stories.

### Added

- **Identity Subsystem**: Created `src/services/identity/` containing models, rules, services, and hypothesis loaders.
- **Emergent Identity Model**: Defined the `IdentityObservation` and `IdentityCategory` structures in `identity/types.ts` capturing traits, values, strengths, work styles, confidence, and links back to supporting stories.
- **Identity Onboarding Hypotheses**: Implemented the `IdentityHypothesis` model and `hypothesesService` to track temporary onboarding assumptions (`Proposed` $\to$ `Confirmed`/`Refined`/`Rejected` lifecycle).
- **Identity Rules Engine**: Implemented deterministic inference rules in `identity/identity-rules.ts` (Reflective Trait Evaluation, Deep Work Focus Evaluation, Project Completion Hypothesis Confirmation).
- **Identity Service**: Manages observations, merges duplicates, implements reinforcement increments, and notifies subscribers.
- **Identity Builder**: Subscribes exclusively to Story events, ensuring that identity characteristics emerge solely from stories and never directly from memories or events.

### Changed

- **Story Lifecycle & Provenance Refinements**: Refactored `story-service.ts` and `story-builder.ts` to assign immutable rule provenance metadata during story creation, and to publish `"Completed"` lifecycle events.

---

## [2.5.0-sprint-5] - 2026-06-30

Status: Implementation Completed (Sprint 5)

Description:

This milestone marks the implementation of the Story Engine, grouping connected memories and relationships into long-running narrative arcs (Stories) that model the user's progress.

### Added

- **Story Subsystem**: Created `src/services/stories/` containing models, rules, and services.
- **Narrative Story Model**: Defined the `Story` data structure in `stories/types.ts` containing the title, status, summary, and arrays of linked memory IDs and relationship IDs.
- **Story Rules Engine**: Implemented deterministic clustering rules in `stories/story-rules.ts`:
  - **Project Clustering Rule**: Automatically routes project memories/relationships to dedicated project narrative arcs.
  - **Reflection Cluster Rule**: Automatically groups note reflection memories into a central `"Personal Growth Reflections"` Story.
- **Story Service**: Manages the story cache, supports mutations, and dispatches `"Created" | "Updated"` notifications to registered subscribers.
- **Story Builder**: Subscribes to memory promotions and relationship detections, automatically executing rules in the background.

### Changed

- **Relationship Search Extensibility**: Refactored `relationship-service.ts` to query comparison targets through a decoupled `getComparisonCandidates(newMemory)` method, preparing the module for future memory indexing.
- **Subsystem Integration**: Loaded the story subsystem in `akira-store.ts` to trigger story construction dynamically.

---

## [2.4.0-sprint-4] - 2026-06-30

Status: Implementation Completed (Sprint 4)

Description:

This milestone marks the implementation of the Memory Relationship Engine, creating the foundation for establishing graph-based semantic links between validated Memories.

### Added

- **Memory Relationship Subsystem**: Created `src/services/memory/relationships/` containing models, rules, and relationship service modules.
- **Relationship Data Model**: Defined the `MemoryRelationship` and `RelationshipType` structures, connecting source and target memories with supporting evidence and timestamp markers.
- **Relationship Discovery Rules**: Implemented deterministic check rules:
  - **Project Membership Rule (`Part Of`)**: Links memories sharing a non-null project ID.
  - **Activity Sequence Rule (`Continues`)**: Links sequential work logs for the same project chronologically.
  - **Milestone Causality Rule (`Caused By`)**: Links project completion milestones back to project creation events.
  - **Cross-Reference Rule (`References`)**: Links memories pointing to the same entities or notes.
- **Relationship Service**: Manages relationship cache arrays, exposes query tools (`getRelationshipsForMemory`), and publishes updates to registered subscribers.

### Changed

- **Subsystem Integration**: Loaded the relationship engine in `akira-store.ts` to execute relationship checking upon memory creation notifications.

---

## [2.3.0-sprint-3] - 2026-06-30

Status: Implementation Completed (Sprint 3)

Description:

This milestone marks the implementation of the Memory Validation Engine, introducing the validation subsystem that promotes raw candidates into long-term validated memories.

### Added

- **Memory Validation Subsystem**: Created `src/services/memory/validation/` containing models, rules, and validators.
- **Validated Memory Model**: Defined the `Memory` data structure in `validation/types.ts` carrying full explainability metadata (`reason`, `explanation`) and provenance tags (`sourceEventId`, `candidateId`).
- **Deterministic Validator**: Implemented the `validator` module to evaluate candidates, outputting `"Promote" | "Hold" | "Reject"` status results.
- **Validation Rules**: Implemented modular rules:
  - **Milestone Validation**: Promotes milestone candidates immediately.
  - **Goal Progress Validation**: Promotes task/mission completions, rejecting generic or blank titles (e.g. `"test"`, `"untitled"`).
  - **Reflection Validation**: Promotes note captures, holding empty notes.
  - **Activity Validation**: Promotes work activity, holding 0-minute tasks.
- **Memory Service**: Manages validated memory lists, maintains graph mapping, and exposes downstream event publisher subscriptions.

### Changed

- **Subsystem Refinements**: Refactored candidate rules and service layers to support disposable subscription listeners (`initialize` / `dispose` hooks) and dynamic rule registration (`registerRule` helper).
- **Decoupled Pipeline Flow**: Connected candidate events to validation evaluation triggers, completing the flow: `User Action` $\to$ `Event` $\to$ `Memory Candidate` $\to$ `Validation Engine` $\to$ `Memory`.

---

## [2.2.0-sprint-2] - 2026-06-30

Status: Implementation Completed (Sprint 2)

Description:

This milestone marks the completion of the Memory Candidate Engine, implementing the candidate pipeline as a decoupled transition layer between raw Events and future Memories.

### Added

- **Memory Candidate Subsystem**: Created `src/services/memory/` containing candidate models, rules, and services.
- **Candidate Data Model**: Defined the `MemoryCandidate` and `CandidateReason` schemas, supporting clear lineage links (provenance) back to original events.
- **Candidate Rules Engine**: Implemented deterministic evaluation rules for project creation, project completion (progress = 100%), continuous work check-ins, note captures, and daily tasks/mission completions.
- **Candidate Service**: Established background subscription listener to automatically inspect recorded events, evaluate candidate rules, and trigger callbacks for candidate subscribers.

### Changed

- **Store Loading Integration**: Connected the candidate engine to `akira-store.ts` to ensure automatic background evaluation of workspace events.

---

## [2.1.0-sprint-1] - 2026-06-30

Status: Implementation Completed (Sprint 1)

Description:

This milestone marks the implementation of the first phase of the Adaptive Memory Engine: the Event Layer. It introduces modular event services without memories, stories, or AI.

### Added

- **Modular Event Directory**: Created `src/services/events/` to isolate event logic.
- **Unified Event Model**: Defined the `MemoryEvent` model structure in `events/types.ts` matching the frozen AME v1.0 specifications.
- **Centralized Event Service**: Created `eventService` in `events/event-service.ts` to construct events and dispatch notifications to registered listeners.

### Changed

- **Store Decoupling**: Refactored `akira-store.ts` to delegate all event construction to the centralized `eventService.record` module, removing local code dependencies.
- **Backward Compatibility**: Preserved all state mutation payloads, UI state fields, and dashboard timeline widgets to prevent regressions.

---

## [2.0.0-architecture] - 2026-06-30

Status: Architecture Complete (Not Implemented)

Description:

This milestone marks the completion, review, and approval of AKIRA's foundational architecture before implementation.

No production functionality was added.

Instead, the complete cognitive architecture, companion philosophy, and long-term design principles were finalized and frozen for implementation.

### Added

#### Adaptive Memory Engine Architecture

Completed the architectural specification for:

- Vision
- Memory Schema
- Memory Relationships
- Memory Importance Engine
- Story Model
- Memory Lifecycle
- Memory Retrieval & Recall
- Context Builder
- Identity Layer

#### Companion Core

Defined AKIRA's behavioral philosophy including:

- Companion Philosophy
- Truth over Comfort
- Humility
- Accountability
- Compassion
- Respect for User Autonomy

#### Core Architectural Principles

Established:

- Events → Memories → Stories → Identity hierarchy
- Explainable Identity through evidence and provenance
- Story-centric reasoning
- Context Builder independent from reasoning models
- Separation of Memory, Context, AI, and Companion behavior
- Technology-independent architecture
- Honest, trustworthy, long-term companionship

### Changed

- Architecture is now frozen for implementation.
- Future architectural enhancements should be tracked in an Architecture Backlog (AME v2) instead of modifying the approved specification.

### Notes

- This milestone represents the transition from product architecture into engineering.
- The Adaptive Memory Engine and Companion Core together now serve as the constitutional foundation of AKIRA.
- No implementation code is included in this milestone.
- The next milestone begins engineering of the approved architecture.

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
