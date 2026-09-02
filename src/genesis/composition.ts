/**
 * GENESIS production composition.
 *
 * This module is the single, explicit declaration of which cognitive processors
 * must be live for the pipeline
 *
 *   event -> candidate -> validated memory -> story -> importance -> understanding
 *
 * to actually run in production.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every processor below subscribes to an upstream service inside its own
 * `initialize()`, and most of them call that method at module scope. That makes
 * a processor's activation depend on whether some other file happens to import
 * its module — an accidental side effect rather than a stated intent.
 *
 * Two processors lost that lottery. `storyBuilder` and `importanceBuilder` were
 * reachable only through `./stories/index.ts` and `./importance/index.ts`, and
 * nothing imported those barrels: `./index.ts` exports `storyService` and
 * `importanceService` from their concrete modules and never pulls in the
 * builders beside them. Both processors were fully functional and fully unit
 * tested, and neither ever ran in the application. Memories were promoted and
 * then simply stopped — no story ever formed, no importance signal was ever
 * computed, and `identityBuilder`, which subscribes to story events, was
 * starved as a consequence.
 *
 * The manifest below replaces that accident with an explicit list. Adding a
 * processor here is what makes it live; `tests/genesis-production-composition.test.ts`
 * fails if a self-initialising processor exists that this file does not name.
 *
 * Every `initialize()` is guarded and idempotent, so this composition is
 * additive: it does not remove the existing module-scope calls and does not
 * change the behaviour of any processor that was already reachable.
 */

import { candidateService } from "./candidate/candidate-service";
import { validationEngine } from "./memory/memory-service";
import { relationshipEngine } from "./memory/relationships/relationship-service";
import { storyBuilder } from "./stories/story-builder";
import { importanceBuilder } from "./importance/importance-builder";
import { identityBuilder } from "./understanding/identity-builder";
import { understandingEngine } from "./understanding/engine";
import { insightEngine } from "./insights/insight-engine";
import { contextBuilder } from "./context/context-builder";
import { genesisRealityAdapter } from "./events/reality-adapter";

/** A cognitive processor that must be subscribed for the pipeline to flow. */
export interface GenesisProcessor {
  /** Stable identifier, used by the composition test and for diagnostics. */
  readonly name: string;
  /** Idempotent. Establishes this processor's upstream subscriptions. */
  initialize(): void;
}

/**
 * The cognitive processors of the GENESIS pipeline, in pipeline order.
 *
 * The reality adapter is listed last on purpose. It is the intake: attaching it
 * opens the platform event stream into GENESIS, and every consumer downstream of
 * it should already be subscribed when that happens. Composition is synchronous
 * and nothing publishes during it, so this is discipline rather than a live
 * race — but it is the ordering that stays correct if that ever changes.
 */
export const GENESIS_COGNITIVE_PROCESSORS: readonly GenesisProcessor[] = [
  // event -> candidate
  { name: "candidateService", initialize: () => candidateService.initialize() },
  // candidate -> validated memory
  { name: "validationEngine", initialize: () => validationEngine.initialize() },
  // memory -> memory relationships
  { name: "relationshipEngine", initialize: () => relationshipEngine.initialize() },
  // memory -> story
  { name: "storyBuilder", initialize: () => storyBuilder.initialize() },
  // memory + story -> importance
  { name: "importanceBuilder", initialize: () => importanceBuilder.initialize() },
  // story -> identity observations
  { name: "identityBuilder", initialize: () => identityBuilder.initialize() },
  // memory + story -> understanding
  { name: "understandingEngine", initialize: () => understandingEngine.initialize() },
  // understanding -> insights
  { name: "insightEngine", initialize: () => insightEngine.initialize() },
  // recall -> context package
  { name: "contextBuilder", initialize: () => contextBuilder.initialize() },

  // AKIRA OS platform event stream -> GENESIS. This is how a real user action
  // becomes cognition; see ./events/reality-adapter.ts. Attaching subscribes the
  // adapter to the instrumentation globalEventBus, which both branches of
  // `publish()` reach, so one attachment serves browser and server alike.
  { name: "realityAdapter", initialize: () => genesisRealityAdapter.attach() },
];

let composed = false;

/**
 * Activates every processor in {@link GENESIS_COGNITIVE_PROCESSORS}.
 *
 * Called once when `src/genesis/index.ts` — the entry point the application
 * imports — is evaluated, so importing GENESIS yields a wired pipeline. Safe to
 * call again: the guard below and each processor's own guard make it a no-op.
 *
 * A processor that throws must not prevent the rest of the pipeline from being
 * wired, so failures are isolated per processor and reported rather than
 * allowed to abort composition.
 */
export function initializeGenesisCognition(): void {
  if (composed) return;
  composed = true;

  for (const processor of GENESIS_COGNITIVE_PROCESSORS) {
    try {
      processor.initialize();
    } catch (err) {
      console.error(`[GENESIS] Failed to initialize processor "${processor.name}":`, err);
    }
  }
}
