import { InitiativeDecision, InitiativeOutcome } from "./types";
import { buildInitiativeDecision } from "./builder";
import { applyUserInitiativeCorrection } from "./rules";
import { initiativeEvents } from "./events";
import { contextResolutionService } from "../context-resolution/service";
import { contextResolutionEvents } from "../context-resolution/events";
import { eventService } from "../../events/event-service";

class InitiativeService {
  private currentDecision: InitiativeDecision | null = null;
  private unsubscriber: (() => void) | null = null;

  /**
   * Initializes the Initiative Engine and subscribes to Context Resolution events.
   */
  public initialize(): InitiativeDecision {
    this.reevaluateInitiative();

    // Re-evaluate whenever Context Resolution finishes resolving contexts
    if (this.unsubscriber) {
      this.unsubscriber();
    }
    this.unsubscriber = contextResolutionEvents.subscribe(() => {
      this.reevaluateInitiative();
    });

    return this.currentDecision!;
  }

  /**
   * Retrieves the current Initiative Decision.
   */
  public getDecision(): InitiativeDecision | null {
    return this.currentDecision;
  }

  /**
   * Evaluates the latest Resolved Context to select the current Initiative Decision.
   */
  public reevaluateInitiative(): void {
    const resolved = contextResolutionService.getContext();
    this.currentDecision = buildInitiativeDecision(resolved);

    initiativeEvents.publish("initiative_decision_evaluated", this.currentDecision);
  }

  /**
   * Applies an explicit user correction or override to the current initiative decision.
   */
  public correctDecision(outcome: InitiativeOutcome, explanation: string): void {
    if (!this.currentDecision) {
      this.reevaluateInitiative();
    }

    const corrected = applyUserInitiativeCorrection(this.currentDecision!, outcome, explanation);
    this.currentDecision = corrected;

    // Record verified interaction trace log
    eventService.record(
      "presence_updated",
      "Initiative Decision Corrected",
      `User corrected initiative decision: ${explanation}`,
      null,
      null,
      { correctedOutcome: outcome, explanation },
    );

    initiativeEvents.publish("initiative_decision_corrected", corrected);
  }

  /**
   * Releases subscriptions and cleans cached decisions.
   */
  public shutdown(): void {
    if (this.unsubscriber) {
      this.unsubscriber();
      this.unsubscriber = null;
    }
    this.currentDecision = null;
  }
}

export const initiativeService = new InitiativeService();
export type { InitiativeService };
