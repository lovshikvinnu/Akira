# AKIRA Foundation Contracts

**Phase 2: Foundation Contracts.** This document specifies the boundaries and communication contracts between GENESIS, VAJRA, HANDS and AKIRA OS. It is an architecture specification only. It defines no TypeScript, transport, schema, folder or runtime implementation, and no code was changed to produce it.

|                  |                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary source   | [AKIRA-TARGET-ARCHITECTURE.md](AKIRA-TARGET-ARCHITECTURE.md) (frozen), cited as **TA §n**, with decisions **Dn** and open questions **On**                                   |
| Secondary source | [AKIRA-TARGET-ARCHITECTURE-CONSISTENCY-AUDIT.md](AKIRA-TARGET-ARCHITECTURE-CONSISTENCY-AUDIT.md), used only for the final consistency state and the intentionally OPEN items |
| Date | 2026-10-02 |
| Revision | Phase 2: initial contracts. Phase 2.1B: corrections per the Phase 2.1A audit (CX1–CX3, PC1, ND1–ND6, A1–A6, W1–W5). Phase 2.1F: contract consequences of accepted Rules N1, N2 and N3 applied. |

### Labels

Every substantive statement carries one label.

| Label        | Meaning                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DECIDED** | A DECISION in the Target Architecture, or in an accepted decision record ([N1](AKIRA-N1-DECISION.md), [N2](AKIRA-N2-DECISION.md), [N3](AKIRA-N3-DECISION.md)), restated here and not changed |
| **TARGET**   | A TARGET in the Target Architecture, restated here                                                                                                    |
| **CONTRACT** | Specified in this phase. Each CONTRACT follows from cited DECIDED/TARGET statements and adds precision, not new authority.                            |
| **PROPOSED** | A contract-level recommendation that goes beyond what the Target Architecture determines. It may be overruled without contradicting anything DECIDED. |
| **OPEN** | Unresolved. Either an existing TA open question (On) or a new contract-level question (Nn, §22) |
| **CURRENT** | Today's implementation, as recorded in the Target Architecture. Context only; never a contract. |

**CONTRACT rule.** Where a CONTRACT and the Target Architecture appear to differ, the Target Architecture wins and the CONTRACT is defective.

### Contract index

| ID  | Contract                     | Section |
| --- | ---------------------------- | ------- |
| K1  | Command                      | §2.1    |
| K2  | Query                        | §2.2    |
| K3  | Event                        | §2.3    |
| K4  | Observation                  | §2.4    |
| K5  | Execution Result             | §2.5    |
| K6  | Mission Result               | §2.5    |
| K7  | Capability descriptor        | §3      |
| K8  | Capability ownership split   | §4      |
| K9  | Capability lifecycle         | §5      |
| K10 | VAJRA → capability flow      | §6      |
| K11 | GENESIS boundary             | §7      |
| K12 | VAJRA boundary               | §8      |
| K13 | HANDS boundary               | §9      |
| K14 | AKIRA OS boundary            | §10     |
| K15 | Persistence                  | §12     |
| K16 | Lifecycle                    | §13     |
| K17 | Authority                    | §14     |
| K18 | Failure                      | §15     |
| K19 | Correlation and traceability | §16     |
| K20 | Interaction semantics        | §17     |
| K21 | MCP boundary                 | §18     |
| K22 | Selective activation         | §19     |

---

## 1. System Boundaries

### 1.1 GENESIS

**DECIDED (TA §3.1, §3.2).** GENESIS is cognition. It answers what AKIRA knows, remembers, understands, infers and cognitively derives.

**CONTRACT (K11, summary).** GENESIS exposes **Query capabilities** and produces **Observations** and **Results**. It does not expose any capability that confers authority over another subsystem.

| Exposes (CONTRACT)                          | Basis                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Memory: search, recall, read                | TA §3.2 Memory System; TA §7.2 `memory.search` / `memory.recall`            |
| Identity: read                              | TA §3.2 Identity; `identity.read`                                           |
| Understanding: query                        | TA §3.2 Understanding; `understanding.query`                                |
| Recall: Memory Recall and Historical Recall | TA §3.2 Recall; `recall.search`                                             |
| Insights: read                              | TA §3.2 Insights                                                            |
| Reflection                                  | **Later** (TA §3.2: concept may remain, current implementation not revived) |
| Cognitive Context: assemble for a focus     | TA §3.2 Cognitive Context; `cognitive-context.read`                         |

**DECIDED (TA §3.1). GENESIS must not become, and must not expose any capability that makes it:**

- a mission orchestrator;
- a system-level decision authority;
- an executor;
- a lifecycle authority (it owns only its internal lifecycle, TA §13);
- a model-transport owner (D12);
- a cross-system command authority.

### 1.2 VAJRA

**DECIDED (D6, TA §5.2).** VAJRA is the authoritative mission coordinator. Its control loop is UNDERSTAND → PLAN → SELECT → COORDINATE → VERIFY.

| VAJRA owns (DECIDED)                                                         | VAJRA does not own (DECIDED)                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Canonical operational Goals (D1)                                             | Raw memory implementation                                                       |
| Missions, mission state and mission lifecycle (D1, D2)                       | Identity implementation                                                         |
| Cross-system decisions                                                       | Workspace implementation and persistence                                        |
| Capability selection and routing (D6)                                        | Database implementation                                                         |
| Global mission constraints                                                   | Terminal execution                                                              |
| Completion criteria                                                          | Claude / Antigravity execution                                                  |
| Verification (D7)                                                            | Model-provider implementation (D12)                                             |
| Escalation                                                                   | UI state                                                                        |
| Planning, system-level Reasoning and Decision, Initiative (TA §5.2, Phase 1) | Internal logic of any capability (GENESIS internals, HANDS execution internals) |

### 1.3 HANDS

**DECIDED (TA §11, §5.4).** HANDS is the controlled execution layer. It receives authorised Commands from VAJRA only, executes them against external executors or tools, observes, and reports Results and Observations.

**DECIDED. HANDS does not:**

- decide objectives;
- create strategic missions;
- select capabilities;
- verify mission completion;
- become an orchestration authority.

### 1.4 AKIRA OS

**DECIDED (TA §2.2, §10, D2).** AKIRA OS is infrastructure and platform, with two planes:

| Plane              | Contents                                                                                                                                                                           | Contract role                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Platform plane** | Persistence infrastructure (storage provider), configuration and secrets, system/runtime lifecycle, capability registration and activation, transport, health, resource management | Beneath GENESIS, VAJRA and HANDS. It provides mechanisms and makes no cognitive or mission decisions. |
| **Domain plane**   | Workspace (projects, tasks, notes, work sessions, vault, search, timeline, presence), conversations (archive, conversation lifecycle, New Chat), application context               | A peer capability owner. Its capabilities are invoked like any other owner's.                         |

**DECIDED.** AKIRA OS is not a mission authority and does not make cognitive decisions on GENESIS's behalf. **Model transport** is an independent concern whose placement is **OPEN** (O9). AKIRA OS is the PROPOSED home (TA §10.3) and is not assumed by any contract here.

---

## 2. Core Communication Primitives

**DECIDED (TA §9.1).** Cross-subsystem communication uses five primitives: Command, Query, Event, Observation and Result. **DECIDED:** no new event bus is introduced.

**TARGET (TA §9.3).** The primitives govern communication _between_ subsystems and across the capability boundary. Wiring inside a subsystem is the owner's own business.

**CONTRACT (all primitives).**

- Every primitive instance is **immutable** once emitted. A correction is a new instance that references the original.
- Every instance carries the correlation fields of §16.
- Each primitive's fields below are **conceptual**: they name the information the contract requires, not a wire format.

### 2.1 Command (K1)

> "Perform this action."

