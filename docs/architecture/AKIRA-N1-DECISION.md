# AKIRA N1 Decision: Internal Command Authority

**Phase 2.1C.** This document resolves one question: N1. It does not resolve N2, N3 or any O-question. It does not change the Target Architecture or the Foundation Contracts. It defines no authentication or transport mechanism and implements nothing.

|             |                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority   | [AKIRA-TARGET-ARCHITECTURE.md](AKIRA-TARGET-ARCHITECTURE.md), cited **TA §n**, decisions **Dn**, principles **TA Pn** (numbered as in TA §23) |
| Subordinate | [AKIRA-FOUNDATION-CONTRACTS.md](AKIRA-FOUNDATION-CONTRACTS.md), cited **FC Kn**                                                               |
| Reference   | [AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT.md](AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT.md)                                            |
| Date        | 2026-10-02                                                                                                                                    |

### Notes on the brief

- **Duplicate source.** The brief lists the Foundation Contracts consistency audit twice (sources 3 and 4). Only one such document exists, and it was used.
- **Principle numbering.** The brief's principle numbers differ from TA §23. Each criterion is evaluated by _subject_, citing the TA's actual number:

  | Brief's label | Subject                                                            | TA §23 number       |
  | ------------- | ------------------------------------------------------------------ | ------------------- |
  | P1            | One orchestration authority                                        | P1                  |
  | P2            | Cognition ≠ orchestration                                          | P2                  |
  | "P5"          | Capabilities as the interface between authority and implementation | **P6**              |
  | "P6"          | Interaction primitives                                             | **P7**              |
  | "P9"          | Modular before distributed                                         | **P11**             |
  | "P11"         | Selective activation                                               | **P10** and **P15** |

---

## 1. Question

**N1** (FC §22.2): _May an internal, non-VAJRA caller (notably the UI, on a direct user edit) issue a single-owner Command (for example `task.update`) without VAJRA mediation?_

Equivalently: can an internal non-VAJRA caller issue a single-owner Command directly to the owning capability, or must every internal Command pass through VAJRA?

---

## 2. Relevant Existing Decisions

Every capability Command is already addressed to **exactly one** owner (TA §9.1). "Single-owner" therefore cannot mean "addressed to one owner", since all Commands are. In this document it means **a Command that is not part of coordinating work across owners** (see §6).

The following TA statements constrain N1.

| Ref                          | Statement                                                                                                                                                                                                                                                         | Label in TA                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| D6 / TA §5.2                 | VAJRA owns canonical operational Goals; Missions and mission state; cross-system decisions; capability selection and routing; global mission constraints; completion criteria; verification; escalation. VAJRA does not own workspace implementation or UI state. | DECISION                            |
| TA §5.1                      | VAJRA "is **not** an execution engine and does not perform every operation itself"                                                                                                                                                                                | DECISION                            |
| TA P1                        | "Cross-system orchestration has exactly one authority: VAJRA. No route, store, cognitive engine, import side effect or external gateway orchestrates."                                                                                                            | Principle                           |
| D5 / TA §15.2                | MCP exposes capabilities. VAJRA remains the cross-system authority. _External_ mutating or action requests go through VAJRA.                                                                                                                                      | DECISION                            |
| D4                           | MCP v0 is read-only                                                                                                                                                                                                                                               | DECISION                            |
| TA §7.1 (diagram)            | "VAJRA **(or another authorised caller)** ──► Capability Contract ──► Owning System"                                                                                                                                                                              | Under a DECISION paragraph          |
| TA §7.1 `permissions`        | "Who may invoke it (**internal caller**, VAJRA, external caller)"                                                                                                                                                                                                 | TARGET                              |
| TA §9.1 Command              | "Who emits: VAJRA **(or an authorised caller)**"; addressed to "exactly one capability owner"                                                                                                                                                                     | TARGET                              |
| TA §12.1 Writer              | "Other subsystems change it only through the owner's Command capabilities"                                                                                                                                                                                        | TARGET                              |
| TA §4.1                      | Auto-starting a work session when a message names a project is an operational decision: "A Command to the sessions owner, **decided by authority, not a UI side effect**"                                                                                         | CURRENT → operational part to VAJRA |
| TA §10.2                     | AKIRA OS _Transport_ is "the mechanism that carries Commands, Queries, Events, Observations and Results"                                                                                                                                                          | TARGET                              |
| TA §3.1, §5.4                | GENESIS issues no Commands to other owners                                                                                                                                                                                                                        | DECISION                            |
| TA §11                       | HANDS accepts "authorised execution Commands from VAJRA only"                                                                                                                                                                                                     | DECISION                            |
| D1                           | VAJRA owns the canonical operational Goal and the Goal and Mission lifecycles                                                                                                                                                                                     | DECISION                            |
| D7                           | Execution ≠ completion; Observation ≠ verification                                                                                                                                                                                                                | DECISION                            |
| TA §9.2                      | A successful state-changing Command typically yields a Result to the caller and an Event from the owner                                                                                                                                                           | TARGET                              |
| TA P6, P7, P10/P15, P11, P14 | Capabilities as the interface; distinct primitives; selective activation; modular before distributed; no subsystem accretes unrelated concerns                                                                                                                    | Principles                          |
| TA §16.1                     | Migration order: Foundation cleanup → **Capability boundaries** → GENESIS migration → **VAJRA v0** → …                                                                                                                                                            | DECISION                            |

