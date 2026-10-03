# AKIRA N2 Decision: Non-VAJRA Requests and Tier-2 Activation

**Phase 2.1D — final resolution.** This document resolves one question: N2. It does not resolve N3 or any O-question, and it does not modify the Foundation Contracts. It defines no authentication, transport, process, resource-management or cost policy, and it implements nothing.

|                |                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority      | [AKIRA-TARGET-ARCHITECTURE.md](AKIRA-TARGET-ARCHITECTURE.md) as clarified in Phase 2.1D-A, cited **TA §n**, decisions **Dn**, principles **TA Pn** (numbered as in TA §23) |
| Accepted input | [AKIRA-N1-DECISION.md](AKIRA-N1-DECISION.md), Rule N1                                                                                                                      |
| Clarification  | [AKIRA-TIER2-ACTIVATION-CLARIFICATION.md](AKIRA-TIER2-ACTIVATION-CLARIFICATION.md), applied to TA §8.1                                                                     |
| Supersedes     | The earlier Phase 2.1D _proposal_ in this file. It is not used as a premise; see §11.                                                                                      |
| Date           | 2026-10-02                                                                                                                                                                 |

> **Note on the brief.** The final-resolution brief was received truncated: it ends inside the Model A diagram. Model B is taken from the clarification's identified alternative, B′: only VAJRA's mission requirements and AKIRA OS lifecycle steps cause Tier 2 activation. The structure mirrors the accepted N1 decision, and the decision is recorded in this file, replacing the earlier proposal. If the missing part of the brief specified other models, criteria or a different output file, this document has not followed them.

---

## 1. Question

**N2.** When an authorised non-VAJRA caller invokes a registered Tier 2 capability that is currently inactive, does that request itself count as a requirement that permits AKIRA OS to activate the capability?

This is the residual question that clarified TA §8.1 marks OPEN: "Whether a request that does not pass through VAJRA can require a Tier 2 capability is **OPEN** (N2)."

---

## 2. Relevant Existing Decisions

| Ref                                      | Statement (clarified TA)                                                                                                                                                                                                                                                                                                                         | Label                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| TA §8                                    | A system "executes because its capability is required by the current **mission, request or lifecycle**"                                                                                                                                                                                                                                          | DECISION                              |
| TA §8.1, Tier 2 Meaning                  | "Not running until a mission, **request** or lifecycle step requires its capability; may be released afterwards"                                                                                                                                                                                                                                 | TARGET                                |
| TA §8.1, Tier 2 Activated by (clarified) | "The AKIRA OS capability/runtime layer activates it when it is required (§8). VAJRA is one requirement source and states the requirement for its missions; a lifecycle step is another (Meaning). Whether a request that does not pass through VAJRA can require a Tier 2 capability is OPEN (N2). VAJRA never initialises subsystem internals." | DECISION, with OPEN                   |
| D2 / TA §13, §13.1                       | AKIRA OS owns capability activation and deactivation, and resource management; "Activates and deactivates capabilities and their resources (Tier 2 on demand)"                                                                                                                                                                                   | DECISION                              |
| D5 / TA §15.2                            | MCP reads: "authorised read capability → owning system → Result", with no VAJRA and no Mission                                                                                                                                                                                                                                                   | DECISION                              |
| D4                                       | MCP v0 is read-only. Auth must eventually protect the boundary (mechanism and timing: O12).                                                                                                                                                                                                                                                      | DECISION                              |
| D6 / TA §5.2                             | VAJRA owns capability selection and routing, and cross-system decisions. Activation is not among its authorities.                                                                                                                                                                                                                                | DECISION                              |
| TA §11                                   | HANDS accepts Commands from VAJRA only                                                                                                                                                                                                                                                                                                           | DECISION                              |
| TA §7.1                                  | `permissions`: who may invoke (internal caller, VAJRA, external caller); `availability`: activation tier and current availability; `cost`                                                                                                                                                                                                        | DECISION (registry) / TARGET (fields) |
| TA P1, P6, P10, P14, P15                 | One orchestration authority; capabilities as the interface; activation as an explicit runtime act; no unrelated concerns; execute only when required                                                                                                                                                                                             | Principles                            |
| Rule N1 (accepted)                       | Bounded direct internal Commands. HANDS and GENESIS targets are excluded. Activation is left to N2.                                                                                                                                                                                                                                              | Accepted decision                     |

**Which Tier 2 capabilities a non-VAJRA caller can reach at all.** TA §8.1's Tier 2 members are deep planning, deep reasoning, historical search, research, vision, CAD, Vivado, browser automation, HANDS execution and external AI tools.

- HANDS execution, and external AI tools acting as executors (TA §10.3), are VAJRA-only (TA §11).
- Deep planning and reasoning are VAJRA's domain (TA §5.2).
- Rule N1's direct Commands target workspace-type capabilities, which TA §8.1 places in Tier 1 ("Workspace"), and exclude HANDS and GENESIS.

