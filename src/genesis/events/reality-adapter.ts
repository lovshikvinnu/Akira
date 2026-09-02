/**
 * GENESIS Reality Adapter — the boundary between the AKIRA OS platform event
 * stream and GENESIS cognition.
 *
 *   AKIRA OS ──► instrumentation globalEventBus ──► RealityAdapter ──► eventService.record()
 *
 * GENESIS has always needed a translation step: the platform speaks
 * `AkiraEvent` (an envelope with id, source, correlationId) while cognition
 * speaks `MemoryEvent` (a titled, described, project-linked occurrence). That
 * step already existed inside `event-service.ts`, attached to the legacy bus —
 * the bus no workspace event is ever published on. This module is the same
 * translation, attached to the bus that carries reality, with the identity,
 * idempotency and failure isolation a boundary needs.
 *
 * DORMANT BY DESIGN
 * -----------------
 * Nothing here runs unless something calls `attach()`. This module deliberately
 * does NOT self-register at import, is NOT part of `genesis/composition.ts`,
 * and is NOT exported from `genesis/index.ts`. Importing it has no effect on a
 * running application. Activation is a later phase's decision, made once the
 * dual-run measurement has shown what actually flows.
 *
 * Attaching it is therefore an explicit, reversible act — which is what lets
 * the tests drive a real OS action end to end without changing production.
 *
 * ONE-WAY BY CONSTRUCTION
 * -----------------------
 * This module imports the bus only to subscribe to it. It never calls
 * `publish()` and holds no reference to a publisher, so a cognitive cycle
 * cannot feed itself. `saveMemory()` writes to the store without republishing,
 * so there is no indirect return edge either.
 */

import { AkiraEvent } from "../../instrumentation/event-types";
import { EventSubscriber } from "../../instrumentation/subscriber";
import { EventBus, globalEventBus } from "../../instrumentation/event-bus";
import { eventService } from "./event-service";
import { translatePlatformEvent, SUPPORTED_PLATFORM_EVENT_TYPES } from "./event-translation";
import { MemoryEvent } from "../../shared/types/event-types";

/** Stable identity on the bus. Also how a duplicate registration is detected. */
export const REALITY_ADAPTER_ID = "genesis-reality-adapter";

/**
 * How many delivered event ids to remember for duplicate suppression.
 *
 * Bounded on purpose: the adapter is long-lived and the platform stream is
 * unbounded, so an ever-growing set would be a slow leak. Replay and retry both
 * redeliver recent events, so recency is the property that matters.
 */
const DEFAULT_SEEN_LIMIT = 5000;

export interface RealityAdapterMetrics {
  /** Events delivered to `onEvent`, whatever their type. */
  received: number;
  /** Events translated and handed to `eventService.record()`. */
  translated: number;
  /** Events skipped because GENESIS has no interpretation for the type. */
  ignored: number;
  /** Events skipped because their `AkiraEvent.id` was already processed. */
  duplicatesSuppressed: number;
  /** Events whose translation or recording threw. */
  failed: number;
  /** The most recent failure, for diagnosis. */
  lastError: { eventId: string; eventType: string; message: string } | null;
  /** Event types seen but not understood, with counts. */
  ignoredTypes: Record<string, number>;
}

export class GenesisRealityAdapter implements EventSubscriber {
  readonly id = REALITY_ADAPTER_ID;

  private bus: EventBus | null = null;
  private readonly seen = new Set<string>();
  private readonly seenLimit: number;

  private received = 0;
  private translated = 0;
  private ignored = 0;
  private duplicatesSuppressed = 0;
  private failed = 0;
  private lastError: RealityAdapterMetrics["lastError"] = null;
  private ignoredTypes = new Map<string, number>();

  constructor(seenLimit: number = DEFAULT_SEEN_LIMIT) {
    this.seenLimit = seenLimit;
  }

  /** Platform event types this adapter can interpret. */
  static get supportedTypes(): readonly string[] {
    return SUPPORTED_PLATFORM_EVENT_TYPES;
  }

