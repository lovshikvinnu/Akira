# AKIRA Tier-2 Activation Clarification

**Phase 2.1D-A.** This document clarifies one ambiguity in the frozen Target Architecture: the meaning of the Tier 2 "Activated by" statement in TA §8.1.

It does **not** resolve N2. It modifies nothing: not the Target Architecture, the Foundation Contracts, the N1 decision or the N2 decision. It proposes wording only.

|                      |                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Interpreted document | [AKIRA-TARGET-ARCHITECTURE.md](AKIRA-TARGET-ARCHITECTURE.md), cited **TA §n**, decisions **Dn**, principles **TA Pn**          |
| Context only         | [AKIRA-N1-DECISION.md](AKIRA-N1-DECISION.md) (accepted); [AKIRA-N2-DECISION.md](AKIRA-N2-DECISION.md) (proposal, not accepted) |
| Date                 | 2026-10-02                                                                                                                     |

**Method.**

- The TA was read independently. The N2 proposal's answer is **not** used as evidence; it appears here only where this document's impact on it is stated (§7).
- The accepted N1 decision is not TA text either. It is used only to describe consequences (§3, §4), not to interpret the TA.

---

## 1. Ambiguity

TA §8.1, Tier 2 row:

| Column       | Text                                                                                                                                            | Label                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Meaning      | "Not running until a mission, **request or lifecycle step** requires its capability; may be released afterwards"                                | TARGET                                                   |
| Activated by | "**VAJRA states the capability requirement**; the AKIRA OS capability/runtime layer activates it. VAJRA never initialises subsystem internals." | DECISION (column header: "Activated by (DECISION, §13)") |

TA §8, the governing DECISION:

> "No system should execute merely because it exists. It executes because its capability is required by the current **mission, request or lifecycle**."