So N2 concerns chiefly **non-VAJRA read Queries of Tier 2 capabilities**: MCP v0 reads under D5, and internal reads, where their target's permissions admit the caller. HANDS cannot be reached at all.

---

## 3. Model A — The request is a requirement

**Semantics.**

- A permitted invocation by a non-VAJRA caller of a registered, available, inactive Tier 2 capability is itself a requirement in the sense of TA §8 ("required by the current … request").
- AKIRA OS activates the capability under its own authority (D2), and the invocation proceeds.
- AKIRA OS may release the capability afterwards (TA §8.1).

**Advantages.**

- Gives TA §8's "request" its plain meaning, alongside the mission source (VAJRA) and the lifecycle source (AKIRA OS) that the clarified cell names.
- Uses only existing authorities:
  - AKIRA OS activates (D2);
  - permissions decide who may invoke (TA §7.1);
  - VAJRA is not involved (D5, Rule N1).
- A capability that the owner's permissions open to a caller is actually usable by that caller. The capability contract determines the outcome (TA P6).

**Risks.**

1. **Cost exposure.** An admitted caller can cause a Tier 2 activation, including an external MCP caller while O12 is open.
2. **Latency.** Activation precedes the first Result.
3. **Contention.** On-demand activations compete for resources with mission work.

**Consequences.**

- _Exposure_ is controlled where the TA already places invocation policy: in each capability's `permissions`.
- _Feasibility_ is controlled where the TA places activation: in AKIRA OS resource management, including the right to decline (D2).

**Interaction with VAJRA.**

- None on this path.
- VAJRA's mission path (TA §8.1) is unchanged.

---

## 4. Model B (B′) — The request is not a requirement

**Semantics.**

- Only a VAJRA-stated mission requirement or an AKIRA OS lifecycle step causes Tier 2 activation.
- A non-VAJRA invocation of an inactive Tier 2 capability fails as _capability unavailable_.

**Advantages.**

- **Strictest cost control.** No non-VAJRA caller, internal or external, can cause a Tier 2 activation, whatever O12 eventually decides.
- **Matches every explicit trigger statement in the TA,** each of which names VAJRA or the lifecycle (TA §5.4, §8.1, §13, §22.5).
- **Simple outcome:** inactive means unavailable for non-VAJRA callers.

**Risks.**

1. **Needs an additional prohibition the TA does not contain.** AKIRA OS owns activation (D2), and a lifecycle step is a valid Tier 2 source (clarified §8.1). For B′ to hold, AKIRA OS must be barred from taking a lifecycle step _in response to_ a non-VAJRA request. Otherwise the lifecycle source absorbs every request and B′ collapses into A. The TA states no such restriction on AKIRA OS's activation authority. B′ would introduce one.
2. **Narrows TA §8's "request".** It reads "request" as VAJRA-mediated only. The clarified cell describes VAJRA's requirement as stated "for its missions", which leaves VAJRA-mediated _non-mission_ requests (an O7 option) as the only remaining meaning.
3. **Permissions without effect.** A capability's `permissions` may admit a caller (TA §7.1) who can then never obtain a Result unless unrelated work happened to activate the capability. Owners would have to avoid granting such permissions, or callers would face availability that depends on hidden runtime history (TA P6).
4. **Pressure toward VAJRA brokering.** Internal callers needing a Tier 2 read would have to route through VAJRA, which would decide nothing beyond "activate this". That is the gateway coupling the N1 decision rejected (N1 §5) and an activation role TA §5.2 does not give VAJRA. MCP v0 callers would have no route at all: D5 gives them only direct reads.

**Consequences.**

- Tier 2 capabilities become, in practice, mission-only for anyone needing reliable results.
- MCP v0's usable catalogue is limited to Tier 0/1 capabilities plus any Tier 2 capability that happens to be active.

**Interaction with VAJRA.** VAJRA, together with the lifecycle, is the only path to Tier 2 activation. Non-VAJRA callers depend on it indirectly.

---

## 5. Comparison

This section is not scored or ranked.