| Aspect                          | Contract                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issuer                          | **DECIDED:** VAJRA for cross-system work, and for every external mutating or action request (D5). **DECIDED:** GENESIS never issues Commands to other owners (TA §3.1). **DECIDED:** no external caller issues Commands in MCP v0 (D4). **DECIDED (Rule N1):** an internal caller may issue a Command directly to the owning capability only when all five Rule N1 conditions hold: an explicit user instruction; no coordination across owners; outside any Mission; permitted by the capability's `permissions`; and a target that is neither a HANDS nor a GENESIS capability.                                |
| Receiver                        | **CONTRACT:** exactly one capability owner, addressed through a Command capability (TA §9.1). HANDS receives Commands from VAJRA only (TA §11).                                                                                                                                                                                                                                                                           |
| Contract-level timing           | **CONTRACT:** asynchronous-capable. A Command always ends in exactly one terminal Result (K5). It may first produce an acceptance Result and intermediate Observations (§17).                                                                                                                                                                                                                                             |
| Required information (CONTRACT) | Command identity; target capability name and version; input conforming to the capability's input contract; issuer identity; authority basis (the mission and step it serves, or the authorised caller and permission it relies on); correlation fields (§16); constraints that apply (for example a deadline, side-effect limits or confirmation requirements); and whether it is a cancellation of a prior Command (§9). |
| Authorization                   | **CONTRACT:** a Command is admitted only if it satisfies the capability's `permissions` (K7) for its issuer and authority basis; otherwise it is rejected (K18). **Not decided:** where this check is enforced (§22.3). For external callers the mechanism is **OPEN** (O12).                                                                                                                                                                                                          |
| Expected response               | **CONTRACT:** a Result to the issuer. **TARGET (TA §9.2):** a successful state-changing Command typically also yields an Event from the owner.                                                                                                                                                                                                                                                                                                              |

### 2.2 Query (K2)

> "Tell me something."

| Aspect                | Contract                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requester             | **TARGET (TA §9.1):** VAJRA, GENESIS, AKIRA OS or another authorised caller. **DECIDED (D4):** MCP v0 is an authorised caller of read Queries only.                                                                             |
| Receiver              | **CONTRACT:** exactly one capability owner, through a Query capability                                                                                                                                                          |
| Input / response      | **CONTRACT:** input per the capability's input contract; the response is a Result (K5) carrying the answer, or a failure                                                                                                        |
| State                 | **TARGET:** a Query must not change the owner's domain state (TA §9.1). **CONTRACT:** a Query may still have operational side effects that are not domain state, such as caching or telemetry. For a non-VAJRA invocation that the capability's `permissions` admit, of a registered, available, inactive Tier 2 capability, the invocation is a requirement and AKIRA OS may activate the capability or decline (Rule N2). Activation is an operational side effect performed by AKIRA OS, not a domain-state change. |
| Missions              | **DECIDED (D5):** a Query does not create a Mission and does not need one. **OPEN (O7):** whether a conversational turn is a Mission. This contract does not decide it.                                                         |
| Relationship to VAJRA | **DECIDED (D5):** MCP read Queries reach the owning capability without VAJRA. **TARGET (TA §3.2):** GENESIS queries the conversation archive through a contract. **Not confirmed by the TA:** whether D6's capability selection and routing extends to non-mission Queries by other internal callers (§22.3). When a Query serves a mission, VAJRA issues it and its correlation fields carry the mission.                                                                            |

### 2.3 Event (K3)

> "Something happened."

| Aspect                   | Contract                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producer                 | **DECIDED/TARGET (TA §9.1):** only the owner of the state that changed                                                                                                                                                                                                                                                                                                          |
| Consumers                | **TARGET:** no addressee. Any subscriber permitted to observe that owner's Events.                                                                                                                                                                                                                                                                                              |
| Requests action?         | **CONTRACT:** no. An Event never instructs anyone. A consumer that reacts does so under its own authority, within its own state. A consumer that wants cross-system work done must go through VAJRA.                                                                                                                                                                            |
| Implies authority?       | **CONTRACT:** no. Receiving an Event confers no authority over the producer's state.                                                                                                                                                                                                                                                                                            |
| Content (CONTRACT)       | Event identity; producer; subject (which owned entity or state); what changed; time of occurrence; causation (the Command, if any, that caused it); correlation (§16)                                                                                                                                                                                                           |
| Ordering                 | **PROPOSED:** Events from one producer about one subject are delivered to each consumer in the order they were produced. No global ordering is required. **PROPOSED:** delivery is at-least-once, and consumers deduplicate by Event identity. Today's GENESIS intake already deduplicates by event id (P0). Whether a _durable_ log backs delivery is **OPEN** (O11). |
| Cognitive interpretation | **TARGET (TA §9.2):** never published as an Event; it is an Observation                                                                                                                                                                                                                                                                                                         |

### 2.4 Observation (K4)

> "Here is evidence or state that I observed."

| Aspect             | Contract                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producer           | **DECIDED (D7):** any capability or system. Typical producers: GENESIS (cognitive evidence and recommendations), HANDS (execution evidence), AKIRA OS (health, runtime, availability).                                                                                                                                                                        |
| Addressee          | **TARGET (TA §9.1):** the authority or owner that will decide what to do with it, normally VAJRA                                                                                                                                                                                                                                                              |
| Content (CONTRACT) | Observation identity; producer (source); subject (what was observed: an entity, an execution, a capability, the user); observation time; correlation and causation (§16); payload (evidence, state or result information); confidence and provenance (what the evidence was derived from), both carried by every Observation (TA §9.1) |
| Changes state?     | **TARGET:** no. Reporting changes nothing in the observed system.                                                                                                                                                                                                                                                                                             |
| Force              | **DECIDED (D7):** Observation ≠ verification. **CONTRACT:** an Observation never satisfies a completion criterion by itself; only VAJRA's verification does (K6).                                                                                                                                                                                             |
| Recommendations    | **CONTRACT:** a recommendation is an Observation whose payload proposes an option, with a rationale and confidence. It is never a Command, and the addressee may ignore it.                                                                                                                                                                                   |

### 2.5 Result: Execution Result (K5) and Mission Result (K6)

|                               | **Execution Result (K5)**                                                                                                                                                 | **Mission Result (K6)**                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meaning                       | **CONTRACT:** the outcome of one Command or Query, as reported by the owner that handled it. For a HANDS Command: the requested action ran (or did not) and how it ended. | **DECIDED (TA §5.5):** the outcome of a mission. A successful Mission Result means VAJRA verified that the mission's completion criteria were satisfied.                                               |
| Producer                      | The capability owner that handled the request (HANDS for execution)                                                                                                       | VAJRA only, and only after verification                                                                                                                                                                |
| Recipient                     | The requester only, correlated to its Command or Query (TA §9.1)                                                                                                          | The mission's requester, and VAJRA's mission state                                                                                                                                                     |
| Status (CONTRACT, conceptual) | Accepted; succeeded (TA §11 "completed"); failed; rejected; timed out; cancelled; partial (§9, §15). These are categories, not a fixed enum (exact HANDS API OPEN, TA §20.3).                  | Completion is verified. A mission that does not complete (for example, failure, TA §13.1) is recorded by VAJRA and is **not** a successful Mission Result. Termination semantics beyond the TA lifecycle concepts (for example, cancellation) are not decided (§22.3). |
| Relationship                  | **DECIDED:** execution ≠ completion (D7). A succeeded Execution Result is evidence for verification, never a Mission Result.                                              | Is based on the evidence (Execution Results and Observations) listed in its verification record (§16)                                                                                                  |

**TARGET (TA §9.2).** An Observation may carry result information as evidence. The Result remains the correlated response to the requester.

---

## 3. Capability Contract (K7)

**DECIDED (TA §7.1).** VAJRA reasons in capabilities and does not import implementations; there is a conceptual Capability Registry. **TARGET (TA §7.1).** A capability is the boundary through which a subsystem offers functionality: a named, owned Command or Query, one or the other, never both. Callers depend on the capability, never on its implementation (TA principle 6).

**CONTRACT. Minimum conceptual descriptor:**

