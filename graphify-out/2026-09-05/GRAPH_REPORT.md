# Graph Report - AKIRA  (2026-09-05)

## Corpus Check
- 893 files · ~542,647 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5881 nodes · 13985 edges · 350 communities (229 shown, 106 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 568 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9f3d7c0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- observability/composition.ts
- AkiraEvent
- AnalyticsService
- reflection/engine/index.ts
- reasoning/index.ts
- metrics/types.ts
- getDatabaseConnection
- RuntimeAdapter
- recall-builder.ts
- akira-store.ts
- cn
- InMemoryIdentityRepository
- IdentityRepository
- telemetry.ts
- routeTree.gen.ts
- identity/types.ts
- AKIRA ADR Process
- AnalyticsEngine.ts
- relationships/service.ts
- diagnostics-service.ts
- context-rules.ts
- IdentityService
- sidebar.tsx
- retention/policy.ts
- TelemetrySeverity
- habits/types.ts
- state/types.ts
- CapabilityRegistry
- vault.test.ts
- brain.tsx
- openrouter-provider.ts
- GoalDecompositionService.ts
- lifecycle-manager.ts
- PresenceContext
- telemetry-store.ts
- PlanningService.ts
- genesis/index.ts
- PlanningGraph
- VaultWorkspace.tsx
- context-resolution/service.ts
- repositories/index.ts
- knowledge/service.ts
- DependencyResolver
- understanding/rules.ts
- context-engine.ts
- runtime-manager.ts
- ModuleManifest
- story-service.ts
- relationship-service.ts
- PlanningService
- projects.tsx
- goals/service.ts
- MilestoneRepository
- IModuleInstance
- Companion Intelligence Layer
- VaultFile
- search/services/index.ts
- VaultFolder
- initiative/service.ts
- Awareness Evolution
- lib/utils.ts
- DAT-001 Fire-And-Forget Database Writes
- useAkira
- IdentityGraphService
- PlanningValidationService
- Task
- TelemetryError
- compilerOptions
- Note
- IdentityEvidence
- MemoryEvent
- reflection/service.ts
- SqliteVaultFileRepository
- IdentityGoal
- IdentityInterest
- Task
- pagination.tsx
- IdentityHabit
- IdentityPersonality
- IdentitySkill
- akira-os/index.ts
- RendererRegistry.ts
- SqliteVaultTagRepository
- IdentityValue
- REL-002 Synchronous Spin-Wait Blocks The Server Event Loop
- instrumentation.test.ts
- perf-ab.ts
- validate-architecture.ts
- globalEventBus
- analytics-service.ts
- GenesisRealityAdapter
- Milestone
- GEN-002 No Cognitive State Survives A Restart
- getDatabasePath
- Project
- IdentityContextProvider
- components.json
- TimelineSubscriber
- Failure-Mode Matrix
- SEC-005 Permission Framework Grants And Denies Nothing
- akira-store
- timeline.tsx
- SqliteSessionRepository.ts
- genesis-planning.test.ts
- PermissionManager
- MockService
- Memory Policy
- Awareness Session
- IdentityConfidence
- PermissionRequiredError
- AnalyticsRepository
- Instrumentation Event Bus (globalEventBus)
- TimelineRepository
- menubar.tsx
- SqliteTimelineRepository
- eventBus
- Consolidated Semantic Memory
- Documentation Accuracy Scorecard
- Context Builder
- Companion Presence
- Stage 1B — Diagnostics Subsystem Investigation
- scripts
- verify-observability-reachability.ts
- tools.index.tsx
- command.tsx
- IdentityPreference
- IdentityRelationship
- Recommendation
- store-init.ts
- RuntimeManager
- genesis-reviewer Subagent
- CapabilityRegistry
- CRIT-007 No Automated Quality Gate Exists
- Severance S4 — Dead Story and Importance Builders
- devDependencies
- __root.tsx
- tools.vault.tsx
- timeline/service.ts
- form.tsx
- search.tsx
- TelemetryServiceImpl
- SDKContext
- createServerFn RPC Layer
- ADR-021: Observability Platform Architecture
- carousel.tsx
- AIProviderManager
- dependencies
- LifecycleManager
- Phase A — Build Recovery
- server.ts
- MetricRegistry
- sdk-context.ts
- CLAUDE.md Governance Router
- alert.tsx
- Memory Importance Engine
- createDefaultStrategyRegistry
- ContextAssemblyService
- Stage 1C Part A — Repository Integrity
- AKIRA Changelog
- resource-sampler.ts
- SqliteSettingsRepository.ts
- genesis-production-composition.test.ts
- Invariant: UI Never Reaches the Database
- TelemetryService (Core Facade)
- DAT-002 Vault Dedup Corrupts Siblings On Soft Delete
- Module State Machine (UNLOADED to RUNNING)
- Module Manifest System
- Data Protection Philosophy
- chart.tsx
- useUploadQueue.ts
- sdk-errors.ts
- event-contract.test.ts
- @hookform/resolvers
- /pre-pr Skill
- BND-004: Nine GENESIS modules self-initialise at import time
- telemetry_records Table
- AKIRA OS v1.1 Final Release Audit
- LoggerFacade
- Observability Platform
- ReasoningEngine
- RealityAdapter
- TelemetryClock
- genesis-context-inclusion-reason.bench.ts
- SimpleMetricRegistry
- What Should Not Be Changed
- Identity Layer
- DecisionEngine
- Shell.tsx
- check-module-boundaries.mjs
- format-edited-file.mjs
- input-otp
- akira-sdk.ts
- /bench-genesis Skill
- Rule 2.3 Service Dominance
- UI Must Not Import Repositories
- TelemetryBase
- RelevanceEngine
- ContextIntelligenceService
- projects SQLite Table
- Nine Local GENESIS Subsystem Emitters
- navigation-menu.tsx
- Temporary Database Mocking (temp_e2e_akira.db)
- contract-auditor Subagent
- ADR-010: Instrumentation Reliability
- ContextManager (AsyncLocalStorage)
- RingBuffer (async boundary)
- timeline_events SQLite Table
- Manifest Validation Rules
- vault-security.test.ts
- TimelineErrorBoundary
- SimpleMetricRegistry
- recharts
- @tanstack/react-virtual
- Failure Isolation Policies
- BND-001: AKIRA OS to GENESIS event path is severed
- AuditFacade
- Dependency Rules Matrix
- package.json
- EventAPI
- TimelineAPI
- Sliding-Window Telemetry Retention
- Story
- Session Intent
- validateMigration.ts
- error/lovable-error-reporting.ts
- Recall and Ranking Regression
- persistAddNote
- Shell layoutMode prop
- EventBusObserver
- migrate-runall.ts
- identityService (identityFoundationService)
- IModuleLogger
- SimpleEventBus
- TelemetryValidator
- Audit 02: Architectural Boundary Audit
- DEP-005: SDK erases all error information
- ErrorState.tsx
- check_real_db.ts
- check_temp_db.ts
- Known-Good Patterns (Do Not Flag)
- Phase Share (Ratios Survive, Absolutes Do Not)
- FORGE Developer Interface
- TITAN Background Processor
- timeline-fallback-durability.test.ts
- AbstractTelemetryService
- cmdk
- Component Layout Structure
- date-fns
- Resilient Initialization (Module Fault Isolation)
- Directed Acyclic Graph Module Representation
- Immutable Unified Telemetry Model
- Unmeasurable Dimensions Are Absent, Never Zero
- observability/auto-compose.ts
- Fail-Silent Execution
- Immutable Storage Principle
- Separation of Read/Write Packages
- Telemetry Performance Budgets
- Audit 04: AKIRA OS Platform Audit
- Strategy Crash-Isolation Test Pattern
- Loop Prevention and Bus Depth Guard
- Relationship Engine (Companion Intelligence Sprint 5)
- embla-carousel-react
- SqliteSearchHistoryRepository.ts
- TelemetryCorrelation
- TimerImpl
- MetricValidationError
- provider-manager.ts
- metrics/registry.ts
- lucide-react
- .mcp.json
- genesis-chat-intake-cost.bench.ts
- MetricAggregator
- MarkdownRenderer.tsx
- genesis-core-class-composition.bench.ts
- @radix-ui/react-avatar
- genesis-core-reachability.test.ts
- @radix-ui/react-collapsible
- @radix-ui/react-dialog
- MetricSnapshot
- @radix-ui/react-hover-card
- @radix-ui/react-label
- genesis-story-structured-reference.test.ts
- @radix-ui/react-navigation-menu
- timeline.test.ts
- @radix-ui/react-progress
- input-otp.tsx
- @radix-ui/react-scroll-area
- insights/index.ts
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- genesis-relationship-adjacency-index.test.ts
- WorkspaceProvider
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react
- react-day-picker
- react-dom
- tailwind-merge
- tailwindcss
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-router
- @tanstack/react-start
- @tanstack/router-plugin
- tw-animate-css
- vite-tsconfig-paths
- zod
- AKIRA OS Product Overview
- Daily Mission Control
- Caches and Normalisation Regression
- Identifier Confusion Regression
- Provenance Regression (Where a Fact Came From)
- Humans Decide, AI Implements
- No Event Loop Blocking
- Comment Intent Rule (Why, Not What)
- Git Branching Strategy (main/develop/feature)
- Semantic Commit Message Format
- src/app/ (Shell, UI Wrapper, Design System)
- Dormant Projects Identification
- Focus Sessions Normalization
- Productivity Score Formula
- ADR-013: Analytics Query Layer
- ADR-015: Analytics Reliability & Self-Recovery
- AnalyticsValidator
- Rejected Alternative: OpenTelemetry SDK in Business Modules
- Event Bus Observability Subscriber
- Local Isolation & Consent Boundaries
- Application Entry Points
- BND-010: Four file-level dependency cycles
- DEP-013: VaultStorageService name collision (server vs client proxy)
- GEN-009 Single-User Content Hard-Coded In Cognitive Engines
- Capability Error Types
- Manifest Authoring Best Practices
- Voice Brain Dump Integration (Future)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 220 edges
2. `IdentityRepository` - 179 edges
3. `InMemoryIdentityRepository` - 103 edges
4. `IdentityService` - 102 edges
5. `AkiraEvent` - 73 edges
6. `getDatabaseConnection()` - 65 edges
7. `PlanningService` - 51 edges
8. `TelemetrySeverity` - 50 edges
9. `TelemetryMetadata` - 48 edges
10. `TelemetryRecord` - 45 edges

## Surprising Connections (you probably didn't know these)
- `Evolution Engine` --semantically_similar_to--> `Event Store`  [INFERRED] [semantically similar]
  src/genesis/identity/README.md → docs/recovery/phase-b-event-architecture-reconciliation.md
- `Module Manifest System` --semantically_similar_to--> `Module Directory Structure Blueprint`  [INFERRED] [semantically similar]
  docs/MANIFEST.md → MODULE_CONTRACT.md
- `Thin Wrapper Pattern` --semantically_similar_to--> `Rule 2.3 Service Dominance`  [INFERRED] [semantically similar]
  docs/SDK.md → MODULE_CONTRACT.md
- `Composition and Wiring Order Regression` --semantically_similar_to--> `ModuleContext`  [INFERRED] [semantically similar]
  .claude/agents/genesis-reviewer.md → docs/RUNTIME.md
- `Confidence Engine` --semantically_similar_to--> `Memory Importance Engine (Sprint 7)`  [INFERRED] [semantically similar]
  src/genesis/identity/README.md → docs/shared/sprint_report.md

## Import Cycles
- 4-file cycle: `src/components/vault/FileGrid.tsx -> src/components/vault/Thumbnail.tsx -> src/routes/tools.vault.tsx -> src/components/vault/VaultWorkspace.tsx -> src/components/vault/FileGrid.tsx`
- 4-file cycle: `src/components/vault/FileList.tsx -> src/components/vault/Thumbnail.tsx -> src/routes/tools.vault.tsx -> src/components/vault/VaultWorkspace.tsx -> src/components/vault/FileList.tsx`
- 4-file cycle: `src/components/vault/PreviewPanel.tsx -> src/hooks/usePreview.ts -> src/routes/tools.vault.tsx -> src/components/vault/VaultWorkspace.tsx -> src/components/vault/PreviewPanel.tsx`

## Hyperedges (group relationships)
- **Analytics Derivation Pipeline (events to derived tables to DTOs)** — docs_adr_adr_011_analytics_architecture_analyticsengine, docs_adr_adr_011_analytics_architecture_metriccalculator, docs_adr_adr_013_analytics_query_layer_analyticsservice, docs_adr_adr_015_analytics_reliability_rebuildmanager, docs_adr_adr_011_analytics_architecture_daily_metrics [EXTRACTED 1.00]
- **Session context ownership handover chain** — docs_genesis_architecture_companion_core_01_companion_lifecycle_companion_session, docs_genesis_architecture_companion_core_02_awareness_session_awareness_session, docs_genesis_architecture_companion_core_02_awareness_session_awareness_snapshot, docs_genesis_architecture_companion_intelligence_02_companion_state_engine_companion_state_engine, docs_genesis_architecture_companion_core_01_companion_lifecycle_reflection_stage [EXTRACTED 1.00]
- **Memory-to-prompt context assembly pipeline** — docs_genesis_architecture_adaptive_memory_engine_08_context_builder_adaptive_memory_engine, docs_genesis_architecture_adaptive_memory_engine_07_memory_retrieval_and_recall_retrieval_and_recall_engine, docs_genesis_architecture_adaptive_memory_engine_08_context_builder_context_builder, docs_genesis_architecture_adaptive_memory_engine_08_context_builder_ai_context_engine, docs_genesis_architecture_adaptive_memory_engine_08_context_builder_reasoning_engine [EXTRACTED 1.00]
- **GENESIS Context to Decision Cognitive Pipeline** — docs_genesis_architecture_contextintelligence_contextassemblyresult, docs_genesis_architecture_reflectionengine_reflectionresult, docs_genesis_architecture_reasoningengine_reasoningresult, docs_genesis_architecture_decisionengine_decisioncollection [EXTRACTED 1.00]
- **The Three Independent Breaks In The GENESIS Pipeline** — docs_audits_05_genesis_cognitive_system_gen_001, docs_audits_05_genesis_cognitive_system_gen_002, docs_audits_05_genesis_cognitive_system_gen_003, docs_audits_akira_master_audit_crit_002, docs_audits_akira_master_audit_crit_004 [EXTRACTED 1.00]
- **The Four Severances Cutting GENESIS Off From Reality** — docs_recovery_event_pipeline_remediation_design_s1_wrong_bus, docs_recovery_event_pipeline_remediation_design_s2_task_completed_constant, docs_recovery_event_pipeline_remediation_design_s3_note_name_drift, docs_recovery_event_pipeline_remediation_design_s4_dead_builder_barrels, docs_recovery_event_pipeline_remediation_design_realityadapter [EXTRACTED 1.00]
- **The Missing Quality Gate Cascade** — docs_audits_08_testing_audit_tst_001, docs_audits_11_code_quality_qua_001, docs_audits_12_documentation_audit_doc_001, docs_audits_akira_master_audit_crit_007, docs_audits_07_reliability_and_failure_rel_001 [EXTRACTED 1.00]
- **Platform Runtime Module Boot Chain** — docs_adr_adr_016_platform_runtime_runtimemanager, docs_adr_adr_017_module_manifest_manifest_file, docs_adr_adr_018_dependency_resolution_dfs_topological_sort, docs_adr_adr_019_lifecycle_manager_lifecyclemanager, docs_adr_adr_020_capability_registry_capabilityregistry [EXTRACTED 1.00]
- **The Severed Event Seam (bus split, registry collision, silent bridge)** — docs_audits_02_architecture_boundaries_bnd_001, docs_audits_02_architecture_boundaries_bnd_002, docs_audits_04_akira_os_platform_plt_005, docs_audits_04_akira_os_platform_plt_007, docs_audits_02_architecture_boundaries_legacy_event_bus_bridge [EXTRACTED 1.00]
- **Subsystem contexts reconciled into the Resolved Context** — docs_genesis_architecture_companion_intelligence_01_presence_engine_presence_context, docs_genesis_architecture_companion_intelligence_02_companion_state_engine_companion_state, docs_genesis_architecture_companion_intelligence_03_goal_engine_goal_context, docs_genesis_architecture_companion_intelligence_04_knowledge_engine_knowledge_context, docs_genesis_architecture_companion_intelligence_05_relationship_engine_relationship_context, docs_genesis_architecture_companion_intelligence_06_habit_intelligence_habit_context, docs_genesis_architecture_companion_intelligence_00_system_overview_reflection_context, docs_genesis_architecture_companion_intelligence_00_system_overview_context_resolution_engine, docs_genesis_architecture_companion_intelligence_00_system_overview_resolved_context [EXTRACTED 1.00]
- **Telemetry Asynchronous Offloading Pipeline** — docs_akira_os_architecture_observability_observability_api_telemetryservice, docs_akira_os_architecture_observability_dataflow_ringbuffer, docs_akira_os_architecture_observability_dataflow_asyncprocessor, docs_akira_os_architecture_observability_dataflow_telemetryrepository, docs_akira_os_architecture_observability_storage_strategy_batch_insertion [EXTRACTED 1.00]
- **Client-to-Database Boundary Chain** — architecture_reactive_client_cache, module_contract_rule_2_3_service_dominance, architecture_rpc_layer, architecture_repository_contract, architecture_sqlite_database, claude_invariant_ui_never_reaches_database [EXTRACTED 1.00]
- **Companion Intelligence context pipeline: specialized contexts to Resolved Context to Initiative Decision** — docs_genesis_architecture_decisions_adr_008_goal_engine_goal_context, docs_genesis_architecture_decisions_adr_009_knowledge_engine_knowledge_context, docs_genesis_architecture_decisions_adr_010_relationship_engine_relationship_context, docs_genesis_architecture_decisions_adr_011_habit_intelligence_habit_context, docs_genesis_architecture_companion_intelligence_07_reflection_engine_reflection_context, docs_genesis_architecture_companion_intelligence_08_context_resolution_engine_resolved_context, docs_genesis_architecture_companion_intelligence_09_initiative_engine_initiative_decision [EXTRACTED 1.00]
- **ADR-001 unidirectional memory-to-inference pipeline** — docs_genesis_architecture_decisions_adr_001_memory_and_ai_separation_adaptive_memory_engine, docs_genesis_architecture_decisions_adr_001_memory_and_ai_separation_recall_engine, docs_genesis_architecture_decisions_adr_001_memory_and_ai_separation_context_builder, docs_genesis_architecture_decisions_adr_001_memory_and_ai_separation_ai_context_engine, docs_genesis_architecture_decisions_adr_001_memory_and_ai_separation_reasoning_model [EXTRACTED 1.00]
- **Pre-PR Verification Gauntlet** — claude_verify_pipeline, contributing_verify_pipeline, _claude_skills_pre_pr_skill_pre_pr, claude_verify_observability, contributing_adr_022, _claude_skills_pre_pr_skill_validate_architecture [EXTRACTED 1.00]
- **GENESIS Cognitive Pipeline: Event to Prompt** — docs_recovery_phase_b_event_architecture_reconciliation_genesiseventservice, docs_recovery_phase_b_event_architecture_reconciliation_candidateruleengine, docs_shared_sprint_report_memoryvalidationengine, docs_shared_sprint_report_storyengine, docs_shared_sprint_report_memoryimportanceengine, docs_shared_sprint_report_contextbuilder, docs_shared_sprint_report_aicontextengine [INFERRED 0.85]
- **Verification That Reported Success Without Exercising Anything** — docs_recovery_vault_security_data_integrity_recovery_d0_dead_test_suite, docs_recovery_stage_1b_diagnostics_investigation_subsystem_c_analytics_diagnostics, docs_recovery_phase_b_event_architecture_reconciliation_neverexercised, docs_recovery_stage_1b_clean_install_verification_f1_clone_does_not_build, docs_recovery_event_pipeline_remediation_design_reachability_test_class [INFERRED 0.85]
- **Memory Significance & Narrative Model** — docs_genesis_architecture_adaptive_memory_engine_02_memory_schema_salience, docs_genesis_architecture_adaptive_memory_engine_02_memory_schema_strength, docs_genesis_architecture_adaptive_memory_engine_04_memory_importance_engine_importance_signals, docs_genesis_architecture_adaptive_memory_engine_05_story_model_story [INFERRED 0.85]
- **Module Runtime Boot Flow** — docs_runtime_runtimemanager, docs_manifest_discovery_process, docs_dependencies_topological_sort, docs_lifecycle_module_state_machine, docs_capabilities_provider_registration_lifecycle, docs_sdk_sdkcontext [INFERRED 0.85]
- **Provenance preservation implemented across Reflection, Knowledge, Habit and Identity contexts** — docs_genesis_architecture_companion_intelligence_08_context_resolution_engine_provenance_preservation, docs_genesis_architecture_companion_intelligence_07_reflection_engine_reflection_context, docs_genesis_architecture_decisions_adr_009_knowledge_engine_knowledge_context, docs_genesis_architecture_decisions_adr_011_habit_intelligence_habit_context, docs_genesis_architecture_decisions_adr_003_emergent_identity_traceable_lineage [INFERRED 0.85]
- **Vault Dedup Lifecycle Data-Loss Defect** — docs_audits_06_data_integrity_dat_002, docs_audits_06_data_integrity_dat_003, docs_audits_akira_master_audit_crit_006, docs_modules_vault_vault_storage_service, docs_audits_08_testing_audit_tst_002 [INFERRED 0.85]

## Communities (350 total, 106 thin omitted)

### Community 0 - "observability/composition.ts"
Cohesion: 0.06
Nodes (17): EventDeliveryObserver, initializeObservability(), isObservabilityInitialized(), recordHealthTransition(), shutdownObservability(), ComponentHealth, ComponentHealthOptions, ComponentHealthStatus (+9 more)

### Community 1 - "AkiraEvent"
Cohesion: 0.05
Nodes (27): CustomCalculator, REALITY_ADAPTER_ID, RealityAdapterMetrics, EventBus, EventDelivery, globalEventBus, EventRepository, EventService (+19 more)

### Community 2 - "AnalyticsService"
Cohesion: 0.11
Nodes (8): ActivityCalculator, ProductivityCalculator, VaultCalculator, AnalyticsService, DashboardSummaryDTO, AnalyticsQueryOptions, QueryService, validateAndResolveQuery()

### Community 3 - "reflection/engine/index.ts"
Cohesion: 0.07
Nodes (31): ThresholdSelectionPolicy, ContextAssemblyService, ContextAssemblyResult, SelectedContext, SelectionPolicy, ContextProviderRegistry, ContextIntelligenceService, CandidateContext (+23 more)

### Community 4 - "reasoning/index.ts"
Cohesion: 0.10
Nodes (25): DecisionEngine, DecisionStrategyRegistry, Decision, DecisionCollection, DecisionStrategy, DecisionType, CONFIDENCE_ANALYZE_EVIDENCE, CONFIDENCE_COLLECT_CONTEXTS (+17 more)

### Community 5 - "metrics/types.ts"
Cohesion: 0.16
Nodes (7): ActiveTimer, Gauge, Histogram, HistogramData, Metric, MetricType, MetricBase

### Community 6 - "getDatabaseConnection"
Cohesion: 0.06
Nodes (21): DailyMetrics, HistoricalAggregates, ProjectMetrics, AnalyticsRepository, SqliteAnalyticsRepository, AnalyticsValidator, DiagnosticIssue, DiagnosticResult (+13 more)

### Community 7 - "RuntimeAdapter"
Cohesion: 0.05
Nodes (27): AnalyticsAdapter, EventAdapter, MemoryAdapter, NotificationAdapter, SearchAdapter, StorageAdapter, TimelineAdapter, WorkspaceAdapter (+19 more)

### Community 8 - "recall-builder.ts"
Cohesion: 0.04
Nodes (34): MemoryImportance, buildRecallEvaluationContext(), classifyMemory(), computeSemanticRelevance(), getStems(), IGNORE_WORDS, MemoryCategory, normalisedMemoryText() (+26 more)

### Community 9 - "akira-store.ts"
Cohesion: 0.03
Nodes (38): ClearListener, clearListeners, EvictionListener, evictionListeners, listeners, memories, MemoryListener, emit() (+30 more)

### Community 10 - "cn"
Cohesion: 0.05
Nodes (58): AccordionContent, AccordionItem, AccordionTrigger, Avatar, AvatarFallback, AvatarImage, Breadcrumb, BreadcrumbEllipsis() (+50 more)

### Community 11 - "InMemoryIdentityRepository"
Cohesion: 0.04
Nodes (6): InMemoryIdentityRepository, uid(), IdentityChangeType, IdentitySnapshot, IdentityTimeline, IdentityVersion

### Community 12 - "IdentityRepository"
Cohesion: 0.04
Nodes (5): IdentityRepository, IdentityPreferenceService, IdentityRelationshipService, IdentityValidationService, IdentityGraph

### Community 13 - "telemetry.ts"
Cohesion: 0.10
Nodes (27): ADR-0022, TelemetryIdGenerator, TelemetryPipelineStage, TelemetryProvider, TelemetrySink, MetricDataPoint, TelemetryMetadataArray, TelemetryMetadataValue (+19 more)

### Community 14 - "routeTree.gen.ts"
Cohesion: 0.05
Nodes (49): getRouter(), Route, Route, Route, Route, Route, Route, Route (+41 more)

### Community 15 - "identity/types.ts"
Cohesion: 0.16
Nodes (35): DomainEvent, Events, callbacks, EventCallback, eventService, PersistHandler, defaultIdentityRepository, IdentityConfidenceService (+27 more)

### Community 16 - "AKIRA ADR Process"
Cohesion: 0.05
Nodes (55): Workspace Canvas Shell (Shell.tsx), Dynamic Tool Registry (toolsRegistry), Archived Reflection Context, Preserve Uncertainty, Reflection Confidence, Reflection Context, Reflection Engine, Temporal Decoupling of Reflection (+47 more)

### Community 17 - "AnalyticsEngine.ts"
Cohesion: 0.04
Nodes (22): AnalyticsEngine, AnalyticsSubscriber, ActivitySummary, DailyActiveProjectsMetricCalculator, DailyFileMetricCalculator, DailyNoteMetricCalculator, DailySearchMetricCalculator, DailySessionMetricCalculator (+14 more)

### Community 18 - "relationships/service.ts"
Cohesion: 0.12
Nodes (24): buildRelationshipContext(), CONFIDENCE_PERSON_OBSERVED, CONFIDENCE_RELATIONSHIP_ARCHIVED, CONFIDENCE_RELATIONSHIP_EVOLVED, CONFIDENCE_RELATIONSHIP_IDENTIFIED, CONFIDENCE_RELATIONSHIP_REFINED, CONFIDENCE_RELATIONSHIP_UNDERSTOOD, CONFIDENCE_RELATIONSHIP_VERIFIED (+16 more)

### Community 19 - "diagnostics-service.ts"
Cohesion: 0.07
Nodes (19): TelemetryValidator, DiagnosticRegistry, DiagnosticsService, CategoryRegistrationError, DiagnosticRegistrationError, DiagnosticsValidationError, LoggerConfigurationError, LoggerValidationError (+11 more)

### Community 20 - "context-rules.ts"
Cohesion: 0.06
Nodes (38): ACTIVE_PROJECT_REASON, STATED_ASPIRATION_REASON, ContextItem, isProjectArc(), isReflectionsArc(), PROJECT_ARC_TITLE_PREFIX, projectArcProjectName(), projectArcTitleRemainder() (+30 more)

### Community 21 - "IdentityService"
Cohesion: 0.06
Nodes (4): IdentityService, uid(), Identity, IdentityProfile

### Community 22 - "sidebar.tsx"
Cohesion: 0.06
Nodes (40): Input, Separator, SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetHeader(), SheetOverlay (+32 more)

### Community 23 - "retention/policy.ts"
Cohesion: 0.04
Nodes (27): rankedActive(), importanceCache, ImportanceListener, listeners, applyDurableRetention(), applyRuntimeRetention(), classifyDurability(), DEFAULT_RETENTION_POLICY (+19 more)

### Community 24 - "TelemetrySeverity"
Cohesion: 0.10
Nodes (16): TelemetryFactory, TelemetryRecord, ReportedDiagnostic, Logger, deepFreeze(), TelemetryMetadata, TelemetrySeverity, CRITICAL (+8 more)

### Community 25 - "habits/types.ts"
Cohesion: 0.10
Nodes (30): buildHabitContext(), CONFIDENCE_BEHAVIOR_OBSERVED, CONFIDENCE_HABIT_ARCHIVED, CONFIDENCE_HABIT_ESTABLISHED, CONFIDENCE_HABIT_EVOLVES, CONFIDENCE_HABIT_VERIFIED, CONFIDENCE_HABIT_WEAKENS, CONFIDENCE_PATTERN_DETECTED (+22 more)

### Community 26 - "state/types.ts"
Cohesion: 0.09
Nodes (26): buildCompanionState(), AMBIGUITY_CONFIDENCE_RECOVERY, CONFLICTING_EVIDENCE_CONFIDENCE, INITIAL_SNAPSHOT_CONFIDENCE, INSUFFICIENT_CONTEXT_CONFIDENCE, TOPIC_SHIFT_CONFIDENCE_DECAY, VERIFIED_EVIDENCE_CONFIDENCE, WORKSPACE_MATCH_CONFIDENCE (+18 more)

### Community 27 - "CapabilityRegistry"
Cohesion: 0.10
Nodes (13): CapabilityBinding, Capability, CapabilityError, CapabilityNotFoundError, CapabilityVersionMismatchError, DuplicateCapabilityRegistrationError, InvalidCapabilityMetadataError, InvalidCapabilityPriorityError (+5 more)

### Community 28 - "vault.test.ts"
Cohesion: 0.10
Nodes (30): getRawFileBase64Rpc, persistCreateFolder, persistDeleteFile, persistDeleteFolder, persistLinkTagToFile, persistMoveFile, persistMoveFolder, persistPermanentDeleteFile (+22 more)

### Community 29 - "brain.tsx"
Cohesion: 0.08
Nodes (23): CandidateReason, MemoryCandidate, CandidateRule, rules, candidateHistory, CandidateListener, candidateService, listeners (+15 more)

### Community 30 - "openrouter-provider.ts"
Cohesion: 0.15
Nodes (18): initialProvider, AIProvider, geminiAdapter, GeminiProvider, parseJSONStream(), uid(), handleOpenRouterError(), openrouterAdapter (+10 more)

### Community 31 - "GoalDecompositionService.ts"
Cohesion: 0.09
Nodes (15): InMemoryTemplateRepository, TemplateRepository, GoalClassifier, GoalDecompositionService, uid(), GoalCategory, Career, Education (+7 more)

### Community 32 - "lifecycle-manager.ts"
Cohesion: 0.09
Nodes (24): LifecycleError, LifecycleHookError, LifecycleTimeoutError, LifecycleTransitionError, RestartError, RollbackError, LifecycleEvents, LifecycleHooks (+16 more)

### Community 33 - "PresenceContext"
Cohesion: 0.10
Nodes (25): buildPresenceContext(), AFTERNOON_START_HOUR, CONTINUITY_MAX_DECAY_GAP, CONVERSATION_CONTINUITY_THRESHOLD, EVENING_START_HOUR, MORNING_START_HOUR, NEXT_DAY_GAP_THRESHOLD, NIGHT_START_HOUR (+17 more)

### Community 34 - "telemetry-store.ts"
Cohesion: 0.05
Nodes (16): severityToNumber(), percentile(), PerformanceMonitor, DEFAULT_OBSERVABILITY_RETENTION, getObservabilityRetention(), ObservabilityRetentionPolicy, ADR-0021, ADR-0022 (+8 more)

### Community 35 - "PlanningService.ts"
Cohesion: 0.22
Nodes (17): DomainEventName, AdaptivePlanningService, RecommendationService, BlockerSeverity, DependencyType, MilestoneStatus, PlanAnalysisResult, PlanDiagnostics (+9 more)

### Community 36 - "genesis/index.ts"
Cohesion: 0.05
Nodes (7): GenesisProcessor, initializeGenesisCognition(), memoryService, recallBuilder, db, KEYS, THIS_YEAR

### Community 37 - "PlanningGraph"
Cohesion: 0.15
Nodes (16): createHealthRuleEngine(), HealthEvaluation, HealthRule, HealthRuleEngine, CompletedRule, DerivedCompletionRule, HealthyRule, InactiveRule (+8 more)

### Community 38 - "VaultWorkspace.tsx"
Cohesion: 0.08
Nodes (20): ContextMenu(), ContextMenuProps, EmptyState(), EmptyStateProps, MetadataPanel(), MetadataPanelProps, VaultLayout(), VaultLayoutProps (+12 more)

### Community 39 - "context-resolution/service.ts"
Cohesion: 0.15
Nodes (14): buildResolvedContext(), BASELINE_CONFIDENCE_THRESHOLD, ContextResolutionCallback, ContextResolutionEvent, contextResolutionEvents, ContextResolutionEventType, listeners, resolveUnifiedContext() (+6 more)

### Community 40 - "repositories/index.ts"
Cohesion: 0.10
Nodes (28): persistAddProject, persistDeleteProject, persistTouchProject, persistUpdateProject, projectsService, persistEndSession, persistStartSession, persistUpdateActiveTask (+20 more)

### Community 41 - "knowledge/service.ts"
Cohesion: 0.12
Nodes (24): buildKnowledgeContext(), KNOWLEDGE_DEPRECATED_CONFIDENCE, KNOWLEDGE_INFERRED_CONFIDENCE, KNOWLEDGE_OBSERVED_CONFIDENCE, KNOWLEDGE_REFINED_CONFIDENCE, KNOWLEDGE_REINFORCED_CONFIDENCE, KNOWLEDGE_UPDATED_CONFIDENCE, KNOWLEDGE_VERIFIED_CONFIDENCE (+16 more)

### Community 42 - "DependencyResolver"
Cohesion: 0.11
Nodes (12): CircularDependencyError, DependencyError, DuplicateDependencyError, InvalidDependencyError, MissingDependencyError, SelfDependencyError, DependencyGraph, DependencyNode (+4 more)

### Community 43 - "understanding/rules.ts"
Cohesion: 0.05
Nodes (45): arraysEqual(), buildInsightGraph(), insightEngine, InsightListener, insights, listeners, notifyListeners(), rebuildInsights() (+37 more)

### Community 44 - "context-engine.ts"
Cohesion: 0.20
Nodes (15): getWorkspaceProvider(), registerWorkspaceProvider(), aiContextEngine, promptBuilder, contextRelevanceSelector, SelectedContext, ContextPackage, intentClassifier (+7 more)

### Community 45 - "runtime-manager.ts"
Cohesion: 0.11
Nodes (16): IModuleEventBus, ModuleContext, ModuleDefinition, ModuleInstance, IModuleLoader, ModuleLoader, isValidTransition(), ModuleState (+8 more)

### Community 46 - "ModuleManifest"
Cohesion: 0.12
Nodes (18): DuplicateCapabilityError, DuplicateModuleError, DuplicateRouteError, InvalidVersionError, ManifestError, ManifestValidationError, MissingFieldError, UnknownPropertyError (+10 more)

### Community 47 - "story-service.ts"
Cohesion: 0.05
Nodes (38): dirty, flushAll(), flushers, FlushPhase, isBatching(), markDirty(), PHASE_ORDER, registerFlusher() (+30 more)

### Community 48 - "relationship-service.ts"
Cohesion: 0.07
Nodes (33): GENESIS_COGNITIVE_PROCESSORS, importanceBuilder, ImportanceRule, importanceRules, importanceService, ImportanceSignal, SignalType, RelationshipRule (+25 more)

### Community 49 - "PlanningService"
Cohesion: 0.09
Nodes (3): PlanningService, Plan, Progress

### Community 50 - "projects.tsx"
Cohesion: 0.18
Nodes (19): PageHeader(), Shell(), ConfirmDialog(), GlassDialog(), VoiceComingSoonDialog(), CardLabel(), CardShell(), EmptyState() (+11 more)

### Community 51 - "goals/service.ts"
Cohesion: 0.13
Nodes (20): buildGoalContext(), GOAL_AMBIGUOUS_CONFIDENCE, GOAL_CLARIFIED_CONFIDENCE, GOAL_CREATED_CONFIDENCE, GOAL_VERIFIED_CONFIDENCE, GoalCallback, GoalEngineEvent, goalEvents (+12 more)

### Community 52 - "MilestoneRepository"
Cohesion: 0.18
Nodes (10): BlockerRepository, DependencyRepository, InMemoryDependencyRepository, InMemoryPlanRepository, MilestoneRepository, PlanRepository, TaskRepository, PlanAnalysisService (+2 more)

### Community 53 - "IModuleInstance"
Cohesion: 0.12
Nodes (3): LifecycleManager, IRuntimeManager, IModuleInstance

### Community 54 - "Companion Intelligence Layer"
Cohesion: 0.12
Nodes (32): Consolidation Engine, Memory Merging, Identity Dimensions, Architectural Invariants, Companion Intelligence Layer, Context Resolution Engine, Evidence Verification, Initiative Engine (+24 more)

### Community 55 - "VaultFile"
Cohesion: 0.09
Nodes (9): FavoritesBar(), FavoritesBarProps, TrashView(), TrashViewProps, VaultFileRepository, VaultFileLinkRow, VaultFileRow, VaultFile (+1 more)

### Community 56 - "search/services/index.ts"
Cohesion: 0.15
Nodes (11): persistClearSearchHistory, persistDeleteSearchHistory, persistGetSearchHistory, persistRunSearch, CacheEntry, SearchManager, SearchRepository, SearchProvider (+3 more)

### Community 57 - "VaultFolder"
Cohesion: 0.13
Nodes (10): FolderNode(), FolderNodeProps, FolderTree(), FolderTreeProps, VaultSidebar(), VaultSidebarProps, VaultFolderRepository, SqliteVaultFolderRepository (+2 more)

### Community 58 - "initiative/service.ts"
Cohesion: 0.13
Nodes (19): buildInitiativeDecision(), CONFIDENCE_QUESTION, CONFIDENCE_REMINDER, CONFIDENCE_SILENCE, CONFIDENCE_SUGGESTION, MIN_CONFIDENCE_FOR_PROACTIVE_INITIATIVE, InitiativeCallback, InitiativeEvent (+11 more)

### Community 59 - "Awareness Evolution"
Cohesion: 0.09
Nodes (29): Provenance and Explainability, Companion Session, Session Outcomes, Session Principles, Conversation Cycle, Conversation Lifecycle, Graceful Abandonment, Understanding Before Response (+21 more)

### Community 60 - "lib/utils.ts"
Cohesion: 0.08
Nodes (17): Badge(), BadgeProps, badgeVariants, Checkbox, HoverCardContent, PopoverContent, Progress, ResizableHandle() (+9 more)

### Community 61 - "DAT-001 Fire-And-Forget Database Writes"
Cohesion: 0.10
Nodes (28): DAT-001 Fire-And-Forget Database Writes, DAT-009 RPC Id Passthrough Works Only Because Validation Is Absent, Optimistic State Mutation Without Reconciliation, normalizeCatastrophicSsrResponse h3 Error Normalisation, REL-003 Every Workspace Write Failure Is Invisible, REL-010 Invalid External Input Unvalidated At Every RPC Entry, TST-004 No Test Exercises The Wiring, Only The Units, Security Posture Summary (+20 more)

### Community 62 - "useAkira"
Cohesion: 0.08
Nodes (27): dailyWorkItems, Sidebar(), Topbar(), AiCore(), CaptureThoughtDialog(), StreakIcon(), TagEditor(), TagEditorProps (+19 more)

### Community 63 - "IdentityGraphService"
Cohesion: 0.10
Nodes (4): IdentityGraphService, uid(), IdentityEdge, IdentityEdgeType

### Community 64 - "PlanningValidationService"
Cohesion: 0.10
Nodes (4): DependencyService, uid(), PlanningValidationService, Dependency

### Community 65 - "Task"
Cohesion: 0.13
Nodes (5): InMemoryTaskRepository, NextActionService, TaskService, uid(), Task

### Community 66 - "TelemetryError"
Cohesion: 0.15
Nodes (8): MetricNotFoundError, MetricOverflowError, MetricTypeError, ContextError, PipelineError, TelemetryError, TelemetrySerializationError, JsonTelemetrySerializer

### Community 67 - "compilerOptions"
Cohesion: 0.07
Nodes (26): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/*.ts, src/**/*.tsx, vite/client, vite.config.ts (+18 more)

### Community 68 - "Note"
Cohesion: 0.13
Nodes (10): AddNoteInput, persistAddNote, persistDeleteNote, persistUpdateNote, AddNoteInput, notesService, NoteRepository, NoteRow (+2 more)

### Community 69 - "IdentityEvidence"
Cohesion: 0.13
Nodes (4): uid(), EvidenceMetadata, EvidenceSourceType, IdentityEvidence

### Community 70 - "MemoryEvent"
Cohesion: 0.08
Nodes (20): chatDeclarationPromoter, onEvent(), MissionCompletedPayload, NotePayload, ProjectPayload, SUPPORTED_PLATFORM_EVENT_TYPES, TaskCompletedPayload, TranslatedEvent (+12 more)

### Community 71 - "reflection/service.ts"
Cohesion: 0.18
Nodes (15): buildReflectionContext(), listeners, ReflectionCallback, ReflectionEngineEvent, reflectionEvents, ReflectionEventType, applyUserReflectionCorrection(), synthesizeReflectionReport() (+7 more)

### Community 73 - "IdentityGoal"
Cohesion: 0.11
Nodes (5): IdentityGoalService, uid(), GoalCategory, GoalPriority, IdentityGoal

### Community 74 - "IdentityInterest"
Cohesion: 0.11
Nodes (4): IdentityInterestService, uid(), IdentityInterest, InterestCategory

### Community 75 - "Task"
Cohesion: 0.15
Nodes (8): persistAddTask, persistDeleteTask, persistUpdateTask, tasksService, TaskRepository, SqliteTaskRepository, TaskRow, Task

### Community 76 - "pagination.tsx"
Cohesion: 0.12
Nodes (21): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+13 more)

