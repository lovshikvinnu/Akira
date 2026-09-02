import { PresenceInputs, PresenceContext, SessionType } from "./types";
import { buildPresenceContext } from "./builder";
import { akira } from "../../persistence/akira-store";
import { publish } from "../../instrumentation";
import { Events } from "../../contracts/events";

/**
 * Returns a presence context safe to put on the platform bus.
 *
 * `evidence` carries optional fields, and an absent one is `undefined`. The
 * platform's serialization middleware rejects `undefined` anywhere in a
 * payload — reasonably, since the value cannot survive a round trip through the
 * event store. The legacy bus performed no such validation, so this only became
 * visible when presence moved onto the platform bus: without it,
 * presenceService.initialize() throws and application startup fails.
 *
 * Omitting the keys rather than nulling them keeps the shape consumers already
 * read: an absent optional and an `undefined` one are indistinguishable to them.
 */
function toSerializablePresenceContext(context: PresenceContext): PresenceContext {
  const { evidence, ...rest } = context;
  const serializableEvidence: PresenceContext["evidence"] = {
    currentSessionStart: evidence.currentSessionStart,
  };

  if (evidence.lastSessionEnd !== undefined) {
    serializableEvidence.lastSessionEnd = evidence.lastSessionEnd;
  }
  if (evidence.lastEventTime !== undefined) {
    serializableEvidence.lastEventTime = evidence.lastEventTime;
  }
  if (evidence.recentProjectId !== undefined) {
    serializableEvidence.recentProjectId = evidence.recentProjectId;
  }

  return { ...rest, evidence: serializableEvidence };
}

class PresenceService {
  private currentContext: PresenceContext | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  /**
   * Initialize the Presence Context.
   * Hydrates state parameters using store statistics if inputs are not explicitly supplied.
   */
  public initialize(inputs?: PresenceInputs): PresenceContext {
    const presenceInputs = inputs || this.resolveInputsFromStore();
    const context = buildPresenceContext(presenceInputs);
    this.currentContext = context;

    this.announcePresence(context);

    // Subscribe to store updates to dynamically sync active focus & project changes
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = akira.subscribe(() => {
      if (this.currentContext) {
        const freshInputs = this.resolveInputsFromStore();
        const freshContext = buildPresenceContext(freshInputs);
        if (this.isContextChanged(this.currentContext, freshContext)) {
          this.currentContext = freshContext;
          this.announcePresence(freshContext);
        }
      }
    });

    // Run active decay decay timer loops
    this.startDecayMonitoring();

    return context;
  }

  /**
   * Announces a presence transition on the platform event bus.
   *
   * Delivery is synchronous, and the bootstrap invariant depends on that:
   * consumers cache the context as it arrives, and
   * companionStateService.bootstrap() throws if it has not seen one by the time
   * it runs. presenceService.initialize() is called before bootstrap() in
   * routes/__root.tsx precisely for this reason.
   */
  private announcePresence(context: PresenceContext): void {
    publish({
      type: Events.PRESENCE_UPDATED,
      source: "presence-service",
      payload: { context: toSerializablePresenceContext(context) },
      version: 1,
      // Momentary state rather than a durable fact, and it fires on every store
      // change plus the decay timer: PersistenceSubscriber skips it.
      transient: true,
    });
  }

  private isContextChanged(prev: PresenceContext | null, next: PresenceContext): boolean {
    if (!prev) return true;
    return (
      prev.sessionType !== next.sessionType ||
      prev.returnState !== next.returnState ||
      prev.timePeriod !== next.timePeriod ||
      prev.firstSessionToday !== next.firstSessionToday ||
      prev.resumedConversation !== next.resumedConversation ||
      prev.recentProjectReference !== next.recentProjectReference ||
      prev.unusualAccessTime !== next.unusualAccessTime ||
      prev.continuityConfidence !== next.continuityConfidence ||
      prev.presenceConfidence !== next.presenceConfidence
    );
  }

  /**
   * Retrieve the active Presence Context.
   */
  public getContext(): PresenceContext | null {
    return this.currentContext;
  }