| Field                     | Meaning                                                                                                                                          | Basis                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Name                      | Domain-oriented, stable identifier (for example `project.update`), never an implementation name                                                  | TA §7.1                         |
| Version                   | Version of the input/output contract. A breaking change creates a new version.                                                                   | CONTRACT                        |
| Owner                     | Exactly one owning subsystem: GENESIS, VAJRA, HANDS or AKIRA OS (a named area)                                                                   | TA §7.1                         |
| Kind                      | Command or Query                                                                                                                                 | TA §7.1                         |
| Input contract            | Schema of accepted input                                                                                                                         | TA §7.1                         |
| Output contract           | Schema of the Result payload. The output is always a Result envelope.                                                                            | TA §7.1                         |
| Permissions               | Which callers may invoke it (internal, VAJRA, external); whether invocation requires confirmation; whether it is externally readable through MCP | TA §7.1; D4                     |
| Activation                | Activation tier (0, 1 or 2) and any activation prerequisites                                                                                     | TA §8.1                         |
| Availability              | Current availability as reported through AKIRA OS (§5)                                                                                           | TA §7.1                         |
| Cost class                | Relative cost, for example local and cheap, model call, or external tool                                                                         | TA §7.1                         |
| Execution characteristics | Synchronous or long-running; idempotent or not; reversible or not; side-effect class; cancellable or not                                         | TA §7.1 (cancellable: CONTRACT) |
| Observability             | Which Observations it may emit, and which Events its owner emits on success                                                                      | CONTRACT                        |
| Failure semantics         | Which K18 failure categories it can return, and whether a timeout leaves the outcome indeterminate                                               | CONTRACT                        |

Exact field names, encodings and catalogue format are deferred to implementation and are deliberately not specified.

---

## 4. Capability Ownership (K8)

Each function belongs to exactly one party. Registration and activation (D2), and selection and routing (D6), are **DECIDED**. Capability ownership (TA §7.1) and execution by the owner (TA §5.3) are **TARGET**. None of these is affected by where the registry implementation physically lives.

| Function                                                | Owner                                                                                                                         | Basis        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Capability ownership** (semantics and implementation) | The owning subsystem named in the descriptor                                                                                  | TA §7.1      |
| **Capability registration**                             | AKIRA OS, on the owner's declaration                                                                                          | D2           |
| **Capability activation and deactivation**              | AKIRA OS                                                                                                                      | D2           |
| **Capability selection**                                | VAJRA                                                                                                                         | D6           |
| **Capability routing**                                  | VAJRA                                                                                                                         | D6           |
| **Capability execution**                                | The capability owner. External-world actions are HANDS-owned capabilities, which execute only on VAJRA's authorised Commands. | TA §5.3, §11 |

**CONTRACT. "Delegated execution" means VAJRA routes to a HANDS capability.** No non-VAJRA owner may hand work to HANDS. GENESIS and AKIRA OS never command HANDS.

**OPEN (O10).** Where the registry or catalogue _implementation_ physically lives. **DECIDED:** this question does not touch registration or activation authority (AKIRA OS) or selection and routing (VAJRA).

---

## 5. Capability Lifecycle (K9)

**CONTRACT.**

```
Defined ─► Registered ─► Available ─► Activated ─► Invoked ─► (Results / Observations) ─► Deactivated
                             ▲            │                                                  │
                             └────────────┴────────────── back to Available ◄────────────────┘
```

| Transition                       | Performed by                                  | Requested or triggered by                                                                                                                                          | Notes                                                                    |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| → **Defined**                    | Capability owner                              | —                                                                                                                                                                  | The owner specifies the descriptor (K7)                                  |
| Defined → **Registered**         | AKIRA OS                                      | The owner's declaration                                                                                                                                            | Registration makes the capability known. It does **not** start anything. |
| Registered → **Available**       | AKIRA OS                                      | The owner reports readiness; prerequisites are met                                                                                                                 | Available means invocable once activated. It does not mean running.      |
| Available → **Activated**        | AKIRA OS                                      | Tier 0/1: the AKIRA OS runtime lifecycle at boot (TA §8.1). Tier 2: VAJRA's capability requirement (D2), or a permitted non-VAJRA invocation (Rule N2; AKIRA OS may decline). | VAJRA never initialises internals (D2)                                   |
| Activated → **Invoked**          | The requester invokes; the owner executes     | VAJRA (selection and routing); or, on the read paths the TA establishes, the requester itself (MCP v0 reads, D5; GENESIS → conversation archive, TA §3.2). Other non-mission Queries: see K2 (§22.3).                                                                              | Each invocation is a Command or Query (K1/K2)                            |
| Invoked → Results / Observations | Capability owner (HANDS for external actions) | —                                                                                                                                                                  | "Observed" is an interaction outcome, not a capability state             |
| Activated → **Deactivated**      | AKIRA OS                                      | Resource management, shutdown, or the requirement ending                                                                                                           | Returns to Available                                                     |
| Any → unregistered               | AKIRA OS                                      | The owner withdraws the capability, or the version is retired                                                                                                      | —                                                                        |

**CONTRACT. Registered ≠ Available ≠ Activated ≠ Invoked ≠ running.** No state implies a later one.

---

## 6. VAJRA → Capability Flow (K10)

**DECIDED (TA §5.1, §5.3, §5.5).** The canonical path for a request that becomes a Mission. Each step is a distinct operation with a distinct owner.

| #   | Step                            | Owner                                         | Primitive / act                                               | Does **not** include                                |
| --- | ------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Request or trigger received     | VAJRA                                         | Input (user request, external trigger, Event, human decision) | Any execution                                       |
| 2   | **Understanding** (operational) | VAJRA, informed by GENESIS                    | Query to GENESIS → Result / Observations                      | VAJRA modelling the user itself (TA §21 X18)        |
| 3   | Goal / Mission determination    | VAJRA                                         | Create or attach a Goal (optional) and a Mission              | Any request that does not become a Mission (D5; O7) |
| 4   | **Planning**                    | VAJRA                                         | Steps, constraints, completion criteria                       | Capability execution                                |
| 5   | **Selection**                   | VAJRA                                         | Choose capabilities through the catalogue                     | Activation                                          |
| 6   | Capability requirement          | VAJRA → AKIRA OS                              | Requirement statement, only if the selected capability is not already activated                                         | Initialising internals (D2)                         |
| 7   | **Activation**                  | AKIRA OS                                      | Activation (K9)                                               | Invocation                                          |
| 8   | **Invocation**                  | VAJRA (routing)                               | Command or Query to the owner                                 | Execution                                           |
| 9   | **Execution**                   | Capability owner (HANDS for external actions) | Work                                                          | Verification                                        |
| 10  | **Observation / Result**        | Capability owner                              | Execution Result (K5), Observations (K4)                      | Proof of success                                    |
| 11  | **Verification**                | VAJRA                                         | Evidence judged against completion criteria                   | —                                                   |
| 12  | Mission state update            | VAJRA                                         | Next step, replan, escalate or fail (TA §13.1)                   | —                                                   |
| 13  | **Completion**                  | VAJRA                                         | Mission Result (K6)                                           | —                                                   |

**These do not collapse.** Execution ≠ Completion and Observation ≠ Verification are **DECIDED** (D7). The other four are **TARGET**, following from the D2/D6 ownership split:

- Understanding ≠ Selection.
- Selection ≠ Activation.
- Activation ≠ Invocation.
- Invocation ≠ Execution.
- Execution ≠ Completion.
- Observation ≠ Verification.

**CONTRACT. A request that does not become a Mission is not routed by this flow.** On a read path the TA establishes (D5; TA §3.2), the requester invokes the owning Query capability directly and receives its Result. VAJRA's steps (selection, routing, verification) do not apply. This does not decide whether any other request may bypass VAJRA: Commands follow Rule N1 (direct internal Commands within its conditions are not routed by this flow); conversational turns are O7; other internal non-mission Queries are §22.3. Activation, where needed, follows §5 and Rule N2.

---

## 7. GENESIS Contract (K11)

### 7.1 What may be asked of GENESIS

**CONTRACT.** All are Query capabilities.