### Community 77 - "IdentityHabit"
Cohesion: 0.12
Nodes (4): IdentityHabitService, uid(), HabitFrequency, IdentityHabit

### Community 78 - "IdentityPersonality"
Cohesion: 0.12
Nodes (4): IdentityPersonalityService, uid(), IdentityPersonality, PersonalityTrait

### Community 79 - "IdentitySkill"
Cohesion: 0.12
Nodes (4): IdentitySkillService, uid(), IdentitySkill, SkillCategory

### Community 80 - "akira-os/index.ts"
Cohesion: 0.18
Nodes (15): ADR-0022, CandidateNode, ChatConversation, ChatMessageItem, CompanionWorkspacePage(), EmergentTrait, generateTitle(), groupConversations() (+7 more)

### Community 81 - "RendererRegistry.ts"
Cohesion: 0.20
Nodes (13): RendererRegistryClass, GenericEventCard(), GenericEventDetail(), NoteEventCard(), NoteEventDetail(), ProjectEventCard(), ProjectEventDetail(), SessionEventCard() (+5 more)

### Community 82 - "SqliteVaultTagRepository"
Cohesion: 0.17
Nodes (4): VaultTagRepository, SqliteVaultTagRepository, VaultTagRow, VaultTag

### Community 83 - "IdentityValue"
Cohesion: 0.11
Nodes (4): IdentityValueService, uid(), IdentityValue, ValueCategory