---

## 3. Model A — Direct Single-Owner Commands

```
UI (on an explicit user instruction) ──Command: task.update──► AKIRA OS · workspace ──Result──► UI
                                                                      └──Event (typically)──► subscribers, incl. VAJRA, GENESIS
```

**Semantics.**

- An internal caller issues a Command directly to the owning capability, within that capability's `permissions` (TA §7.1).
- The owner validates, mutates its own state and returns a Result. It typically emits an Event (TA §9.2).
- VAJRA is not on the path. It remains the authority for anything that coordinates more than one owner, and for everything a Mission does.

**Advantages.**

- It matches the TA's own wording: "or another authorised caller" (TA §7.1, §9.1); "internal caller" as a permissions category (TA §7.1); "other subsystems change it only through the owner's Command capabilities" (TA §12.1). The TA describes the owner, not VAJRA, as the gate for a dataset's mutations.
- It keeps VAJRA a coordinator rather than a pass-through for every edit (TA §5.1: VAJRA "does not perform every operation itself").
- It keeps the carrying of Commands in AKIRA OS transport (TA §10.2), not in VAJRA.
- It is compatible with the decided migration order. Workspace capabilities exist at "Capability boundaries", before "VAJRA v0" (TA §16.1), so UI edits can move onto capabilities without waiting for VAJRA.

**Risks.**

1. **Orchestration creeping into the UI.** If a UI action issues Commands to several owners in sequence, the UI becomes a de facto orchestrator. That is the defect P0 found in `chat.tsx` and that TA P1 forbids.
2. **Inferred actions disguised as user edits.** The UI could start doing things the user did not explicitly ask for, such as the CURRENT auto-session-start. The TA classifies those as decisions "by authority, not a UI side effect" (TA §4.1).
3. **VAJRA sees outcomes, not intent.** It learns of a direct edit only through the owner's Event, not before the edit happens.

**Architectural consequences.**

- The authority to mutate a dataset stays with its semantic owner (TA §12.1).
- VAJRA's authority is unchanged, but bounded: it is not consulted for edits that coordinate nothing.
- The caller must be prevented from accumulating cross-owner logic. This is the boundary in §6–§7, not a new mechanism.

**Interaction with VAJRA.**

- VAJRA can observe the resulting Events and react under its own authority. For example, a Mission whose steps touched a task may re-verify.
- A direct Command never changes Goal or Mission state, because those are VAJRA-owned capabilities (D1). A Command addressed to them is received and decided by VAJRA as owner.

---

## 4. Model B — All Commands Through VAJRA

```
UI ──request──► VAJRA ──Command: task.update──► AKIRA OS · workspace ──Result──► VAJRA ──► UI
```

**Semantics.**

- Every internal mutation, including a single-owner edit with no cross-system effect, is submitted to VAJRA.
- VAJRA issues the Command. No internal caller ever commands a capability directly.

**Advantages.**

- **One path for all mutations.** That makes it easier to audit, and easier to guarantee that no caller embeds coordination logic.
- **VAJRA sees intent before effect** for every mutation.
- **Simpler rule.** No boundary between "coordinating" and "single-owner" has to be policed.

**Risks.**