  /**
   * Subscribes to a platform event bus. Explicit by design — see the dormancy
   * note above.
   *
   * Idempotent in two independent ways: this method returns early when already
   * attached, and the bus stores subscribers in a Set keyed by object identity,
   * so even a bypassed guard cannot produce a second delivery.
   */
  attach(bus: EventBus = globalEventBus): void {
    if (this.bus === bus) return;
    if (this.bus) this.detach();

    bus.subscribe(this);
    this.bus = bus;
  }

  /** Unsubscribes. Safe to call when not attached. */
  detach(): void {
    if (!this.bus) return;
    this.bus.unsubscribe(this);
    this.bus = null;
  }

  isAttached(): boolean {
    return this.bus !== null;
  }

  /**
   * Receives one platform event.
   *
   * Never throws. A fault in translation or in GENESIS is recorded and
   * swallowed here so that the publisher and every peer subscriber — the
   * persistence writer and the Timeline among them — are unaffected by a
   * cognitive failure. The bus applies its own try/catch as well; this is the
   * inner guard that also produces a usable metric.
   */
  onEvent(event: AkiraEvent): void {
    this.received += 1;

    try {
      if (this.seen.has(event.id)) {
        this.duplicatesSuppressed += 1;
        return;
      }

      const translated = translatePlatformEvent(event.type, event.payload);
      if (!translated) {
        this.ignored += 1;
        this.ignoredTypes.set(event.type, (this.ignoredTypes.get(event.type) ?? 0) + 1);
        return;
      }

      // Marked before recording so that a throw inside GENESIS cannot cause the
      // same event to be reprocessed on redelivery.
      this.remember(event.id);

      eventService.record(
        translated.eventType,
        translated.title,
        translated.description,
        translated.relatedProjectId,
        translated.relatedNoteId,
        this.buildMetadata(event),
      );

      this.translated += 1;
    } catch (err) {
      this.failed += 1;
      this.lastError = {
        eventId: event?.id ?? "<unknown>",
        eventType: event?.type ?? "<unknown>",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Carries the platform envelope through as MemoryEvent metadata.
   *
   * The payload is spread at the top level because that is the shape the
   * existing candidate rules read (`metadata.patch`, `metadata.title`). The
   * provenance fields are namespaced under `platformEvent` so they cannot
   * collide with a payload key.
   */
  private buildMetadata(event: AkiraEvent): Record<string, unknown> {
    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};

    return {
      ...payload,
      platformEvent: {
        id: event.id,
        type: event.type,
        source: event.source,
        timestamp: event.timestamp,
        correlationId: event.correlationId ?? null,
      },
    };
  }

  /** Records an id for duplicate suppression, evicting the oldest when full. */
  private remember(eventId: string): void {
    this.seen.add(eventId);
    if (this.seen.size > this.seenLimit) {
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
  }

  getMetrics(): RealityAdapterMetrics {
    return {
      received: this.received,
      translated: this.translated,
      ignored: this.ignored,
      duplicatesSuppressed: this.duplicatesSuppressed,
      failed: this.failed,
      lastError: this.lastError,
      ignoredTypes: Object.fromEntries(this.ignoredTypes),
    };
  }

  /** Clears counters and duplicate-suppression state. Does not detach. */
  reset(): void {
    this.seen.clear();
    this.received = 0;
    this.translated = 0;
    this.ignored = 0;
    this.duplicatesSuppressed = 0;
    this.failed = 0;
    this.lastError = null;
    this.ignoredTypes = new Map();
  }
}

/**
 * Shared instance for a future phase to attach.
 *
 * Constructing it is inert — no subscription is created until `attach()` is
 * called. Tests that need isolation should build their own instance rather than
 * reusing this one.
 */
export const genesisRealityAdapter = new GenesisRealityAdapter();

/** Re-exported so callers need not reach into the translation module. */
export type { MemoryEvent };