### Community 84 - "REL-002 Synchronous Spin-Wait Blocks The Server Event Loop"
Cohesion: 0.09
Nodes (23): GEN-007 Context Filtering Keyed On Rendered Display Strings, DAT-006 Search-Cache Invalidation By Regex Over SQL Text, DAT-007 No Schema Evolution Path; Two Vault Schema Sources, DAT-011 Test Artefacts And Scratch Databases Committed, REL-002 Synchronous Spin-Wait Blocks The Server Event Loop, REL-009 Resource Leaks: Seven Intervals, Inconsistent Teardown, REL-013 Cascading-Failure Surface Is Small By Accident, TST-005 Fragile Order-Dependent Test Isolation (+15 more)

### Community 85 - "instrumentation.test.ts"
Cohesion: 0.15
Nodes (12): isSerializable(), isValidTimestamp(), composeMiddleware(), correlationIdGenerator(), defaultMiddlewarePipeline, eventIdGenerator(), generateUUID(), Middleware (+4 more)

### Community 86 - "perf-ab.ts"
Cohesion: 0.17
Nodes (13): OUT, ABResult, at(), DEFAULT_SAMPLES, DEFAULT_WARMUP, describeAB(), interleavedAB(), MIN_TRUSTWORTHY_MS (+5 more)