| Criterion                                                                              | Model A                                                                              | Model B′                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Clarified **TA §8.1** (VAJRA is one source; lifecycle is another; request source OPEN) | Fills the OPEN point: a non-VAJRA request is a source                                | Fills the OPEN point: it is not                                                                                             |
| **TA §8** ("mission, request or lifecycle")                                            | "Request" taken at face value                                                        | "Request" restricted to VAJRA-mediated non-mission requests                                                                 |
| **D2** (AKIRA OS owns activation and resources)                                        | Exercised fully, including declining                                                 | Restricted: AKIRA OS may not activate on a non-VAJRA request, even via a lifecycle step. This restriction is not in the TA. |
| **D5** (reads without VAJRA)                                                           | Reads of permitted Tier 2 capabilities can succeed                                   | Reads of inactive Tier 2 capabilities fail; MCP has no path to change that                                                  |
| **D6 / TA P1**                                                                         | Activation is not orchestration; VAJRA unaffected                                    | Pushes VAJRA toward brokering activation for non-mission work                                                               |
| **Rule N1**                                                                            | Unaffected in practice: direct Commands target Tier 1                                | Unaffected in practice                                                                                                      |
| **TA §7.1 permissions / cost**                                                         | Exposure governed by permissions                                                     | Exposure removed regardless of permissions                                                                                  |
| **TA P6** (capabilities as the interface)                                              | Outcome follows the contract and permissions                                         | Outcome depends on unrelated activation history                                                                             |
| **TA P10 / P15** (selective activation)                                                | Activation only for a permitted request; released afterwards                         | Activation only for missions and lifecycle steps                                                                            |
| **TA P14** (no unrelated concerns)                                                     | VAJRA keeps only its concerns                                                        | VAJRA gains a de facto activation-brokering concern                                                                         |
| **TA §11** (HANDS)                                                                     | N/A: unreachable by non-VAJRA callers                                                | N/A                                                                                                                         |
| **O12** (external auth)                                                                | Remains open. External activation exposure equals what external `permissions` admit. | Remains open. No external activation at all.                                                                                |
| **N3**                                                                                 | Unaffected: no non-VAJRA Command to GENESIS exists                                   | Unaffected                                                                                                                  |
| **New rules required**                                                                 | None: every element is an existing authority                                         | One: a prohibition on AKIRA OS responding to non-VAJRA requests                                                             |

---

## 6. Resolution

**Rule N2.** If all of the following hold:

- an authorised non-VAJRA caller makes an invocation (Query, or a Command permitted under Rule N1);
- the target capability's `permissions` admit that invocation (TA §7.1);
- the capability is a **registered**, **available** Tier 2 capability that is currently **inactive**;

then:

1. **The request is a requirement.** The permitted invocation is a requirement under TA §8 ("required by the current … request"). AKIRA OS may activate the capability under its own activation authority (D2). It owns how activation happens, and the invocation then proceeds.
2. **AKIRA OS may decline or defer.** It may do so under resource management (D2). The caller receives _activation failure_ or _capability unavailable_, under the existing failure categories. Declining is an AKIRA OS lifecycle decision, never a mission decision.
3. **Permission precedes activation.** An invocation that the capability's permissions do not admit is rejected and never causes activation. Where that check is enforced remains undecided (FC §22.3).
4. **Only registered, available capabilities.** An unregistered capability, or a registered but unavailable one, is never activated on demand. The caller receives _capability unavailable_.
5. **Release.** AKIRA OS may release an on-demand activation afterwards (TA §8.1).

**Unchanged.**

- VAJRA's mission path: VAJRA states requirements for its missions (clarified TA §8.1).
- Lifecycle-step activation by AKIRA OS.
- Tier 0 and Tier 1 activation, which belongs to the AKIRA OS runtime lifecycle (TA §8.1).

**Answer to N2: yes.** A permitted non-VAJRA request counts as a requirement that permits AKIRA OS to activate the capability. Rule N2 grants permission to activate; it creates no obligation, and AKIRA OS retains the right to decline.

---

## 7. Boundary Conditions

Rule N2 does **not**:

| Not authorized or decided                                                                      | Basis                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Widen who may invoke a capability; only permissions decide that                                | TA §7.1                                                             |
| Let external callers do anything beyond MCP v0 reads that their permissions admit              | D4, D5                                                              |
| Let any non-VAJRA caller invoke or activate HANDS                                              | TA §11                                                              |
| Permit any Command to GENESIS, or decide GENESIS mutation semantics                            | N3 (OPEN)                                                           |
| Give VAJRA activation authority, or require VAJRA for activation                               | D2                                                                  |
| Change VAJRA's mission requirement path                                                        | Clarified TA §8.1                                                   |
| Oblige AKIRA OS to activate                                                                    | D2 (resource management)                                            |
| Make activation a mission decision, or let AKIRA OS change mission state                       | D2                                                                  |
| Apply to Tier 0 or Tier 1 activation, which is lifecycle-owned                                 | TA §8.1                                                             |
| Activate unregistered or unavailable capabilities                                              | TA §13.1 (registration and availability)                            |
| Decide where authorization is enforced, or how callers authenticate                            | FC §22.3; O12                                                       |
| Define a resource, priority or cost policy; AKIRA OS owns its content, which is undesigned     | D2                                                                  |
| Decide process placement or topology                                                           | TA P11; O1                                                          |
| Decide conversation-turn handling, including whether VAJRA-mediated non-mission requests exist | O7                                                                  |
| Change Rule N1's conditions                                                                    | N1 decision                                                         |
| Decide the D6 scope over non-mission internal Queries (FC §22.3)                               | Rule N2 concerns activation only, not who selects or routes a Query |

