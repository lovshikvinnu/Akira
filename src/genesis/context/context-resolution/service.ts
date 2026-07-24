import { ResolvedContext } from "./types";
import { buildResolvedContext } from "./builder";
import { contextResolutionEvents } from "./events";
import type { PresenceContext } from "../../../akira-os/presence/types";
import { eventBus } from "../../../shared/infrastructure/event-bus";
import { Events } from "../../../contracts/events";
import { companionStateService } from "../state/service";
import { stateEvents } from "../state/events";
import { goalService } from "../goals/service";
import { goalEvents } from "../goals/events";
import { knowledgeService } from "../knowledge/service";
import { knowledgeEvents } from "../knowledge/events";
import { relationshipService } from "../relationships/service";
import { relationshipEvents } from "../relationships/events";
import { habitService } from "../habits/service";
import { habitEvents } from "../habits/events";
import { reflectionService } from "../../insights/reflection/service";
import { reflectionEvents } from "../../insights/reflection/events";

class ContextResolutionService {
  private currentResolvedContext: ResolvedContext | null = null;
  private unsubscribers: (() => void)[] = [];
  private latestPresenceContext: PresenceContext | null = null;

  constructor() {
    eventBus.subscribe(Events.PRESENCE_UPDATED, (event) => {
      this.latestPresenceContext = event.payload.context;
    });
  }

  /**
   * Initializes the Context Resolution Engine and registers real-time event subscriptions
   * across all specialised Companion Intelligence engines.
   */
  public initialize(): ResolvedContext {
    this.unsubscribers = [];
    this.rebuildResolvedContext();

    // Subscribe to all upstream events to re-run coordination rules dynamically
    this.unsubscribers.push(
      eventBus.subscribe(Events.PRESENCE_UPDATED, (event) => {
        this.latestPresenceContext = event.payload.context;
        this.rebuildResolvedContext();
      }),
    );
    this.unsubscribers.push(stateEvents.subscribe(() => this.rebuildResolvedContext()));
    this.unsubscribers.push(goalEvents.subscribe(() => this.rebuildResolvedContext()));
    this.unsubscribers.push(knowledgeEvents.subscribe(() => this.rebuildResolvedContext()));
    this.unsubscribers.push(relationshipEvents.subscribe(() => this.rebuildResolvedContext()));
    this.unsubscribers.push(habitEvents.subscribe(() => this.rebuildResolvedContext()));
    this.unsubscribers.push(reflectionEvents.subscribe(() => this.rebuildResolvedContext()));

    return this.currentResolvedContext!;
  }

  /**
   * Returns the current compiled Resolved Context.
   */
  public getContext(): ResolvedContext | null {
    return this.currentResolvedContext;
  }

  /**
   * Gathers latest conceptual outputs from all active engines and executes the reconciliation rules.
   */
  public rebuildResolvedContext(): void {
    const presence = this.latestPresenceContext;
    const state = companionStateService.getState();
    const goals = goalService.getContext();
    const knowledge = knowledgeService.getContext();
    const relationships = relationshipService.getContext();
    const habits = habitService.getContext();
    const reflection = reflectionService.getContext();

    this.currentResolvedContext = buildResolvedContext(
      presence,
      state,
      goals,
      knowledge,
      relationships,
      habits,
      reflection,
    );

    contextResolutionEvents.publish("resolved_context_updated", this.currentResolvedContext);
  }

  /**
   * Releases event listeners and clears cache.
   */
  public shutdown(): void {
    this.unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        console.error("Error unsubscribing context resolution handler:", err);
      }
    });
    this.unsubscribers = [];
    this.currentResolvedContext = null;
  }
}

export const contextResolutionService = new ContextResolutionService();
export type { ContextResolutionService };