### Community 87 - "validate-architecture.ts"
Cohesion: 0.09
Nodes (20): ../akira-os/notes, ../akira-os/projects, ../akira-os/sessions, ../akira-os/settings, ../akira-os/tasks, assert(), cleanupTestDb(), failures (+12 more)

### Community 88 - "globalEventBus"
Cohesion: 0.10
Nodes (22): DAT-005 Event Store And Timeline Diverge Silently, DAT-010 Analytics Watermark Advances Past Unprocessed Events, TST-010 A Benchmark Masquerading As A Test, Event Store Ingest Throughput Benchmark, PERF-002 ConsistencyChecker Materialises The Whole Event Store, GENESIS Memory As Derived Replayed State, AnalyticsRepository And Derived Metric Tables, analytics_state Rebuild Watermark Table (+14 more)

### Community 89 - "analytics-service.ts"
Cohesion: 0.18
Nodes (17): DashboardBuilder, DashboardDTO, DashboardService, ActivityWidget, ProductivityWidget, ProjectWidget, SearchWidget, SessionWidget (+9 more)

### Community 91 - "Milestone"
Cohesion: 0.16
Nodes (4): InMemoryMilestoneRepository, MilestoneService, uid(), Milestone

### Community 92 - "GEN-002 No Cognitive State Survives A Restart"
Cohesion: 0.13
Nodes (21): GEN-001 GENESIS Observes No Reality, GEN-002 No Cognitive State Survives A Restart, GEN-003 GENESIS Records Its Own Lifecycle As User Reality, GEN-004 No Duplicate Detection In The Promote Path, GEN-005 Collection Getters Return The Live Internal Array, GEN-006 Prompt Assembly Has No Token Budget, GEN-008 Insight Recency Filter Triggered By Substrings, GEN-010 Companion State Snapshot Discards Three Fields (+13 more)

