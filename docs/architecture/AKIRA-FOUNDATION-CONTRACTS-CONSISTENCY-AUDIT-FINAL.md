# AKIRA Foundation Contracts — Final Consistency Audit

| | |
| --- | --- |
| Audited | `AKIRA-TARGET-ARCHITECTURE.md` (**TA**), `AKIRA-FOUNDATION-CONTRACTS.md` (**FC**), `AKIRA-N1-DECISION.md` (**N1**), `AKIRA-N2-DECISION.md` (**N2**), `AKIRA-N3-DECISION.md` (**N3**) |
| State audited | After the N3 TA §7.2 correction, the consolidated N1/N2/N3 FC update, and the N2 TA §8.1 correction |
| Date | 2026-10-02 |
| Files modified by this audit | None. Only this report was created. |

**Method.**
1. Every check below was made against the current text of the five documents, using exact line contents.
2. The Target Architecture is authoritative. N1, N2 and N3 are accepted decision records. The Foundation Contracts are subordinate to all of them.
3. Each finding is classified as one of:

| Class | Meaning |
| --- | --- |
| CONTRADICTION | Two documents, or two places in one document, state incompatible things |
| UNAUTHORIZED DECISION | A statement commits to something no authoritative source decided |
| AMBIGUITY | A statement admits a reading that conflicts with an authoritative source |
| MINOR WORDING | Traceability, labelling or phrasing issue that changes no architecture |
| PASS | The check found nothing wrong |

---

## 1. Verdict

### PASS WITH MINOR ISSUES

| Class | Count |
| --- | --- |
| CONTRADICTION | **0** |
| UNAUTHORIZED DECISION | **0** |
| AMBIGUITY | **1** (AM1) |
| MINOR WORDING | **7** (MW1–MW7) |

**N1, N2 and N3 are reflected correctly and consistently:**
- in the TA, at the two cells that record them (§7.2, §8.1);
- throughout the FC.

**Nothing has been accidentally closed or changed:**
- no O-question was closed or modified;
- no §22.3 held-open item is contradicted;
- no unauthorized decision was introduced during consolidation.

The remaining items are one wording ambiguity in the N2 precondition (AM1) and traceability or phrasing gaps (MW1–MW7).

---

## 2. Checks Requested

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | TA ↔ FC consistency | **PASS** (AM1, MW1, MW2, MW3 noted) | FC restates TA decisions faithfully. FC K11 matches TA §3.1 and TA §7.2. FC K9, K17 and K22 match TA §8.1. FC K21 matches D4 and D5. |
| 2 | N1, N2 and N3 correctly reflected everywhere | **PASS** in TA and FC (MW4: stale status lines in the decision records themselves) | §3 below |
| 3 | No remaining OPEN/DECIDED contradiction for N1–N3 | **PASS in TA and FC**. MW4: the decision records still contain point-in-time "N2/N3 remains OPEN" and "pending" statements. | TA: the only N-references are §7.2 "(Rule N3)" and §8.1 "(Rule N2)". FC: no "OPEN (N1/N2/N3)" marker remains; §22.2 marks all three resolved. |
| 4 | No accidental closure or modification of O1–O12 | **PASS** | TA §20 is unchanged by the three edits, which touched TA lines 473 and 517 only. FC §22.1 is byte-identical to the pre-consolidation backup. Each decision's boundary table explicitly excludes the O-questions it borders: N1 §7 (O1, O2, O6, O7, O12); N2 §7 (O1, O7, O12); N3 §7 (O4, O6, O7, O11). |
| 5 | No contradiction with the still-open §22.3 items | **PASS** | §4 below |
| 6 | Command / Query / Event / Observation / Result semantics | **PASS** | FC K1–K6 match TA §9.1–§9.2: Command to exactly one owner; Query changes no domain state; Event only from the owner and "typically" after a Command; Observation carries confidence and provenance and is never verification; execution Result is distinct from Mission Result. The N2 activation sentence in K2 is classed as an operational side effect, not domain state, which agrees with K2's existing CONTRACT. |
| 7 | GENESIS Command-free under N3 | **PASS** | §5 below |
| 8 | N2 activation limited to Tier 2 and Rule N2 | **PASS** (AM1 noted) | §6 below |
| 9 | N1 direct-Command conditions are exactly five | **PASS** (MW7 noted) | N1 §6 lists conditions 1–5. FC K1 lists the same five. FC K12, K17 and the §11 Command and Workspace rows refer to Rule N1 without restating, adding or dropping conditions. |
| 10 | Ownership matrix agrees with the contracts | **PASS** | §7 below |
| 11 | No unauthorized decisions during consolidation | **PASS** | §8 below |
| 12 | No legacy or implementation detail becomes a target requirement | **PASS** | TA §7.2 cites `eventService.record` only in its "CURRENT implementation" column. N3 makes no requirement of it. FC references to current code are labelled CURRENT (K19) or P0 context (K3) and impose nothing. |

