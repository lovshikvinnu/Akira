# AKIRA N3 Decision: GENESIS Command and Mutation Boundary

**Phase 2.1E.** This document resolves one question: N3. It does not resolve any O-question. It does not modify the Target Architecture, the Foundation Contracts, or the N1 or N2 decisions. It does not redesign GENESIS internals and implements nothing.

|                 |                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority       | [AKIRA-TARGET-ARCHITECTURE.md](AKIRA-TARGET-ARCHITECTURE.md), cited **TA §n**, decisions **Dn**, principles **TA Pn** (numbered as in TA §23) |
| Accepted inputs | [AKIRA-N1-DECISION.md](AKIRA-N1-DECISION.md) (Rule N1); [AKIRA-N2-DECISION.md](AKIRA-N2-DECISION.md) (Rule N2)                                |
| Subordinate     | [AKIRA-FOUNDATION-CONTRACTS.md](AKIRA-FOUNDATION-CONTRACTS.md), cited **FC Kn**                                                               |
| Reference       | [AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT.md](AKIRA-FOUNDATION-CONTRACTS-CONSISTENCY-AUDIT.md)                                            |
| Date            | 2026-10-02                                                                                                                                    |

> **Note on the brief.** The Phase 2.1E brief was received truncated: it ends inside the Model A diagram. Model B ("GENESIS accepts no Commands") and a VAJRA-only variant of Model A were derived from the brief's listed distinctions. The structure mirrors the accepted N1 and N2 decisions, and the output file follows their naming. If the missing part of the brief specified other models, criteria or a different file, this document has not followed them.

---

## 1. Question

**N3** (FC §22.2): _Does GENESIS accept any Commands (for example `memory.store`, an explicit "forget" or correction, or reset handling), and from whom?_

The precise scope is whether a Command can be addressed **to** GENESIS as the owning system of cognitive state.

These are distinct from N3, and are addressed only where they bear on it:

| #   | Distinct question                                            | Where it is settled                      |
| --- | ------------------------------------------------------------ | ---------------------------------------- |
| 1   | GENESIS **issuing** Commands                                 | Already DECIDED: never (TA §3.1)         |
| 2   | GENESIS mutating its own derived state internally            | GENESIS internal business (TA §9.3)      |
| 3   | Persisting the durable memory stream                         | TA §12; Memory System is the sole writer |
| 4   | Another subsystem _asking_ GENESIS to perform cognition      | A Query (TA §9.1)                        |
| 5   | VAJRA commanding GENESIS                                     | Analysed as Model A′ (§4)                |
| 6   | A user asking AKIRA to remember, forget or correct something | §6, item 4                               |
| 7   | An Event causing GENESIS to derive or update cognition       | TA §3.1 input                            |

---

## 2. Relevant Existing Decisions