| Request                    | Capability (illustrative name) | Returns                                                                                             | Basis               |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------- |
| Memory search              | `memory.search`                | Result: matching memories, with provenance                                                          | TA §7.2             |
| Memory recall for a focus  | `memory.recall`                | Result: ranked recall candidates                                                                    | TA §3.2             |
| Memory read                | `memory.read`                  | Result: a memory by stable identity. Requires stable ids (TA §18 note; see §16).                    | P0 §11.2 candidate; TA §18 `memoryService` note |
| Identity read              | `identity.read`                | Result: the identity read model (structure subject to O4)                                           | TA §3.2, O4         |
| Understanding              | `understanding.query`          | Result plus interpretation Observations, with confidence                                            | TA §3.2             |
| Historical recall          | `recall.search`                | Result: past-conversation evidence. GENESIS queries the AKIRA OS conversation archive to answer it. | TA §3.2             |
| Insights                   | `insight.read` (illustrative)  | Result plus insight Observations                                                                    | TA §3.2             |
| Cognitive context assembly | `cognitive-context.read`       | Result: a cognitive representation for a focus (conversation turn, mission or topic)                | TA §3.2             |
| Reflection                 | —                              | Later redesign; no contract now                                                                     | TA §3.2             |

### 7.2 Interaction

```
VAJRA (or authorised caller) ─Query─► GENESIS capability ─► Result + Observations (evidence, interpretation,
                                                                                    confidence, recommendation)
                                                                     ─► requester
```

**DECIDED (TA §5.4, §3.1).** GENESIS informs; VAJRA coordinates. GENESIS issues no Commands to other owners.

**CONTRACT.** GENESIS provides each of the following without commanding:

- **Evidence:** Observations with provenance;
- **Confidence:** carried by every Observation (TA §9.1);
- **Interpretation:** an Understanding Result or Observation;
- **Recommendation:** an Observation proposing an option (K4).

None of these obliges any action.

### 7.3 What GENESIS sends and receives

| Direction | Primitive                                                                                                                                                         | Contract                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| In        | Domain Events from AKIRA OS (workspace changes, conversation turns, a conversation-boundary Event, which GENESIS may receive, TA §13.1)                                                                 | TARGET (TA §3.1). GENESIS updates only its own cognitive state. |
| In        | Queries from VAJRA and authorised callers                                                                                                                         | TARGET                                                          |
| In        | Start/stop under its internal lifecycle contract, triggered by the AKIRA OS runtime lifecycle                                                                     | DECIDED (D2)                                                    |
| In | **Commands:** none (Rule N3). `memory.store` is GENESIS-internal, not invocable by other subsystems or callers (TA §7.2). | **DECIDED (Rule N3)** |
| Out       | Queries to other owners (for example to the AKIRA OS conversation archive for Historical Recall)                                                                  | TARGET (TA §3.2)                                                |
| Out       | Observations to VAJRA, for example a goal-declaration Observation to the Goal owner                                                                               | TARGET (TA §3.2)                                                |
| Out       | Writes of its own state to the storage provider                                                                                                                   | TARGET (TA §12)                                                 |
| Out       | Commands to other owners                                                                                                                                          | **Never** (DECIDED)                                             |

---

## 8. VAJRA Contract (K12)

**CONTRACT.** The operations below are VAJRA's. "Authoritative" means no other subsystem may perform the operation or override its outcome.

| Operation                                                              | Authoritative?                                             | Contract                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Receive user intent, external triggers, system Events, human decisions | —                                                          | Inputs to UNDERSTAND (D6)                                                                                                                   |
| Create / read / update Goals                                           | **Yes** (D1)                                               | Creation: **PROPOSED** (TA §6) only by an explicit user act or by VAJRA confirming a cognitive proposal. Schema and states **OPEN** (O3).   |
| Create / read / update Missions; transition mission lifecycle          | **Yes** (D1, D2)                                           | Lifecycle concepts: creation, planning, running, paused, resumed, verification, completion, failure, escalation (TA §13). Not a fixed enum. |
| Select capabilities                                                    | **Yes** (D6)                                               | Through the catalogue (K7)                                                                                                                  |
| Route invocations                                                      | **Yes** (D6)                                               | To exactly one owner per invocation                                                                                                         |
| State capability requirements                                          | Yes, as requester. AKIRA OS performs activation.           | D2                                                                                                                                          |
| Issue Commands | **Yes** for cross-system and external-originated work (D5) | K1. Internal callers may also issue Commands directly within Rule N1; VAJRA's authority remains cross-system, mission and external work. |
| Issue Queries                                                          | Not exclusive on the read paths the TA establishes (D5; TA §3.2). Scope of D6 over other non-mission internal Queries: not confirmed (§22.3).    | K2                                                                                                                                          |
| Receive Observations and Results                                       | —                                                          | K4, K5                                                                                                                                      |
| Verify completion                                                      | **Yes** (D7)                                               | Against completion criteria, using recorded evidence                                                                                        |
| Update mission state                                                   | **Yes**                                                    | After every Result or verification outcome                                                                                                  |
| Escalate                                                               | **Yes**                                                    | **CONTRACT:** an escalation is a request for a human decision. The decision comes back as an input to VAJRA.                                |
| Stop or cancel work | Not decided for missions | Mission cancellation is not among the TA mission lifecycle concepts (TA §13.1); its semantics are not decided (§22.3). A HANDS Command may end cancelled (TA §11); see K13. |
| Initiative (proactive action)                                          | **Yes** (TA §5.2, Phase 1)                                 | Redesigned under VAJRA. No contract beyond ownership now.                                                                                   |

---

## 9. HANDS Contract (K13)

**DECIDED (TA §5.4, §11).**

```
VAJRA ─authorised Command─► HANDS ─► executor / tool ─► HANDS ─► Observations + Execution Result ─► VAJRA
```

**CONTRACT. HANDS behaviour:**

| Aspect             | Contract                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command acceptance | HANDS acts only on authorised Commands: issuer VAJRA (TA §11), with the capability's permissions and confirmation requirements (K7) satisfied. Where the authorisation check is enforced is not decided (K1, §22.3). HANDS answers with **accepted** or **rejected** (K18), rejecting inadmissible Commands (invalid input, executor unavailable). |
| Execution state    | Accepted → running → one terminal outcome: **succeeded** (TA §11 "completed"), **failed**, **timed out**, **cancelled** or **partial**. These are categories; the exact HANDS API is **OPEN** (TA §20.3).                      |
| Success            | The action ran and ended normally. An Execution Result with Observations of what it produced. **Not** mission completion.                                                                                 |
| Failure            | The action ran, or could not run, and did not end normally. A failure Result with diagnostic Observations.                                                                                                |
| Timeout            | The deadline in the Command's constraints passed. A timed-out Result, stating whether the external effect is **indeterminate** (it may or may not have happened).                                         |
| Cancellation       | A HANDS Command may end **cancelled** (TA §11). Only VAJRA can request cancellation, because only VAJRA issues Commands to HANDS (TA §11). HANDS stops where possible and reports a cancelled Result, stating any indeterminate effect.                                           |
| Partial completion | Part of the action took effect. A partial Result, with Observations identifying what did and did not happen.                                                                                              |
| Observation        | HANDS may emit Observations during and after execution (output, state of the external environment). They are evidence only.                                                                               |
| Correlation        | Every acceptance, Observation and terminal Result references the Command, and through it the mission and step (§16)                                                                                       |
| Never              | Choose objectives, create Missions, select capabilities, verify mission completion, accept Commands from anyone but VAJRA (DECIDED)                                                                       |

Concrete terminal, browser, Claude and Antigravity integrations are later HANDS work and are not specified here.

---

## 10. AKIRA OS Contract (K14)

**CONTRACT. What VAJRA may request from AKIRA OS:**