### Community 93 - "getDatabasePath"
Cohesion: 0.12
Nodes (18): RC-5 — Stale Local Test-Helper Calls and Dead Config, tests/database-path-safety.test.ts, ESM Import Hoisting Root Cause, getDatabasePath, In-Memory Database Default Under Test, check_real_db.ts Resolver Bypass, D0 — The Entire Vault Test Suite Was Dead, D1 — Path Traversal via Prefix Matching (+10 more)

### Community 94 - "Project"
Cohesion: 0.19
Nodes (4): ProjectRepository, ProjectRow, SqliteProjectRepository, Project

### Community 95 - "IdentityContextProvider"
Cohesion: 0.12
Nodes (3): IdentityContextProvider, IdentityHealth, IdentitySummary

### Community 96 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 97 - "TimelineSubscriber"
Cohesion: 0.13
Nodes (19): ADR-008: Event-Driven Timeline, Instrumentation Event Bus, TimelineRepository, TimelineSubscriber, Removal of Timeline DB Audit Triggers, persistPublishEvent RPC bridge, publish() unified API, Subscriber Fault Isolation (+11 more)

### Community 98 - "Failure-Mode Matrix"
Cohesion: 0.13
Nodes (19): DAT-004 Timeline Fallback Queue Is A Permanent Data Sink, DAT-008 initializeDatabase Failure Logged And Ignored, Failure-Mode Matrix, REL-005 Errors Swallowed At Every Subscriber Boundary, REL-006 publish() Throws Inside A State Reducer, REL-007 Database Initialisation Failure Does Not Stop The Server, REL-011 Corrupted Persisted Data Handled Inconsistently, REL-012 Provider Failure Falls Back To A Silent Mock (+11 more)

### Community 99 - "SEC-005 Permission Framework Grants And Denies Nothing"
Cohesion: 0.13
Nodes (19): TST-006 Excessive Mocking Hides The Defect It Should Catch, SEC-001 Unsandboxed Module Loading And startup Path Escape, SEC-005 Permission Framework Grants And Denies Nothing, QUA-009 Naming Inconsistencies Hiding Real Ambiguity, DOC-003 ROADMAP.md Contradicts The Code In Both Directions, Two Parallel Canons For TITAN And FORGE, Twenty-Two Architectural Deviations, CRIT-002 The Two Event Buses Are Not Connected (+11 more)

### Community 100 - "akira-store"
Cohesion: 0.13
Nodes (19): Shell Responsive Breakpoint Behavior, Sidebar.tsx, Developer Mode Visibility Gating, getVisibleTools, Tool Registry, Tool Interface, Tool Categories, toolsRegistry (+11 more)

### Community 101 - "timeline.tsx"
Cohesion: 0.19
Nodes (13): TimelineEvent, DetailDrawer(), DetailDrawerProps, RendererRegistry, TimelineList(), TimelineListProps, TimelineUIState, groupEventsByDate() (+5 more)

### Community 102 - "SqliteSessionRepository.ts"
Cohesion: 0.19
Nodes (5): SessionRepository, SessionRow, SettingRow, SqliteSessionRepository, WorkSession

### Community 103 - "genesis-planning.test.ts"
Cohesion: 0.18
Nodes (3): InMemoryBlockerRepository, uid(), Blocker

### Community 104 - "PermissionManager"
Cohesion: 0.16
Nodes (8): PermissionCatalog, PermissionDeniedError, PermissionNotFoundError, PermissionManager, PermissionDescriptor, PermissionGroup, PermissionScope, RiskLevel

### Community 105 - "MockService"
Cohesion: 0.12
Nodes (3): createMockContext(), MockPermissionManager, MockService

### Community 106 - "Memory Policy"
Cohesion: 0.13
Nodes (18): Active Memory, Archived Memory, Historical Memory, Memory Candidate, Memory Reinforcement, Validated Memory, Reflection Stage, Explicit User Intent (+10 more)

### Community 107 - "Awareness Session"
Cohesion: 0.14
Nodes (18): Future AI Context Engine, Context Package, Reasoning Engine, Closure Stage, The Brain, Awareness-First Architecture, Awareness Session, Awareness Snapshot (+10 more)

### Community 109 - "PermissionRequiredError"
Cohesion: 0.14
Nodes (3): PermissionRequiredError, MemoryAPI, StorageAPI

### Community 110 - "AnalyticsRepository"
Cohesion: 0.13
Nodes (17): AnalyticsEngine, AnalyticsRepository, daily_metrics table, EventRepository.findBetween(), MetricCalculator contract, project_metrics table, ADR-012: Core Metrics Framework, Range-Agnostic Calculator Execution (+9 more)

### Community 111 - "Instrumentation Event Bus (globalEventBus)"
Cohesion: 0.12
Nodes (17): Contract-First Ordering Constraint, Event Pipeline Remediation Design, Option A — Unify on the Instrumentation Bus, Option C — Reverse Bridge Between Both Buses, Severance S1 — Wrong Bus, Severance S2 — TASK_COMPLETED Constant Collision, AnalyticsSubscriber (never registered), Instrumentation Event Bus (globalEventBus) (+9 more)

### Community 112 - "TimelineRepository"
Cohesion: 0.16
Nodes (4): dbTransaction(), TimelineService, uid(), TimelineRepository

### Community 113 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 115 - "eventBus"
Cohesion: 0.12
Nodes (16): Composition and Wiring Order Regression, eventBus, TanStack File-Based Routing, GENESIS AI Context & Memory Flow, Optimistic State Mutation, Reactive Client Cache (akira-store), Read-Only WorkspaceProvider, Invariant: GENESIS Has No Workspace DB Write Access (+8 more)

### Community 116 - "Consolidated Semantic Memory"
Cohesion: 0.15
Nodes (16): 500MB telemetry.db Disk Quota, Background Pruning Scheduler, Sliding-Window Retention Policy, Adaptive Memory Engine, Consolidated Semantic Memory, Privacy and Local-First Architecture, Exponential Memory Decay Algorithm, Memory Event (+8 more)

### Community 117 - "Documentation Accuracy Scorecard"
Cohesion: 0.15
Nodes (16): GEN-013 Boot-Order Race Against Un-Hydrated Reality, GEN-014 Bootstrap Throw Path Leaves System Half-Initialised, Read-Only WorkspaceProvider Seam, REL-008 One Boot Failure Silently Disables Seven Subsystems, QUA-005 God Files (brain.tsx, chat.tsx, akira-store.ts), Documentation Accuracy Scorecard, DOC-002 Changelog Claims Seven Test Suites That Do Not Exist, DOC-005 DIRECTORY_STRUCTURE.md Omits Eleven Source Directories (+8 more)

### Community 118 - "Context Builder"
Cohesion: 0.13
Nodes (16): Memory Lifecycle, Memory Splitting, Multi-Story Resolution, Story Model, Contextual Recall, Memory Importance Engine, Passive Recall, Proactive Recall (+8 more)

### Community 119 - "Companion Presence"
Cohesion: 0.13
Nodes (16): The Companion, Accountability Without Shame, Companion Core Philosophy, Compassion, Guidance Principles, Humility, Respect for Autonomy, Truth over Comfort (+8 more)

### Community 120 - "Stage 1B — Diagnostics Subsystem Investigation"
Cohesion: 0.15
Nodes (16): Stage 1B — Clean Installation Verification, E1 — Clean Clone of Committed HEAD, E2 — Clean Copy of the Recovered Working Tree, F1 — Clean Clone of main Does Not Build, Undeclared Toolchain Expectations, Stage 1B — Diagnostics Baseline, Stage 1B — Diagnostics Subsystem Investigation, DiagnosticsService Name Collision (+8 more)

### Community 121 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:dev, dev, format, lint, preview, test (+8 more)