| Ref                                   | Statement                                                                                                                                                                                                                                                                                                                                                  | Label                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **TA §3.1** GENESIS boundary contract | _Inputs:_ "Domain **Events** from AKIRA OS (workspace changes, conversation turns); cognitive **Queries** from VAJRA, and authorised read Queries … (MCP v0, §15); activation by the AKIRA OS runtime lifecycle (§13)". _Writes:_ "Only its own cognitive state". _Never:_ "Issues Commands to other owners; calls a model; decides what AKIRA does next". | TARGET (boundary contract)                    |
| **TA §5.4** VAJRA ↔ GENESIS           | "VAJRA ──cognitive **Query**──► GENESIS capability ──► Observation / evidence (and Result) ──► VAJRA". "GENESIS informs; VAJRA coordinates."                                                                                                                                                                                                               | DECISION                                      |
| **TA §7.2**                           | `memory.store`, Command, GENESIS · Memory, implemented by "`eventService.record` (internal). **PROPOSED:** never externally callable (P0 §11.3)"                                                                                                                                                                                                           | Example (DECISION: "examples only"); PROPOSED |
| **TA §15.1**                          | "P0 §11.3's list of surfaces that must never be exposed is adopted." That list includes `eventService.record` ("Writing here forges the user's history") and identity `create*`/`update*`/`archive*` ("Identity must be _derived_, never asserted by an external agent").                                                                                  | TARGET                                        |
| **TA §18** `eventService` row         | "Records cognition events only … **Never a public capability**"                                                                                                                                                                                                                                                                                            | Migration map                                 |
| **TA §3.2** Memory System             | "The Memory System is the sole semantic owner and sole writer of the memory stream"                                                                                                                                                                                                                                                                        | DECISION / TARGET                             |
| **TA §3.2** Identity                  | "One canonical Identity System. It is **evidence-based**"                                                                                                                                                                                                                                                                                                  | DECISION                                      |
| **TA §3.2** Understanding             | A cognitive rule must not directly mutate unrelated domain state. Interpretation flows out as Observations.                                                                                                                                                                                                                                                | DECISION                                      |
| **TA §9.1** Command                   | "Do this"; addressed to exactly one owner; may change the owner's state; can be refused with a failure Result                                                                                                                                                                                                                                              | TARGET                                        |
| **TA §12.1**                          | Writer "belongs to the semantic owner. Other subsystems change it **only through the owner's Command capabilities**."                                                                                                                                                                                                                                      | TARGET                                        |
| **TA §13.1**, **D3**                  | New Chat: GENESIS _may receive_ a conversation-boundary Event and resets only conversation-scoped state                                                                                                                                                                                                                                                    | DECISION / TARGET                             |
| **O6**                                | Reset semantics OPEN. One option noted: "Selective reset: per-dataset operations, each owned by that dataset's semantic owner". "Reset must reach GENESIS runtime state."                                                                                                                                                                                  | OPEN                                          |
| **O4**                                | Identity: durable vs derived; whether stores merge                                                                                                                                                                                                                                                                                                         | OPEN                                          |
| **O7**                                | Conversation-turn lifecycle                                                                                                                                                                                                                                                                                                                                | OPEN                                          |
| **D4, D5**                            | MCP v0 read-only; external mutations via VAJRA                                                                                                                                                                                                                                                                                                             | DECISION                                      |
| **D2**                                | AKIRA OS owns runtime lifecycle; subsystems own their internal lifecycle; AKIRA OS decides _when_                                                                                                                                                                                                                                                          | DECISION                                      |
| **Rule N1** (accepted)                | Direct internal Commands within five conditions. Condition 5 excludes GENESIS targets, citing N3.                                                                                                                                                                                                                                                          | Accepted                                      |
| **Rule N2** (accepted)                | Activation on demand for permitted non-VAJRA invocations                                                                                                                                                                                                                                                                                                   | Accepted                                      |
| **TA P2, P5, P6, P7, P9, P14**        | Cognition ≠ orchestration; explicit ownership; capabilities as the interface; distinct primitives; persistence ≠ ownership; no unrelated concerns                                                                                                                                                                                                          | Principles                                    |

**What the TA does and does not say.**

- **TA §3.1 enumerates GENESIS's inputs, and no Command is among them.**
- The TA's only GENESIS Command example, `memory.store`, is implemented internally and PROPOSED as never externally callable.
- The surface it would wrap (`eventService.record`) is on the TA's adopted never-expose list.
- TA §12.1's rule ("only through the owner's Command capabilities") does not require that any such capability exist. If none exists, no other subsystem can change GENESIS state.

---

## 3. Model A — GENESIS accepts owner-local Commands

```
authorised caller ──Command: e.g. memory.store / memory.forget / identity correction──► GENESIS · Memory / Identity
                                                                                          ├── Result
                                                                                          └── Event (typically)
```

**Semantics.**

- GENESIS exposes Command capabilities whose effect is confined to its own cognitive state.
- Callers would be:
  - VAJRA, for mission work;
  - internal callers under Rule N1, which would require amending its condition 5.
