import { ObservedHabit, HabitEvidence, HabitContext, HabitStatus } from "./types";
import { buildHabitContext } from "./builder";
import { habitEvents } from "./events";
import {
  createObservedBehavior,
  addHabitEvidence,
  evaluateHabitDecay,
  applyUserHabitCorrection,
} from "./rules";
import { akira } from "../../akira-store";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

class HabitService {
  private habits: ObservedHabit[] = [];
  private evidenceLog: HabitEvidence[] = [];
  private currentContext: HabitContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private lastProjectId: string | null | undefined = undefined;

  /**
   * Initializes the Habit Intelligence Engine.
   */
  public initialize(): HabitContext {
    this.habits = [];
    this.evidenceLog = [];
    this.lastProjectId = undefined;

    this.rebuildContext();

    // Subscribe to store updates to analyze workspace events (e.g. project changes, task completions)
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }

    const initialStoreState = akira.getState();
    this.lastProjectId = initialStoreState.lastProjectId;

    this.storeUnsubscribe = akira.subscribe(() => {
      this.processWorkspaceEvents();
    });

    return this.currentContext!;
  }

  /**
   * Returns the current compiled Habit Context.
   */
  public getContext(): HabitContext | null {
    return this.currentContext;
  }

  /**
   * Records a behavioral observation instance.
   */
  public recordBehaviorObservation(
    name: string,
    source: "presence" | "state" | "goal" | "knowledge" | "relationship",
    contextDependency?: { projectId?: string; domainId?: string; timeOfDay?: string },
  ): ObservedHabit {
    const evidenceId = uid();
    const evidence: HabitEvidence = {
      id: evidenceId,
      timestamp: Date.now(),
      description: `Observed behavior event for "${name}" via ${source}`,
      source,
      verified: false,
      contextDependency,
    };

    this.evidenceLog.push(evidence);

    const existingIndex = this.habits.findIndex(
      (h) =>
        h.name.toLowerCase() === name.toLowerCase() &&
        h.contextDependency?.projectId === contextDependency?.projectId &&
        h.contextDependency?.domainId === contextDependency?.domainId &&
        h.contextDependency?.timeOfDay === contextDependency?.timeOfDay,
    );

    if (existingIndex !== -1) {
      const previous = this.habits[existingIndex];
      const updated = addHabitEvidence(previous, evidence);
      this.habits[existingIndex] = updated;

      this.rebuildContext();
      habitEvents.publish("habit_updated", this.currentContext!, updated);
      return updated;
    } else {
      const id = uid();
      const node = createObservedBehavior(id, name, evidence);
      this.habits.push(node);

      this.rebuildContext();
      habitEvents.publish("behavior_observed", this.currentContext!, node);
      return node;
    }
  }

  /**
   * Processes explicit user corrections (Evidence Verification principle).
   */
  public correctHabit(
    id: string,
    property: "status" | "name" | "projectId" | "domainId" | "timeOfDay",
    value: string,
    explanation: string,
  ): void {
    const index = this.habits.findIndex((h) => h.id === id);
    if (index === -1) return;

    const previous = this.habits[index];
    const corrected = applyUserHabitCorrection(previous, property, value);
    this.habits[index] = corrected;

    const correctionEvidence: HabitEvidence = {
      id: uid(),
      timestamp: Date.now(),
      description: `User corrected habit property "${property}": ${explanation}`,
      source: "user_correction",
      verified: true,
    };

    this.evidenceLog.push(correctionEvidence);
    corrected.evidence.push(correctionEvidence);

    this.rebuildContext();
    habitEvents.publish("habit_corrected", this.currentContext!, corrected);
    habitEvents.publish("habit_updated", this.currentContext!, corrected);

    eventService.record(
      "note_created",
      "Habit Context Corrected",
      `User correction applied to habit "${corrected.name}": ${explanation}`,
      null,
      null,
      { corrected },
    );
  }

  /**
   * Run a decay check to transition neglected habits to HabitWeakens or HabitArchived.
   */
  public runDecayCheck(): void {
    const now = Date.now();
    let hasChanges = false;

    this.habits = this.habits.map((h) => {
      const decayed = evaluateHabitDecay(h, now);
      if (decayed.status !== h.status) {
        hasChanges = true;
      }
      return decayed;
    });

    if (hasChanges) {
      this.rebuildContext();
    }
  }

  /**
   * Analyzes state changes in the store to infer behavioral context dependencies.
   */
  private processWorkspaceEvents(): void {
    const state = akira.getState();
    const activeProject = state.lastProjectId;

    // Detect project transitions (Workspace Focus Switch)
    if (activeProject !== this.lastProjectId) {
      this.lastProjectId = activeProject;
      if (activeProject) {
        this.recordBehaviorObservation("Workspace Focus Switch", "state", {
          projectId: activeProject,
        });
      }
    }
  }

  private rebuildContext(): void {
    this.currentContext = buildHabitContext(this.habits, this.evidenceLog);
    habitEvents.publish("habit_context_updated", this.currentContext);
  }

  /**
   * Releases listeners and clears cache.
   */
  public shutdown(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.habits = [];
    this.evidenceLog = [];
    this.currentContext = null;
    this.lastProjectId = undefined;
  }
}

export const habitService = new HabitService();
export type { HabitService };