### Community 122 - "verify-observability-reachability.ts"
Cohesion: 0.15
Nodes (14): abort(), assertMarkerPresent(), CLIENT_DIR, clientFiles, deliveryPrefix, fail(), healthRationale, markerFromSource() (+6 more)

### Community 123 - "tools.index.tsx"
Cohesion: 0.23
Nodes (11): getEnabledTools(), getTools(), getToolsByCategory(), getVisibleTools(), Tool, toolsRegistry, getDevVisibleTools(), CATEGORIES (+3 more)

### Community 124 - "command.tsx"
Cohesion: 0.12
Nodes (14): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut() (+6 more)

### Community 125 - "IdentityPreference"
Cohesion: 0.15
Nodes (3): uid(), IdentityPreference, PreferenceCategory

### Community 126 - "IdentityRelationship"
Cohesion: 0.15
Nodes (3): uid(), IdentityRelationship, RelationshipType

### Community 127 - "Recommendation"
Cohesion: 0.17
Nodes (3): RecommendationRule, RecommendationRuleEngine, Recommendation

### Community 128 - "store-init.ts"
Cohesion: 0.31
Nodes (6): settingsRepository, getInitialState, parsePersistedArray(), ARRAY_KEYS, loadState(), WRONG_SHAPES

### Community 130 - "genesis-reviewer Subagent"
Cohesion: 0.25
Nodes (8): genesis-reviewer Subagent, src/akira-os/ (OS Core Feature Modules), src/contracts/ (Pure Interface Contracts), src/genesis/ (AI Companion Engine), src/persistence/ (SQLite Connector & Repositories), src/routes/ (Routing Controllers), AKIRA OS (Reality Layer), GENESIS (Interpretation Layer)

### Community 131 - "CapabilityRegistry"
Cohesion: 0.17
Nodes (15): ADR-016: Platform Runtime Module Core, ADR-017: Module Manifest System, manifest.yaml / manifest.json declaration, Zero-Dependency YAML Parser, ADR-018: Dependency Resolution Engine, Alphabetical Pre-Sort for Deterministic Boot Order, ADR-019: Centralized Lifecycle Manager, ADR-020: Capability Registry (+7 more)

### Community 132 - "CRIT-007 No Automated Quality Gate Exists"
Cohesion: 0.17
Nodes (15): GEN-012 Planning Subsystem Does Not Typecheck, REL-001 Application Cannot Start And No Gate Caught It, TST-001 No Automated Quality Gate Of Any Kind, TST-003 Largest GENESIS Suite Executes Zero Tests, TST-009 Coverage Tooling Installed And Unreachable, GENESIS Barrel Import Graph Cost, QUA-001 Lint Gate Detects Nothing But Formatting, QUA-007 371 Uses Of any At The System Seams (+7 more)

### Community 133 - "Severance S4 — Dead Story and Importance Builders"
Cohesion: 0.13
Nodes (15): initializeGenesis Explicit Registration, Reachability Test Class, Severance S4 — Dead Story and Importance Builders, Memory Importance Engine (Sprint 7), Recall and Retrieval Engine (Sprint 8), Confidence Engine, Evidence Engine, Evolution Engine (+7 more)

### Community 134 - "devDependencies"
Cohesion: 0.05
Nodes (41): eslint, eslint-config-prettier, @eslint/js, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @lovable.dev/vite-tanstack-config (+33 more)

### Community 135 - "__root.tsx"
Cohesion: 0.17
Nodes (9): timelineService, BootSequence(), Toaster(), ToasterProps, LovableErrorOptions, LovableEvents, reportLovableError(), Window (+1 more)

### Community 136 - "tools.vault.tsx"
Cohesion: 0.15
Nodes (12): getRawFileBase64(), FileGrid(), FileGridProps, FileList(), FileListProps, PreviewPanel(), PreviewPanelProps, Thumbnail() (+4 more)

### Community 137 - "timeline/service.ts"
Cohesion: 0.30
Nodes (7): getTimelineEvents, TimelineCursor, TimelineQueryRequest, TimelineQueryResult, fallbackQueue, isDuplicateIdError(), TimelineEventRow

### Community 138 - "form.tsx"
Cohesion: 0.19
Nodes (12): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+4 more)

### Community 139 - "search.tsx"
Cohesion: 0.10
Nodes (17): searchHistoryService, searchService, CommandPalette(), Drawer(), DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader() (+9 more)

### Community 140 - "TelemetryServiceImpl"
Cohesion: 0.14
Nodes (3): TelemetryPipeline, TelemetrySerializer, TelemetryServiceImpl

### Community 141 - "SDKContext"
Cohesion: 0.24
Nodes (5): AnalyticsAPI, AkiraSDK, SDKContext, NotificationAPI, WorkspaceAPI

### Community 142 - "createServerFn RPC Layer"
Cohesion: 0.20
Nodes (14): ADR-003: SSR & RPC Serialization, createServerFn RPC Layer, Dynamic Repository Import Isolation, ADR-004: Repository Pattern, Repository Pattern, ADR-006: Module Contract, Standard Module Directory Layout, Direct SQLite Fallback for Corrupt Rows (+6 more)

### Community 143 - "ADR-021: Observability Platform Architecture"
Cohesion: 0.15
Nodes (14): ADR-021: Observability Platform Architecture, Four-Layer Observability Stack, Unidirectional Dependency Flow, ADR-022: Completing the Observability Platform, Null-Sink Defect (TelemetryPipelineImpl with zero stages), Audit 01: Repository Map, GENESIS Subsystem Inventory, Suspected Legacy / Abandoned Areas (+6 more)

### Community 144 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 145 - "AIProviderManager"
Cohesion: 0.19
Nodes (4): AIProviderManager, applyUnedited(), useAIProviderManager(), SettingsPage()

### Community 146 - "dependencies"
Cohesion: 0.05
Nodes (41): better-sqlite3, class-variance-authority, clsx, dependencies, better-sqlite3, class-variance-authority, clsx, @radix-ui/react-accordion (+33 more)

### Community 147 - "LifecycleManager"
Cohesion: 0.17
Nodes (13): ModuleContext dependency injection, ModuleInstance, RuntimeManager, Pre-Load Parsing & Validation, Pluggable Failure Policies (StrictPolicy / ContinueOnFailurePolicy), Graceful Boot Rollback, LifecycleManager, LifecycleTransitionError (+5 more)

### Community 148 - "Phase A — Build Recovery"
Cohesion: 0.16
Nodes (16): Phase A — Build Recovery, RC-2 — Wrong Relative Import Depth, RC-3 — Contracts Narrower Than Their Only Implementation, RC-4 — Same Name Declared by Two Subsystems, Five-Phase Event Migration Proposal, The Pipeline Has Never Been Exercised, Phase B — Event Architecture Reconciliation, The Three Severance Points (+8 more)

### Community 149 - "server.ts"
Cohesion: 0.27
Nodes (7): consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), normalizeCatastrophicSsrResponse(), ServerEntry, errorMiddleware

### Community 151 - "sdk-context.ts"
Cohesion: 0.15
Nodes (10): AnalyticsService, EventBus, MemoryService, NotificationService, PermissionManager, NOTE: the other service types above remain `unknown`. Giving them real…, SearchService, StorageService (+2 more)

### Community 152 - "CLAUDE.md Governance Router"
Cohesion: 0.18
Nodes (12): AKIRA Mission, Preserve Simplicity / Never Overengineer, AKIRA Tech Stack, AKIRA OS Platform Architecture, Strict Local-First Reality, CLAUDE.md Governance Router, TypeScript Conventions, Documentation Maintenance Rules (+4 more)

### Community 153 - "alert.tsx"
Cohesion: 0.50
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 154 - "Memory Importance Engine"
Cohesion: 0.17
Nodes (12): Alignment with LLM Context Windows, MemoryRelationship (future graph edges), salience, AI Judgment Signal, Importance is Explainable, Implementation Independence, Importance Signals, Importance vs Recency vs Favorites (+4 more)

### Community 155 - "createDefaultStrategyRegistry"
Cohesion: 0.24
Nodes (12): Automatic Story Evolution, createDefaultStrategyRegistry(), DeductiveReasoningStrategy, Foundational Deterministic (non-LLM) Strategies, ImplicationReasoningStrategy, ReasoningStrategy (Interface), ReasoningStrategyRegistry, SynthesisReasoningStrategy (+4 more)

### Community 156 - "ContextAssemblyService"
Cohesion: 0.18
Nodes (12): ContextAssemblyResult, ContextAssemblyService, ScoredContextCollection, SelectionPolicy (Interface), ThresholdSelectionPolicy, No Natural-Language Formatting in Insights, Reflection, ReflectionAssemblyService (+4 more)

### Community 157 - "Stage 1C Part A — Repository Integrity"
Cohesion: 0.18
Nodes (12): compatibility/adapters/event-adapter.ts, No Error Suppression Policy, P0 Production Build Failure, Phase A — Baseline (pre-repair), createHealthRuleEngine.ts, HealthyRule.ts, RC-1 — Multi-File Code Generated as a Single Blob, CF-9 — A Fresh Install Writes to Live User Data by Default (+4 more)

### Community 158 - "AKIRA Changelog"
Cohesion: 0.17
Nodes (12): Connection Defect, Not Cognition Defect, Candidate Rule Engine, AKIRA Changelog, Keep a Changelog, Semantic Versioning, v2.0.0-architecture Release, AKIRA Engineering Report: Adaptive Memory Engine Sprints, Identity Engine (Sprint 6) (+4 more)

### Community 159 - "resource-sampler.ts"
Cohesion: 0.23
Nodes (8): ApplicationPressure, browserHeap(), describeResourceAvailability(), isFiniteNumber(), NodeMemoryUsage, ResourceAvailability, ResourceSample, ResourceSampler

### Community 160 - "SqliteSettingsRepository.ts"
Cohesion: 0.24
Nodes (3): SettingsRepository, SettingRow, SqliteSettingsRepository

### Community 161 - "genesis-production-composition.test.ts"
Cohesion: 0.21
Nodes (10): ENTRY, GENESIS_DIR, genesisSourceFiles(), reachableFromEntry(), REPO_ROOT, resolveSpecifier(), SelfInitialising, selfInitialisingModules() (+2 more)

### Community 162 - "Invariant: UI Never Reaches the Database"
Cohesion: 0.14
Nodes (14): Mechanical vs Judgement Rule Split, process.exit Prohibition in Source, Client-Server Decoupling, check-module-boundaries.mjs PostToolUse Guard, Invariant: UI Never Reaches the Database, Coding Standards (UI Declarative Separation, No Magic Strings), Import Restriction Policy, CLI Entry-Point Guidelines (Thin Wrappers) (+6 more)

### Community 163 - "TelemetryService (Core Facade)"
Cohesion: 0.18
Nodes (11): Health Check Flow, HealthRuleRegistry, TelemetryServiceImpl, Concurrency & Context Propagation (AsyncLocalStorage), DiagnosticsFacade, HealthFacade, ResourceFacade, Span (+3 more)