- GENESIS, as semantic owner, may validate, hold or reject the Command (TA §9.1).

**Advantages.**

- **Direct user controls become possible.** For example, a "forget this memory" control, without routing through conversation.
- **Reset has an obvious path.** A selective Reset (one O6 option) could use GENESIS-owned operations.
- **Uniform shape.** GENESIS looks like every other owner: Command capabilities, governed by `permissions`.

**Risks.**

1. **Contradicts TA §3.1.** The TARGET boundary contract enumerates GENESIS's inputs and includes no Commands. Model A requires amending it.
2. **Forging history.** A Command that records memory events from outside writes into the user's cognitive history. That is the surface TA §15.1 adopts as never-expose ("Writing here forges the user's history").
3. **Tension with evidence-based identity (TA §3.2).** A Command that directly sets identity or derived state asserts cognition instead of deriving it. Model A is safe only if every GENESIS Command were reduced to "submit input that GENESIS evaluates", which is functionally what an Event already is.
4. **A second ingestion channel.** Other owners could push their state into GENESIS by Command instead of publishing Events (TA §3.1, §9.2), duplicating the intake boundary that TA §18 consolidates in the reality adapter.
5. **Amends an accepted decision.** Rule N1 condition 5 would have to change.

**Architectural consequences.** TA §3.1, TA §5.4 (if VAJRA commands GENESIS) and Rule N1 would each need amendment. GENESIS would gain a mutation surface that every caller's permissions must police.

**Interaction with VAJRA.** VAJRA could command cognitive changes as mission steps, not only query.

---

## 4. Model A′ — Commands to GENESIS from VAJRA only

**Semantics.** As Model A, but only VAJRA may issue them.

**Assessment.**

- **Inherits risks 1–4 of Model A.**
- **Contradicts TA §5.4,** which shows the VAJRA → GENESIS relationship as Queries.
- **Recreates the gateway coupling the N1 decision rejected.** A user's explicit single-owner correction would have to route through VAJRA, which would decide nothing beyond relaying it (N1 §5).
- **Its only gain over Model A is a narrower issuer set.**

---

## 5. Model B — GENESIS accepts no Commands

```
other owners ──Events (workspace changes, conversation turns, other owners' state changes)──► GENESIS
VAJRA / authorised callers ──Queries──► GENESIS ──Results / Observations──►
AKIRA OS runtime lifecycle ──start / stop (internal lifecycle contract)──► GENESIS
GENESIS changes only its own state, by processing these inputs
```

**Semantics.**

- GENESIS's cross-subsystem interface is exactly TA §3.1's:
  - Events in, Queries in, lifecycle in;
  - Results and Observations out.
- No subsystem and no external caller addresses a Command to GENESIS.
- `memory.store` is GENESIS-internal, the Memory System's own recording act.
- All change to cognitive state is GENESIS's own response to its inputs.

**Advantages.**

- **Matches the TA as written:** TA §3.1 (inputs), TA §5.4 (Queries only), TA §7.2 (memory.store internal, never externally callable), TA §15.1 (never-expose list), TA §18 (eventService never public).
- **Preserves evidence-based cognition (TA §3.2).** Nothing external asserts memory, identity or understanding. GENESIS derives it from evidence, including what the user says.
- **One intake boundary.** Domain changes arrive only as Events from their owners (TA §3.1, §9.2).
- **Cognition stays non-orchestrating, with no mutation surface to police** (TA P2, P14).
- **No amendment** to the TA, Rule N1 or Rule N2.

**Risks.**

1. **No direct, non-conversational control over cognitive state.**
   - A user's wish to remember, forget or correct reaches GENESIS only through its existing inputs. Examples: a conversation turn Event, or a domain Event such as deleting a note.
   - GENESIS decides the effect.
   - A dedicated "forget this memory" control that bypasses interpretation is not provided. Providing one later would mean revisiting N3 and amending TA §3.1.
