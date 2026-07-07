import { PresenceInputs, PresenceContext, SessionType } from "./types";
import { buildPresenceContext } from "./builder";
import { presenceEvents } from "./events";
import { akira } from "../../akira-store";
import { eventService } from "../../events/event-service";

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

    // Publish to local presence listeners
    presenceEvents.publish(context);

    // Record the transition event in the global event system
    eventService.record(
      "presence_updated",
      "Presence Context Resolved",
      `Resolved: ${context.returnState} during the ${context.timePeriod}`,
      context.recentProjectReference,
      null,
      { context },
    );

    // Subscribe to store updates to dynamically sync active focus & project changes
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = akira.subscribe(() => {
      if (this.currentContext) {
        const freshInputs = this.resolveInputsFromStore();
        const freshContext = buildPresenceContext(freshInputs);
        this.currentContext = freshContext;
        presenceEvents.publish(freshContext);
      }
    });

    // Run active decay timer loops
    this.startDecayMonitoring();

    return context;
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
    this.currentContext = newContext;
    presenceEvents.publish(newContext);
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