### Community 164 - "DAT-002 Vault Dedup Corrupts Siblings On Soft Delete"
Cohesion: 0.25
Nodes (11): SHA-256 Content Hashing And Dedup Index, Crash-Recovery Matrix, DAT-002 Vault Dedup Corrupts Siblings On Soft Delete, DAT-003 Filesystem Operations Inside SQLite Transactions, CRIT-006 Vault Dedup Lifecycle Loses User Files, Upload And Deduplication Pipeline, VaultFolderService Circular Move Prevention, VaultHashService SHA-256 Stream Hashing (+3 more)

### Community 165 - "Module State Machine (UNLOADED to RUNNING)"
Cohesion: 0.20
Nodes (11): Provider Registration Lifecycle, Hook Execution Sequence (Observers then Module Callbacks), LifecycleManager, Module State Machine (UNLOADED to RUNNING), Restart Sequence, Manifest Discovery Process, ModuleInstance, ModuleLoader (+3 more)

### Community 166 - "Module Manifest System"
Cohesion: 0.20
Nodes (11): Cycle Detection (Temporary/Permanent Marks), DependencyNode, Dependency Resolver, Reverse-Order Shutdown Sequence, Deterministic DFS Topological Sort, Startup/Shutdown Timeout Handling, Module Manifest System, Platform Module Runtime (+3 more)

### Community 167 - "Data Protection Philosophy"
Cohesion: 0.22
Nodes (11): F2 — Production Artefact Is Not Self-Hostable, Desktop-First Architecture, LLM Is the Final Consumer, Native Dependency Constraint, Active and Idle Protection, Data Protection Philosophy, Growth Data Deserves Strong Protection, Memories Are Highly Sensitive (+3 more)

### Community 168 - "chart.tsx"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 169 - "useUploadQueue.ts"
Cohesion: 0.43
Nodes (5): uploadMockFileServer(), UploadQueue(), UploadQueueProps, UploadItem, useUploadQueue()

### Community 170 - "sdk-errors.ts"
Cohesion: 0.22
Nodes (4): SDKError, SDKVersionMismatchError, UnsupportedFeatureError, PermissionAPI

### Community 171 - "event-contract.test.ts"
Cohesion: 0.27
Nodes (10): declarationsInSource(), publishedConstants(), publishedLiterals(), publishedValues(), PUBLISHER_FILES, read(), REGISTRY, REPO_ROOT (+2 more)

### Community 173 - "/pre-pr Skill"
Cohesion: 0.27
Nodes (10): Judgement Rules (Green Suite Is Not No Regression), CRLF Lint Noise Filtering Step, /pre-pr Skill, validate:architecture Known 3 Failures, CRLF Lint Noise Caveat, verify:observability Reachability Check, npm run verify Pipeline, ADR-022 (Observability Tree-Shaken Out of Bundle) (+2 more)

### Community 174 - "BND-004: Nine GENESIS modules self-initialise at import time"
Cohesion: 0.20
Nodes (10): Fail-Safe Fail-Silent Async Telemetry, BND-004: Nine GENESIS modules self-initialise at import time, BND-005: persistence and akira-os bidirectional 19-file cycle, BND-006: contracts and shared depend upward, BND-008: GENESIS couples to AKIRA OS internals, BND-009: GENESIS persists config in the platform settings store, Boundary Compliance Scorecard, WorkspaceProvider read-only seam (+2 more)

### Community 175 - "telemetry_records Table"
Cohesion: 0.20
Nodes (10): AsyncProcessor (batch worker), ObservabilityQueryFacade, TelemetryRepository (SQLite), Dependency Injection Extension Points, SQLiteTelemetryRepository, SQLCipher Encrypted Storage (Roadmap), Batch Insertion (100 records / 2000 ms), Telemetry Indexing Strategy (+2 more)

### Community 176 - "AKIRA OS v1.1 Final Release Audit"
Cohesion: 0.20
Nodes (10): Forbidden Subsystem Imports, Layer Violation (Circular References), Strict API Isolation Invariant, AKIRA OS Releases & Audits, v1.1.0 SQLite Foundation Target, Frozen Architecture / No Feature Creep, AKIRA OS v1.1 Final Release Audit, Persistence Audit (SQLite-only runtime persistence) (+2 more)

### Community 177 - "LoggerFacade"
Cohesion: 0.20
Nodes (10): OTelExporter, LoggerFacade, TelemetryExporter contract, Lazy String Evaluation, Sensitive Data Scrubbing (PII Masking), OTLP Cloud Export Sync, TelemetryPipeline, TelemetryPipelineStage (+2 more)

### Community 178 - "Observability Platform"
Cohesion: 0.20
Nodes (10): Collection Layer, Instrumentation Layer, Observability Non-Goals, Observability Platform, Passive Observation Principle, Presentation Layer, Storage Layer, AKIRA OS Architecture Documentation (+2 more)

### Community 179 - "ReasoningEngine"
Cohesion: 0.20
Nodes (10): Prohibited Data Sources (Reasoning), Reasoning, ReasoningAssemblyService, ReasoningCollection, ReasoningEngine, ReasoningResult (Public Output Contract), ReasoningType, Strict Pipeline Decoupling (+2 more)

### Community 180 - "RealityAdapter"
Cohesion: 0.24
Nodes (10): Idempotency Keyed on AkiraEvent.id, Option B — Platform Bus plus GENESIS Reality Adapter, Option D — Event-Store-First Cognition, RealityAdapter, RealityAdapterMetrics, AkiraEvent Envelope, Event Store, GENESIS MemoryEvent Stream (eventService) (+2 more)

### Community 182 - "genesis-context-inclusion-reason.bench.ts"
Cohesion: 0.43
Nodes (4): log(), measure(), reportNoteMechanism(), structuralLabel()

### Community 183 - "SimpleMetricRegistry"
Cohesion: 0.22
Nodes (9): Counter (CounterImpl), Gauge (GaugeImpl), Avoid High Cardinality Labels, Histogram (HistogramImpl), SimpleMetricRegistry, MetricSnapshot (Immutable), Timer (TimerImpl), MetricsFacade (+1 more)

### Community 184 - "What Should Not Be Changed"
Cohesion: 0.25
Nodes (9): GENESIS Cognitive Pipeline (Events to Context), Evidence And Confidence Model, GENESIS Rule-Engine Pattern, migration-impl.ts Idempotent Legacy Migration, Measured / Potential / Premature Evidence Labelling, Keyset Pagination In findPaged, PERF-001 Startup Hydration Loads The Entire Database, Premature Optimization: Leave These Alone (+1 more)

### Community 185 - "Identity Layer"
Cohesion: 0.22
Nodes (9): Identity Confidence and Evidence, Evidence Integrity, Identity Hypotheses, Identity Layer, Identity Reflection, Memory Confidence, Awareness Confidence, Awareness Recovery (+1 more)

### Community 186 - "DecisionEngine"
Cohesion: 0.22
Nodes (9): Provider/Strategy Failure Isolation, Decision, DecisionCollection, DecisionEngine, DecisionStrategy (Interface), DecisionStrategyRegistry, DecisionType, Decision Strategy Failure Isolation (+1 more)

### Community 187 - "Shell.tsx"
Cohesion: 0.22
Nodes (9): BootSequence.tsx, Global Command Palette Overlay, Fit Layout Mode, Scroll Layout Mode, Shell.tsx, Workspace Shell, Dynamic, Optional and Splat Segments, __root.tsx (+1 more)

### Community 188 - "check-module-boundaries.mjs"
Cohesion: 0.22
Nodes (6): files, FORBIDDEN, payload, report, UI_SURFACE, violations

### Community 189 - "format-edited-file.mjs"
Cohesion: 0.25
Nodes (7): files, FORMATTABLE, insideProject(), payload, PRETTIER_BIN, res, ROOT

### Community 192 - "/bench-genesis Skill"
Cohesion: 0.29
Nodes (8): /bench-genesis Skill, interleavedAB / describeAB, MIN_TRUSTWORTHY_MS Reportability Threshold, perf-ab.ts Paired A/B Harness, Rejected Measurement Approaches, Trimmed Mean as the Deciding Statistic, Benches Excluded from Default Vitest Suite, GENESIS Paired A/B Perf Protocol

### Community 193 - "Rule 2.3 Service Dominance"
Cohesion: 0.18
Nodes (11): fts_workspace FTS5 Virtual Table, Domain Repository Contract, RPC Layer (createServerFn), SQLite Database (akira.db, WAL), Sqlite Repository Implementation, timeline_events Audit Table, Invariant: Services Are the Single Client Entry Point, Compliant Analytics Module Example (+3 more)

### Community 194 - "UI Must Not Import Repositories"
Cohesion: 0.29
Nodes (8): UI Must Not Import Repositories, God Modules by Fan-Out, BND-003: GENESIS compiled into the browser bundle, vite importProtection disabled, DEP-011: genesis/index.ts re-exports colliding names, DEP-012: PlanningService references five undeclared types, DEP-014: Fan-out hotspots, PLT-004: Module boundaries are not enforceable

### Community 195 - "TelemetryBase"
Cohesion: 0.25
Nodes (8): Wall Clock vs Monotonic Time Model, DiagnosticRecord, HealthRecord, LogRecord, ResourceRecord, TelemetryBase, TelemetrySeverity, TraceRecord (SpanRecord)

### Community 196 - "RelevanceEngine"
Cohesion: 0.25
Nodes (8): Importance-Ranked Memory Retrieval, AverageScoreAggregator, DefaultRelevanceStrategy, Determinism & Ordering Policy, RelevanceEngine, RelevanceStrategy (Interface), RelevanceStrategyRegistry, ScoreAggregator (Interface)

### Community 197 - "ContextIntelligenceService"
Cohesion: 0.25
Nodes (8): Architectural Purity Boundaries, CandidateContext, Context Intelligence Subsystem, ContextCollection, ContextIntelligenceService, ContextProvider (Interface), ContextProviderRegistry, ContextRequest

### Community 198 - "projects SQLite Table"
Cohesion: 0.25
Nodes (8): notes SQLite Table, Tag Array JSON Serialization, Projects Management Module, projects SQLite Table, Focus Sessions Tracking Module, sessions SQLite Table, Daily Tasks And Missions Module, tasks SQLite Table

### Community 199 - "Nine Local GENESIS Subsystem Emitters"
Cohesion: 0.29
Nodes (8): Deliberate Holds — 9 Errors Not Fixed, Nine Local GENESIS Subsystem Emitters, Event Contract Drift and Orphan Constants, Goal Engine (Companion Intelligence Sprint 3), Habit Intelligence (Companion Intelligence Sprint 6), Knowledge Engine (Companion Intelligence Sprint 4), Identity Event Flow, GENESIS Identity Subsystem