2. **Reset path not pre-built.** If O6 eventually requires a reset operation addressed to GENESIS as a Command, N3 would need revisiting. If O6 delivers reset through the AKIRA OS lifecycle (D2), no revision is needed.

**Architectural consequences.**

- `memory.store` leaves the cross-subsystem capability catalogue: it is internal wiring (TA §9.3).
- Rule N1 condition 5's GENESIS exclusion becomes permanent rather than pending.
- Rule N2's observation that "no non-VAJRA Command to GENESIS exists" becomes permanent.

**Interaction with VAJRA.** Unchanged from TA §5.4:

- VAJRA queries GENESIS and receives Results and Observations.
- GENESIS learns of mission outcomes from Events VAJRA emits as the owner of mission state.

---

## 6. Resolution

**Rule N3.**

1. **No inbound Commands.** GENESIS exposes no Command capabilities to other subsystems or to external callers. No Command is addressed to GENESIS by VAJRA, AKIRA OS, HANDS, any internal caller under Rule N1, or MCP.
2. **The interface is exactly TA §3.1's.**
   - Inbound: domain Events, Queries, and the AKIRA OS runtime lifecycle's start/stop under GENESIS's internal-lifecycle contract (D2).
   - Outbound: Results and Observations.
   - GENESIS issues no Commands (unchanged).
3. **GENESIS alone changes its cognitive state,** by processing its inputs and through its internal lifecycle (for example, memory reconstruction). Queries never change it (TA §9.1). `memory.store` (TA §7.2) is GENESIS-internal and is not invocable by any other subsystem or caller.
4. **Explicit user intent arrives as input.** A user's explicit wish to remember, forget or correct something reaches GENESIS as cognitive input through those inputs (for example, a conversation-turn Event). GENESIS decides its cognitive effect, evidence-based (TA §3.2).
   - How a conversation turn is processed beyond that is O7.
   - Whether non-conversational controls should exist is outside this rule. They would require revisiting N3.
5. **Other owners publish Events.** No owner pushes its state into GENESIS by Command (TA §3.1, §9.2).
6. **Reset is not decided here.** If O6 concludes that a reset must be delivered to GENESIS as a Command, Rule N3 must be revisited then. A reset delivered through the AKIRA OS runtime lifecycle (D2) is compatible with Rule N3.

**Answer to N3: GENESIS accepts no Commands.** Its mutation boundary is internal. Cognitive state changes only as GENESIS's own response to its Events, its lifecycle, and the cognitive input those carry.

---

## 7. Boundary Conditions

Rule N3 does **not**:

| Not decided or not changed                                                        | Basis                                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Change GENESIS's internal wiring, recording or derivation                         | TA §9.3 (internal business)                                                                                                 |
| Decide how Reset reaches GENESIS                                                  | O6 (OPEN)                                                                                                                   |
| Decide identity durability, derivation or store consolidation                     | O4 (OPEN)                                                                                                                   |
| Decide conversation-turn handling                                                 | O7 (OPEN)                                                                                                                   |
| Decide which Events GENESIS subscribes to, or event-log durability                | O11; GENESIS internal                                                                                                       |
| Prevent VAJRA or any authorised caller from **querying** GENESIS                  | TA §3.1, §5.4; Rule N2 for activation                                                                                       |
| Prevent GENESIS from querying other owners (for example the conversation archive) | TA §3.2                                                                                                                     |
| Change how GENESIS reports evidence or recommendations (Observations)             | TA §3.1, D7                                                                                                                 |
| Give any caller authority to assert memory, identity or understanding             | TA §3.2, §15.1                                                                                                              |
| Amend Rule N1 or Rule N2                                                          | Both remain as accepted. N1 condition 5 is satisfied permanently. N2's "no non-VAJRA Command to GENESIS" holds permanently. |
| Decide where authorization is enforced, or authentication                         | FC §22.3; O12                                                                                                               |
| Decide runtime placement                                                          | O1                                                                                                                          |
| Add non-conversational memory-editing features                                    | Outside N3. They would require revisiting N3 and TA §3.1.                                                                   |

