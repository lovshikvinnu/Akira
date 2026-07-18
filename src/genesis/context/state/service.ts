import { CompanionState, AwarenessSnapshot, SessionIntent, FocusArea } from "./types";
import { buildCompanionState } from "./builder";
import { stateEvents } from "./events";
import { addEvidence, applyUserCorrection } from "./rules";
import type { PresenceContext } from "../../../akira-os/presence/types";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { eventBus } from "../../../shared/infrastructure/event-bus";
import { Events } from "../../../contracts/events";
import { eventService } from "../../events/event-service";
import { recallService } from "../../recall/recall-service";
import { memoryService, validationEngine } from "../../memory/memory-service";
import { Memory } from "../../validation/types";
import { registerCompanionStateProvider } from "../../../shared/genesis-provider";
import { recallBuilder } from "../../recall/recall-builder";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

class CompanionStateService {
  private currentState: CompanionState | null = null;
  private isSnapshotImmutable = false;
  private storeUnsubscribe: (() => void) | null = null;
  private latestPresenceContext: PresenceContext | null = null;
  private presenceUnsubscribe: (() => void) | null = null;

  constructor() {
    this.presenceUnsubscribe = eventBus.subscribe(Events.PRESENCE_UPDATED, (event) => {
      this.latestPresenceContext = event.payload.context;
    });
  }

  /**
   * Bootstraps the active session state.
   * Hands over context ownership from the Awareness Session snapshot to the State Engine.
   */
  public bootstrap(snapshot?: AwarenessSnapshot): CompanionState {
    // 1. Initialize GENESIS lifecycle
    validationEngine.initialize();
    recallBuilder.initialize();
    memoryService.initialize();

    const presenceContext = this.latestPresenceContext;
    if (!presenceContext) {
      throw new Error("Cannot bootstrap Companion State: Presence Engine is not initialized.");
    }

    const awarenessSnapshot = snapshot || this.compileSnapshotFromStore();

    // Instantiate initial state
    const state = buildCompanionState(awarenessSnapshot, presenceContext);

    this.currentState = state;
    this.isSnapshotImmutable = true; // Handoff completed, snapshot is now read-only

    // Publish initialization event
    stateEvents.publish("state_initialized", state);

    // Record system update
    eventService.record(
      "note_created",
      "Companion State Bootstrapped",
      `Handoff complete. Sole ownership transitioned to Companion State. Intent: ${state.currentFocus}`,
      state.activeProject?.id,
      null,
      { state },
    );

    // Subscribe to store modifications to dynamically record workspace evidence
    this.subscribeToStore();

    return state;
  }

  /**
   * Retrieve active session state context.
   */
  public getState(): CompanionState | null {
    return this.currentState;
  }

  /**
   * Evaluates if the snapshot baseline is locked.
   */
  public isSnapshotLocked(): boolean {
    return this.isSnapshotImmutable;
  }

  /**
   * Applies an explicit user correction to a state field, preserving validation trace.
   */
  public correctState(
    field: "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus",
    value: unknown,
    description: string,
  ): void {
    if (!this.currentState) {
      return;
    }

    const corrected = applyUserCorrection(this.currentState, field, value, description);
    this.currentState = corrected;

    stateEvents.publish("state_corrected", corrected);
    stateEvents.publish("state_updated", corrected);

    eventService.record(
      "note_created",
      "Companion State Corrected",
      `User correction applied to ${field}: ${description}`,
      corrected.activeProject?.id,
      null,
      { corrected },
    );
  }

  /**
   * Updates state parameters based on workspace events or conversational analysis.
   */
  public recordWorkspaceEvidence(
    field: "activeProject" | "activeGoal" | "currentDiscussion" | "currentFocus",
    value: unknown,
    description: string,
  ): void {
    if (!this.currentState) {
      return;
    }

    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
    const updated = addEvidence(this.currentState, {
      id: uid(),
      source: "workspace_event",
      timestamp: Date.now(),
      description,
      verified: false,
      targetField: field,
      value: stringValue,
    });

    this.currentState = updated;
    stateEvents.publish("state_updated", updated);
  }

  /**
   * End the current interaction session, clean working memory footprint,
   * and handover state parameters for reflection logs.
   */
  public closeSession(): CompanionState | null {
    if (!this.currentState) {
      return null;
    }

    const finalState = this.currentState;

    // Emit expiration event
    stateEvents.publish("state_expired", finalState);

    // Cleanup state
    this.currentState = null;
    this.isSnapshotImmutable = false;

    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }

    // Clean up GENESIS active subscriptions
    recallBuilder.dispose();
    validationEngine.dispose();

    return finalState;
  }

  /**
   * Generates a snapshot of the workspace state.
   */
  private compileSnapshotFromStore(): AwarenessSnapshot {
    const store = getWorkspaceProvider().getState();
    const now = Date.now();

    // Map intent category
    let intent: SessionIntent = "Unknown";
    if (store.activeSession) {
      intent = "Building";
    } else if (store.chat && store.chat.length > 0) {
      const lastMsg = store.chat[store.chat.length - 1];
      const age = now - new Date(lastMsg.createdAt).getTime();
      if (age < 15 * 60 * 1000) {
        intent = "Casual";
      }
    }

    // Resolve initial project context
    let initialProject = null;
    if (store.lastProjectId) {
      const proj = store.projects.find((p) => p.id === store.lastProjectId);
      if (proj) {
        initialProject = { id: proj.id, name: proj.name };
      }
    }

    const activeGoals = store.tasks
      .filter((t) => !t.done && (!store.lastProjectId || t.projectId === store.lastProjectId))
      .slice(0, 3)
      .map((t) => t.title);

    // Ask GENESIS for recalled memories (unidirectional pull)
    const activeCandidates = recallService
      .getRecallCandidates()
      .filter((c) => c.status === "Active");
    const memories = memoryService.getMemories();

    const relevantMemories = activeCandidates
      .map((c) => memories.find((m) => m.id === c.memoryId))
      .filter((m): m is Memory => !!m)
      .map((m) => m.description);

    const recentActivity = activeCandidates
      .map((c) => memories.find((m) => m.id === c.memoryId))
      .filter((m): m is Memory => !!m)
      .slice(0, 3)
      .map((m) => `${m.title}: ${m.description}`);

    return {
      sessionIdentifier: uid(),
      temporalReference: now,
      sessionIntent: intent,
      activeStories: [],
      activeGoals,
      relevantMemories,
      identityObservations: [],
      currentConstraints: [],
      recentActivity,
      initialProject,
    };
  }

  /**
   * Listen to store transitions to automatically trace active focus shifts.
   */
  private subscribeToStore(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }

    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
      if (!this.currentState) return;
      const store = getWorkspaceProvider().getState();

      // Check if project changed
      const lastProjId = store.lastProjectId;
      const currentProjId = this.currentState.activeProject?.id;

      if (lastProjId && lastProjId !== currentProjId) {
        const proj = store.projects.find((p) => p.id === lastProjId);
        if (proj) {
          this.recordWorkspaceEvidence(
            "activeProject",
            { id: proj.id, name: proj.name },
            `Detected workspace project switch to "${proj.name}"`,
          );
        }
      }

      // Check if active focus changed
      if (store.activeSession) {
        if (this.currentState.currentFocus !== "Building") {
          this.recordWorkspaceEvidence(
            "currentFocus",
            "Building",
            `Detected active project focus session started for task: "${store.activeSession.task || "Unspecified"}"`,
          );
        }
      }
    });
  }
}

export const companionStateService = new CompanionStateService();
export type { CompanionStateService };

registerCompanionStateProvider(() => companionStateService.getState());