### Community 200 - "navigation-menu.tsx"
Cohesion: 0.29
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 201 - "Temporary Database Mocking (temp_e2e_akira.db)"
Cohesion: 0.29
Nodes (7): Dot Reporter Requirement for Pre-PR Tests, Vitest Reporter Caveat (Suppressed stderr), Testing Requirements & Coverage Rules, Legacy runAll to Vitest Migration, Logical File Vault (SHA-256 dedup, MIME magic bytes), AKIRA_DATABASE_PATH Environment Redirection, Temporary Database Mocking (temp_e2e_akira.db)

### Community 202 - "contract-auditor Subagent"
Cohesion: 0.12
Nodes (20): contract-auditor Subagent, Feature Priority Order, Sidebar Tool Registry (toolsRegistry), Workspace Shell (Shell.tsx), Invariant: New Modules Register in registry.ts, Invariant: No Viewport Math in Modules, Invariant: Use the @/ Alias, Invariant: Routes Are Controllers (+12 more)

### Community 203 - "ADR-010: Instrumentation Reliability"
Cohesion: 0.33
Nodes (7): ADR-010: Instrumentation Reliability, Event Ordering Guarantees, 10,000 events/sec Throughput Target, analytics_state table, PLT-006: Event ordering is not deterministic in the Event Store, PLT-015: Incremental rebuild permanently skips same-millisecond events, PLT-018: rebuildAll wipes derived tables outside the rebuild transaction

### Community 204 - "ContextManager (AsyncLocalStorage)"
Cohesion: 0.29
Nodes (7): ContextManager (AsyncLocalStorage), Log Recording Flow, Trace Recording Flow, Telemetry Record Lifecycle, TelemetryContext (AsyncTelemetryContext), TelemetryCorrelation, telemetryFactory

### Community 205 - "RingBuffer (async boundary)"
Cohesion: 0.29
Nodes (7): Metric Recording Flow, MetricAggregator (collection stage), RingBuffer (async boundary), MetricAggregator, Ring Buffer Overflow Policy, 10,000-Record Ring Buffer Cap, Lock-Free Queueing & Copy-on-Write Contexts

### Community 206 - "timeline_events SQLite Table"
Cohesion: 0.29
Nodes (7): PERF-006 Missing Index On vault_file_tags.tag_id, Dynamic Repository Import To Avoid Driver Leakage, timeline_events SQLite Table, Timeline Logs Module, TimelineService Event Subscriptions, vault_files SQLite Table And Audit Trigger, TimelineSubscriber Mapping Strategy

### Community 207 - "Manifest Validation Rules"
Cohesion: 0.29
Nodes (7): Pre-Load Checks Before Importing Source, Manifest Validation Rules, AkiraSDK, SDK Error Types, SDK Permission Model, PermissionManager, Thin Wrapper Pattern

### Community 208 - "vault-security.test.ts"
Cohesion: 0.38
Nodes (5): readableContent(), removeContents(), reset(), storagePathOf(), vaultRoot

### Community 209 - "TimelineErrorBoundary"
Cohesion: 0.29
Nodes (3): Props, State, TimelineErrorBoundary

### Community 210 - "SimpleMetricRegistry"
Cohesion: 0.28
Nodes (4): MetricLabelSet, MetricMetadata, MetricRegistrationError, SimpleMetricRegistry

### Community 213 - "Failure Isolation Policies"
Cohesion: 0.33
Nodes (6): Error Handling Strategy (Graceful Degrade), reportLovableError, Fault Tolerance via Transitive Skipping, Failure Isolation Policies, Boot Sequence Rollback, Module Failure Isolation Guarantee

### Community 214 - "BND-001: AKIRA OS to GENESIS event path is severed"
Cohesion: 0.40
Nodes (6): ADR-009: Module Event Integration, Fact-Based Event Ordering, BND-001: AKIRA OS to GENESIS event path is severed, Legacy-to-Instrumentation Event Bus Bridge, PLT-005: Two event systems with a one-way lossy silent bridge, PLT-011: correlationId auto-generated per event, making correlation inert

### Community 215 - "AuditFacade"
Cohesion: 0.33
Nodes (6): Audit Event Flow, AuditCryptoManager, AuditFacade, AuditLogger (HMAC-SHA256 append-only file), Audit Cryptographic Chaining, AuditRecord

### Community 216 - "Dependency Rules Matrix"
Cohesion: 0.33
Nodes (6): Observability Dependency Hierarchy, Dependency Rules Matrix, Interface-First Contract, src/observability Package Tree, Zero Business Domain Dependency, Telemetry Access Control Matrix

### Community 217 - "package.json"
Cohesion: 0.33
Nodes (5): name, private, sideEffects, type, ./src/observability/auto-compose.ts

### Community 220 - "Sliding-Window Telemetry Retention"
Cohesion: 0.40
Nodes (5): Rejected Alternative B: Reuse Event Bus / Event Store for Telemetry, Sliding-Window Telemetry Retention, Storage & Presentation Layers Deferred, TelemetrySink seam, TelemetryStore (bounded ring buffer)

### Community 221 - "Story"
Cohesion: 0.40
Nodes (5): Story Influence on Importance, Many-to-Many Memory-to-Story Mapping, Story, Story-Based Recommendations, Story Types (vocation/growth/education/life_event)

### Community 222 - "Session Intent"
Cohesion: 0.40
Nodes (5): Session Intent, Intent Stability, Dynamic Awareness, Intent Discovery, User Correction Override

### Community 224 - "error/lovable-error-reporting.ts"
Cohesion: 0.40
Nodes (3): LovableErrorOptions, LovableEvents, Window

### Community 225 - "Recall and Ranking Regression"
Cohesion: 0.50
Nodes (4): Budget Enforcement Regression, computeSemanticRelevance Blank-Context Short-Circuit, Importance and Retention Regression (501-memory window), Recall and Ranking Regression

### Community 226 - "persistAddNote"
Cohesion: 0.50
Nodes (4): persistAddNote, NoteRepository contract, SqliteNoteRepository, PLT-003: schema_version is decorative; no migration ladder

### Community 227 - "Shell layoutMode prop"
Cohesion: 0.50
Nodes (4): ADR-005: Container Layout, Fit Mode, Shell layoutMode prop, Scroll Mode

### Community 228 - "EventBusObserver"
Cohesion: 0.50
Nodes (4): EventBusObserver, Health Is Derived, Never Declared, HealthRegistry, PerformanceMonitor

### Community 229 - "migrate-runall.ts"
Cohesion: 0.83
Nodes (3): cleanContent(), collectFiles(), main()

### Community 231 - "identityService (identityFoundationService)"
Cohesion: 0.50
Nodes (4): getIdentityHealth, IdentityProfile, identityService (identityFoundationService), validateIdentity

### Community 234 - "TelemetryValidator"
Cohesion: 0.67
Nodes (3): Metadata Validation & Circular Reference Detection, Telemetry Core, TelemetryValidator

### Community 235 - "Audit 02: Architectural Boundary Audit"
Cohesion: 0.67
Nodes (3): Measured Cross-Directory Import Directions, Audit 02: Architectural Boundary Audit, Audit 03: Dependency & Coupling Audit

### Community 236 - "DEP-005: SDK erases all error information"
Cohesion: 1.00
Nodes (3): DEP-005: SDK erases all error information, DEP-006: The SDK has no type contracts, Platform SDK Assessment

### Community 246 - "AbstractTelemetryService"
Cohesion: 0.17
Nodes (4): TraceStateError, AbstractTelemetryService, TraceService, TracingValidator

### Community 264 - "SqliteSearchHistoryRepository.ts"
Cohesion: 0.21
Nodes (4): SearchHistoryEntry, SearchHistoryRepository, SearchHistoryRow, SqliteSearchHistoryRepository

### Community 265 - "TelemetryCorrelation"
Cohesion: 0.23
Nodes (4): TelemetryContext, TelemetryCorrelation, AsyncTelemetryContext, getStorage()

### Community 267 - "MetricValidationError"
Cohesion: 0.22
Nodes (3): MetricValidationError, GaugeImpl, HistogramImpl

### Community 268 - "provider-manager.ts"
Cohesion: 0.24
Nodes (6): ProviderMetrics, ProviderStatus, providerRegistry, providers, freshManager(), store

### Community 269 - "metrics/registry.ts"
Cohesion: 0.22
Nodes (3): Counter, metricRegistry, CounterImpl

### Community 272 - "genesis-chat-intake-cost.bench.ts"
Cohesion: 0.33
Nodes (8): build(), chatMessage(), completeTask(), freshWorkspace(), isChat(), realImportance, realRecall, scored()

### Community 274 - "MarkdownRenderer.tsx"
Cohesion: 0.36
Nodes (6): BlockToken, CodeLine, highlightCodeLine(), MarkdownRenderer(), parseMarkdown(), renderInlineText()

### Community 285 - "timeline.test.ts"
Cohesion: 0.50
Nodes (3): seedTied(), setupMockProjects(), TIED_IDS

### Community 287 - "input-otp.tsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

## Ambiguous Edges - Review These
- `Event Contract Drift and Orphan Constants` → `Identity Event Flow`  [AMBIGUOUS]
  src/genesis/identity/README.md · relation: conceptually_related_to
- `DAT-007 No Schema Evolution Path; Two Vault Schema Sources` → `DAT-011 Test Artefacts And Scratch Databases Committed`  [AMBIGUOUS]
  docs/audits/06-data-integrity.md · relation: conceptually_related_to

## Knowledge Gaps
- **899 isolated node(s):** `context7`, `$schema`, `style`, `rsc`, `tsx` (+894 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1825 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **106 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Event Contract Drift and Orphan Constants` and `Identity Event Flow`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DAT-007 No Schema Evolution Path; Two Vault Schema Sources` and `DAT-011 Test Artefacts And Scratch Databases Committed`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `cn` to `chart.tsx`, `navigation-menu.tsx`, `form.tsx`, `search.tsx`, `pagination.tsx`, `carousel.tsx`, `command.tsx`, `menubar.tsx`, `sidebar.tsx`, `alert.tsx`, `lib/utils.ts`, `input-otp.tsx`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `IdentityRepository` connect `IdentityRepository` to `IdentityEvidence`, `IdentityGoal`, `IdentityInterest`, `InMemoryIdentityRepository`, `IdentityConfidence`, `IdentityHabit`, `IdentityPersonality`, `identity/types.ts`, `IdentitySkill`, `IdentityValue`, `IdentityService`, `IdentityContextProvider`, `IdentityPreference`, `IdentityRelationship`, `IdentityGraphService`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `IdentityService` connect `IdentityService` to `InMemoryIdentityRepository`, `IdentityRepository`, `identity/types.ts`, `context-rules.ts`, `brain.tsx`, `genesis/index.ts`, `understanding/rules.ts`, `IdentityGraphService`, `IdentityEvidence`, `IdentityGoal`, `IdentityInterest`, `IdentityHabit`, `IdentityPersonality`, `IdentitySkill`, `IdentityValue`, `IdentityContextProvider`, `IdentityConfidence`, `IdentityPreference`, `IdentityRelationship`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `context7`, `$schema`, `style` to the rest of the system?**
  _899 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `observability/composition.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.058673469387755105 - nodes in this community are weakly interconnected._