  /**
   * Re-evaluates presence metrics in response to user actions or passage of time.
   */
  public updatePresenceConfidence(lastEventTime: number): void {
    if (!this.currentContext) {
      return;
    }

    const currentRef = Date.now();
    const lastSessionStart =
      this.currentContext.evidence.lastSessionEnd !== undefined
        ? this.currentContext.evidence.currentSessionStart - this.currentContext.absenceDuration
        : undefined;

    const inputs: PresenceInputs = {
      currentTemporalReference: currentRef,
      lastSessionEndReference: this.currentContext.evidence.lastSessionEnd,
      lastSessionStartReference: lastSessionStart,
      lastEventTemporalReference: lastEventTime,
      hasPriorHistory: true,
      recentProjectId: this.currentContext.recentProjectReference,
      activeSessionType: this.currentContext.sessionType,
      localHourOfDay: new Date(currentRef).getHours(),
    };

    const newContext = buildPresenceContext(inputs);
    if (this.isContextChanged(this.currentContext, newContext)) {
      this.currentContext = newContext;
      this.announcePresence(newContext);
    }
  }

  /**
   * Fetches database parameters dynamically to construct initial PresenceInputs.
   */
  private resolveInputsFromStore(): PresenceInputs {
    const storeState = akira.getState();
    const now = Date.now();
    const localHour = new Date(now).getHours();

    const hasPriorHistory =
      (storeState.sessions && storeState.sessions.length > 0) ||
      (storeState.memories && storeState.memories.length > 0) ||
      (storeState.chat && storeState.chat.length > 0);

    let lastSessionEnd: number | undefined;
    let lastSessionStart: number | undefined;

    if (storeState.sessions && storeState.sessions.length > 0) {
      const lastSession = storeState.sessions[0];
      lastSessionEnd = new Date(lastSession.endedAt).getTime();
      lastSessionStart = new Date(lastSession.startedAt).getTime();
    }

    // Determine the last activity moment across event streams
    let lastEventTime = lastSessionEnd;
    if (storeState.memories && storeState.memories.length > 0) {
      const latestMemTime = new Date(storeState.memories[0].timestamp).getTime();
      if (lastEventTime === undefined || latestMemTime > lastEventTime) {
        lastEventTime = latestMemTime;
      }
    }
    if (storeState.chat && storeState.chat.length > 0) {
      const latestChatTime = new Date(
        storeState.chat[storeState.chat.length - 1].createdAt,
      ).getTime();
      if (lastEventTime === undefined || latestChatTime > lastEventTime) {
        lastEventTime = latestChatTime;
      }
    }

    // Resolve current session focus modality
    let activeSessionType: SessionType = "Unknown";
    if (storeState.activeSession) {
      activeSessionType = "Focus";
    } else if (storeState.chat && storeState.chat.length > 0) {
      const lastMsg = storeState.chat[storeState.chat.length - 1];
      const timeSinceLastMsg = now - new Date(lastMsg.createdAt).getTime();
      if (timeSinceLastMsg < 5 * 60 * 1000) {
        activeSessionType = "Chat";
      } else {
        activeSessionType = "Idle";
      }
    }

    return {
      currentTemporalReference: now,
      lastSessionEndReference: lastSessionEnd,
      lastSessionStartReference: lastSessionStart,
      lastEventTemporalReference: lastEventTime,
      hasPriorHistory,
      recentProjectId: storeState.lastProjectId,
      activeSessionType,
      localHourOfDay: localHour,
    };
  }

  /**
   * Background monitoring of confidence decay curves.
   */
  private startDecayMonitoring(): void {
    this.stopDecayMonitoring();
    this.timerId = setInterval(() => {
      if (this.currentContext) {
        const lastEvent = this.currentContext.evidence.lastEventTime || Date.now();
        this.updatePresenceConfidence(lastEvent);
      }
    }, 30000); // update every 30 seconds
  }

  private stopDecayMonitoring(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Wind down timers and release state objects.
   */
  public shutdown(): void {
    this.stopDecayMonitoring();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.currentContext = null;
  }
}

export const presenceService = new PresenceService();
export type { PresenceService };