---

## 8. Contract and Architecture Consequences

If Rule N2 is accepted, the following would need updating. **None is edited in this task.**

| Document / section                                   | Change needed                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TA §8.1** Tier 2 _Activated by_ cell               | Replace "Whether a request that does not pass through VAJRA can require a Tier 2 capability is OPEN (N2)" with a reference to Rule N2 (a permitted non-VAJRA request is a requirement; AKIRA OS may activate or decline) |
| FC §2.2 (K2) _State_ row                             | Replace the N2 OPEN sentence with Rule N2                                                                                                                                                                                |
| FC §5 (K9) Available → Activated row                 | Replace "or on-demand for other authorised callers (OPEN, N2)" with "or a permitted non-VAJRA invocation (Rule N2)"                                                                                                      |
| FC §6 (K10) closing CONTRACT                         | Replace "(N2 OPEN)" with Rule N2                                                                                                                                                                                         |
| FC §11 ownership matrix, _Capability activation_ row | Replace "other callers: OPEN (N2)" with "permitted non-VAJRA invocations (Rule N2)"                                                                                                                                      |
| FC §14 (K17) _Request activation_ row                | Replace "others: OPEN (N2)" with Rule N2                                                                                                                                                                                 |
| FC §19 (K22) item 3                                  | Replace "unless AKIRA OS activates it on demand (OPEN, N2)" with Rule N2                                                                                                                                                 |
| FC §22.2 N2 row; FC §23 _Capability_ row             | Mark N2 resolved, pointing to this document                                                                                                                                                                              |
| FC (K18)                                             | No new category. _Activation failure_ and _capability unavailable_ already cover a declined activation.                                                                                                                  |

**Still pending from accepted N1.** The N1 contract updates (N1 §8) have not yet been applied to the Foundation Contracts. Both sets should be applied together in one contracts change.

---

## 9. Remaining Open Questions

- **N3 remains OPEN.**
- **N1 remains accepted and unmodified.**
- **All O-questions are unchanged:** O1, O2, O3, O4, O6, O7, O7r, O8/O8a, O9, O10, O11, O12.
- **FC §22.3 items are unchanged:** the authorization enforcement point, the D6 scope over non-mission Queries, mission cancellation, the model-transport form, verification-record persistence, and New Chat notification.

---

## 10. Decision Status

**DECIDED. N2 is resolved by Rule N2 (§6): a permitted non-VAJRA request is a requirement that permits AKIRA OS to activate an inactive Tier 2 capability, and AKIRA OS may decline.**

**Basis (clarified TA only).**

- TA §8 (DECISION) lists "request" as a requirement source alongside mission and lifecycle.
- Clarified TA §8.1 establishes that VAJRA is not the exclusive trigger, and that a lifecycle step, which belongs to AKIRA OS, is a valid source.
- D2 gives AKIRA OS the activation and resource-management authority, with no restriction on what may prompt it.
- TA §7.1 places invocation policy, and therefore exposure, in `permissions`.
- D5 and Rule N1 establish non-VAJRA invocation paths.

**Model A requires no new rule. Model B′ requires one:** a prohibition on AKIRA OS activating in response to a non-VAJRA request. The TA does not contain that prohibition, and nothing in the TA's existing decisions demands it. Choosing B′ would therefore be a new restriction on D2. Choosing A applies existing authorities as written.

**Not used as a premise.** The earlier proposal's conclusion was not relied on (§11).

**When it takes effect.** As with every DECISION in this document set, it takes effect when the project owner accepts it. The §8 updates, including the TA §8.1 cell, are made only after acceptance, in a separate change.

---

## 11. Relationship to the Earlier Proposal

The earlier Phase 2.1D proposal in this file also concluded "AKIRA OS activates on demand".

**Why it was re-evaluated.** It rested on an interpretation of TA §8.1 that the Phase 2.1D-A clarification showed was _permitted but not established_.

**What this resolution does differently:**

- Its analysis starts from the clarified TA, in which strict VAJRA exclusivity is excluded and the request source is explicitly OPEN.
- It compares Model A against the clarification's Model B′, rather than against strict exclusivity.
- Its decisive argument is new: B′ needs an additional prohibition on D2, which the TA lacks. The proposal's argument depended on reading §8.1 as non-exclusive.

**Narrower scope.**

- Rule N2 covers Tier 2 only. The proposal generalised to any inactive capability.
- Rule N2 states the result as a _permission_ to activate, not an obligation.

The proposal's text is superseded by this document.