**The question.** Is the _Activated by_ cell an **exclusive** rule (only VAJRA may cause a Tier 2 activation), or does it name **one** valid requirement source (VAJRA's) among others?

---

## 2. Relevant Existing Decisions

Every TA statement that names a Tier 2 activation trigger is listed below.

| Ref                                          | Text                                                                                                                                                                                              | What it establishes about triggers                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TA §8** (DECISION)                         | Executes "because its capability is required by the current mission, request or lifecycle"                                                                                                        | Three kinds of requirement source: mission, request and lifecycle. It does not say who states each.                                                                                             |
| **TA §8.1 Tier 2 Meaning** (TARGET)          | "until a mission, request or lifecycle step requires its capability"                                                                                                                              | The same three sources, applied specifically to Tier 2                                                                                                                                          |
| **TA §8.1 Tier 2 Activated by** (DECISION)   | "VAJRA states the capability requirement; the AKIRA OS capability/runtime layer activates it"                                                                                                     | Names **one** source (VAJRA). The word "only" does not appear.                                                                                                                                  |
| **D2** (TA §13, §20.1)                       | AKIRA OS owns "capability activation and deactivation; resource management"; "VAJRA never initialises subsystem internals: it states a capability requirement and the runtime layer activates it" | AKIRA OS is the sole activation _authority_. The VAJRA clause constrains _how VAJRA_ obtains activation. It does not enumerate requirement sources.                                             |
| **TA §13** critical rule (DECISION)          | "VAJRA does not initialise GENESIS internals … VAJRA ─► capability requirement ─► capability / runtime layer (AKIRA OS) ─► required capability activated"                                         | Framed as a prohibition on VAJRA (no internal initialisation), not as an exclusivity rule                                                                                                       |
| **TA §13.1** activation row (DECISION owner) | AKIRA OS "Activates and deactivates capabilities and their resources (**Tier 2 on demand**)"; _What others do_: "VAJRA states the requirement and consumes availability"                          | "On demand" without specifying whose demand. VAJRA is described as one party that states requirements.                                                                                          |
| **TA §5.4** VAJRA ↔ AKIRA OS (DECISION)      | "VAJRA ──capability / runtime requirement──► AKIRA OS ──► … activation"                                                                                                                           | VAJRA's path. Silent about other sources.                                                                                                                                                       |
| **TA §22.5** diagram                         | "VAJRA ─► capability requirement ─► AKIRA OS … ─► capability activated (Tier 2)"                                                                                                                  | VAJRA's path, illustrated                                                                                                                                                                       |
| **D5** (TA §15.2)                            | "MCP ─► authorised read capability ─► owning system ─► Result", with no VAJRA and no Mission                                                                                                      | A non-VAJRA request path exists. The TA does not say what happens if its target is inactive.                                                                                                    |
| **TA §15.3**                                 | Example MCP v0 reads: `project.read`, `goal.read`, `mission.read`, `memory.search`, `identity.read`, `workspace.read`                                                                             | By TA §8.1 tier membership, every example targets a Tier 0 or Tier 1 capability. The TA never shows a non-VAJRA request to a Tier 2 capability.                                                 |
| **D6** (TA §5.2)                             | VAJRA owns capability selection and routing; cross-system decisions                                                                                                                               | Selection is VAJRA's. Activation is not listed among VAJRA's authorities.                                                                                                                       |
| **TA §4.2**                                  | historical-recall "only if selected under VAJRA's capability-selection authority (D6)"                                                                                                            | One Tier 2 example (historical search) is, inside a conversation turn, invoked under VAJRA's selection authority. This concerns _selection_, not whether another source could cause activation. |
| **TA §7.1**                                  | `permissions`: who may invoke (internal caller, VAJRA, external caller); `availability`: "Activation tier (§8) and current availability"                                                          | Invocation policy and activation tier are separate metadata. Nothing ties permission to invoke to who may cause activation.                                                                     |
| **TA P10, P15**                              | "Activation is an explicit runtime act, not a consequence of import or mount"; "A system executes only when its capability is required"                                                           | Demand-driven activation. Neutral on _whose_ demand.                                                                                                                                            |
| **TA P1, P14**                               | One orchestration authority; no subsystem accretes unrelated concerns                                                                                                                             | Neither treats activation as orchestration, nor assigns it to VAJRA                                                                                                                             |

---

## 3. Interpretation A — VAJRA is one valid requirement source

**Reading.**

- The _Activated by_ cell describes VAJRA's path, which matters because of D2's prohibition on VAJRA initialising internals.
- Other requirement sources named by TA §8 and the Tier 2 _Meaning_ cell (request, lifecycle step) also exist.
- AKIRA OS activates in every case, and remains the only activation authority.

**Consistency with the TA.**

- **Consistent with TA §8 and the Tier 2 Meaning cell.** Both name "request" and "lifecycle step" alongside "mission".
- **Consistent with D2 and TA §13.1.** AKIRA OS owns activation "on demand". The VAJRA clause is a constraint on VAJRA, and is fully preserved.
- **Consistent with D5.** A non-VAJRA read path exists, and nothing forbids its target from being activated.
- **Consistent with D6 and P1.** Causing activation is not selection, routing or orchestration, so a non-VAJRA source gains no orchestration authority.
- **Not established by the TA.** The TA never says that a request which does not pass through VAJRA _is_ a requirement source. Interpretation A is permitted by the text, not stated by it.

---

## 4. Interpretation B — VAJRA is the exclusive Tier 2 trigger

**Reading.** Only VAJRA's stated requirement causes Tier 2 activation. "Request" in TA §8 means a request VAJRA has received and turned into a requirement (TA §5.2: VAJRA receives user requests).

**Consistency with the TA.**

- **Inconsistent in its strict form.** The Tier 2 _Meaning_ cell, in the same row, says a **lifecycle step** can require a Tier 2 capability. TA §8 says the same, and the lifecycle is AKIRA OS's (D2), not VAJRA's. A rule that _only VAJRA_ may cause Tier 2 activation contradicts the row it sits in. The _Activated by_ cell is therefore demonstrably **not exhaustive**: it omits a source the TA itself names.
- **A weaker form (B′) remains consistent:** only VAJRA's requirement or an AKIRA OS lifecycle step causes Tier 2 activation, and a caller request does so only through VAJRA.
  - "Request" in TA §8 can be read as a VAJRA-mediated request (TA §5.2, §5.3).
  - Every TA example of a non-VAJRA request (D5; TA §15.3) targets Tier 0 or Tier 1.
  - The one Tier 2 example with a stated invocation authority (historical search, TA §4.2) sits under VAJRA's selection authority.
  - Under B′, D5 reads and accepted Rule N1 direct Commands would reach Tier 2 capabilities only if those were already activated by VAJRA or the lifecycle. Nothing in the TA contradicts that.

---

## 5. Determination

### GENUINELY AMBIGUOUS

The TA settles part of the question and leaves the rest open:

1. **Settled by the TA: VAJRA is not the exclusive Tier 2 trigger.** The same §8.1 row names a lifecycle step as a requirement source, and TA §8 names lifecycle and request alongside mission. Strict Interpretation B is inconsistent with the TA text.
2. **Not settled by the TA: whether a request that does not pass through VAJRA is a requirement source** (Interpretation A), or whether requests count only once VAJRA turns them into requirements (B′).
   - TA §8's "request" can be read either way.
   - The TA never addresses a non-VAJRA request for a Tier 2 capability: all its non-VAJRA request examples target Tier 0 or 1.
   - The only explicit trigger statements describe VAJRA's path, but as a prohibition on VAJRA, not as an enumeration of sources.

The ambiguity that blocks N2 is point 2. It cannot be resolved by interpretation alone without making the decision N2 exists to make.

---

## 6. Minimal Clarification

**Proposed one-cell change.** Change the TA §8.1 Tier 2 _Activated by_ cell only. Its purpose:

- record what the TA already implies, that VAJRA is one valid requirement source and not the exclusive trigger;
- name the residual question explicitly as OPEN, so that N2 can be decided without contradicting the TA.

**Current**

> VAJRA states the capability requirement; the AKIRA OS capability/runtime layer activates it. VAJRA never initialises subsystem internals.

**Proposed**

> The AKIRA OS capability/runtime layer activates it when it is required (§8). VAJRA is one requirement source and states the requirement for its missions; a lifecycle step is another (Meaning). Whether a request that does not pass through VAJRA can require a Tier 2 capability is **OPEN** (N2). VAJRA never initialises subsystem internals.

**What the change does:**

- states that VAJRA is **one valid requirement source**, not the exclusive trigger (settled by the TA itself, §5 point 1);
- preserves D2 (AKIRA OS activates) and the prohibition on VAJRA initialising internals;
- keeps "lifecycle step" consistent with the Meaning cell in the same row;
- names the only unsettled point (§5 point 2) as **OPEN (N2)**.

**What the change does not do:**

- decide N2. Both Interpretation A and B′ remain possible answers to N2 after the change;
- change D5, D6, Rule N1, any capability's permissions, or any tier membership;
- give any caller orchestration or activation authority. AKIRA OS remains the sole activation authority.

**Labelling.** The cell sits under the column header "Activated by (DECISION, §13)". The proposed text keeps the DECISION content (AKIRA OS activates; VAJRA never initialises internals; VAJRA is a requirement source) and adds an explicit OPEN marker for the residual question. If the project owner prefers, the OPEN sentence can move to TA §20.2 as a new open item, with the cell referring to it.

---

## 7. Impact

If the clarification is adopted, the following would be affected. **None is modified in this task.**

| Document                                       | Effect                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AKIRA-TARGET-ARCHITECTURE.md**               | TA §8.1 Tier 2 _Activated by_ cell replaced as in §6. Optionally, a TA §20 entry recording N2 as an open activation question, or a note that this cell was clarified in Phase 2.1D-A.                                                                                                                                                                                                              |
| **AKIRA-N2-DECISION.md**                       | Its §10 "Interpretation this rests on" paragraph, the "tension" paragraph in §2, and the TA §8.1 row of the §5 comparison would need to cite this clarification. **Strict exclusivity is excluded by the TA.** N2 must still choose between A and B′. That proposal leans to Interpretation A; it would remain a proposal and would need reconsideration in light of §5 point 2 before acceptance. |
| AKIRA-TARGET-ARCHITECTURE-CONSISTENCY-AUDIT.md | Not modified. It audited the TA before this clarification. A one-cell clarification consistent with TA §8 would not change its findings, but any re-audit should cover the changed cell.                                                                                                                                                                                                           |
| AKIRA-FOUNDATION-CONTRACTS.md                  | **No change required by this clarification.** K9, K17, K22 and §11 already carry N2 as OPEN.                                                                                                                                                                                                                                                                                                       |
| AKIRA-N1-DECISION.md                           | No change. Rule N1 already defers activation to N2.                                                                                                                                                                                                                                                                                                                                                |

---

## 8. Preservation

- **N1 remains accepted** and unmodified.
- **N2 remains OPEN.** The N2 decision document is a proposal not yet accepted, and this clarification neither accepts nor rejects it.
- **N3 remains OPEN.**
- **All O-questions are unchanged:** O1, O2, O3, O4, O6, O7, O7r, O8/O8a, O9, O10, O11, O12.
- **Foundation Contracts remain unchanged.**
- **No document other than this file was created or modified.**