---

## 3. Recent Changes Verified

| Change | Location | Result |
| --- | --- | --- |
| N3 TA correction | TA §7.2, line 473: `memory.store` … "GENESIS-internal; not invocable by other subsystems or callers (Rule N3)." | **PASS.** Consistent with TA §3.1 (no Command input), TA §5.4 (VAJRA → GENESIS by Query), TA §9.3 (internal wiring) and TA §12.1. Matches N3 §6.3. MW3 notes a capability-table oddity. |
| N2 TA correction | TA §8.1, line 517: "A permitted non-VAJRA invocation may require a Tier 2 capability; AKIRA OS may activate it or decline activation under Rule N2." | **PASS.** Consistent with TA §8, D2, D5 and N2 §6. The cell still states VAJRA as a requirement source and keeps the "never initialises internals" rule. MW2 and AM1 are noted. |
| Consolidated FC update | FC header and legend; K1, K2, K9, K10, K11, K12, K17, K22; §11 Capability activation, Command, Memory and Workspace rows; §22.2; §23 | **PASS.** Each edit matches the change the N1, N2 or N3 §8 table requires. The DECIDED legend extension is needed so that labels stay accurate. No optional item was applied. |

---

## 4. §22.3 Held-Open Items vs N1–N3

| §22.3 item | Touched by | Result |
| --- | --- | --- |
| Authorization enforcement point | N1 condition 4 ("where that check is enforced remains undecided"); N2 §6.3 ("permission precedes activation … where enforced remains undecided"); FC K1, K13, K18 | **PASS.** Neither decision chooses a location. |
| D6 scope over non-mission internal Queries | N2 §7 last row (explicitly not decided); FC K2, K9, K10, K12 | **PASS.** Rule N2 concerns activation, not who selects or routes. Rule N1 concerns Commands only. |
| Mission cancellation semantics | FC K6, K12, K20 | **PASS.** No decision touches it. HANDS Command cancellation (TA §11) is unchanged. |
| Model-transport invocation form | FC K14, K20 | **PASS.** Untouched; O9 unchanged. |
| Verification-record persistence | FC K15, K19 | **PASS.** Untouched. |
| New Chat notification mechanism | FC K16, Example F | **PASS.** N3 uses Events and lifecycle only, consistent with "GENESIS may receive a conversation-boundary Event" (TA §13.1). |

---

## 5. GENESIS Command-Freedom (N3)

All of the following express "no Command is addressed to GENESIS":

| Location | Statement |
| --- | --- |
| TA §3.1 | Inputs: Events, Queries, activation |
| TA §5.4 | VAJRA → GENESIS by Query |
| TA §7.2 | `memory.store` GENESIS-internal |
| FC §1.1 and §7.1 | GENESIS exposes Query capabilities; "All are Query capabilities" |
| FC §7.3 | "In: Commands: none (Rule N3)"; "Out: Commands to other owners: Never" |
| FC K17 | "never to GENESIS (Rule N3)" |
| FC §11 Memory row | "Only GENESIS, from its inputs such as Events (Rule N3)" |
| FC K1 Issuer | Rule N1 condition 5 excludes GENESIS targets |
| N1 §6 | Condition 5 |
| N2 §7 | No Command to GENESIS |