---

## 8. Contract and Architecture Consequences

If Rule N3 is accepted, the following would need updating. **None is edited in this task.**

| Document / section                      | Change needed                                                                                                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TA §7.2** `memory.store` row          | Replace "**PROPOSED:** never externally callable" with "GENESIS-internal; not invocable by other subsystems or callers (Rule N3)". This is the only TA change, and it confirms rather than alters TA §3.1. |
| FC §1.1 (K11 summary)                   | Optional: state that GENESIS exposes **only** Query capabilities (Rule N3)                                                                                                                                 |
| FC §7.3 (K11), _In: Commands_ row       | Replace "OPEN (N3)" with "None (Rule N3); `memory.store` is GENESIS-internal"                                                                                                                              |
| FC §11 ownership matrix, _Memory_ row   | Replace "(Command-based creation: OPEN, N3)" with "only GENESIS, from its inputs (Rule N3)"                                                                                                                |
| FC §11 ownership matrix, _Identity_ row | Optional: note "no Command interface (Rule N3)"                                                                                                                                                            |
| FC §14 (K17) _Issue Commands_ row       | Add "never to GENESIS (Rule N3)"                                                                                                                                                                           |
| FC §20 invariants                       | Optionally add: "No Command is addressed to GENESIS; GENESIS changes only its own state, from its inputs"                                                                                                  |
| FC §22.2 N3 row; FC §23 _GENESIS_ row   | Mark N3 resolved, pointing to this document                                                                                                                                                                |
| AKIRA-N1-DECISION.md                    | No change. Condition 5's GENESIS exclusion now rests on Rule N3.                                                                                                                                           |
| AKIRA-N2-DECISION.md                    | No change                                                                                                                                                                                                  |

**Still pending from accepted N1 and N2.** Their Foundation Contract updates (N1 §8, N2 §8) and N2's TA §8.1 cell update have not been applied. These could be applied together with Rule N3's updates in one change.

---

## 9. Remaining Open Questions

- **N1 and N2 remain accepted and unmodified.**
- **All O-questions are unchanged:** O1, O2, O3, O4, O6, O7, O7r, O8/O8a, O9, O10, O11, O12.
  - O6 is explicitly not decided (§6, item 6).
  - O4 and O7 are explicitly not decided (§7).
- **FC §22.3 items are unchanged.**
- **New dependency recorded, not a new question.** If O6 resolves Reset as a Command to GENESIS, Rule N3 must be revisited (§6, item 6).

---

## 10. Decision Status

**DECIDED. N3 is resolved by Rule N3 (§6): GENESIS accepts no Commands. Its cognitive state changes only through its own processing of its inputs (Events, lifecycle) and its internal lifecycle.**

**Basis.**

- TA §3.1's boundary contract enumerates GENESIS's inputs without Commands.
- TA §5.4 shows the VAJRA → GENESIS relationship as Queries only.
- TA §7.2 already treats `memory.store` as internal, PROPOSED never externally callable.
- TA §15.1 and §18 place `eventService.record` on the never-expose list ("forges the user's history"), and TA §3.2 makes identity evidence-based.

**Why Model B, and not Model A or A′.**

- Model B requires **no** amendment to the TA's boundary contract, Rule N1 or Rule N2.
- Model A would require amending TA §3.1 and Rule N1, and would create a mutation surface the TA lists as never-expose.
- Model A′ adds a conflict with TA §5.4 and the N1 gateway concern.

**The cost of Model B is explicit.** There is no direct, non-conversational command over cognitive state. Revisiting it is a future product decision; nothing in the current architecture requires it.

**When it takes effect.** As with every DECISION in this document set, it takes effect when the project owner accepts it. The §8 updates are made only after acceptance, in a separate change.