| Request                                                                                | Primitive                                            | Contract                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Capability activation | VAJRA states (or ends) a capability requirement → Result | VAJRA states _which capability it requires_. AKIRA OS performs activation, decides deactivation and owns how both happen (D2; TA §13.1). |
| Capability availability / catalogue inspection                                         | Query → Result                                       | Read-only view of registration and availability (K9)                                                    |
| Persistence of VAJRA-owned data (Goals, Missions, mission state) | Storage-provider contract                            | AKIRA OS stores; VAJRA remains the semantic owner and writer (TA §12)                                   |
| Workspace and conversation domain operations                                           | Commands / Queries to domain-plane capabilities      | Like any other owner's capabilities                                                                     |
| Runtime health                                                                         | Query → Result; health Observations                  | Read-only                                                                                               |
| Configuration                                                                          | Query → Result for non-secret configuration          | **TARGET:** secrets are never exposed through generic access (TA §12.2)                                 |
| Model transport                                                                        | —                                                    | Placement **OPEN** (O9). The TA *proposes* invocation through a Command capability (TA §10.3, PROPOSED); this is not decided here.                        |

**DECIDED (D2).** "VAJRA requests capability activation" is permitted. "VAJRA initialises capability internals" is not: initialisation belongs to the AKIRA OS runtime lifecycle and the subsystem's internal lifecycle.

**CONTRACT.** AKIRA OS never sets mission state, selects capabilities for a mission, or interprets cognitive data. Its activation decisions are resource and lifecycle decisions, not mission decisions.

---

## 11. Ownership Matrix

Rows and columns marked **OPEN** are not decided. The columns mean:

- **Can Create / Modify:** has the authority to create or change the thing (the act may be requested by others through capabilities).
- **Can Execute:** performs the work.
- **Can Verify:** judges success against criteria.

| Concept                     | Owner                                                   | Can Create                                                                                   | Can Modify                         | Can Read                                                      | Can Execute                                                 | Can Verify                                           |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Goal                        | VAJRA (D1)                                              | VAJRA. PROPOSED trigger: explicit user act, or VAJRA confirming a GENESIS proposal.          | VAJRA                              | VAJRA; GENESIS and authorised callers via Query (`goal.read`) | — | Not specified (the TA defines verification for Missions only) |
| Mission                     | VAJRA (D1)                                              | VAJRA                                                                                        | VAJRA                              | VAJRA; authorised callers via Query (`mission.read`)          | Its steps by capability owners (HANDS for external actions) | VAJRA                                                |
| Capability (semantics)      | Owning subsystem                                        | Owner (defines)                                                                              | Owner (new version)                | Any authorised caller (catalogue)                             | Owner                                                       | —                                                    |
| Capability registration     | AKIRA OS (D2)                                           | AKIRA OS, on the owner's declaration                                                         | AKIRA OS                           | VAJRA, authorised callers                                     | AKIRA OS                                                    | —                                                    |
| Capability activation       | AKIRA OS (D2)                                           | AKIRA OS. Requested by VAJRA (Tier 2) or the lifecycle (Tier 0/1); for a registered, available, inactive Tier 2 capability, also a non-VAJRA invocation that its `permissions` admit (Rule N2). | AKIRA OS                           | VAJRA (availability)                                          | AKIRA OS                                                    | —                                                    |
| Command                     | Issuer for the instance; addressed owner for the effect | VAJRA; internal callers within Rule N1; never GENESIS→others; never external in v0  | Immutable                          | Issuer, addressee                                             | Addressed owner                                             | Mission-level: VAJRA                                 |
| Query                       | Requester for the instance                              | VAJRA, GENESIS, AKIRA OS, authorised callers (incl. MCP v0)                                  | Immutable                          | Requester, addressee                                          | Addressed owner (answers)                                   | —                                                    |
| Event                       | Owner of the changed state                              | Only that owner                                                                              | Immutable                          | Permitted subscribers                                         | — (requests nothing)                                        | —                                                    |
| Observation                 | Producer                                                | Any capability or system (D7)                                                                | Immutable                          | Addressee (normally VAJRA)                                    | —                                                           | Used by VAJRA as evidence; never itself verification |
| Execution Result            | Handling owner                                          | Handling owner                                                                               | Immutable                          | Requester                                                     | —                                                           | Mission-level: VAJRA                                 |
| Mission Result              | VAJRA                                                   | VAJRA, after verification only                                                               | Immutable                          | Mission requester, authorised callers                         | —                                                           | VAJRA (it _is_ the verified outcome)                 |
| Verification                | VAJRA (D7)                                              | VAJRA                                                                                        | VAJRA                              | VAJRA; mission readers                                        | VAJRA                                                       | —                                                    |
| Memory                      | GENESIS · Memory                                        | Only GENESIS, from its inputs such as Events (Rule N3)                                                                        | GENESIS                            | Via GENESIS Queries                                           | —                                                           | —                                                    |
| Identity                    | GENESIS · Identity                                      | GENESIS (from evidence)                                                                      | GENESIS                            | Via `identity.read`                                           | —                                                           | — (durable vs derived: OPEN, O4)                     |
| Workspace                   | AKIRA OS · workspace                                    | Via AKIRA OS Command capabilities (invoked by VAJRA, or by internal callers within Rule N1)                    | Same; authority location OPEN (O2) | Authorised callers; GENESIS via Events and Queries            | AKIRA OS                                                    | —                                                    |
| Conversation                | AKIRA OS · conversations                                | AKIRA OS (including New Chat, D3)                                                            | AKIRA OS appends turns (TA §10.2); what triggers an append within a turn: OPEN (O7)         | GENESIS (Historical Recall), VAJRA, authorised callers        | AKIRA OS                                                    | —                                                    |
| Runtime lifecycle           | AKIRA OS (D2)                                           | AKIRA OS                                                                                     | AKIRA OS                           | VAJRA (health, availability)                                  | AKIRA OS                                                    | —                                                    |
| Mission lifecycle           | VAJRA (D2)                                              | VAJRA                                                                                        | VAJRA                              | Mission readers                                               | VAJRA                                                       | VAJRA                                                |
| Conversation-turn lifecycle | **OPEN (O7)**                                           | OPEN                                                                                         | OPEN                               | OPEN                                                          | OPEN                                                        | OPEN                                                 |
| Reset                       | **OPEN (O6)**                                           | OPEN                                                                                         | OPEN                               | OPEN                                                          | OPEN                                                        | OPEN                                                 |

---

## 12. Persistence Contract (K15)

**DECIDED (TA §12.1).** Persistence ≠ ownership. **TARGET (TA §12.1).** Every dataset has three roles:

| Role                 | Contract                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Semantic owner**   | Decides meaning, validity, lifecycle and retention. Exactly one per dataset.                                                                                                     |
| **Writer**           | The only path that mutates the dataset. It belongs to the semantic owner. Others change the data only through the owner's Command capabilities.                                  |
| **Storage provider** | AKIRA OS platform plane. It provides durability, transactions, and schema and migration mechanics. It never interprets, filters, retains or rewrites data on its own initiative. |