**Examples.** FC Examples A, C, E and F use Queries, Events or lifecycle only.

**Nothing permits a Command to GENESIS.** No FC section, example or decision permits one: not from VAJRA, AKIRA OS, HANDS, internal callers or MCP. The FC K1 *Receiver* row names only the HANDS restriction, but every place that lists Command targets or issuers carries the GENESIS exclusion. **PASS.**

---

## 6. N2 Scope (Tier 2, Rule N2)

**Tier 2 only.**
- Every Rule N2 statement is limited to *Tier 2*: TA §8.1, FC K2, K9 (the Tier 2 clause only), K17, K22 item 3, §11 Capability activation row.
- Tier 0 and Tier 1 remain lifecycle-activated: TA §8.1, FC K9, K22 item 1.

**The other limits of Rule N2 are carried too.**
- *Permission precedes activation:* each statement says "permitted".
- *AKIRA OS may decline:* stated in TA §8.1, K2, K9, K17 and K22.
- *VAJRA's path unchanged:* TA §8.1 keeps "VAJRA is one requirement source"; FC K9 and K17 keep "VAJRA (Tier 2)".

**PASS**, with AM1.

---

## 7. Ownership Matrix vs Contracts

| Matrix row | Agrees with |
| --- | --- |
| Capability activation | K9, K17, K22 (Rule N2) |
| Command | K1, K12, K17 (Rule N1; never GENESIS → others; never external in v0). The row lists issuers. The GENESIS *target* exclusion is carried by K17 and Rule N1 condition 5, so the row does not conflict. |
| Memory | K11, K15 (GENESIS is the sole writer, Rule N3) |
| Identity | K11, K15 (GENESIS; O4 open) |
| Workspace | K1, K12 (Rule N1); O2 open |
| Conversation | TA §10.2 (AKIRA OS appends); O7 (trigger). N1 §7 leaves conversation turns to O7. |
| Goal, Mission, Verification, Runtime lifecycle, Mission lifecycle, Conversation-turn lifecycle, Reset | Unchanged; agree with K12, K16 and §22 |

**PASS.**

---

## 8. Unauthorized-Decision Check (consolidation)

| Consolidation text | Source | Result |
| --- | --- | --- |
| FC K1 Rule N1 summary | N1 §6, conditions 1–5 | PASS |
| FC K12: "VAJRA's authority remains cross-system, mission and external work" | N1 §8 | PASS |
| FC K2: "Activation is an operational side effect performed by AKIRA OS, not a domain-state change" | FC K2's existing CONTRACT ("operational side effects that are not domain state"); D2 | PASS: follows from existing text |
| FC K17: "a permitted non-VAJRA invocation … is itself a requirement, which AKIRA OS may decline" | N2 §6.1–§6.2 | PASS |
| FC K11: "`memory.store` is GENESIS-internal" | N3 §6.3; TA §7.2 | PASS |
| FC legend: DECIDED extended to the accepted decision records | Needed for accurate labels; decides nothing | PASS |
| FC §22.2 resolution table | Summarises N1–N3 §6 | PASS |

**No unauthorized decision.**

---

## 9. Findings