1. **VAJRA becomes a universal mutation gateway.** For a single-owner edit, VAJRA makes no cross-system decision, no selection among alternatives, no plan and no verification. It only relays. That relaying is the job the TA assigns to AKIRA OS transport (TA §10.2). So Model B creates exactly the coupling the brief's first test describes: VAJRA as infrastructure rather than as an orchestration authority.
2. **Against TA §5.1.** VAJRA "does not perform every operation itself". Mediating every operation pushes toward the opposite.
3. **Against TA P14.** VAJRA accretes a CRUD-gateway concern unrelated to its question ("What should happen, using which capabilities, and has it succeeded?", TA §2.1). It also moves toward owning UI-driven workspace flow, which TA §5.2 says it does not own.
4. **Migration conflict.** Under TA §16.1, capability boundaries precede VAJRA v0. Under Model B, no UI mutation could use a workspace capability until VAJRA v0 exists, so old UI write paths would have to persist longer.
5. **Availability coupling.** VAJRA is Tier 0, so always available (TA §8.1). Even so, every edit would depend on VAJRA's correctness as well as the owner's.
6. **Mission-flow ambiguity.** K10's flow would have to admit non-mission Commands routed by VAJRA. That reopens the distinction CX2 corrected (K10: a request that does not become a Mission is not routed by the mission flow).

**Architectural consequences.**

- VAJRA's authority widens from cross-system coordination to all mutation.
- The owner remains the semantic writer (TA §12.1), but can no longer be invoked by anyone except VAJRA.
- The TA's "internal caller" permission category (TA §7.1) and its "or another authorised caller" wording (§7.1, §9.1) become vacuous for Commands.

**Interaction with VAJRA.** VAJRA is on every mutation path. Mission authority and mutation relaying become one role.

---

## 5. Comparison

