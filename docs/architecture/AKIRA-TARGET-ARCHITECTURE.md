# AKIRA Target Architecture

**Phase 1 — Target Architecture Definition (revised in Phase 1.1).** This is the canonical reference for the architecture AKIRA is being migrated toward. It defines responsibilities, ownership, boundaries, contracts and migration shape. It is **not** an implementation plan or a task list. No code was changed to produce it.

|                  |                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline commit  | `genesis/foundation-stabilization` @ `e58020f`                                                                                                                                                                    |
| Source documents | `deep-scan/AKIRA-Architecture-Audit.pdf` (the "audit"); [AKIRA-ARCHITECTURE-DISPOSITION.md](AKIRA-ARCHITECTURE-DISPOSITION.md) (Phase 0, cited as **P0**, and **P0 #n** for row _n_ of its §12 disposition table) |
| Decision source | The project owner's Phase 1 architecture brief and Phase 1.1 decision brief (both 2026-10-02); Phase 2 decision records [AKIRA-N1-DECISION.md](AKIRA-N1-DECISION.md) (Rule N1), [AKIRA-N2-DECISION.md](AKIRA-N2-DECISION.md) (Rule N2) and [AKIRA-N3-DECISION.md](AKIRA-N3-DECISION.md) (Rule N3) |
| Revisions | Phase 1: initial definition. Phase 1.1: closes the decisions listed in §20.1 and keeps the rest OPEN (§20.2, §20.3). Phase 2: §8.1 Tier 2 activation cell clarified (Phase 2.1D-A) and updated for Rule N2; §7.2 `memory.store` updated for Rule N3. Rule N1 is recorded in its decision record. |
| Not consulted | The "original VAJRA proposal" named as a source by the Phase 1.1 brief is not in the repository and was not available to this revision (§21, X21). |
| Date | 2026-10-02 |

### Status labels

Every substantive statement carries exactly one label.

| Label        | Meaning                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **FACT**     | Verified directly in the repository at the baseline commit.                                                       |
| **CURRENT**  | How the current implementation behaves. Verified in P0 (which cites `file:line`) unless a citation is given here. |
| **DECISION** | Decided by the project owner in the Phase 1 or Phase 1.1 brief, or in an accepted Phase 2 decision record (Rules N1, N2, N3). Binding on this document. |
| **TARGET**   | Design that follows directly from one or more DECISIONs.                                                          |
| **PROPOSED** | A recommendation made by this document. Not yet decided. It may be overruled without contradicting any DECISION.  |
| **OPEN**     | Unresolved. §20 records it with its consequences. Nothing in this document may silently resolve an OPEN item.     |

---

## 1. Purpose and Scope

This document answers one question: **what is AKIRA's intended architecture, and how does each current component relate to it?**

It defines:

- the responsibility boundary of GENESIS, VAJRA, AKIRA OS and HANDS;
- the capability boundary between authority and implementation;
- the communication vocabulary;
- persistence, lifecycle and runtime-authority ownership;
- the migration pattern;
- the decisions that remain open.

It does not define:

- class designs, schemas, APIs, wire formats or the MCP protocol surface;
- VAJRA's internal algorithms;
- HANDS executors;
- implementation sequencing below the level of migration stages.

---

## 2. Core Architectural Direction

### 2.1 Four subsystems

**DECISION.** AKIRA is composed of four architectural subsystems with distinct responsibilities:

| Subsystem    | One-line responsibility                   | Answers the question                                                                                  |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **GENESIS**  | Cognition                                 | What does AKIRA know, remember, understand and infer about the world and the user?                    |
| **VAJRA**    | Authority, orchestration, mission control | What should happen, using which capabilities, and has it succeeded?                                   |
| **HANDS**    | Controlled execution                      | Carry out this specific action against an external executor, and report what happened.                |
| **AKIRA OS** | Infrastructure, platform, system/runtime lifecycle | Provide the workspace, storage, configuration, transport, runtime lifecycle and capability activation every other subsystem runs on. |

> GENESIS understands. VAJRA decides and coordinates. HANDS executes. AKIRA OS provides infrastructure.

**DECISION.** These are architectural subsystems. They are **not** four chatbots or four autonomous agents, and none of them is a process by default (§23, principle 11).

### 2.2 Reconciling the two layer pictures

The brief shows the system two ways:

- "AKIRA OS ↓ GENESIS / VAJRA / HANDS", where the OS sits beneath everything; and
- "User → VAJRA → Capabilities → GENESIS / AKIRA OS / HANDS", where the OS is a peer capability provider.

**TARGET.** Both are correct because AKIRA OS has **two planes**:

| Plane              | What it contains                                                                                   | Relationship to others                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Platform plane** | Persistence infrastructure, configuration, lifecycle, transport, health                            | _Beneath_ GENESIS, VAJRA and HANDS. Every subsystem depends on it. It never makes cognitive or mission decisions. |
| **Domain plane** | Workspace: projects, tasks, notes, work sessions, vault, search, timeline, conversations, presence | A _peer_ capability owner. VAJRA invokes its capabilities like any other owner's; external callers may read them through the capability boundary (§15). |

```
                         ┌──────────── VAJRA (authority) ────────────┐
                         │   goals · missions · routing · verification│
                         └───────────────┬────────────────────────────┘
                                         │ capability contracts
             ┌───────────────────────────┼─────────────────────────────┐
             ▼                           ▼                             ▼
     GENESIS (cognition)       AKIRA OS — domain plane          HANDS (execution)
     memory · identity ·       workspace · conversations ·      executors / tools
     understanding · recall    vault · search · timeline
             │                           │                             │
             └───────────────┬───────────┴─────────────┬───────────────┘
                             ▼                         ▼
        ┌─────────────── AKIRA OS — platform plane ─────────────────┐
        │ persistence · configuration · lifecycle · transport · health│
        └────────────────────────────────────────────────────────────┘
```

---

## 3. GENESIS Target Boundary

### 3.1 Responsibility

**DECISION.** GENESIS is a coherent cognitive subsystem. It answers what AKIRA knows, remembers, understands, infers and cognitively derives. It must not become the system-wide brain.

**DECISION. GENESIS must not own:**

- system-level orchestration
- mission execution
- application lifecycle
- model transport
- execution
- initiative authority
- system-wide decisions
- workspace lifecycle
- cross-system command routing

**TARGET. The GENESIS boundary contract:**

| Aspect  | Definition                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs | Domain **Events** from AKIRA OS (workspace changes, conversation turns); cognitive **Queries** from VAJRA, and authorised read Queries arriving through the capability boundary (MCP v0, §15); activation by the AKIRA OS runtime lifecycle (§13) |
| Outputs | Query **Results** (memory, identity, understanding, recall, insight and cognitive-context reads); **Observations**: cognitive evidence and recommendations, such as a detected goal declaration with its confidence and provenance. GENESIS informs; it does not decide (§5.4). |
| Writes  | Only its own cognitive state, through the persistence infrastructure it is given                                                                                                                                |
| Never   | Issues Commands to other owners; calls a model; decides what AKIRA does next                                                                                                                                    |

### 3.2 Target capabilities

**DECISION.** GENESIS consists of: Memory, Identity, Understanding, Recall, Insights, Reflection (later) and Cognitive Context.

#### Memory System

- **DECISION.** Memory is one coherent Memory System covering:
  - memory events
  - candidates
  - validation
  - relationships between memories
  - stories
  - importance
  - recall
  - retention
  - the durable memory stream

  Persistence stores memory; it is not the cognitive owner.

- **CURRENT.** Memory ownership is split three ways:
  - `memoryService` holds runtime memory;
  - akira-store holds the durable stream in `settings.genesis_memories`;
  - `retention/policy.ts` holds the rules, which persistence imports.

  On top of that, the store rewrites past events when a project or note is deleted (P0 §6, B5).

- **TARGET.** The Memory System is the sole semantic owner and sole writer of the memory stream (§12). Retention is a Memory System policy that the Memory System applies. The storage layer persists what it is handed and does not interpret it.

#### Identity System

- **DECISION.** One canonical Identity System. It is evidence-based and represents:
  - interests
  - skills
  - goals _as understood by cognition_
  - habits _as understood by cognition_
  - preferences
  - values
  - relationships and evidence, where appropriate
  - confidence, evolution and evidence history

  The internal design is not fixed here.

- **CURRENT.** There are two stores:
  - emergent identity, held in memory and cleared on replay;
  - foundation identity, which lives for the whole process, is never cleared, and is written by a rule in Understanding.

  The two match names differently, and cold boots re-record `identity.*` events into the user-history budget (P0 §4.3, P0 #73–#74, B7).

- **DECISION.** GENESIS owns Identity. Identity holds cognitive knowledge about the person, for example "this person cares about building hardware". That is identity information, not a canonical Goal (§6).
- **TARGET.** Identity consumes evidence and is reached through one identity capability boundary (`identity.read`).
- **OPEN (O4).** Which identity structures are durable and which are derived, and whether the two current stores physically merge. §21, X15 explains how this relates to the Phase 1 wording "one canonical Identity System".

#### Understanding

- **DECISION.** Understanding interprets information and produces cognitive understanding and evidence. A cognitive rule must **not** directly mutate unrelated domain state.
- **CURRENT.** `personalDeclarationRule` (`understanding/rules.ts:618`) writes directly into foundation identity (`create*`, `addEvidence`) as a side effect of a rebuild (P0 #69).
- **TARGET.** The flow is:

  ```
  input ──► Understanding ──► cognitive evidence / interpretation (Observation)
                                   │
                                   ├──► Identity System (GENESIS)  — consumes identity evidence
                                   └──► owning system outside GENESIS — e.g. a goal-declaration Observation
                                        reaches the Goal owner (VAJRA), which decides whether a Goal exists
  ```

#### Recall

There are two different "recalls".

- **FACT.** The repository uses "recall" for two distinct mechanisms:

  | Name in this document | Mechanism (CURRENT)                                                                                                   | Data it reads                            |
  | --------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
  | **Memory Recall**     | `recall/*`: recall candidates ranked per mode (BOOTSTRAP / QUERY / CONTINUATION) and fed to the context package       | GENESIS memories, stories, importance    |
  | **Historical Recall** | `historical-search-intent.ts` + `HistoricalRecallProvider` → `querySearchMessages` (FTS5 / bm25 over `chat_messages`) | The conversation archive (AKIRA OS data) |

- **DECISION.** Historical and personal recall ("What did I previously say / decide / remember about X?") is a GENESIS capability. Conversation-archive _storage_ does not become part of GENESIS.
- **TARGET.** Both recalls are GENESIS capabilities:
  - Memory Recall is part of the Memory System.
  - Historical Recall is a GENESIS capability that _queries_ the conversation archive, which AKIRA OS owns, through a contract. This matches the current `HistoricalRecallProvider` seam (P0 #36, #84).

#### Insights

- **DECISION.** Insights are cognitive: learning momentum, parallel commitments, goal alignment, relationships between observations, and higher-level patterns. They produce Observations. They never execute actions.
- **CURRENT.** `insightEngine` is live and read-only (P0 #72).
- **TARGET.** Unchanged in principle.

#### Reflection

- **DECISION.** The concept may remain. The current implementation must not be revived. Reflection is a later redesign.
- **CURRENT.** `reflectionService` is inert; it has no producer (P0 #81, LATER).

#### Cognitive Context

- **DECISION.** GENESIS owns _cognitive_ context assembly: memories, identity, understanding, insights and recall assembled into a representation other systems consume. It does not own UI, mission, execution, application-lifecycle, workspace-lifecycle or orchestration state.
- **CURRENT.** `contextBuilder`, `contextService` and `context-rules` build a `ContextPackage` (P0 #82). The package is the cognitive part.
- **TARGET.** Cognitive Context is a Query capability. Given a focus (a conversation turn, a mission, a topic), it returns a cognitive representation. It has no knowledge of who renders it or which model consumes it.

---

## 4. Responsibilities Leaving GENESIS

Each responsibility below is **DECISION**. The _where-to_ is TARGET, PROPOSED or OPEN as marked.

| Responsibility                                                                          | CURRENT location                                                                                        | GENESIS keeps                                                                                | Moves to                                                                                                       | Status of the destination                                                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Canonical Goals** | Split across about 9 representations (P0 §9.1) | Understanding goals, inferring possible goals, goal-related evidence, the user's relationship to goals, goal-relevant cognitive context | The canonical operational Goal owner | **DECISION:** VAJRA owns the canonical operational Goal and its lifecycle (§6). **OPEN:** schema and states (O3). |
| **Initiative** ("should AKIRA proactively do something?")                               | `context/initiative/*`, inert, always "Silence" (P0 #80)                                                | Observations that might motivate initiative                                                  | VAJRA                                                                                                          | **DECISION:** VAJRA owns Initiative (§5.2). **TARGET:** the existing implementation is _not_ moved; it is redesigned under VAJRA.                        |
| **Operational intent** (request → objective → mission → execution)                      | No operational router exists. Operational decisions are scattered (below).                              | Semantic interpretation: categories, ambiguity, "is this about the past?"                    | VAJRA                                                                                                          | **TARGET.**                                                                                                  |
| **System / runtime lifecycle** (boot, shutdown, memory / validation / recall / identity start-up) | `companionStateService.bootstrap/closeSession`, `__root.tsx` effects, import-time composition, `chat.tsx` New Chat (P0 §8) | Its own internal lifecycle (e.g. the memory-reconstruction procedure); situational cognitive state | System/runtime lifecycle → AKIRA OS; mission lifecycle → VAJRA. New Chat becomes a conversation boundary. | **DECISION** (§13). |
| **Non-cognitive context**                                                               | `contextResolutionService` merges presence, companion state, relationships, habits, reflection          | Cognitive Context                                                                            | Workspace/application context → AKIRA OS; mission context → VAJRA                                              | **TARGET.**                                                                                                  |
| **Model transport** (providers, provider management, API calls, dispatch) | `genesis/context/ai/providers/*`, `provider-manager.ts`, `providerRegistry` | Nothing | Outside GENESIS, and not part of VAJRA | **DECISION:** an independent capability/infrastructure concern. **PROPOSED:** an AKIRA OS platform service (§10.3). **OPEN:** placement (O9). |
| **AI context engine** | `context/ai/context-engine.ts`: intent → resolution → relevance → historical recall → prompt → provider | Cognitive context assembly | Conversation context, workspace context, mission context, model dispatch, turn orchestration → outside GENESIS (turn owner OPEN, O7) | **TARGET** (§4.2). |
| **Planning / system-level Reasoning / system-level Decision**                           | `genesis/{planning,reasoning,decision}`, loaded but never invoked (P0 #90–#92)                          | Cognitive reasoning _about_ the user (insights, understanding)                               | VAJRA domain                                                                                                   | **DECISION.** The existing implementations are **not** moved or revived; they are subject to later redesign. |

### 4.1 Operational decisions currently embedded in cognition or UI

**CURRENT.** Several decisions that are operational — they choose what AKIRA _does_ — are made today inside GENESIS or a route. They show where the cognitive/operational split runs:

| Operational decision                                        | CURRENT location                                                                                    | Cognitive part (stays in GENESIS)                                    | Operational part (→ VAJRA)                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Whether to run Historical Recall for this turn              | `context-engine.ts:73-78` (`detectHistoricalSearch`, `detectHistoricalQuestion`, `genesisCovers()`) | "This question is about the user's past"; "memory already covers it" | "Therefore invoke the Historical Recall capability"                         |
| Whether workspace material enters the prompt                | `context-relevance-selector.ts` (`workspaceRelevant`)                                               | Relevance judgement                                                  | Which context sources to request for this turn                              |
| Auto-starting a work session when a message names a project | `routes/chat.tsx:664-674`                                                                           | (none needed)                                                        | A Command to the sessions owner, decided by authority, not a UI side effect |
| Resetting the cognitive session on New Chat | `chat.tsx:591-592` → `closeSession` + `bootstrap` | (none) | None. New Chat is a conversation boundary owned by AKIRA OS · conversations and triggers no cognitive reset (DECISION, §13.2) |
| Proactive action                                            | `initiativeService` (inert)                                                                         | Observations                                                         | The initiative decision                                                     |

### 4.2 Splitting the AI context engine

**TARGET.** Today one function (`executeRequestStream`) performs six concerns. In the target they are owned separately:

```
CURRENT  chat.tsx handleSend ─► aiContextEngine.executeRequestStream
                                  intent → resolution → relevance → historical recall → prompt → provider

TARGET   Turn orchestrator (owner OPEN, O7; GENESIS and the UI are excluded by DECISION)
           ├─ Query  GENESIS   cognitive-context(focus)          → cognitive representation
           ├─ Query  GENESIS   historical-recall(query)          → only if selected under VAJRA's capability-selection authority (D6)
           ├─ Query  AKIRA OS  workspace-context / conversation  → workspace + conversation history
           ├─ Query  VAJRA     mission context                   → only when the turn belongs to a mission
           ├─ Compose the model request (PROPOSED: owned by the turn orchestrator, not by GENESIS)
           └─ Command model transport (placement OPEN, O9)         → Result
```

**CURRENT.** `prompt-builder.ts` (P0 #86, KEEP) mixes three kinds of section:

- cognitive sections: `[COGNITIVE CONTEXT]`, `[UNDERSTANDINGS]`, `[INSIGHTS]`;
- workspace and profile sections: `[USER]`, `[AVAILABLE PROJECTS]`;
- conversation-archive sections: `[FROM PAST CONVERSATIONS]`.

The persona string is overridden from `chat.tsx:776`.

**PROPOSED.**

- **GENESIS** keeps _serialising its own cognitive representation_.
- **The turn orchestrator** composes the full model request.

This refines P0 #86 (see §21, X8).

---

## 5. VAJRA

### 5.1 Definition

**DECISION.** VAJRA is the **authoritative mission coordinator** of AKIRA: the system-level authority and orchestration layer. It is **not** an execution engine and does not perform every operation itself. It:

- understands what needs to happen;
- determines the required capabilities;
- coordinates them;
- observes results;
- verifies progress;
- maintains mission state.

**DECISION. VAJRA's primary control loop:**

```
UNDERSTAND ─► PLAN ─► SELECT ─► COORDINATE ─► VERIFY
```

| Step | Meaning (TARGET) |
| --- | --- |
| UNDERSTAND | Establish what a request or trigger means _operationally_: its objective, its constraints, and whether it becomes a Mission. VAJRA draws on GENESIS through cognitive Queries; it does not keep its own model of the user (§5.4, §21 X18). |
| PLAN | Decide the steps and the capabilities they require |
| SELECT | Choose capabilities through the capability boundary (§7) |
| COORDINATE | Issue Commands and Queries; collect Results and Observations |
| VERIFY | Judge the evidence against the mission's completion criteria (§5.5). The outcome updates mission state, which may start another pass. |

**CURRENT.** **None of this exists.**

- **FACT.** There is no mission object, command router, mission manager or workflow engine (P0 §2.2, audit Part 14).
- **CURRENT.** Today's partial stand-ins are listed below. None of them is VAJRA, and none is to be grown into it (P0 §5; the audit's Part 15 "VAJRA candidates" are all redistributed in §18):
  - orchestration fragments in `__root.tsx`, `chat.tsx`, `companionStateService` and `aiContextEngine`;
  - dormant designs in `src/runtime`, `initiativeService` and `genesis/planning`.

### 5.2 Contract (DECISION)

| | |
| --- | --- |
| Receives | User requests; external triggers; system Events; Observations; capability Results; human decisions; mission updates |
| Produces | Queries; Commands; mission-state updates; capability selections; verification decisions; escalation requests; final outcomes |
| Owns | Canonical operational Goals; Missions and mission state; cross-system decisions; capability selection and routing; global mission constraints; completion criteria; verification; escalation |
| Does not own | Raw memory implementation; identity implementation; workspace implementation; database implementation; terminal execution; Claude / Antigravity execution; model-provider implementation; UI state; the internal logic of any capability |
| Depends on (TARGET) | The capability contract, never implementation modules; the AKIRA OS platform plane for persistence, transport and capability activation |

**DECISION (Phase 1).** VAJRA's domain also includes Planning, system-level Reasoning, system-level Decision and Initiative. The existing implementations of these are not revived (§4, §19).

**OPEN.** VAJRA's exact interfaces, message shapes and persisted schemas are later design work (§20.3). No TypeScript interface is defined here.

### 5.3 Conceptual flow (DECISION)

```
User Request → Understanding → Mission → Required Capabilities → Execution/Coordination Plan
  → Commands → Capability Execution → Observations / Results → Verification → Mission State Update → Completion
```

This is the path of a request that becomes a Mission. It does not imply that every request does: read Queries need not become Missions (D5), and whether a conversational turn is a Mission is **OPEN** (O7).

**TARGET.** In this flow:

- "Understanding" is VAJRA's UNDERSTAND step. Its cognitive input comes from GENESIS Queries; it is not a second, VAJRA-internal model of the user.
- "Capability Execution" is performed by the owner of each capability: GENESIS, AKIRA OS or HANDS.
- "Verification" is VAJRA's (§5.5).

### 5.4 Relationships (DECISION)

**VAJRA ↔ GENESIS.** GENESIS informs; VAJRA coordinates.

```
VAJRA ──cognitive Query──► GENESIS capability ──► Observation / evidence (and Result) ──► VAJRA
```

GENESIS can produce cognitive evidence and recommendations. It does not become the system-wide authority, and it issues no Commands to other owners.

**VAJRA ↔ HANDS.** HANDS executes; it does not decide the overall objective.

```
VAJRA ──authorised Command──► HANDS ──► external executor / tool ──► Observation / Result ──► VAJRA
```

**VAJRA ↔ AKIRA OS.** AKIRA OS provides infrastructure; it does not become the cross-system mission authority.

```
VAJRA ──capability / runtime requirement──► AKIRA OS ──► infrastructure · activation · resources
```

VAJRA states _which capability it requires_. It never initialises GENESIS internals, or any subsystem's internals, itself (§13).

**VAJRA ↔ MCP.** MCP exposes capabilities; VAJRA remains the cross-system authority (§15.2).

### 5.5 Observation, evidence and verification (DECISION)

```
Command ─► Execution ─► Observation ─► Evidence ─► VAJRA Verification ─► Mission Result
```

- **Verification belongs to VAJRA's mission control.** It determines whether the mission's completion criteria are satisfied.
- **Execution ≠ completion.** A capability that ran, even successfully, has not thereby completed the mission.
- **Observation ≠ verification.** An Observation is evidence. No Observation is by itself proof of success.
- **TARGET.** Capability owners return a Result for each Command (did the operation run, and how did it end) and may report Observations (what was seen). VAJRA weighs both as evidence (§9.2).

## 6. Goal vs Mission

**DECISION.** Goal and Mission are distinct concepts and must never be used as synonyms.

- **Goal:** a durable desired outcome or objective.
- **Mission:** an operational unit of work through which AKIRA attempts to achieve an objective.

**DECISION.** VAJRA owns the canonical operational Goal, and the operational lifecycle of both Goals and Missions.

```
Goal   (durable desired outcome; optional)
  │  pursued by
  ▼
Mission(s)   (operational, bounded units of work)
```

**DECISION. A Mission does not require a long-lived Goal.** A bounded user request can become a Mission directly. Example: "Find the datasheet for this IC" may be a Mission without creating any durable Goal.

| | **Goal** | **Mission** |
| --- | --- | --- |
| Definition (DECISION) | A durable desired outcome or objective | An operational unit of work through which AKIRA attempts to achieve an objective |
| Owner (DECISION) | VAJRA: the canonical operational Goal and its lifecycle | VAJRA: mission orchestration and mission lifecycle |
| Time scale (TARGET) | Long-lived. Survives many Missions. | Bounded: it has a start, a terminal state and completion criteria |
| Concepts (DECISION, Phase 1) | — | Objective, state, constraints, required capabilities, execution steps, observations, results, failures, verification, completion criteria |
| Schema and states | **OPEN** (O3). No schema or status enum is fixed. | **OPEN** (§20.3). No schema or state enum is fixed. |
| GENESIS role (DECISION) | Understands goals, infers possible goals, produces evidence about goals, understands the user's relationship to goals, provides goal-relevant cognitive context. Does **not** own the canonical Goal. | Provides cognitive evidence and understanding relevant to the mission |
| HANDS role | None | Executes mission actions on VAJRA's authorised Commands |
| AKIRA OS role | Storage infrastructure | Storage infrastructure; activates the capabilities and resources the mission requires |
| Relation (DECISION) | A Goal may be pursued by zero or more Missions | A Mission may serve a Goal, or none (a bounded request) |

**DECISION. Cognitive identity is not a Goal.** Identity may contain "this person cares about building hardware". That is cognitive identity information owned by GENESIS, not the canonical Goal object owned by VAJRA.

**CURRENT.** There is no Goal and no Mission entity.

- `MISSION_COMPLETED` fires when _every task in the workspace_ is done (`akira-store.ts:534-542`, P0 A1).
- `/daily-mission` redirects to `/tasks`.
- About 9 goal representations exist (P0 §9.1).

**TARGET. Workspace tasks are not mission steps.**

- A _Task_ is a user-managed workspace item owned by AKIRA OS.
- A _mission step_ is VAJRA's operational unit.

A mission may create, update or read tasks through capabilities, but the two concepts are not merged.

**OPEN (O3).** How do _Project_ and _Task_ (AKIRA OS) relate to _Goal_ and _Mission_ (VAJRA)? For example:

- Is a project a goal, does a project reference a goal, or are they independent?
- Should the `MISSION_COMPLETED` event be renamed when real Missions exist? (P0 #95 is LATER.)

**PROPOSED.** A Goal is created only by an explicit user act or by VAJRA confirming a cognitive proposal. GENESIS emits a _goal-declaration Observation_; it never emits a Goal.

## 7. Capability-Oriented Architecture

### 7.1 The boundary

**DECISION.** VAJRA reasons in capabilities. It does not import implementations. MCP v0 may invoke only read capabilities; any future mutating or action request from outside goes through VAJRA (§15.2).

```
VAJRA (or another authorised caller) ──► Capability Contract ──► Owning System ──► Implementation
```

**DECISION.** There is a conceptual **Capability Registry**. AKIRA OS owns capability registration and activation authority (§13); VAJRA owns selection and routing (§5.2). Only the physical location of the registry/catalogue _implementation_ is OPEN (O10); who owns registration is not. Each capability is described by metadata:

| Field              | Meaning (TARGET)                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Domain-oriented and stable, for example `project.update` or `memory.search`. Never an implementation name such as `persistUpdateTask`. |
| `owner`            | Exactly one owning subsystem                                                                                                           |
| `kind` | Command or Query (§9). A capability is one or the other. |
| `input` / `output` | Schemas. The output is always a Result envelope (§9). |
| `permissions`      | Who may invoke it (internal caller, VAJRA, external caller) and whether it needs confirmation                                          |
| `availability`     | Activation tier (§8) and current availability                                                                                          |
| `cost`             | Relative cost class, for example local and cheap versus model call versus external tool                                                |
| `execution`        | Characteristics: synchronous or long-running, idempotent or not, reversible or not, side-effect class                                  |

### 7.2 Illustrative capabilities

**DECISION.** These are examples only, not a registry.

| Capability (example)                                 | Kind            | Owner (TARGET)              | CURRENT implementation it would front                                                 |
| ---------------------------------------------------- | --------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `memory.search` / `memory.recall`                    | Query           | GENESIS · Memory            | `recallBuilder`, `contextBuilder` (browser)                                           |
| `memory.store`                                       | Command         | GENESIS · Memory            | `eventService.record` (internal). GENESIS-internal; not invocable by other subsystems or callers (Rule N3). |
| `identity.read`                                      | Query           | GENESIS · Identity          | Emergent store + foundation façade (store consolidation: O4)                                    |
| `understanding.query`                                | Query           | GENESIS · Understanding     | `understandingEngine`                                                                 |
| `recall.search` (historical)                         | Query           | GENESIS · Recall            | `HistoricalRecallProvider` → `querySearchMessages`                                    |
| `cognitive-context.read` | Query | GENESIS · Cognitive Context | `contextService.getActiveContext` |
| `workspace.read` | Query | AKIRA OS · workspace | `getInitialState` (a bulk dump) today; no per-entity read RPC exists (P0 §11.2) |
| `project.read` / `project.update`                    | Query / Command | AKIRA OS · workspace        | `persistAddProject` / `persistUpdateProject`, via akira-store                         |
| `conversation.read`                                  | Query           | AKIRA OS · conversations    | Archive blob (owner is currently `chat.tsx`, P0 #16)                                  |
| `goal.read` / `goal.create` / `goal.update`          | Query / Command | VAJRA · goals               | None                                                                                  |
| `mission.create` / `mission.update` / `mission.read` | Command / Query | VAJRA · mission             | None                                                                                  |
| `hands.execute`                                      | Command         | HANDS                       | None                                                                                  |

### 7.3 Relationship to existing registries

**CURRENT.** Three existing artifacts look similar to this registry. None of them is it:

| Existing artifact                         | What it is                                                                                    | Relation to the target registry                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/registry/CapabilityRegistry` | Provider selection: which module implements a capability id, chosen by priority. Unreachable. | P0 #45 is **LATER** and **not revived** (DECISION, §19). Its provider-selection pattern may be reconsidered when VAJRA needs routing among several providers of one capability. |
| `akira-os/tools/registry.ts`              | A static catalogue of UI tools for the sidebar                                                | P0 #21 **KEEP** as a UI catalogue. It is not the capability registry.                                                                                                           |
| The 47 server functions                   | Client→server transport                                                                       | P0 #27 **REFACTOR**. They become _implementations behind_ capabilities, never the capabilities themselves.                                                                      |

**DECISION.** Registration and activation of capabilities are AKIRA OS runtime responsibilities (§13). Selection and routing are VAJRA's (§5.2). MCP exposes capabilities; VAJRA remains the cross-system authority (§15.2).

**OPEN (O10). Where does the registry/catalogue implementation physically live?** This is a location question only. Ownership of registration and activation (AKIRA OS) and of selection and routing (VAJRA) is decided above.

- The Phase 1 folder shape lists `vajra/capabilities` (§17), which now denotes selection and routing policy only (§21, X20).
- MCP v0 reads must work through the capability boundary without becoming Missions (D5).
- **PROPOSED:** the _catalogue_ (definitions and contracts) lives in the neutral `contracts/` area; _registration and activation_ live in the AKIRA OS runtime lifecycle; the _selection and routing policy_ lives in VAJRA.

---

## 8. Selective Activation

**DECISION.** No system should execute merely because it exists. It executes because its capability is required by the current mission, request or lifecycle. Saving CPU is a side benefit, not the purpose.

### 8.1 Tiers

**DECISION** for the tiers; tier membership examples are from the brief.

| Tier | Meaning (TARGET) | Members (DECISION examples) | Activated by (DECISION, §13) |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **0: Always available** | Running for the whole lifetime of the application process                                                  | VAJRA core, mission state, capability registry, core event/transport, persistence interface, health/lifecycle foundations               | AKIRA OS lifecycle at boot                                                                             |
| **1: Warm** | Initialised early and kept ready; does incremental work only in response to relevant events or queries | Memory, Identity, Cognitive Context, Conversation, Workspace | AKIRA OS runtime lifecycle (DECISION). Ordering after Tier 0 and hydration is TARGET. |
| **2: On demand** | Not running until a mission, request or lifecycle step requires its capability; may be released afterwards | Deep planning, deep reasoning, historical search, research, vision, CAD, Vivado, browser automation, HANDS execution, external AI tools | The AKIRA OS capability/runtime layer activates it when it is required (§8). VAJRA is one requirement source and states the requirement for its missions; a lifecycle step is another (Meaning). A non-VAJRA invocation that the capability's `permissions` admit may require a registered, available, inactive Tier 2 capability; AKIRA OS may activate it or decline activation under Rule N2. VAJRA never initialises subsystem internals. |

### 8.2 Current violations

**CURRENT.** The current implementation activates by _existence_:

| Behaviour                                                                     | Evidence (P0)   |
| ----------------------------------------------------------------------------- | --------------- |
| All 12 GENESIS processors compose at import, on the client **and the server** | P0 §4, #51, #52 |
| Six of them also self-subscribe at module load                                | P0 §4           |
| 15 planning singletons are constructed at import and never used               | P0 §4.7         |
| 8 engines start at root mount, before hydration                               | P0 §8 O2        |
| Every New Chat runs a full memory replay                                      | P0 §8 O6        |
| Historical Recall decides its own activation inside the engine                | §4.1            |

**DECISION.** Selective activation is a runtime principle: a capability executes because it is required, not merely because its subsystem exists.

**TARGET.** Activation is an explicit runtime act (§13), never an import side effect.

---

## 9. Communication Model

### 9.1 The five primitives

**DECISION.** Cross-subsystem communication uses five primitives: Command, Query, Event, Observation, Result. This defines the contract only. **DECISION:** no new event bus is implemented now.

**DECISION.** Observation is a system-wide primitive, not a GENESIS-only term: evidence, state or result information reported by a capability or system about what it observed. An Observation is never by itself verification (§5.5).

The definitions below are TARGET.

|                  | **Command**                                                 | **Query**                                                               | **Event**                                                         | **Observation**                                                             | **Result**                                                                        |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Meaning          | "Do this."                                                  | "Tell me this."                                                         | "This happened."                                                  | "Here is what I observed."                                                  | "Here is the outcome of what you asked."                                          |
| Mood / tense     | Imperative                                                  | Interrogative                                                           | Past tense, a completed fact                                      | Evidential: a claim, with provenance                                        | Response                                                                          |
| Addressed to     | Exactly one capability owner                                | Exactly one capability owner                                            | No addressee; any interested subscriber                           | The authority or owner that will decide what to do with it                  | The requester only, correlated to its Command or Query                            |
| Changes state?   | May change the owner's state                                | Must not change the owner's domain state                                | Records that the owner's state _did_ change                       | No: the observer does not change the observed system's state by reporting   | No                                                                                |
| Who emits | VAJRA (or an authorised caller) | VAJRA, GENESIS, AKIRA OS (or an authorised caller) | **Only the owner of the state that changed** | Any capability or system: GENESIS (cognitive evidence), HANDS (execution evidence), AKIRA OS (health, runtime) | The owner that handled the Command or Query |
| Can be refused?  | Yes, with a failure Result                                  | Yes, with a failure Result                                              | No: it already happened                                           | The consumer may discard it                                                 | —                                                                                 |
| Certainty        | —                                                           | —                                                                       | Authoritative                                                     | May be uncertain; carries confidence and provenance                         | Authoritative about the operation                                                 |
| CURRENT analogue | Store actions → POST server functions (`persistUpdateTask`) | GET server functions; provider `get`; `contextService.getActiveContext` | Platform `AkiraEvent` (`TASK_COMPLETED`); cognition `MemoryEvent` | `IdentityObservation`; insights; `EventBusObserver`                         | **None uniform.** `persist` swallows failures; ad-hoc `{success}` shapes (P0 §10) |

### 9.2 Distinctions that must not blur (TARGET)

- **Event vs Observation.**
  - An Event is an authoritative fact published by the owner of the changed state: "task 42 was completed."
  - An Observation is evidence reported by a capability or system about what it observed, possibly uncertain: "the user appears to be learning Verilog, confidence 0.6", or "the build printed 3 failures."
  - A cognitive interpretation is never published as an Event.
- **Result vs Event.**
  - A Result goes to the requester and answers one request.
  - An Event goes to subscribers and records a change.
  - A successful state-changing Command typically yields both: a Result to the caller, and an Event from the owner.
- **Result vs Observation.**
  - HANDS returns a Result for the command it ran: did it run, exit status, failure.
  - HANDS may also emit Observations about what it saw.
  - An Observation may carry result information (what an execution produced) as evidence. The Result remains the correlated response to the requester (§21, X19).
  - VAJRA verifies using both. Neither one is verification (§5.5).

### 9.3 Scope of the primitives

**TARGET.** The primitives govern communication _between_ subsystems and across the capability boundary. Wiring inside a subsystem remains the owner's business, and is never exposed. Examples of such internal wiring:

- GENESIS `onRecord`, service listener sets, `batch.ts`, the per-context event objects (P0 M3, M5, M6);
- store `subscribe` for the UI.

**CURRENT** problems this vocabulary is meant to resolve (P0 §7, §9.4):

- three event vocabularies;
- 98 event constants, of which about 26 are published and about 70 are cognition bookkeeping;
- event types used as a durability lever (`note_created` / `note_edited` for system notes);
- two unconnected bus instances;
- no uniform Result.

**OPEN (O11).** Whether AKIRA needs a durable domain event log, in addition to its current persistence and event mechanisms, is an unresolved infrastructure and design question. None is assumed and none is created. The `events` table is written and never read (P0 #30, LATER).

---

## 10. AKIRA OS

### 10.1 Responsibility

**DECISION.** AKIRA OS is infrastructure and platform, not another brain. Its responsibilities:

- workspace
- persistence
- configuration
- lifecycle
- transport
- platform services

It does not make cognitive decisions on behalf of GENESIS, and it is not the mission authority.

### 10.2 Planes and contents (TARGET)

| Plane    | Area                            | Owns                                                                                                                                     | CURRENT starting point                                                                    |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Domain   | Workspace                       | Projects, tasks, notes, work sessions, vault, search, timeline, presence                                                                 | `src/akira-os/*` modules (P0 #10–#21)                                                     |
| Domain | Conversations | The conversation archive and conversation lifecycle (create, append, list, search index), including New Chat as a conversation boundary (DECISION, §13.2) | `akira-os/conversations`, but the archive is currently owned by `chat.tsx` state (P0 #16) |
| Domain   | Workspace / application context | What the user is doing _in the application_: active project, focus, presence, session type                                               | Spread across `companionStateService`, presence and `contextResolutionService`            |
| Platform | Persistence infrastructure      | Connection, schema and migration mechanics, transactions, durability. Never the meaning of what it stores.                               | `persistence/connection`, repositories, initializer (P0 #22–#23)                          |
| Platform | Configuration                   | Settings, provider configuration, secrets                                                                                                | Split across `settings`, `akira:ai:*` and `localStorage` (P0 §6)                          |
| Platform | System / runtime lifecycle | Boot, shutdown, runtime lifecycle, capability registration, capability activation and deactivation, resource management, health and lifecycle infrastructure (DECISION, §13) | `__root.tsx` effects, import side effects, `initializer.ts` (P0 §8) |
| Platform | Transport                       | The mechanism that carries Commands, Queries, Events, Observations and Results between subsystems and across the browser/server boundary | Server functions (P0 #27), platform bus (P0 #28–#29)                                      |
| Platform | Health                          | Health and telemetry collection                                                                                                          | `observability` (P0 #40)                                                                  |
| Platform (PROPOSED) | Model transport | PROPOSED home only; the placement is OPEN (O9, §10.3) | `genesis/context/ai/providers`, `provider-manager` |

### 10.3 Model transport

**DECISION.**

- GENESIS ≠ model transport.
- VAJRA ≠ model-provider implementation.
- Model transport (providers, provider configuration, secrets, API communication, dispatch) is an **independent capability / infrastructure concern**.

**OPEN (O9).** Its physical owner: AKIRA OS, a dedicated Model Gateway, or another infrastructure layer.

**PROPOSED (a recommendation, not a decision).** An AKIRA OS platform service, invoked through a Command capability. The reasons:

- Model inference that AKIRA uses for its own conversation is infrastructure in the same sense as persistence.
- Placing it in the platform plane keeps secrets with the configuration owner.

**PROPOSED distinction from HANDS.**

- _Model transport_ serves AKIRA's own cognition and conversation.
- _External AI tools acting as executors_ (Claude, Antigravity, coding agents) are HANDS, because they act on the world on VAJRA's behalf.

### 10.4 The store

**CURRENT.** `akira-store` is the client-authoritative owner of workspace state, the open chat and the durable memory stream, and it imports GENESIS policy (P0 #7).

**TARGET.**

- The memory stream leaves the store for the Memory System (§12).
- The open chat merges into the conversations owner.
- Whether the store remains the workspace _authority_ or becomes a _cache_ is **OPEN** (O2).

---

## 11. HANDS

**DECISION.** HANDS is the controlled execution layer. It is not an independent brain and does not decide what AKIRA wants to accomplish. VAJRA decides which capability or action is required; HANDS provides the controlled execution.

```
VAJRA ──Command (execution)──► HANDS ──► external executor / tool ──► HANDS ──Result + Observations──► VAJRA
```

**TARGET boundary:**

| Aspect              | Definition                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs | Authorised execution Commands from VAJRA only (DECISION, §5.4). Never from GENESIS; never directly from the public boundary: MCP v0 is read-only, and future external action requests route through VAJRA (DECISION, §15.2). |
| Outputs             | A Result per Command (accepted, completed, failed, cancelled); Observations of what the execution produced                                                            |
| Owns                | Executor adapters and execution sessions, for example terminal, Claude, Antigravity, development tools, external software, browser or software environments           |
| Does not own        | Missions; decisions about whether to execute; verification of mission success (VAJRA); cognitive interpretation of outputs (GENESIS)                                  |
| Controls (PROPOSED) | Each execution capability declares a side-effect class, reversibility and confirmation requirement in its capability metadata (§7.1). Confirmation policy is VAJRA's. |

**CURRENT.** Nothing exists.

- **FACT.** The model's output is never parsed for actions.
- **FACT.** `finishReason: "tool_calls"` is typed and never produced (P0 §2.2).

**DECISION.** Execution ≠ completion. A HANDS Result says that an action ran and how it ended; whether the mission is complete is VAJRA's verification (§5.5).

**DECISION.** HANDS v0 is not part of this phase. Its exact API is **OPEN** (§20.3).

**INFERENCE.** Executors such as a terminal or development tools cannot run inside a browser tab. HANDS therefore implies at least one non-browser runtime context. This bears on O1.

---

## 12. Persistence Ownership

### 12.1 Three roles

**DECISION.** Cognitive ownership, domain ownership and storage infrastructure are separate. Persistence is not ownership.

**TARGET.** Every persisted dataset has three roles, and the roles may sit in different subsystems:

| Role                 | Responsibility                                                                | Rule                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Semantic owner**   | Decides what the data _means_, what is valid, its lifecycle and its retention | Exactly one per dataset                                                                                  |
| **Writer**           | The only code path that mutates it                                            | Belongs to the semantic owner. Other subsystems change it only through the owner's Command capabilities. |
| **Storage provider** | Durability, transactions, schema and migration _mechanics_                    | AKIRA OS platform plane. It never interprets, filters, retains or rewrites data on its own initiative.   |

### 12.2 Target persistence map

| Dataset                                                           | Semantic owner + writer (TARGET)                                               | Storage                 | CURRENT                                                                                            | Gap                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Memory stream                                                     | GENESIS · Memory                                                               | AKIRA OS                | akira-store holds it and applies `applyDurableRetention`; the store rewrites past events on delete | Writer and retention move to Memory. Storage stops importing GENESIS. |
| Derived cognition (stories, importance, recall, understandings)   | GENESIS                                                                        | Not persisted (CURRENT) | Rebuilt by replay                                                                                  | Whether to persist derived state is **OPEN** (O8a under O8)           |
| Identity                                                          | GENESIS · Identity                                                             | AKIRA OS, _if durable_  | Emergent: none. Foundation: process memory; `identity.*` events persisted and never read.          | **OPEN** (O4)                                                         |
| Workspace entities (projects, tasks, notes, work sessions, vault) | AKIRA OS · workspace                                                           | AKIRA OS                | Client store authoritative, server repositories write                                              | Authority location is **OPEN** (O2)                                   |
| Conversation archive                                              | AKIRA OS · conversations                                                       | AKIRA OS                | Owned by `chat.tsx` state; a second chat store in `settings.chat`                                  | Owner moves to the conversations module                               |
| Goals                                                             | VAJRA · goals                                                                  | AKIRA OS                | None                                                                                               | New. Model **OPEN** (O3).                                             |
| Missions and mission state                                        | VAJRA · mission                                                                | AKIRA OS                | None                                                                                               | New                                                                   |
| Configuration and secrets                                         | AKIRA OS · configuration                                                       | AKIRA OS                | Three stores; secrets readable by a generic RPC                                                    | Single owner; secrets never exposed through generic access            |
| Domain event log (if one is needed) | AKIRA OS · transport | AKIRA OS | `events` table, write-only | Whether one is needed at all is **OPEN** (O11) |
| Timeline read model                                               | AKIRA OS · timeline                                                            | AKIRA OS                | `timeline_events` (subscriber plus DB triggers)                                                    | Keep (P0 #31)                                                         |
| Health / telemetry                                                | AKIRA OS · health                                                              | in-process memory (CURRENT) | Write-only                                                                                         | Phase 7                                                               |
| Execution records                                                 | HANDS produces Results and Observations; VAJRA records them into mission state | AKIRA OS                | None                                                                                               | New                                                                   |

**OPEN (O8).** The exact persistence boundary is unresolved. Questions include: one database or several, per-owner tables or schemas, and how each owner's writes are isolated (§20).

---

## 13. Lifecycle Ownership

**DECISION. Lifecycle has two system-level owners, and each subsystem owns its internals:**

| Lifecycle | Owner (DECISION) | Includes |
| --- | --- | --- |
| **System / runtime** | AKIRA OS | Boot; shutdown; runtime lifecycle; capability registration; capability activation and deactivation; resource management; system health and lifecycle infrastructure |
| **Mission** | VAJRA | Mission creation, planning, running, paused, resumed, verification, completion, failure, escalation |
| **Internal** | Each subsystem | Its own internal lifecycle, for example GENESIS's memory-reconstruction procedure |

**DECISION. Critical rule: VAJRA does not initialise GENESIS internals** (or any subsystem's internals):

```
VAJRA ─► capability requirement ─► capability / runtime layer (AKIRA OS) ─► required capability activated
```

Selective activation is therefore a runtime principle: a capability executes because it is required, not merely because its subsystem exists (§8).

**DECISION (Phase 1).** GENESIS must not become the application lifecycle manager.

This supersedes the P0 §8 proposal of one lifecycle owner that VAJRA later absorbs.

### 13.1 Lifecycle table

| Lifecycle | Owner | What the owner does | What others do | CURRENT |
| --- | --- | --- | --- | --- |
| Process boot | AKIRA OS · runtime lifecycle (DECISION) | TARGET: starts Tier 0, initialises storage, hydrates, then activates Tier 1 in a defined order, once | Subsystems expose a start contract | `__root.tsx` effects, import side effects, first-RPC registration (P0 O1–O4, O10) |
| Initialisation of a subsystem | AKIRA OS decides _when_ (DECISION) | — | The subsystem owns _how_ (DECISION: internal lifecycle) | Composition at import; `companionStateService` starts upstream engines |
| Shutdown | AKIRA OS · runtime lifecycle (DECISION) | TARGET: stops subsystems in reverse order; settles pending writes | Subsystems expose a stop contract | Cleanup runs in init order; `settlePendingPersistence` and `closeDatabaseConnection` are never called (P0 O2) |
| Capability registration | AKIRA OS (DECISION) | Registers the capabilities that owners declare | Each owner declares its capabilities and metadata (§7.1) | None (the runtime `CapabilityRegistry` is unreachable) |
| Capability activation / deactivation; resource management | AKIRA OS (DECISION) | Activates and deactivates capabilities and their resources (Tier 2 on demand) | VAJRA states the requirement and consumes availability; it never initialises internals | Nothing is deactivated; everything starts at import or mount |
| Cognitive reconstruction (replay) | GENESIS internal procedure; triggered by the AKIRA OS runtime lifecycle | TARGET: once per process start, or after a deliberate destructive reset (O6) | — | Triggered three times: root after hydration, `bootstrap` at boot, `bootstrap` on New Chat (P0 §8) |
| **New Chat** | AKIRA OS · conversations (DECISION) | Opens a new conversation with new conversation context / state (§13.2) | TARGET: GENESIS may receive a conversation-boundary Event | `closeSession` + `bootstrap`: full replay; switches off promotion until `bootstrap` (P0 B6) |
| Conversation-scoped cognitive state | GENESIS | TARGET: resets only state scoped to the conversation, in response to the boundary Event. Never Memory, Identity or durable knowledge. | — | `companionStateService` |
| Mission lifecycle | VAJRA (DECISION) | Creation, planning, running, paused, resumed, verification, completion, failure, escalation. These are lifecycle concepts, not a fixed state enum (§20.3). | Capability owners execute steps | None |
| Conversation-turn lifecycle | **OPEN** (O7) | — | — | `chat.tsx handleSend` |

### 13.2 New Chat (DECISION)

New Chat is a **conversation boundary**:

```
New Chat ─► new conversation ─► new conversation context / state
```

New Chat does **not**:

- replay all memory;
- rebuild identity;
- reconstruct GENESIS state;
- reset durable knowledge;
- reset Goals;
- reset Missions;
- reboot AKIRA.

Memory, Identity, Goals, Missions and durable knowledge survive New Chat. New Chat does not reset or remove them. They continue to evolve in normal operation, and are reset or removed as a whole only if the user explicitly performs an appropriate destructive operation.

**DECISION.** New Chat ≠ Reset. Reset semantics remain **OPEN** (O6).

**CURRENT.** The implementation does the opposite: `chat.tsx:591-592` calls `closeSession` + `bootstrap`, which replays the whole memory stream and disposes validation and recall (P0 B6). This document records the target only and changes no code.

## 14. Runtime Authority

**DECISION (principle, D8).** AKIRA must eventually have **one** authoritative live runtime.

**OPEN (O1).** Where that runtime is placed (browser, server, desktop, cloud or local backend) is **not decided**. This section analyses the placement without resolving it.

### 14.1 The facts that constrain the decision

| #   | Fact                                                                                                                                                                                                                              | Source                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| F1  | GENESIS cognition and the model call run in the browser                                                                                                                                                                           | CURRENT, P0 §2.2                                                               |
| F2  | A second, accidental GENESIS instance is composed on the server (SSR import), accumulates, and never persists                                                                                                                     | CURRENT, P0 #52                                                                |
| F3  | The workspace is client-authoritative: the store writes, RPC persists, and memory leads disk                                                                                                                                      | CURRENT, P0 §6                                                                 |
| F4  | Domain events originate only in the browser store, plus server-side vault. A server-side write is invisible to browser GENESIS.                                                                                                   | CURRENT, P0 §7                                                                 |
| F5  | API keys reach the browser through an unauthenticated generic GET RPC                                                                                                                                                             | CURRENT, P0 B4                                                                 |
| F6  | There is no desktop shell (no Electron or Tauri). The app runs as `vite dev` (a local server process) plus a browser. The production build preset is `cloudflare-module`, incompatible with `better-sqlite3` and the file system. | FACT: `package.json:9-10`, `.output/nitro.json`, `vite.config.ts:3`            |
| F7  | An MCP server would be a server-side process                                                                                                                                                                                      | DECISION premise (Phase 1 brief §13)                                                   |
| F8  | HANDS executors (terminal, tools) cannot run in a browser tab                                                                                                                                                                     | INFERENCE, §11                                                                 |
| F9  | `AGENTS.md` lists the future backend as "Python, FastAPI, SQLite"                                                                                                                                                                 | FACT: `AGENTS.md`. This conflicts with the current TypeScript server; see X12. |

### 14.2 Options

| Option                                    | Description                                                                                                                                         | Consequences                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: Browser-authoritative** (status quo) | Cognition, turn orchestration and VAJRA in the browser. The server holds storage.                                                                   | MCP and HANDS can reach only server-side data, not cognition, VAJRA or mission state. AKIRA's authority exists only while a browser tab is open. Secrets must stay client-reachable. Contradicts F7 and F8 for any capability beyond OS-domain reads.                                                                                                                                                         |
| **B: Server-authoritative**               | GENESIS, VAJRA, model transport, HANDS and domain authority run in one long-lived local server process. The browser is a UI client holding a cache. | MCP, HANDS and UI become clients of one authority. Secrets leave the browser. A server-side write reaches cognition by construction. Costs: GENESIS must be hosted in a single deliberate server instance (replacing the accidental F2 instance), not per request. Client-side reactivity needs a server→client change channel. Depends on a deployment target that can host SQLite and the file system (F6). |
| **C: Split** | Domain authority, MCP and HANDS on the server; GENESIS (and possibly VAJRA) in the browser | VAJRA or MCP would need cognition reachable across the browser boundary. Cognition is unavailable whenever no tab is open. As an end state it conflicts with the one-runtime principle (D8); it could exist only transitionally. |

### 14.3 Analysis

**INFERENCE.**

- F7 and F8 make some non-browser authority unavoidable, for MCP and for HANDS.
- Option A is therefore viable only if MCP is limited to OS-domain data and HANDS never exists in the browser-tab form.
- Option C splits one authority across two runtimes.
- These inferences point toward B. Attractiveness is not a decision: the placement stays **OPEN**.
- MCP v0 is read-only (D4), but it can read cognitive capabilities only from wherever the authoritative runtime is placed. Under today's placement, a server process reaches only OS-domain data (F1, F7).

**What must be decided before implementation:**

1. The authority location.
2. The deployment target that hosts it (F6).
3. Whether that host is the existing TypeScript server or a different backend (F9).

O2, O7, O8, O9, O10 and O12 depend on, or are shaped by, the placement. Two more are **OPEN, contingent on O1**:

- the single-instance guarantee for GENESIS on the server;
- the server→client change channel.

---

## 15. MCP Boundary

### 15.1 Placement (DECISION)

MCP is an **external capability gateway**: an interface, not an authority. It is not implemented in this phase.

```
External MCP client ─► MCP ─► AKIRA capability boundary ─► owning system ─► persistence / runtime
```

**DECISION. MCP must never directly access:**

- SQLite tables;
- internal files;
- arbitrary services;
- GENESIS internals;
- akira-store internals;
- private implementation APIs.

MCP never bypasses AKIRA's ownership boundaries.

**TARGET.** MCP binds to _capabilities_ (§7), never to file paths, service singletons, server-function names, React lifecycle or database internals. P0 §11.3's list of surfaces that must never be exposed is adopted.

### 15.2 MCP and VAJRA (DECISION)

> **MCP exposes capabilities; VAJRA remains the cross-system authority.** MCP must not become a second orchestration authority.

**Reads.** Read Queries do not need to become Missions:

```
MCP ─► authorised read capability ─► owning system ─► Result
```

**Future mutating or action requests** must respect VAJRA's central authority:

```
External request ─► MCP ─► capability / VAJRA boundary ─► VAJRA ─► Mission ─► Commands ─► capabilities
```

No external request reaches a mutating or action capability except through VAJRA. The capability model remains the abstraction between systems.

**OPEN (O10).** Where the Capability Registry / catalogue implementation physically lives (ownership of registration and activation is DECIDED, D2); the exact MCP server implementation; MCP v0's stage in the migration sequence (§16.2).

### 15.3 MCP v0 scope (DECISION)

- MCP v0 is **read-only**.
- Example read capabilities: `project.read`, `goal.read`, `mission.read`, `memory.search`, `identity.read`, `workspace.read`. These are examples, not the final catalogue.
- Write and execution capabilities are a future direction. They are not part of MCP v0.
- Authentication and authorization must eventually protect the external boundary. The mechanism, and whether it is required at v0 launch, are **OPEN** (O12).

**TARGET (sequencing).** A read capability can be exposed only once its owner exists and holds the data:

- `goal.read` and `mission.read` presuppose VAJRA. **FACT:** no Goal or Mission owner exists today (P0 §10).
- `memory.search` and `identity.read` presuppose that cognition is reachable from the MCP process, which depends on runtime placement (O1, §14).

See §21, X17.

## 16. Migration Strategy

### 16.1 Approach

**DECISION.** No big-bang rewrite. Controlled, strangler-style migration.

**DECISION. Stage sequence:**

```
CURRENT AKIRA
   ↓  Foundation cleanup
   ↓  Capability boundaries
   ↓  GENESIS migration
   ↓  VAJRA v0
   ↓  Mission + coordination
   ↓  Progressive migration
   ↓  HANDS integration
AKIRA target architecture
```

**DECISION. Per-component pattern:**

```
old implementation ─► adapter / boundary ─► capability contract ─► new owner
                                   … then, once the new path is proven: remove the old path.
```

**DECISION.** Moving folders is not architecture. Contracts and ownership are.

### 16.2 How the stages relate to the P0 phases

**PROPOSED.** The brief's stages and the P0 §15 phases describe the same path at different granularity:

| Brief stage            | P0 phases it contains                                                           | Notes                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Foundation cleanup     | P0 Phase 1 (ownership), Phase 2 (communication), plus removal of the KILL items (subject to O7r for `RuntimeManager`, SDK and compatibility) | Includes removing the accidental server GENESIS (P0 #52) and the conversation archive leaving `chat.tsx` |
| Capability boundaries  | P0 Phase 3 (capabilities), Phase 6 (Result contract)                            | The catalogue (O10) and the uniform Result                                                               |
| GENESIS migration      | P0 Phase 4 (cognition / orchestration separation), Phase 5 (lifecycle)          | AI context engine split, identity consolidation (per O4), AKIRA OS runtime lifecycle                                                 |
| VAJRA v0               | —                                                                               | New                                                                                                      |
| Mission + coordination | —                                                                               | New                                                                                                      |
| Progressive migration  | P0 Phase 7 (observability), Phase 8 (external contract)                         | —                                                                                                        |
| HANDS integration      | —                                                                               | New                                                                                                      |

**OPEN (O10).** Where MCP v0 sits in this sequence. **TARGET constraint:** MCP v0 is read-only (D4) and its reads need no Mission (D5), so it does not wait for VAJRA to read owners that already exist. `goal.read` and `mission.read` wait for VAJRA.

### 16.3 Gate

**PROPOSED.** A component's old path is removed only when two things are true:

- its capability contract has a test that exercises the new owner;
- no caller of the old path remains. Verify this with import tracing, not file names; P0's method applies.

---

## 17. Proposed Target Folder Shape

**PROPOSED, and explicitly conceptual.** This is an _ownership_ map, **not an instruction to move files**. The physical structure may differ during implementation as long as ownership and contracts are correct. No folder is created by this phase. The exact folder structure is **OPEN** (§20.3).

```
src/
  genesis/                       cognition
    memory/                      events, candidates, validation, relationships, stories, importance,
                                 memory recall, retention, durable stream (semantic owner)
    identity/                    one canonical Identity System (identity consolidation per O4)
    understanding/               interpretation → evidence (Observations)
    recall/                      historical / personal recall (queries the OS conversation archive)
    insights/
    reflection/                  later redesign
    cognitive-context/           cognitive context assembly

  vajra/                         authority / orchestration   (does not exist yet)
    core/
    goals/
    mission/
    planning/                    redesign, not a move of genesis/planning
    reasoning/                   redesign
    decision/                    redesign
    initiative/                  redesign, not a move of context/initiative
    capabilities/                selection and routing policy (implementation location: O10)

  akira-os/                      infrastructure and platform
    workspace/                   projects, tasks, notes, work sessions, vault, search, timeline, presence
    conversations/               the conversation archive and conversation lifecycle
    persistence/                 storage infrastructure only
    configuration/               settings, provider config, secrets
    lifecycle/                   system/runtime lifecycle: boot, shutdown, capability
                                 registration, activation/deactivation, resources
    transport/                   carrying the five primitives; browser/server boundary
    models/                      PROPOSED only; model-transport placement OPEN (O9)

  hands/                         controlled execution   (does not exist yet)

  contracts/                     neutral; owned by no single subsystem
    commands/
    queries/
    events/
    observations/
    results/
    capabilities/                PROPOSED: the capability catalogue (implementation location: O10)
```

**FACT.** `src/persistence` currently sits beside `src/akira-os`, not inside it, and it holds `akira-store.ts`. Its target home inside `akira-os/` above is conceptual only. Physically moving it is not implied.

---

## 18. Migration Map

The dispositions are taken from P0 §12 and not changed here. Where this document's DECISIONs refine a P0 disposition, the Notes column says so and cites §21.

| Component                                                                                            | Current location                                                                            | Current responsibility (CURRENT)                                    | P0 disposition                                              | Target owner                                                                                                                                             | Target responsibility                                                    | Migration strategy (PROPOSED)                                                                  | Notes / open questions                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Memory pipeline (candidate, validator, relationships, stories, importance, batch, retention service) | `genesis/{candidate,validation,memory/relationships,stories,importance,batch.ts,retention}` | Events → memories → derived structures                              | KEEP (#56–58, #60–62, #65, #66)                             | GENESIS · Memory                                                                                                                                         | Unchanged internals                                                      | Keep in place. Re-own the edges.                                                               | —                                                                                   |
| `memoryService`                                                                                      | `genesis/memory/memory-service.ts`                                                          | Runtime memory; clear and replay                                    | REFACTOR (#59)                                              | GENESIS · Memory                                                                                                                                         | Runtime memory; reconstruction run once per process start                | Replay triggered only by the AKIRA OS runtime lifecycle                                                   | Ids regenerate on replay, so a stable memory id is a precondition for `memory.read` |
| Durable memory stream                                                                                | `settings.genesis_memories` via akira-store                                                 | Persisted cognition                                                 | REFACTOR (#67)                                              | GENESIS · Memory (semantic/writer); AKIRA OS (storage)                                                                                                   | Single writer; retention applied by Memory                               | Adapter: Memory writes through a storage contract; the store relinquishes it                   | Format change (blob → rows) is not required (P0 §14)                                |
| Retention policy                                                                                     | `genesis/retention/policy.ts`                                                               | Durability classes; imported by the store                           | REFACTOR (#64)                                              | GENESIS · Memory                                                                                                                                         | Policy applied by its owner                                              | Remove the store's import once Memory writes the stream                                        | `identity.*` must stop consuming the user-history budget                            |
| `eventService`                                                                                       | `genesis/events/event-service.ts`                                                           | Single cognition recorder; also a bookkeeping sink                  | REFACTOR (#55)                                              | GENESIS · Memory (internal)                                                                                                                              | Records cognition events only                                            | Re-route system bookkeeping (identity, notes)                                                  | Never a public capability                                                           |
| Reality adapter                                                                                      | `genesis/events/reality-adapter.ts`                                                         | Platform bus → GENESIS                                              | REFACTOR (#53)                                              | GENESIS · Memory (intake)                                                                                                                                | Consumes domain Events                                                   | Rebind to the target transport (§9); failures become visible                                   | —                                                                                   |
| `composition.ts`                                                                                     | `genesis/composition.ts`                                                                    | Import-time wiring, client and server                               | REFACTOR (#51)                                              | GENESIS (procedure), AKIRA OS lifecycle (trigger)                                                                                                        | Explicit start contract                                                  | Start is called by lifecycle; the import side effect is removed                                | —                                                                                   |
| Server-side GENESIS instance                                                                         | (SSR side effect)                                                                           | Accidental accumulating copy                                        | KILL (#52)                                                  | —                                                                                                                                                        | —                                                                        | Remove                                                                                         | Under O1-B, a _deliberate_ single server instance replaces it                       |
| Identity: emergent + foundation (reached) | `genesis/understanding/identity-*`, `genesis/identity/*` | Two identity stores | MERGE (#73, #74) | GENESIS · Identity (DECISION) | One evidence-based identity boundary | Adapter: one identity read model over both stores; physical store consolidation per O4 | O4 (durable vs derived; whether the stores merge); §21, X15 |
| Identity: unreached services                                                                         | `genesis/identity/*`                                                                        | Skill, relationship, personality, update/archive paths              | LATER (#75)                                                 | GENESIS · Identity                                                                                                                                       | —                                                                        | Revisit after identity consolidation (per O4)                                                                        | —                                                                                   |
| Understanding                                                                                        | `genesis/understanding/{engine,rules,builder}.ts`                                           | Understanding graph                                                 | KEEP (#68)                                                  | GENESIS · Understanding                                                                                                                                  | Interpretation → evidence                                                | Keep                                                                                           | —                                                                                   |
| `personalDeclarationRule` identity writes                                                            | `understanding/rules.ts:618`                                                                | A rule mutates foundation identity                                  | REFACTOR (#69)                                              | GENESIS · Understanding → Identity                                                                                                                       | Emits identity and goal-declaration evidence (Observations)              | Replace direct writes with evidence consumed by Identity; goal evidence goes to the Goal owner | The cross-owner write is the defect                                                 |
| Intent resolver / classifier                                                                         | `genesis/understanding/intent-*.ts`                                                         | Keyword intent and ambiguity                                        | KEEP (#70)                                                  | Semantic part: GENESIS · Understanding. Operational part: VAJRA.                                                                                         | Semantic interpretation (GENESIS); request → objective → mission (VAJRA) | Split when VAJRA v0 exists. Until then GENESIS keeps it unchanged.                             | **Refines P0 #70** (§21, X1)                                                        |
| Memory Recall                                                                                        | `genesis/recall/*`                                                                          | Recall candidates                                                   | KEEP (#63)                                                  | GENESIS · Memory                                                                                                                                         | Engine behind `memory.recall`                                            | Keep                                                                                           | Lifecycle moves off `companionStateService`                                         |
| Historical Recall path                                                                               | `context/historical-search-intent.ts`, `HistoricalRecallProvider`                           | Search past conversations                                           | KEEP (#84)                                                  | GENESIS · Recall (capability); AKIRA OS · conversations (data)                                                                                           | `recall.search`                                                          | Keep the seam. Move the _invocation decision_ (§4.1) to VAJRA when it exists.                  | Mock replies and system notes are indexed (P0 B9)                                   |
| Insights                                                                                             | `genesis/insights/insight-engine.ts`                                                        | Rules over understandings                                           | KEEP (#72)                                                  | GENESIS · Insights                                                                                                                                       | Produce Observations                                                     | Keep                                                                                           | —                                                                                   |
| Reflection                                                                                           | `genesis/insights/reflection/service.ts`                                                    | Inert                                                               | LATER (#81)                                                 | GENESIS · Reflection                                                                                                                                     | Later redesign                                                           | Do not revive                                                                                  | —                                                                                   |
| Hypotheses                                                                                           | `genesis/understanding/hypotheses.ts`                                                       | Inert                                                               | LATER (#71)                                                 | GENESIS · Identity / Understanding                                                                                                                       | —                                                                        | Do not revive                                                                                  | —                                                                                   |
| Context builder / service / rules                                                                    | `genesis/context/context-*.ts`                                                              | ContextPackage                                                      | KEEP (#82)                                                  | GENESIS · Cognitive Context                                                                                                                              | `cognitive-context.read`                                                 | Keep; expose as a Query                                                                        | —                                                                                   |
| Context relevance selector                                                                           | `context/context-relevance-selector.ts`                                                     | Strips workspace material                                           | KEEP (#83)                                                  | GENESIS (relevance judgement); per-turn source selection is exercised under VAJRA's capability-selection authority (D6), whatever O7 decides about the turn lifecycle                                                                                      | —                                                                        | Keep; source selection is extracted together with turn orchestration (O7) and stays under D6                                           | —                                                                                   |
| Context resolution                                                                                   | `context/context-resolution/*`                                                              | Merges presence, companion state, relationships, habits, reflection | KEEP (#79)                                                  | Split: cognitive sources → GENESIS; application/workspace context → AKIRA OS; mission context → VAJRA                                                    | Three distinct context owners                                            | Adapter that keeps today's ResolvedContext composed from three owners, then remove the merger  | **Refines P0 #79** (§21, X2)                                                        |
| Companion state | `context/state/service.ts` | Focus, active project, active goal; memory-layer lifecycle | REFACTOR (#76) | Lifecycle → AKIRA OS runtime lifecycle (DECISION). Focus and active project → AKIRA OS workspace context. Active goal → VAJRA goals. Conversation-scoped cognitive state → GENESIS. | — | Remove the lifecycle authority first, so New Chat stops triggering replay (DECISION, §13.2); then redistribute state | — |
| Contacts (`relationshipService`, context)                                                            | `context/relationships/service.ts`                                                          | Contacts from @mentions                                             | REFACTOR (#77)                                              | GENESIS · Identity (relationships as evidence)                                                                                                           | —                                                                        | After MCP (P0 §14)                                                                             | Name collision with `memoryRelationshipService`                                     |
| Habits (`habitService`)                                                                              | `context/habits/service.ts`                                                                 | Session-scoped focus-switch habit                                   | KEEP (#78)                                                  | GENESIS · Identity (habits as understood by cognition)                                                                                                   | —                                                                        | Keep as is until identity consolidation (per O4)                                                            | **Refines P0 #78** placement only (§21, X10)                                        |
| Initiative                                                                                           | `context/initiative/*`                                                                      | Inert, always "Silence"                                             | LATER (#80)                                                 | VAJRA · initiative                                                                                                                                       | Proactivity decision                                                     | Redesign under VAJRA; do not move                                                              | —                                                                                   |
| AI context engine                                                                                    | `context/ai/context-engine.ts`                                                              | Six fused concerns (§4.2)                                           | REFACTOR (#85)                                              | GENESIS (cognitive assembly); turn orchestrator (the rest; O7)                                                                                           | —                                                                        | Strangle: wrap it, then extract dispatch and orchestration                                     | `executeRequest` duplicate                                                          |
| Prompt builder                                                                                       | `context/ai/prompt-builder.ts`                                                              | Builds the system instruction from mixed sources                    | KEEP (#86)                                                  | GENESIS (cognitive sections); turn orchestrator (composition)                                                                                            | —                                                                        | Keep; split ownership with the engine                                                          | **Refines P0 #86** (§21, X8)                                                        |
| Provider abstraction | `context/ai/{types,index}.ts`, `providerRegistry`, normalizers | Pluggable text generation | KEEP (#87) | Outside GENESIS and VAJRA (DECISION). Placement OPEN (O9); AKIRA OS · models PROPOSED. | Model transport | Re-home behind a capability | O9 |
| Providers (Gemini, OpenRouter)                                                                       | `context/ai/providers/*`                                                                    | Browser fetch with browser-held keys                                | REFACTOR (#88)                                              | As above                                                                                                                                                 | —                                                                        | Re-home; mock replies must never persist                                                       | Placement depends on O1                                                             |
| Provider manager | `context/ai/provider-manager.ts` | Config, keys, status; imports `@/akira-os` | REFACTOR (#89) | AKIRA OS · configuration (secrets) + model transport (placement O9) | — | Re-home; secrets leave generic settings access | — |
| Goals | ~9 representations (P0 §9.1) | Fragmented | No single P0 row (P0 §9.1: "MERGE into one canonical Goal") | VAJRA · goals (DECISION) | Canonical operational Goal and its lifecycle; Goal → Mission(s) | New owner; GENESIS emits goal evidence only | O3 (schema, states, Project/Task relationship) |
| Planning                                                                                             | `genesis/planning`                                                                          | Loaded, never invoked                                               | LATER (#90)                                                 | VAJRA · planning (domain)                                                                                                                                | —                                                                        | Redesign; do not move or revive                                                                | —                                                                                   |
| Reasoning                                                                                            | `genesis/reasoning`                                                                         | Loaded, never invoked                                               | LATER (#91)                                                 | VAJRA · reasoning (system level)                                                                                                                         | —                                                                        | Redesign                                                                                       | —                                                                                   |
| Decision                                                                                             | `genesis/decision`                                                                          | Loaded, never invoked                                               | LATER (#92)                                                 | VAJRA · decision (system level)                                                                                                                          | —                                                                        | Redesign                                                                                       | —                                                                                   |
| Context assembly / relevance / intelligence                                                          | `genesis/context/{assembly,relevance,intelligence}`, `insights/reflection/engine`           | Unreachable duplicates                                              | MERGE (#93)                                                 | GENESIS · Cognitive Context                                                                                                                              | —                                                                        | Fold into the live components, then remove                                                     | —                                                                                   |
| `RuntimeManager` + manifest + module loader | `src/runtime` | Plugin host; unreachable | KILL (#42) | — | — | Not revived and not deleted in this phase (DECISION); what survives is **OPEN** (O7r) | ADR-016–020 status pending |
| `LifecycleManager` | `src/runtime/lifecycle` | State machine; unreachable | LATER (#43) | May inform the AKIRA OS runtime lifecycle design (O7r) | — | Not activated | — |
| `CapabilityRegistry` | `src/runtime/registry` | Provider selection; unreachable | LATER (#45) | May inform registry and routing design (O7r, O10) | — | Not activated; not the target registry (§7.3) | — |
| `DependencyResolver` | `src/runtime/resolver` | Topological sort; unreachable | LATER (#44) | May inform AKIRA OS lifecycle ordering (O7r) | — | Not activated | — |
| SDK / compatibility | `src/sdk`, `src/compatibility` | Unreachable | KILL (#47, #48) | — | — | Not revived and not deleted in this phase; what survives is **OPEN** (O7r) | — |
| Platform bus + publisher                                                                             | `instrumentation/{event-bus,publisher}.ts`, `instrumentation/server`                        | Topic-less ×2; client→server bridge                                 | REFACTOR (#28, #29)                                         | AKIRA OS · transport                                                                                                                                     | Carries domain Events (§9)                                               | Adapter onto the target transport; deterministic server registration                           | No new bus is implemented now (DECISION)                                            |
| Event vocabulary                                                                                     | `contracts/events.ts`                                                                       | 98 mixed constants                                                  | REFACTOR (#35)                                              | `contracts/events` (domain) + GENESIS-internal (cognition)                                                                                               | The five-primitive vocabulary                                            | Split domain from cognition                                                                    | —                                                                                   |
| Legacy string-topic bus                                                                              | `shared/infrastructure/event-bus`                                                           | Unreachable                                                         | KILL (#32)                                                  | —                                                                                                                                                        | —                                                                        | Remove                                                                                         | —                                                                                   |
| `events` table | `instrumentation/event-store` | Write-only | LATER (#30) | AKIRA OS · transport, if a durable log is needed (O11) | — | — | O11 |
| akira-store                                                                                          | `persistence/akira-store.ts`                                                                | Workspace, open chat and memory stream; client-authoritative        | REFACTOR (#7)                                               | AKIRA OS · workspace (state or cache: O2)                                                                                                                | Workspace state only                                                     | The memory stream leaves for Memory, the open chat for conversations; authority per O2         | —                                                                                   |
| Persistence connection + repositories                                                                | `persistence/{connection,repositories}`                                                     | Storage                                                             | KEEP (#22)                                                  | AKIRA OS · persistence                                                                                                                                   | Storage infrastructure only                                              | Keep                                                                                           | —                                                                                   |
| Schema / migrations                                                                                  | `persistence/{schema.sql,initializer.ts,…}` (5 places)                                      | Schema                                                              | REFACTOR (#23)                                              | AKIRA OS · persistence                                                                                                                                   | Single schema owner                                                      | Consolidate                                                                                    | —                                                                                   |
| Workspace modules                                                                                    | `akira-os/{projects,tasks,notes,search,presence,tools}`                                     | Domain read/write                                                   | KEEP (#10–13, #17, #20, #21)                                | AKIRA OS · workspace                                                                                                                                     | Domain capability owners                                                 | Front them with capabilities                                                                   | —                                                                                   |
| Work sessions                                                                                        | `akira-os/sessions`                                                                         | Work sessions                                                       | REFACTOR (#14)                                              | AKIRA OS · workspace                                                                                                                                     | —                                                                        | Single owner; server-issued ids                                                                | —                                                                                   |
| Conversations | `akira-os/conversations` + `chat.tsx` state + `settings.chat` | Archive + open chat | REFACTOR (#16) | AKIRA OS · conversations | Archive and conversation lifecycle; New Chat = conversation boundary (DECISION) | Move the owner out of the route; merge the two chat stores | — |
| Settings (generic key-value)                                                                         | `akira-os/settings`                                                                         | Generic get/set incl. secrets                                       | REFACTOR (#15)                                              | AKIRA OS · configuration                                                                                                                                 | Typed configuration                                                      | Retire generic access from any public path                                                     | —                                                                                   |
| Timeline, vault                                                                                      | `akira-os/{timeline,vault}`                                                                 | Read model; files                                                   | REFACTOR (#18, #19)                                         | AKIRA OS · workspace                                                                                                                                     | —                                                                        | Per P0                                                                                         | —                                                                                   |
| Root lifecycle | `routes/__root.tsx` | Boot, hydration, 8 engines | REFACTOR (#4) | AKIRA OS · runtime lifecycle (DECISION) | — | Runtime lifecycle replaces the route effects | — |
| Conversation loop                                                                                    | `routes/chat.tsx`                                                                           | Turn orchestration, archive, sessions, replay                       | REFACTOR (#3)                                               | Turn orchestrator (O7) + AKIRA OS · conversations                                                                                                        | —                                                                        | Extract behind capabilities; the route mounts only                                             | —                                                                                   |
| Observability core                                                                                   | `src/observability` (21 files)                                                              | Write-only health                                                   | REFACTOR (#40)                                              | AKIRA OS · health                                                                                                                                        | Readable health (Observations / Queries)                                 | Phase 7                                                                                        | —                                                                                   |
| Model transport (as a whole) | `genesis/context/ai/*` | In GENESIS | (see #87–89) | Outside GENESIS and VAJRA (DECISION); placement OPEN (O9); AKIRA OS PROPOSED | — | — | O9 |

---

## 19. What We Are Not Doing Yet

**DECISION.** None of the following happens in this phase, and none is implied by this document:

- **Nothing new is built.** No VAJRA implementation. No HANDS implementation. No MCP implementation.
- **No GENESIS rewrite.** GENESIS migration means re-owning its edges, not rebuilding cognition (P0 principle).
- **No revival of the old planning / reasoning / decision stack**, and no relocation of it into `vajra/`.
- **No revival of the legacy runtime stack** (`RuntimeManager`, `LifecycleManager`, `CapabilityRegistry`, `DependencyResolver`, SDK, compatibility) just because it resembles VAJRA.
- **No splitting into processes.**
  - No microservices or distributed architecture for the sake of separation.
  - No assumption that every conceptual component becomes a separate process.
  - No assumption that every function deserves its own system.
- **No reorganisation without contracts.**
  - No massive file move without contracts.
  - No implementation based solely on folder names.
- **No new event bus.** The communication contract (§9) comes first.
- **No deletion or revival of the legacy runtime stack.** P0 dispositions stand; what survives is OPEN (O7r).
- **No MCP writes or execution in v0** (DECISION, §15.3).
- **No big-bang rewrite.**

> **Modular architecture, not distributed architecture.** Strong boundaries without premature processes or services.

---

## 20. Architectural Decisions: Closed and Open

This section separates the architectural decisions that have been made from the implementation and deployment questions that are intentionally deferred. Open IDs are kept stable so that references elsewhere in the document remain valid.

### 20.1 Closed in Phase 1.1 (DECISION)

| # | Decision | Previously | Applied in |
| --- | --- | --- | --- |
| D1 | **Goal ownership.** VAJRA owns the canonical operational Goal and the operational lifecycle of Goals and Missions. A Goal is a durable desired outcome; a Mission is an operational unit of work; Goal → Mission(s); a bounded request may become a Mission with no Goal. GENESIS understands, infers and evidences goals but does not own the canonical Goal. Cognitive identity ("cares about building hardware") is not a Goal. | O3 (owner part) | §4, §6, §12, §18, §22 |
| D2 | **Lifecycle and activation.** AKIRA OS owns system/runtime lifecycle: boot, shutdown, capability registration, activation and deactivation, resource management, health and lifecycle infrastructure. VAJRA owns mission lifecycle. Subsystems own their internal lifecycle. VAJRA never initialises subsystem internals: it states a capability requirement and the runtime layer activates it. | Phase 1 TARGET; P0 §8 proposal | §8, §10, §13, §17, §22 |
| D3 | **New Chat** is a conversation boundary. It does not replay memory, rebuild identity, reconstruct GENESIS, reset durable knowledge, Goals or Missions, or reboot AKIRA. New Chat ≠ Reset. | Part of O6; §13 TARGET | §4.1, §13.2, §18, §22 |
| D4 | **MCP v0 is read-only.** MCP is an external capability gateway. It never directly accesses SQLite, internal files, arbitrary services, GENESIS internals, akira-store internals or private APIs. Authentication and authorization must eventually protect the boundary. | O5 | §7, §15, §19 |
| D5 | **MCP and VAJRA.** MCP exposes capabilities; VAJRA remains the cross-system authority. Reads go capability → owner → Result without a Mission. Future mutating or action requests go through VAJRA. | O10 (rule part); X6 | §5.4, §7.3, §15.2, §22 |
| D6 | **VAJRA contract.** Authoritative mission coordinator; control loop UNDERSTAND → PLAN → SELECT → COORDINATE → VERIFY; receives, produces, owns and does-not-own as in §5.2; relationships to GENESIS, HANDS and AKIRA OS as in §5.4. | Phase 1 §5 TARGET | §5, §11 |
| D7 | **Observation and verification.** Observation is a system-wide primitive. Verification is VAJRA's mission-control responsibility. Execution ≠ completion; Observation ≠ verification. | X4, X5 | §5.5, §9, §11 |
| D8 | **One runtime (principle only).** AKIRA must eventually have one authoritative live runtime. Its placement stays OPEN (O1). | O1 (principle part) | §14 |
| D12 | **Model transport (principle only).** GENESIS ≠ model transport; VAJRA ≠ model-provider implementation; model transport is an independent capability/infrastructure concern. Its placement stays OPEN (O9). | O9 (principle part) | §4, §10.3, §18 |

Numbering follows the Phase 1.1 brief. Its decisions 9, 10, 11, 13 and 14 confirmed questions as OPEN; they appear in §20.2.

### 20.2 Still OPEN

#### O1. Where is the one authoritative live runtime placed?

| | |
| --- | --- |
| Status | **Principle DECIDED** (D8: exactly one authoritative live runtime). **Placement OPEN:** browser, server, desktop, cloud or local backend are all undecided. |
| Why it matters | It determines whether MCP, HANDS and VAJRA can reach cognition and mission state at all, and whether secrets can leave the browser (§14). MCP v0 can read cognition only from wherever this runtime lives. |
| Consequences | Option A limits MCP v0 to OS-domain data, and HANDS cannot exist in a browser tab. Option B requires a deliberate single server-side GENESIS and a server→client change channel. Option C, as an end state, conflicts with D8. |
| Decide before implementation | The placement; the deployment target that can host SQLite and the file system (F6); TypeScript server versus the `AGENTS.md` Python backend (F9). |

#### O2. Is the server or backend authoritative for workspace writes, with browser state as a cache?

| | |
| --- | --- |
| Status | **OPEN.** Coupled to O1. |
| Why it matters | Today only the browser store publishes workspace Events. A non-browser writer (VAJRA or HANDS on a non-browser runtime) would be invisible to cognition and the UI (P0 §7). D4 removes external writes from MCP v0, but not this problem. |
| Consequences | **If yes:** a server→client change channel; optimistic UI becomes cache reconciliation; id minting moves to the server, which fixes the P0 B1/B2 class of defects. **If no:** every non-browser writer is forbidden or must be proxied through a browser. |
| Decide before implementation | The authority, the change-propagation direction, and conflict semantics for optimistic UI. |

#### O3. What are the Goal schema, its states, and its relationship to Project and Task?

| | |
| --- | --- |
| Status | **Owner and Goal/Mission relationship DECIDED** (D1). **Schema, status values and the Project/Task relationship OPEN.** |
| Why it matters | About 9 representations feed the prompt today (P0 §9.1). `goal.*` capabilities cannot be specified without a model. |
| Consequences | Project arcs, `IdentityGoal`, understanding Goals and companion `activeGoal` become _evidence about_ or _views of_ the canonical Goal. |
| Decide before implementation | The Goal fields and states; who may create a Goal (PROPOSED: a user act or VAJRA confirmation); its relationship to Project and Task; whether `genesis/planning`'s model informs the design. |

#### O4. Identity: what is durable, what is derived, and do the two current stores merge?

| | |
| --- | --- |
| Status | **GENESIS owns Identity (DECISION). OPEN:** which identity structures are durable, which are derived, and whether the two current stores (emergent and foundation) merge. See §21, X15. |
| Why it matters | The stores differ in lifetime, matching and persistence. Cold boots re-record `identity.*` (P0 B7). `identity.read` is ill-defined until this is settled. |
| Consequences | **Durable:** Identity is persisted state with its own schema; replay no longer re-creates it; evidence links need stable ids. **Derived:** Identity is rebuilt from the memory stream; identity bookkeeping must not be persisted as user-history events. |
| Decide before implementation | Which facets are durable; whether consolidation is physical (one store) or logical (one boundary); the evidence-id model, given that memory ids regenerate on replay today. No schema is fixed here. |

#### O5. Closed

Closed by D4: MCP v0 is read-only.

#### O6. What does a destructive Reset mean?

| | |
| --- | --- |
| Status | **New Chat ≠ Reset is DECIDED** (D3). **Reset semantics OPEN.** |
| Why it matters | The relationship of Reset to durable cognition, Goals, Missions, conversations, the conversation archive and workspace data is undesigned. Today Reset clears workspace and memory but leaves the archive and in-memory GENESIS caches, while Historical Recall quotes the archive to the model, which violates the precondition stated in `reset.ts:46-49` (P0 B12). |
| Consequences | **Full reset:** one "forget everything" operation across all owners. **Selective reset:** per-dataset operations, each owned by that dataset's semantic owner (§12). **Either way:** Reset must reach GENESIS runtime state and VAJRA mission state, not only storage. |
| Decide before implementation | The scope of Reset per dataset (§12.2); whether Reset is one operation or several; how it reaches each owner's lifecycle (§13). |

#### O7. Who owns the conversation-turn lifecycle? Is a conversational turn a Mission?

| | |
| --- | --- |
| Status | **OPEN.** |
| Why it matters | DECISION: turn orchestration leaves GENESIS and the UI. D5 establishes that read Queries need not become Missions, but it does not decide whether a conversational turn is a Mission. A plain chat turn may not warrant a Mission's machinery (constraints, verification, completion criteria). |
| Consequences | **Every turn is a (lightweight) Mission:** one uniform path, but heavier. **A non-mission request path inside VAJRA:** lighter, but two paths. **A conversation service in AKIRA OS:** reintroduces orchestration outside the authority, against principle 1. |
| Decide before implementation | The owner; whether VAJRA v0 must exist before turn orchestration can leave `chat.tsx`, or whether an interim owner is allowed. |

#### O7r. What survives of RuntimeManager, LifecycleManager, CapabilityRegistry, DependencyResolver and the SDK/compatibility layers?

| | |
| --- | --- |
| Status | **OPEN.** DECISION: nothing is deleted or revived in this phase, and the old stack is not revived merely because similar concepts appear in the target. P0 dispositions remain authoritative: KILL for `RuntimeManager` (#42), SDK (#47) and compatibility (#48); LATER for `LifecycleManager` (#43), `DependencyResolver` (#44), `CapabilityRegistry` (#45) and permissions (#46). |
| Why it matters | Three dormant control designs remain in the tree. ADR-016–020 still read "Accepted". Their concepts may inform the implementation of runtime lifecycle and capability registration (D2). |
| Consequences | **Remove:** the tree loses about 3.6k LOC of misleading architecture. **Keep:** a risk of accidental revival, and docs that contradict the target. |
| Decide before implementation | Confirm or revise the P0 KILLs; the ADR-016–020 status; whether the LATER pattern donors are kept in the tree or archived. |

#### O8. What is the exact persistence boundary for GENESIS, VAJRA and AKIRA OS?

| | |
| --- | --- |
| Status | **OPEN.** The principle is DECIDED (§12.1: persistence is not ownership); the mechanics are not. |
| Why it matters | Single-writer ownership must be enforceable, not conventional. |
| Consequences | **One database with per-owner tables:** simplest, but needs enforced write isolation. **Per-owner databases:** strong isolation, but cross-owner transactions are lost (for example, project delete currently stamps sessions in one transaction). |
| Decide before implementation | The isolation mechanism; whether derived cognition is persisted (O8a); the schema-ownership model (P0 #23); how cross-owner consistency is achieved, through Events or transactions. |

#### O9. Where is model transport placed?

| | |
| --- | --- |
| Status | **Principle DECIDED** (D12). **Placement OPEN:** AKIRA OS, a Model Gateway, or another infrastructure layer. AKIRA OS is PROPOSED only (§10.3). |
| Why it matters | It determines the secret owner, cost accounting and activation tier. |
| Consequences | **AKIRA OS service:** model calls are platform infrastructure; external agents are HANDS. **Dedicated Model Gateway:** the same separation with its own boundary and lifecycle. **HANDS (analysed contrast, not a listed candidate):** every model call would become an "execution", which over-weights ordinary conversation. D12 rules out GENESIS and VAJRA. |
| Decide before implementation | The owner, and its placement relative to O1. |

#### O10. Capability Registry implementation location, MCP implementation, MCP stage

| | |
| --- | --- |
| Status | **Rule DECIDED** (D5). **Ownership is not open:** registration and activation authority is AKIRA OS's (D2); selection and routing are VAJRA's (D6). **OPEN, location and implementation only:** where the registry/catalogue implementation physically lives; the exact MCP server implementation; MCP v0's stage in the migration sequence (§16.2). |
| Why it matters | MCP v0 reads must work through the capability boundary without becoming Missions (D5), so they must not depend on VAJRA-internal code paths. |
| Consequences | **Catalogue in neutral `contracts/`** (PROPOSED): MCP v0 can precede VAJRA for reads of existing owners. **Catalogue inside VAJRA:** MCP v0 waits for VAJRA. |
| Decide before implementation | The catalogue and registry location; MCP's stage in §16; the MCP server's process and host (with O1). |

#### O11. Does AKIRA need a durable domain event log?

| | |
| --- | --- |
| Status | **OPEN.** An unresolved infrastructure and design question. No log is assumed to be required, and none is created (P0 #30 LATER). |
| Why it matters | Mission audit, analytics and replay of domain history would depend on it. |
| Consequences | **Log:** the `events` table gains a reader and a retention policy. **Delivery only:** the table is removed, and analytics needs another source. |
| Decide before implementation | Before the transport target (§9) is fixed. |

#### O12. External-boundary authentication and authorization

| | |
| --- | --- |
| Status | **Requirement DECIDED** (D4: auth must eventually protect the external boundary). **Mechanism and v0 timing OPEN.** Raised in Phase 1.1. |
| Why it matters | Even read-only, MCP v0 would expose memory, identity and conversations. **FACT:** no server function is authenticated today (P0 §11.4). P0 §13.11 listed an authorization boundary as a pre-MCP prerequisite (§21, X16). |
| Consequences | **Required at v0 launch:** MCP v0 waits for the auth design. **Not required at v0:** read-only v0 exposes personal data to any local caller that can reach it. |
| Decide before implementation | The mechanism; per-capability permissions (§7.1 `permissions`); whether v0 may ship without it. |

### 20.3 Deferred design details (OPEN)

These are intentionally left to later design work.

| Detail | Status |
| --- | --- |
| Exact Goal schema and status values | OPEN (O3) |
| Exact Mission schema and state values | OPEN |
| VAJRA interfaces and message shapes | OPEN. No TypeScript interfaces are defined. |
| Exact HANDS API | OPEN |
| Exact Identity persistence model | OPEN (O4) |
| Exact database schemas | OPEN (O8) |
| Physical location of the Capability Registry / catalogue implementation (ownership is DECIDED, D2) | OPEN (O10) |
| Exact MCP server implementation | OPEN (O10) |
| Exact folder structure | OPEN. §17 is conceptual. |

## 21. Contradictions and Refinements

Differences found between the audit, P0, the Phase 1 brief, the Phase 1.1 brief and this document. Contradictions closed by the Phase 1.1 decisions have been removed from this section; §20.1 records the decisions that closed them. Nothing here is silently resolved.

### 21.1 Standing refinements and gaps

| # | Between | Contradiction | Resolution in this document |
| --- | --- | --- | --- |
| X1 | P0 #70 ↔ Phase 1 brief §3 | P0: Intent Resolver **KEEP**. Brief: split or move it (semantic → GENESIS, operational → VAJRA). | P0 disposition kept; the split is a target refinement (§18). Executed only when VAJRA exists. |
| X2 | P0 #79 ↔ Phase 1 brief §3 | P0: Context Resolution **KEEP**. Brief: split into cognitive / application / mission context. | Refinement (§18). |
| X8 | P0 #86 ↔ Phase 1 brief §3 | P0: prompt builder **KEEP**, in GENESIS. Brief: model-facing composition is outside GENESIS. | Refinement: GENESIS keeps cognitive serialisation; composition moves to the turn orchestrator (§4.2). |
| X9 | Phase 1 brief §7 ↔ current | Tier 0 includes "VAJRA core". VAJRA does not exist, and the current system activates by import. | Not a decision conflict; a current-vs-target gap (§8.2). |
| X10 | P0 #77, #78 ↔ Phase 1 brief §2 | P0 placed habits and contacts in _context_. The brief places habits and relationships (as cognition) in Identity. | Refinement of placement within GENESIS; dispositions unchanged. |
| X11 | `ARCHITECTURE.md` §5 ↔ this document | The repository's architecture doc shows "AI Model Provider → Proactive Initiative Suggestions" inside GENESIS's flow, and says GENESIS has no write access to the workspace _database_. That is true, but it writes the durable stream through the store. | `ARCHITECTURE.md` is superseded for GENESIS's boundary by this document. Updating it is a later documentation task. |
| X12 | `AGENTS.md` ↔ current | `AGENTS.md` lists the future backend as Python / FastAPI. The repository is a TypeScript server (TanStack Start / nitro). | **OPEN** within O1 |
| X13 | Repository ↔ runtime placement | No desktop packaging exists; the build preset `cloudflare-module` cannot host `better-sqlite3`; production is effectively `vite dev`. | **OPEN** within O1 (F6) |

### 21.2 Raised while applying Phase 1.1

| # | Between | Contradiction | Resolution in this document |
| --- | --- | --- | --- |
| X15 | Phase 1 brief §2 ↔ Phase 1.1 brief decision 10 | Phase 1: identity implementations "should eventually be consolidated into one canonical Identity System". Phase 1.1: "Should the two current identity stores merge?" remains OPEN. | **Reconciled by interpretation; owner confirmation needed.** One canonical Identity _system_ (a single owner and capability boundary) stays decided. Whether the current _stores_ physically merge is OPEN (O4). P0 #73/#74 MERGE stands as a disposition. |
| X16 | P0 §13.11 ↔ D4 | P0 lists an authorization boundary as a pre-MCP prerequisite. D4 says auth must "eventually" protect the boundary. | **Not resolved.** Recorded as O12. Resolving it either way would be a new decision. |
| X17 | D4 examples ↔ FACT ↔ P0 §10 | D4's example reads include `goal.read` and `mission.read`. No Goal or Mission owner exists, and P0 §10 said MCP v0 must not expose `mission.*`. | Not a decision conflict. The examples are not the final catalogue, and a read is exposed only once its owner exists (TARGET, §15.3). Whether MCP v0 waits for VAJRA is OPEN (O10). |
| X18 | D6 (UNDERSTAND in VAJRA's loop) ↔ GENESIS owning Understanding | Both subsystems "understand". | VAJRA's UNDERSTAND is _operational_ understanding of a request, informed by cognitive Queries to GENESIS (§5.1, §5.4). This follows D6's VAJRA ↔ GENESIS relationship; no new assumption beyond naming the distinction. |
| X19 | D7 ↔ §9 Result primitive | D7 defines an Observation as "evidence/state/result information". §9 keeps Result as a distinct primitive. | An Observation may carry result information as evidence; a Result is the correlated response to the requester (§9.2). Both remain distinct primitives. |
| X20 | D2 ↔ D6 ↔ Phase 1 folder shape ↔ D5 | AKIRA OS owns capability registration and activation (D2); VAJRA owns selection and routing (D6); the folder shape listed `vajra/capabilities`; the registry implementation's physical location is not final (D5). | Responsibilities split as stated. `vajra/capabilities` now denotes selection and routing policy only. Only the implementation's physical location is OPEN (O10); registration and activation authority stays with AKIRA OS. |
| X21 | Phase 1.1 brief sources ↔ available material | The brief names "the original VAJRA proposal provided during the architecture discussion" as a source. It is not in the repository and was not available to this revision. | VAJRA content here derives only from the Phase 1 and Phase 1.1 briefs. If the original proposal differs, this document has not been checked against it. |

## 22. Architectural Diagrams

### 22.1 System level

```
              User                                   External MCP client
               │ request                                      │
               ▼                                              ▼
  ┌───────────── VAJRA ─────────────┐         MCP (capability gateway · v0 read-only)
  │ goals · missions · selection ·  │◄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤ future mutating / action
  │ verification · escalation       │                         │ requests (not in v0)
  └──────┬───────────────────▲──────┘                         │
 Commands│          Results /│                                │ authorised read Queries
 Queries ▼       Observations│                                │ (no Mission needed)
  ┌─────────────────────────── Capability boundary ───────────▼──────────────┐
  └─────────┬─────────────────────────┬─────────────────────────┬────────────┘
            ▼                         ▼                         ▼
         GENESIS                  AKIRA OS                    HANDS
       (cognition)             (domain plane)          (execution; Commands
                                                         from VAJRA only)
  ────────────────────────────────────────────────────────────────────────────
  AKIRA OS platform plane: persistence · configuration · runtime lifecycle ·
  capability registration and activation · transport · health
```

### 22.2 Cognitive flow

```
 Input (domain Events · conversation turns · cognitive Queries)
   │
   ▼
 Understanding ──► Observations (evidence) ──► Identity
   │                         └──────────────► Goal owner (VAJRA): goal evidence only
   ▼
 Memory (events → candidates → validation → memories → relationships · stories · importance · retention)
   │
   ├─► Identity          ├─► Memory Recall       ├─► Historical Recall (queries the OS archive)
   └─► Insights ──► Observations
   │
   ▼
 Cognitive Context ──Result / Observations──► VAJRA, the turn orchestrator (O7), or an authorised MCP read

 GENESIS informs and may recommend. It issues no Commands to other owners.
```

### 22.3 Mission flow

```
 Request / trigger ─► VAJRA · UNDERSTAND (cognitive Queries to GENESIS)
                         │
                         ▼
          Goal (durable, optional) ──pursued by──► Mission (operational)
                         │
                         ▼
          PLAN ─► SELECT (capability requirement ─► AKIRA OS activates the capability)
                         │
                         ▼
          COORDINATE: Commands ─► GENESIS | AKIRA OS | HANDS ─► execution
                                                                  │
                         ┌──── Results + Observations (evidence) ◄┘
                         ▼
          VERIFY against completion criteria     execution ≠ completion
                         │                       observation ≠ verification
                         ▼
          Mission state update ─► e.g. next step · completion · failure · escalation
```

### 22.4 Ownership

```
┌──────────────── GENESIS ────────────────┐  ┌───────────────── VAJRA ─────────────────┐
│ Memory System (semantic owner, stream)  │  │ Canonical operational Goals             │
│ Identity (one boundary; stores: O4)     │  │ Missions · mission state · lifecycle    │
│ Understanding (→ Observations)          │  │ Planning · system Reasoning · Decision  │
│ Memory Recall · Historical Recall       │  │ Initiative · global mission constraints │
│ Insights · Reflection (later)           │  │ Capability selection and routing        │
│ Cognitive Context                       │  │ Completion criteria · Verification      │
│ Its own internal lifecycle              │  │ Escalation                              │
└─────────────────────────────────────────┘  └─────────────────────────────────────────┘
┌─────────────── AKIRA OS ────────────────┐  ┌───────────────── HANDS ─────────────────┐
│ Domain: workspace · conversations       │  │ Executor adapters (terminal, Claude,    │
│   (New Chat) · vault · search ·         │  │   Antigravity, dev tools, browser/sw)   │
│   timeline · presence · app context     │  │ Execution sessions                      │
│ Platform: persistence infra · config ·  │  │ Results + Observations of execution     │
│   secrets · runtime lifecycle ·         │  │                                         │
│   capability registration/activation ·  │  │                                         │
│   resources · transport · health        │  │                                         │
└─────────────────────────────────────────┘  └─────────────────────────────────────────┘
  Independent concern, placement OPEN (O9): model transport.
  Owner OPEN (O7): conversation-turn orchestration.
  contracts/ (neutral): commands · queries · events · observations · results · capabilities (implementation location: O10)
```

### 22.5 Lifecycle and activation

```
 AKIRA OS runtime lifecycle ─ boot ─► Tier 0 ─► storage init ─► hydrate ─► Tier 1 (once per process)
                            └ shutdown ─► reverse order · settle pending writes

 VAJRA ─► capability requirement ─► AKIRA OS capability / runtime layer ─► capability activated (Tier 2)
          VAJRA never initialises subsystem internals.

 New Chat ─► AKIRA OS · conversations ─► new conversation + conversation context / state
          No replay · no identity rebuild · Memory, Identity, Goals and Missions survive.
```

## 23. Architectural Principles

1. **One authority for orchestration.** Cross-system orchestration has exactly one authority: VAJRA. No route, store, cognitive engine, import side effect or external gateway orchestrates.
2. **Cognition is not orchestration.** GENESIS understands and informs. It does not decide what AKIRA does.
3. **Execution is not decision-making.** HANDS executes what VAJRA decided. It never chooses the objective.
4. **Infrastructure is not cognition.** AKIRA OS stores, configures, transports, activates and runs the system lifecycle. It never interprets.
5. **Ownership is explicit.** Every dataset, capability and lifecycle has exactly one named owner.
6. **Capabilities are the interface between authority and implementation.** Callers depend on capability contracts, never on modules, files or server functions.
7. **Commands, Queries, Events, Observations and Results are distinct.** None stands in for another.
8. **Goals and Missions are distinct.** A Goal is a durable outcome; a Mission is an operational unit of work. A Mission can exist without a Goal.
9. **Persistence is not ownership.** Storing data confers no authority over its meaning or lifecycle.
10. **Selective activation over unnecessary computation.** Activation is an explicit runtime act, not a consequence of import or mount.
11. **Modular before distributed.** Strong boundaries in-process. A new process only when a boundary demonstrably requires it.
12. **Migrate incrementally.** Old path → adapter → contract → new owner. Remove the old path only when the new one is proven.
13. **Do not revive legacy architecture merely because it exists.** Resemblance to the target is not a reason to reuse.
14. **No subsystem accretes unrelated concerns.** When a responsibility does not match a subsystem's question (§2.1), it belongs elsewhere.
15. **A system executes only when its capability is required.**
16. **MCP exposes capabilities; VAJRA remains the cross-system authority.** External reads reach owners through the capability boundary; no external request mutates or acts except through VAJRA.
17. **Execution is not completion, and observation is not verification.** Only VAJRA's verification against completion criteria completes a mission.
18. **New Chat is a conversation boundary.** It never resets or rebuilds durable state.
19. **One authoritative live runtime.** Where it lives is still open; that there is exactly one is not.