| ID | Class | Location | Finding |
| --- | --- | --- | --- |
| **AM1** | AMBIGUITY | **TA §8.1** (line 517); **FC K2** (line 158), **K17** "Request activation" (line 521), **K22** item 3 (line 644) | Rule N2 applies only to a **registered and available** capability that is inactive (N2 §6 preconditions; §6.4: unregistered or unavailable capabilities are "never activated on demand"). These four statements say only "inactive Tier 2 capability" or "permitted non-VAJRA invocation". "Inactive" can be read as including *registered but not available*, which N2 excludes. FC K9's lifecycle mitigates this, because on-demand activation appears only on the Available → Activated transition. The other four statements are looser than the rule they cite. |
| **MW1** | MINOR WORDING | **TA** header (*Decision source*, *Revisions*) and *Status labels* (DECISION row: "Decided by the project owner in the Phase 1 or Phase 1.1 brief") | TA §7.2 and §8.1 now record Rule N3 and Rule N2, but three provenance gaps remain. The TA's DECISION definition does not cover the later decision records. Its Revisions row does not mention the Phase 2.1D-A, 2.1D and 2.1E edits. And "Rule N2" and "Rule N3" are referenced without a link or definition anywhere in the TA. The cells read correctly on their own; only provenance is incomplete. |
| **MW2** | MINOR WORDING | **TA §8.1** (line 517) vs **N2 §6.1** | The TA says a permitted non-VAJRA invocation "**may require**" a Tier 2 capability. Rule N2 says the invocation "**is** a requirement" (FC K2 and K17 follow N2). Because AKIRA OS may decline in both formulations, the outcome is the same, but the modal is placed differently. |
| **MW3** | MINOR WORDING | **TA §7.2** `memory.store` row (line 473) | The "Illustrative capabilities" table now lists an operation that, under Rule N3, is GENESIS-internal and not invocable by anyone else. FC K7 defines a capability as the boundary through which a subsystem offers functionality. The row is explicitly marked internal and the table is "examples only", so nothing conflicts, but the entry is not a boundary capability. |
| **MW4** | MINOR WORDING | **N1** §7 ("N3 (OPEN)", "N2 (OPEN)"), §8 ("K11: Commands to GENESIS remain N3"; "K9 and K22: activation remains N2"), §9 ("N2 remains OPEN", "N3 remains OPEN"), §10 ("Until then the Foundation Contracts continue to show N1 as OPEN"). **N2** §1 (quotes the superseded "OPEN (N2)" cell), §7 ("N3 (OPEN)"), §8 ("Still pending from accepted N1"), §9 ("N3 remains OPEN"). **N3** §2 (quotes the superseded TA §7.2 PROPOSED text), §8 ("Still pending from accepted N1 and N2") | These records accurately state the status *at the time each was written*. They carry no header saying that the later decisions were accepted and that their §8 updates have been applied. A reader of N1 or N2 alone could believe N2 or N3 is still open. |
| **MW5** | MINOR WORDING | **FC** header, *Primary source* row: "AKIRA-TARGET-ARCHITECTURE.md (**frozen**)" | The TA has since been amended twice (§7.2, §8.1) by accepted decisions. "Frozen" no longer describes it precisely. |
| **MW6** | MINOR WORDING | **FC §22.1** O6 row ("§11 Reset row; K16") vs **N3** §6.6 and §9 | N3 records a dependency: if O6 resolves Reset as a Command addressed to GENESIS, Rule N3 must be revisited. The FC's O6 row does not carry this cross-reference, so a future O6 design working from the FC alone may miss it. |
| **MW7** | MINOR WORDING | **FC K1** Issuer row (line 142) vs **N1** §6 condition 4 | N1 condition 4 reads "permitted to internal callers by the capability's `permissions` (TA §7.1), **including any confirmation requirement**". FC K1 says "permitted by the capability's `permissions`". The confirmation part is implied, because FC K7 defines `permissions` to include confirmation, but it is not restated. There are still exactly five conditions. |

---

## 10. Summary

| | |
| --- | --- |
| **Overall verdict** | PASS WITH MINOR ISSUES |
| Contradiction count | **0** |
| Unauthorized-decision count | **0** |
| Ambiguity count | **1** (AM1) |
| Minor-wording count | **7** (MW1–MW7) |

### Can Phase 2 be frozen?

**Yes.** No contradiction or unauthorized decision exists. N1–N3 are consistently reflected in the TA and FC. No O-question or §22.3 item has been altered.

**Recommended in the freeze change** (wording only, no architectural effect):
- **AM1:** carry "registered and available" into the four N2 restatements, because it touches the precondition of an accepted rule.
- **MW1:** record TA provenance for Rules N2 and N3.

**Can follow as errata:** MW2–MW7, including status headers on the three decision records (MW4).

**This audit made no fixes.**