| Criterion                                                                       | Model A                                                                                                                                         | Model B                                                                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D5** (external mutations via VAJRA; MCP reads direct)                         | Unaffected. Model A concerns internal callers only; external Commands still go via VAJRA, and MCP v0 has none.                                  | Unaffected for external callers. Extends the VAJRA-only rule to internal callers, which D5 does not require.                                         |
| **D6** (VAJRA: cross-system decisions, selection and routing, missions)         | Preserved, provided "single-owner" excludes anything coordinating across owners. A single explicit user edit involves no cross-system decision. | Preserved, but stretched. VAJRA "routes" Commands for which no selection or decision exists.                                                         |
| **D7** (Observation ≠ verification; execution ≠ completion)                     | Unaffected. No verification is involved in a direct edit, and it creates no mission completion.                                                 | Unaffected                                                                                                                                           |
| **TA P1** (one orchestration authority)                                         | Holds only with the §6 boundary. Without it, the UI would orchestrate.                                                                          | Holds trivially, since no other caller can mutate                                                                                                    |
| **TA P2** (cognition ≠ orchestration)                                           | Unaffected. GENESIS still issues no Commands (TA §3.1).                                                                                         | Unaffected                                                                                                                                           |
| **TA P6** (capabilities as the interface)                                       | Directly expressed: the caller depends on the capability contract, not on VAJRA or an implementation.                                           | Callers depend on VAJRA as an intermediary for every mutation, not on the capability.                                                                |
| **TA P7** (distinct primitives)                                                 | Command, Result and Event are used exactly as TA §9.1–§9.2 define them                                                                          | Introduces a request-to-VAJRA layer in front of every Command. The TA defines that layer for external and mission work, not for every internal edit. |
| **TA P11** (modular before distributed)                                         | Neutral. No process boundary is implied.                                                                                                        | Neutral as to processes. Adds an architectural hop on every mutation.                                                                                |
| **TA P10 / P15** (selective activation)                                         | Only the owning capability is involved                                                                                                          | VAJRA's coordination machinery is involved even when nothing is coordinated                                                                          |
| **TA P14** (no unrelated concerns)                                              | VAJRA keeps only its own concerns                                                                                                               | VAJRA accretes a gateway concern                                                                                                                     |
| **FC K8** (ownership split)                                                     | Consistent. Execution by the owner; registration and activation by AKIRA OS. Selection is trivial: the user named the operation.                | Consistent, but selection and routing are performed by VAJRA even when trivial                                                                       |
| **FC K10** (mission flow)                                                       | Consistent with the CX2 correction: non-mission requests are not routed by the mission flow                                                     | Would require K10 to carry non-mission Commands through VAJRA                                                                                        |
| **FC K17** (authority)                                                          | Fills the "internal non-VAJRA callers: OPEN (N1)" cell with a bounded rule                                                                      | Fills the same cell with "never"                                                                                                                     |
| **FC K20** (interaction semantics)                                              | A domain-owner Command stays request/response: one Result, typically an Event                                                                   | Each internal Command becomes a two-leg interaction via VAJRA                                                                                        |
| **N2** (activation for non-VAJRA callers)                                       | Must not decide it. If the owning capability is not activated, the outcome follows N2.                                                          | Sidesteps N2 for Commands only by forcing VAJRA's requirement path. That would be an implicit partial answer to N2.                                  |
| **N3** (Commands to GENESIS)                                                    | Must not decide it. Commands _to GENESIS_ are excluded from this decision (§7).                                                                 | Would imply that any GENESIS Command arrives from VAJRA, a partial answer to N3                                                                      |
| **TA §5.1** (VAJRA does not perform every operation)                            | Consistent                                                                                                                                      | In tension                                                                                                                                           |
| **TA §10.2** (transport carries Commands; AKIRA OS)                             | Consistent                                                                                                                                      | VAJRA overlaps transport                                                                                                                             |
| **TA §12.1** (others change data only through the owner's Command capabilities) | Consistent                                                                                                                                      | Narrows "others" to VAJRA alone, beyond the TA text                                                                                                  |
| **TA §16.1** (capability boundaries before VAJRA v0)                            | Consistent                                                                                                                                      | Conflicts in sequencing                                                                                                                              |

**The brief's two tests:**

1. _Does requiring VAJRA for every Command make VAJRA a universal mutation gateway rather than an orchestration authority?_
   **Yes.** For single-owner edits VAJRA would make no decision, only relay, which overlaps AKIRA OS transport (TA §10.2) and runs against TA §5.1 and TA P14.
2. _Does allowing direct single-owner Commands undermine VAJRA's role as authoritative mission coordinator?_
   **Not if the boundary in §6 holds.** VAJRA's authority (D6) concerns cross-system decisions, Missions and Goals. A single explicit user edit to one owner involves none of these. VAJRA is undermined only if direct Commands are allowed to coordinate across owners or to carry inferred decisions. Both are excluded by §6 and §7.

---

## 6. Proposed Resolution

**Rule N1.** An internal caller may issue a Command directly to the owning capability, without VAJRA, if and only if **all** of the following hold:

1. **Explicit instruction.** The Command carries out an explicit instruction from the user for that operation. Its need is not inferred by the caller, by cognition, or from an Event (TA §4.1: inferred operational actions are "decided by authority, not a UI side effect").
2. **No coordination.** It is not one of several Commands that together coordinate work across owners. Work that needs more than one owner is cross-system work and goes to VAJRA (D6, TA P1).
3. **Outside any Mission.** It does not serve a Mission step. Commands that serve a Mission are issued by VAJRA (D1, D6).
4. **Permitted.** It is permitted to internal callers by the capability's `permissions` (TA §7.1), including any confirmation requirement. _Where_ that check is enforced remains undecided (FC §22.3).
5. **Permitted target.** The target capability is neither a HANDS capability (TA §11: VAJRA only) nor a GENESIS capability (N3, excluded from this decision).

**Effects of a direct Command:**

- The owner returns a Result to the caller and typically emits an Event (TA §9.2).
- VAJRA may observe that Event and act under its own authority.
- A direct Command never changes Goal or Mission state. Those capabilities are VAJRA-owned (D1), so a Command addressed to them is received and decided by VAJRA as owner.

**Everything else is not permitted directly** and goes to VAJRA as a request:

- Commands that fail any condition above;
- every Command from an external caller (D4, D5);
- every Command to HANDS (TA §11).

**Answer to N1:** **Yes, within Rule N1.** Model A applies inside the rule's boundary; Model B's VAJRA path applies to everything outside it.

---

## 7. Boundary Conditions

Rule N1 does **not** authorize:

| Not authorized                                                                                                    | Basis                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| Any mutation spanning more than one owner, or any sequence of Commands that coordinates owners                    | D6; TA P1             |
| Any Command serving a Mission step                                                                                | D1, D6                |
| Any change to Goal or Mission state by anyone other than VAJRA                                                    | D1                    |
| Any Command whose need is inferred rather than explicitly instructed by the user, such as automatic session start | TA §4.1               |
| Any external Command; any MCP write                                                                               | D4, D5                |
| Any Command to HANDS from a non-VAJRA caller                                                                      | TA §11                |
| Any Command issued by GENESIS to another owner                                                                    | TA §3.1               |
| Any Command _to_ a GENESIS capability                                                                             | N3 (OPEN)             |
| Orchestration of any kind by the caller                                                                           | TA P1                 |
| Activation of an inactive capability as a consequence of the Command                                              | N2 (OPEN)             |
| Any decision on where authorization is enforced, or how callers authenticate                                      | FC §22.3; O12         |
| Any decision on where the owning capability runs, or whether server or browser is authoritative for the write     | O1, O2                |
| Any decision on conversation-turn handling (for example, whether submitting a chat message is a direct Command)   | O7                    |
| Reset, or any other operation whose scope is OPEN                                                                 | O6                    |
| Bypassing a capability's confirmation requirement                                                                 | TA §7.1 `permissions` |

---

## 8. Contract Consequences

If Rule N1 is adopted, these Foundation Contract sections would need updating. **None is edited in this task.**

| Section                                               | Change needed                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FC §2.1 (K1) Issuer row                               | Replace "OPEN (N1)" with Rule N1 (§6)                                                                                                                    |
| FC §6 (K10) closing CONTRACT                          | Replace "Commands are N1" with a reference to Rule N1. Direct Commands under Rule N1 are not routed by the mission flow.                                 |
| FC §8 (K12) "Issue Commands" row                      | Add that internal callers may issue Commands directly within Rule N1. VAJRA's authority remains cross-system, mission and external work.                 |
| FC §11 ownership matrix, _Command_ row (_Can Create_) | Replace "internal single-owner callers: OPEN (N1)" with "internal callers within Rule N1"                                                                |
| FC §11 ownership matrix, _Workspace_ row              | Replace "UI direct: OPEN, N1" with "internal callers within Rule N1"                                                                                     |
| FC §14 (K17) "Issue Commands" row                     | Replace "OPEN (N1)" with Rule N1                                                                                                                         |
| FC §20 invariants                                     | Optionally add: "A direct internal Command never coordinates across owners, serves a Mission, targets HANDS or GENESIS, or carries an inferred decision" |
| FC §22.2 N1 row                                       | Move N1 to a resolved list, pointing to this document                                                                                                    |
| FC §23 completeness check, _Communication_ row        | Remove "Internal Command issuers (N1)" from the missing-contract column                                                                                  |

Sections deliberately **unchanged**:

- K13: HANDS remains VAJRA-only.
- K11: Commands to GENESIS remain N3.
- K9 and K22: activation remains N2.
- K21: MCP remains read-only.
- §22.3: the authorization enforcement point and the D6 scope over _Queries_ remain held open. Rule N1 concerns Commands only.

---

## 9. Remaining Open Questions

- **N2 remains OPEN.** Rule N1 says nothing about what happens when a directly commanded capability is inactive (§7).
- **N3 remains OPEN.** Commands _to_ GENESIS are excluded from Rule N1 (§6.5, §7).
- **All existing O-questions are unchanged:** O1, O2, O3, O4, O6, O7, O7r, O8/O8a, O9, O10, O11, O12. The §7 rows for O1, O2, O6, O7 and O12 state explicitly that Rule N1 does not touch them.
- **FC §22.3 items are unchanged,** including the D6 scope over non-mission _Queries_. Rule N1 concerns Commands and does not settle that item, though it is consistent with either answer to it.

---

## 10. Decision Status

**DECIDED. N1 is resolved by Rule N1 (§6).**

- **Why it can be decided now.** The TA already anticipates non-VAJRA Command issuers in three places:
  - "or another authorised caller" (TA §7.1, §9.1);
  - "internal caller" as a permissions category (TA §7.1);
  - "other subsystems change it only through the owner's Command capabilities" (TA §12.1).

  It also scopes VAJRA's exclusive authority to cross-system orchestration, Missions, Goals and external mutation (D1, D5, D6, TA P1). And it locates inferred operational actions with VAJRA (TA §4.1).

- **What this decision adds.** No new architectural question is needed to answer N1. The decision only states the boundary between those existing statements precisely.
- **When it takes effect.** As with every DECISION in this document set, it takes effect when the project owner accepts it. Until then the Foundation Contracts continue to show N1 as OPEN. The contract updates in §8 are made only after acceptance, in a separate change.