| Durable concept                                                 | Semantic owner                                                                     | Authority to mutate            | Storage               | Durable / derived                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ | --------------------- | ---------------------------------------------- |
| Memory stream                                                   | GENESIS · Memory                                                                   | GENESIS only                   | AKIRA OS              | Durable (TARGET)                               |
| Derived cognition (stories, importance, recall, understandings) | GENESIS                                                                            | GENESIS only                   | AKIRA OS if persisted | **OPEN** (O8a)                                 |
| Identity                                                        | GENESIS · Identity                                                                 | GENESIS only                   | AKIRA OS if durable   | **OPEN** (O4)                                  |
| Workspace entities                                              | AKIRA OS · workspace                                                               | AKIRA OS, through its Commands | AKIRA OS              | Durable. Authority location **OPEN** (O2).     |
| Conversation archive                                            | AKIRA OS · conversations                                                           | AKIRA OS                       | AKIRA OS              | Durable. Reset scope **OPEN** (O6).            |
| Goals                                                           | VAJRA · goals                                                                      | VAJRA only                     | AKIRA OS              | Durable. Schema **OPEN** (O3).                 |
| Missions and mission state | VAJRA · mission | VAJRA only | AKIRA OS | TARGET (TA §12.2); schema OPEN (TA §20.3) |
| Verification records | VAJRA (verification is VAJRA's, D7) | VAJRA | — | Whether and how verification records are persisted is not decided; they are not in TA §12.2 (§22.3) |
| Execution records                                               | VAJRA records them into mission state; HANDS produces the Results and Observations | VAJRA                          | AKIRA OS              | TARGET (TA §12.2)                              |
| Configuration and secrets                                       | AKIRA OS · configuration                                                           | AKIRA OS                       | AKIRA OS              | Durable                                        |
| Capability registrations                                        | AKIRA OS                                                                           | AKIRA OS                       | AKIRA OS              | Not specified by the TA; implementation detail |
| Domain event log                                                | AKIRA OS · transport                                                               | —                              | AKIRA OS              | Whether it exists is **OPEN** (O11)            |
| Timeline read model                                             | AKIRA OS · timeline                                                                | AKIRA OS                       | AKIRA OS              | Durable (TARGET)                               |

**OPEN (O8).** Isolation mechanism and database layout. No table or schema is designed here.

---

## 13. Lifecycle Contract (K16)

| Lifecycle                 | Owner                         | Boundary rule (CONTRACT unless marked)                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System / runtime**      | AKIRA OS (D2)                 | Boot, shutdown, runtime lifecycle, registration, activation and deactivation, resources, health. **DECIDED:** VAJRA never initialises internals. AKIRA OS never sets mission state.                                                                                                                |
| **Mission**               | VAJRA (D2)                    | Creation through completion, failure or escalation. AKIRA OS and capability owners never change mission state; they report Results and Observations.                                                                                                                                               |
| **Internal subsystem**    | Each subsystem (D2)           | Each subsystem exposes a start/stop contract. AKIRA OS decides _when_; the subsystem decides _how_ (TA §13.1). Example: GENESIS memory reconstruction runs once per process start (TARGET).                                                                                                        |
| **Conversation**          | AKIRA OS · conversations (D3) | New Chat opens a new conversation with new conversation context and state (D3). **TARGET (TA §13.1):** GENESIS may receive a conversation-boundary Event. How subsystems are informed is not fixed here. **DECIDED:** no replay, no identity rebuild, no reset of durable knowledge, Goals or Missions, no reboot. GENESIS may reset only conversation-scoped cognitive state (TARGET). |
| **Conversation turn**     | **OPEN (O7)**                 | No contract is defined here. Whatever O7 decides, capability selection within a turn stays under VAJRA's authority (D6; TA §4.2).                                                                                                                                                                  |
| **Capability activation** | AKIRA OS (D2)                 | K9                                                                                                                                                                                                                                                                                                 |
| **Reset**                 | **OPEN (O6)**                 | **DECIDED:** New Chat ≠ Reset. No Reset contract is defined.                                                                                                                                                                                                                                       |

**CONTRACT. Overlap prevention:**

1. A mission state change never starts or stops a subsystem directly. It may only produce a capability requirement.
2. A runtime lifecycle act never changes a mission. If a capability deactivation affects a mission, AKIRA OS reports it as an Observation, and VAJRA decides.
3. Conversation lifecycle acts never reach the system/runtime or mission lifecycles.

---

## 14. Authority Contract (K17)

**CONTRACT.** This section covers architectural authority, not authentication. The external authentication mechanism and its timing are **OPEN** (O12).

| Authority                     | Who                                                                                                                                                                   | Basis               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Issue Commands | VAJRA for cross-system and external-originated work. Internal callers: directly, within Rule N1. Never GENESIS to other owners; never to GENESIS (Rule N3); never external in MCP v0. | D4, D5, D6, TA §3.1; Rules N1, N3 |
| Issue Queries                 | VAJRA, GENESIS, AKIRA OS, authorised callers (including MCP v0 for externally readable capabilities)                                                                  | TA §9.1, D4         |
| Register capabilities         | AKIRA OS, on the owner's declaration                                                                                                                                  | D2                  |
| Activate capabilities         | AKIRA OS                                                                                                                                                              | D2                  |
| Request activation | VAJRA (Tier 2); the AKIRA OS lifecycle (Tier 0/1); a non-VAJRA invocation that the capability's `permissions` admit, of a registered, available, inactive Tier 2 capability is itself a requirement, which AKIRA OS may decline (Rule N2) | D2, TA §8.1; Rule N2 |
| Select and route capabilities | VAJRA                                                                                                                                                                 | D6                  |
| Verify mission completion     | VAJRA                                                                                                                                                                 | D7                  |
| Modify Goals                  | VAJRA                                                                                                                                                                 | D1                  |
| Modify Missions               | VAJRA                                                                                                                                                                 | D1                  |
| Execute external actions      | HANDS, only on VAJRA's authorised Commands                                                                                                                            | TA §11              |
| Confirm high-impact actions   | **PROPOSED (TA §11):** confirmation policy is VAJRA's, and capabilities declare their confirmation requirement in `permissions`                                       | TA §11 PROPOSED     |
| Mutate any dataset            | Its semantic owner only                                                                                                                                               | TA §12.1            |

---

## 15. Failure Contract (K18)

**CONTRACT.** Each failure has a detector (who notices it), a reporter (who emits the Result or Observation), and a response owner (who decides what happens next).

| Failure                | Detector / reporter                                          | Response owner                                                           | Contract                                                                                                          |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Invalid request        | Receiving capability owner                                   | Requester                                                                | Failure Result: input does not match the contract, or the request is malformed. No side effect.                   |
| Capability unavailable | AKIRA OS (registration and availability) or the routing step | VAJRA (re-select, wait, escalate); other requesters handle it themselves | Failure Result. No side effect.                                                                                   |
| Activation failure     | AKIRA OS                                                     | VAJRA (for its requirements)                                             | Failure Result to the requester, plus a health Observation                                                        |
| Command rejection      | The authorisation point (location not decided, K1), or the receiving owner or HANDS for preconditions                                     | VAJRA                                                                    | Failure Result stating the reason (authority, permission, precondition, confirmation missing). No side effect.    |
| Execution failure      | Capability owner or HANDS                                    | VAJRA                                                                    | Failure Result with diagnostic Observations. The side-effect state must be stated.                                |
| Timeout                | Owner or HANDS (deadline from the Command's constraints)     | VAJRA                                                                    | Timed-out Result. **The outcome may be indeterminate.** VAJRA must not treat a timeout as "did not happen".       |
| Partial result         | Capability owner or HANDS                                    | VAJRA (verification)                                                     | Partial Result, with Observations of what took effect                                                             |
| Observation failure    | Producer                                                     | VAJRA                                                                    | The Result states that evidence is missing. Verification over missing evidence is **inconclusive**, not success.  |
| Verification failure   | VAJRA                                                        | VAJRA                                                                    | Completion criteria are not satisfied. A mission-state update follows: replan, retry the step, escalate, or fail. |
| Mission failure        | VAJRA                                                        | VAJRA                                                                    | VAJRA records the failure and produces the final outcome (TA §5.2 "final outcomes"). It is not a successful Mission Result (K6).                                                                   |
| Escalation             | VAJRA                                                        | Human decision, returned to VAJRA                                        | A request for a human decision, recorded on the mission                                                           |

**CONTRACT.**

- A failure never moves authority. For example, a HANDS failure does not let HANDS choose an alternative objective.
- Re-issuing a Command after a failure is a VAJRA decision.
- No retry policy is specified, because the Target Architecture specifies none.

---

## 16. Correlation and Traceability (K19)

**CONTRACT. Minimum conceptual identifiers:**

| Identifier                          | Identifies                                                         | Carried by                                                                      |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Request id**                      | The originating request or trigger                                 | Everything that follows from it                                                 |
| **Correlation id**                  | One end-to-end trace (it may equal the request id)                 | Every primitive in the trace                                                    |
| **Goal id**                         | A canonical Goal (optional)                                        | Missions pursuing it                                                            |
| **Mission id**                      | A Mission (optional; absent for non-mission Queries)               | Commands, Queries, Results, Observations and verification records that serve it |
| **Step id**                         | A step within a mission's plan                                     | Invocations for that step                                                       |
| **Invocation id**                   | One Command or Query                                               | Its Results, Observations and the Events it causes                              |
| **Causation id**                    | The immediate cause (the invocation or Event that led to this one) | Every primitive except the originating request                                  |
| **Execution id**                    | One execution attempt or session in HANDS or another owner         | Execution Observations and Results                                              |
| **Event / Observation / Result id** | The instance itself, for deduplication and reference               | The instance                                                                    |
| **Verification record id**          | One verification judgement, listing the evidence ids it relied on (conceptual; whether it is persisted is not decided, K15)  | Mission Result                                                                  |

```
Request ─► (Goal) ─► Mission ─► Step ─► Command/Query ─► Execution ─► Observation / Result ─► Verification ─► Mission Result
 request   goal id   mission id  step id  invocation id   execution id  causation = invocation   evidence ids   mission id +
   id                                                                                                          verification id
```

**CONTRACT. Traceability across time.** Identifiers that are referenced across time must remain resolvable for correlation and traceability.

- Goal and Mission identifiers are stable for the life of the Goal or Mission.
- For memory, the TA treats stable ids as a precondition for `memory.read` (TA §18).
- For identity evidence, the id model is **OPEN** (O4) and is not fixed by this contract.

**CURRENT (recorded in TA §18).** Memory ids regenerate on replay today. This is a precondition for `memory.read` and evidence links, not an open architectural question. Identity evidence identity depends on O4.

No identifier format, generator or storage is chosen.

---

## 17. Interaction Semantics (K20)

**CONTRACT.** These are semantic expectations only. They hold whether the transport is a function call, message passing, RPC, IPC, MCP or something else.

| Interaction                                              | Semantic shape                                                                                    | Cancellable                          | Notes                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Query                                                    | Request / response                                                                                | Yes, if long-running                 | One Result                                                      |
| Command to a domain owner (for example `project.update`) | Request / response                                                                                | Per the capability's characteristics | One Result; typically an Event on state change (TA §9.2)                            |
| Command to HANDS                                         | Long-running: acknowledge (accepted or rejected), then a terminal Result                          | Yes (cancellation Command)           | Observations may arrive in between                              |
| Event                                                    | Fire-and-forget publish                                                                           | —                                    | No response; ordering per producer and subject (PROPOSED, §2.3) |
| Observation                                              | Fire-and-observe                                                                                  | —                                    | No response required                                            |
| Capability activation                                    | Request / response; may be long-running                                                           | —                                    | Result: activated, or activation failure                        |
| Mission | Long-running; pausable; resumable (TA §13.1) | Not decided (mission cancellation is not in the TA; §22.3) | Ends in a verified Mission Result, or does not complete (for example, failure) |
| Escalation | Long-running wait for a human decision | Not specified | Escalation is a TA lifecycle concept (TA §13.1); how it ends is not specified |
| Model-transport invocation | Not fixed: depends on O9 and on the TA-PROPOSED Command-capability form (TA §10.3). **PROPOSED:** incremental output may be delivered before the terminal Result. | Not fixed | Owner OPEN (O9) |

---

## 18. MCP Boundary (K21)

| Aspect                                                   | Status           | Contract                                                                                                                      |
| -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Nature                                                   | DECIDED (D4)     | An external capability gateway, not an authority                                                                              |
| v0 scope                                                 | DECIDED (D4)     | Read-only. MCP is an authorised caller of Query capabilities whose `permissions` mark them externally readable.               |
| Commands                                                 | DECIDED (D4, D5) | None in v0. Future mutating or action requests are submitted to VAJRA as requests; MCP never addresses a Command to an owner. |
| Orchestration                                            | DECIDED (D5)     | MCP is never a second orchestration authority                                                                                 |
| Internals                                                | DECIDED (D4)     | Never direct SQLite, internal files, arbitrary services, GENESIS internals, akira-store internals or private APIs             |
| Missions                                                 | DECIDED (D5)     | MCP reads do not create Missions                                                                                              |
| Events and Observations                                  | PROPOSED         | Not exposed directly in v0. Anything external reads arrives as a Query Result.                                                |
| Registry placement, MCP server implementation, MCP stage | OPEN (O10)       | —                                                                                                                             |
| Authentication and authorization | DECIDED (D4) | Must eventually protect the external boundary |
| Authentication mechanism and timing | OPEN (O12) | — |
| Reachability of cognitive reads                          | OPEN (O1)        | `memory.search` and `identity.read` depend on where the authoritative runtime lives (TA §15.3)                                |

---

## 19. Selective Activation (K22)

**DECIDED (TA §8, D2).** A capability executes only when the current mission, request or lifecycle requires it.

| State      | Means                                              | Does not mean                     |
| ---------- | -------------------------------------------------- | --------------------------------- |
| Registered | Known to AKIRA OS                                  | Ready, or running                 |
| Available  | Prerequisites met; invocable once activated        | Running                           |
| Activated  | Resources allocated and the capability can respond | Doing work                        |
| Invoked    | Handling a specific Command or Query               | Continuing after the request ends |

**CONTRACT.**

1. Tier 0 is activated for the process lifetime and Tier 1 is warm, both by the AKIRA OS runtime lifecycle (TA §8.1). Tier 2 is activated only on requirement and may be deactivated afterwards.
2. Registration, import or module load never activates a capability.
3. An invocation of a capability that is not activated returns _capability unavailable_ (K18), except that for a non-VAJRA invocation that the capability's `permissions` admit, of a registered, available, inactive Tier 2 capability, AKIRA OS may activate it on demand or decline (Rule N2).
4. Activation does not presuppose a separate process or service (TA principle 11). Whether a given capability involves an external process is an implementation and placement matter (O1).

---

## 20. Contract Invariants

Each invariant is supported by the cited Target Architecture statement.

| #   | Invariant                                                                                                        | Basis              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------ |
| I1  | GENESIS never issues Commands to other owners, and so cannot command cross-system work.                          | TA §3.1, §5.4      |
| I2  | VAJRA is the only cross-system orchestration authority.                                                          | D6; TA principle 1 |
| I3  | HANDS never decides objectives, selects capabilities or verifies completion.                                     | TA §11             |
| I4  | HANDS accepts Commands only from VAJRA.                                                                          | TA §11, §5.4       |
| I5  | AKIRA OS owns system/runtime lifecycle; VAJRA owns mission lifecycle; neither changes the other's.               | D2                 |
| I6  | AKIRA OS owns capability registration and activation; VAJRA states requirements and never initialises internals. | D2                 |
| I7  | VAJRA owns capability selection and routing.                                                                     | D6                 |
| I8  | An Observation is never verification.                                                                            | D7                 |
| I9  | Execution is never mission completion; only VAJRA issues a Mission Result, and only after verification.          | D7; TA §5.5        |
| I10 | Persistence never implies semantic ownership; storage never interprets or rewrites data.                         | TA §12.1           |
| I11 | A Goal is not a Mission; a Mission may exist without a Goal.                                                     | D1                 |
| I12 | New Chat is not Reset; New Chat never resets or rebuilds durable state.                                          | D3                 |
| I13 | MCP is never an orchestration authority; MCP v0 issues no Commands.                                              | D4, D5             |
| I14 | A Query never creates a Mission and never changes the owner's domain state.                                      | D5; TA §9.1        |
| I15 | Only the owner of changed state emits an Event, and an Event never requests action.                              | TA §9.1            |
| I16 | Every Command and Query is addressed to exactly one capability owner.                                            | TA §9.1            |
| I17 | Implementation location never changes ownership.                                                                 | TA §7.3, O10       |
| I18 | Open decisions stay open; no contract here resolves one.                                                         | TA §20             |
| I19 | No subsystem accretes unrelated authority.                                                                       | TA principle 14    |

---

## 21. Contract Examples

### Example A: Cognitive Query

```
VAJRA ─Query: memory.search (mission id, step id, invocation id)─► GENESIS
GENESIS ─Result: memories + provenance─► VAJRA
GENESIS ─Observation: interpretation (confidence 0.7)─► VAJRA      (evidence only; obliges nothing)
```

### Example B: External execution and verification

```
VAJRA ─Command: hands.execute (mission, step, deadline, confirmation satisfied)─► HANDS
HANDS ─Result: accepted─► VAJRA
HANDS ─► executor ─► HANDS ─Observation: output captured─► VAJRA
HANDS ─Result: succeeded (execution id)─► VAJRA                    (execution ≠ completion)
VAJRA ─verification record (evidence: result id, observation ids)─► criteria satisfied
VAJRA ─Mission Result─► requester
```

### Example C: Capability activation

```
VAJRA ─capability requirement: recall.search (Tier 2)─► AKIRA OS
AKIRA OS ─activates (owns how)─► Result: activated
VAJRA ─Query: recall.search─► GENESIS ─► GENESIS ─Query─► AKIRA OS · conversations ─► Result ─► GENESIS ─Result─► VAJRA
```

### Example D: MCP v0 read

```
External MCP client ─► MCP ─Query: project.read (authorised read)─► AKIRA OS · workspace ─Result─► MCP ─► client
                                                                   (no Mission, no VAJRA, no Command)
```

### Example E: A goal declaration becomes evidence, not a Goal

```
AKIRA OS ─Event: conversation turn─► GENESIS
GENESIS ─Observation: goal declaration (confidence, provenance)─► VAJRA
VAJRA decides (PROPOSED rule: explicit user act or VAJRA confirmation) ─► Goal created or not
```

### Example F: New Chat

```
AKIRA OS · conversations: New Chat ─► new conversation + new conversation context / state
(TARGET: GENESIS may receive a conversation-boundary Event; the mechanism is not fixed)
GENESIS resets only conversation-scoped state.    Memory, Identity, Goals and Missions are unchanged.
```

---

## 22. Open Questions

### 22.1 Preserved from the Target Architecture (not resolved here)

| ID       | Question                                                                  | Where it touches these contracts                                     |
| -------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| O1       | Placement of the one authoritative live runtime                           | Reachability of cognitive reads (K21); where every contract executes |
| O2       | Server or backend authority for workspace writes                          | Workspace row of §11; Command issuers (N1)                           |
| O3       | Goal schema, states, Project/Task ↔ Goal/Mission relationship             | K12 Goal operations; §11 Goal row                                    |
| O4       | Identity durable vs derived; store consolidation                          | `identity.read` Result shape; identity evidence ids (K19)            |
| O6       | Reset semantics                                                           | §11 Reset row; K16                                                   |
| O7       | Conversation-turn lifecycle; whether a turn is a Mission                  | K2, K16, §11 Conversation row                                        |
| O7r      | What survives of the legacy runtime stack                                 | None of these contracts depend on it                                 |
| O8 / O8a | Persistence boundary mechanics; whether derived cognition is persisted    | K15                                                                  |
| O9       | Model-transport placement                                                 | K10 model row; K20 model row                                         |
| O10      | Registry/catalogue implementation location; MCP implementation; MCP stage | K8, K21                                                              |
| O11      | Durable domain event log                                                  | K3 ordering and delivery                                             |
| O12      | External auth mechanism and timing                                        | K1 authorization; K17; K21                                           |

Deferred design details (TA §20.3: schemas, VAJRA interfaces, HANDS API, folder structure) remain deferred.

### 22.2 Questions raised by contract design (all resolved)

All three are resolved by accepted decision records. The rows are kept for traceability.

| ID | Resolution |
| --- | --- |
| N1 | **Resolved: Rule N1** ([AKIRA-N1-DECISION.md](AKIRA-N1-DECISION.md)). Bounded direct internal Commands. |
| N2 | **Resolved: Rule N2** ([AKIRA-N2-DECISION.md](AKIRA-N2-DECISION.md)). A non-VAJRA invocation that the capability's `permissions` admit, of a registered, available, inactive Tier 2 capability counts as a requirement; AKIRA OS may activate it or decline. |
| N3 | **Resolved: Rule N3** ([AKIRA-N3-DECISION.md](AKIRA-N3-DECISION.md)). GENESIS accepts no Commands. |

Original questions, as raised:

| ID     | Question                                                                                                                                                                                                                | Why it blocks                                                                                                                                                                                                                          | Constraint already fixed                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **N1** | May an internal, non-VAJRA caller (notably the UI, on a direct user edit) issue a **single-owner Command** (for example `task.update`) without VAJRA mediation?                                                         | TA §9.1 allows "an authorised caller" to issue Commands without defining one. Every UI write path depends on the answer.                                                                                                               | Cross-system and external-originated mutations must go through VAJRA (D5; principle 1). External Commands are excluded in v0 (D4). |
| **N2** | When an authorised caller other than VAJRA (an MCP v0 read, or a GENESIS Query) invokes a Tier 2 capability that is not active, does AKIRA OS activate it on demand, or does the call fail as _capability unavailable_? | TA §8.1 names only VAJRA's requirement as the Tier 2 trigger, but D5 lets reads bypass VAJRA.                                                                                                                                          | Activation authority is AKIRA OS's in either case (D2). VAJRA is not required for reads (D5).                                      |
| **N3** | Does GENESIS accept any **Commands** (for example `memory.store`, an explicit "forget" or correction, or reset handling), and from whom?                                                                                | TA §3.1 lists only Events, Queries and activation as GENESIS inputs, while TA §7.2 lists `memory.store` as a GENESIS Command capability (PROPOSED never externally callable). Explicit user corrections and Reset (O6) need an answer. | GENESIS issues no Commands to other owners (DECIDED, TA §3.1); only GENESIS mutates its state (TA §12).                                                           |

### 22.3 Held open by the Phase 2.1B correction pass

These were contract-level commitments that the Target Architecture does not make. They are now explicitly not decided. None is resolved here, and none is a new decision.

| Item | Where | Status |
| --- | --- | --- |
| Where authorization is enforced (receiver, capability boundary, gateway, or a combination) | K1, K13, K18 | Not decided by the TA; external mechanism OPEN (O12) |
| Whether D6's selection and routing extends to non-mission Queries by internal callers beyond the read paths the TA establishes (D5; TA §3.2) | K2, K9, K10, K12 | Not confirmed by the TA |
| Mission cancellation and termination semantics beyond the TA lifecycle concepts | K6, K12, K20 | Not decided; HANDS Command cancellation is TA-supported (TA §11) |
| Model-transport invocation form | K14, K20 | TA PROPOSED (Command capability, TA §10.3); placement OPEN (O9) |
| Persistence of verification records | K15, K19 | Not decided (not in TA §12.2) |
| How subsystems are informed of a New Chat, beyond "GENESIS may receive a conversation-boundary Event" (TA §13.1) | K16, Example F | Not fixed; D3 unchanged |

---

## 23. Contract Completeness Check

| Question                                                                               | Answer                             | Missing contract                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| **GENESIS:** can another subsystem tell exactly what it may ask GENESIS?               | **Yes** for Queries (§7.1)         | — (N3 resolved: no Commands to GENESIS, Rule N3)                    |
| **VAJRA:** is it clear what VAJRA owns and controls?                                   | **Yes** (§1.2, §8)                 | Goal schema and creation rule (O3; PROPOSED); mission cancellation semantics (§22.3)             |
| **HANDS:** does an executor know what HANDS receives and returns?                      | **Yes** at the contract level (§9) | Exact HANDS API (deferred, TA §20.3), not a contract gap |
| **AKIRA OS:** is its infrastructure authority clear?                                   | **Yes** (§1.4, §10)                | Model-transport placement (O9)                           |
| **Capability:** who owns, registers, activates, selects, invokes and executes it?      | **Yes** (§4, §5)                   | — (N2 resolved: Rule N2)             |
| **Mission:** can it be traced from creation to verification without missing authority? | **Yes** (§6, §16)                  | —                                                        |
| **Communication:** are the five primitives distinct without overlap?                   | **Yes** (§2)                       | D6 scope over non-mission internal Queries (§22.3)                            |
| **Persistence:** is semantic ownership separate from storage?                          | **Yes** (§12)                      | Mechanics (O8); identity durability (O4)                 |

No contract gap exists beyond the preserved open questions and the items held open in §22.3. N1–N3 are resolved (§22.2).
