import { ObservedHabit, HabitEvidence, HabitContext, HabitStatus } from "./types";
import { buildHabitContext } from "./builder";
import { habitEvents } from "./events";
import {
  createObservedBehavior,
  addHabitEvidence,
  evaluateHabitDecay,
  applyUserHabitCorrection,
} from "./rules";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Observed workspace patterns, for the current session only.
 *
 * `initialize()` clears `habits` and `evidenceLog`, nothing persists them, and
 * that is the intended shape rather than a gap. Recorded here because the
 * architecture documents say the opposite and the next reader will find them
 * first.
 *
 * WHY SESSION-SCOPED IS RIGHT DESPITE THE DOCS
 * --------------------------------------------
 * Long-term habits already exist and already survive a restart -- in the
 * identity tier, not here. A habit the user *declares* ("I run every morning",
 * written as a note) reaches `PersonalDeclarationRule`, which calls
 * `identityFoundationService.createHabit`. Identity is re-derived from the
 * durable `genesis_memories` stream on every boot, so it comes back. Measured
 * across a hydrate + clear-then-replay:
 *
 *     identity habits (declared)  ['run']                     -> ['run']
 *     context habits  (observed)  ['Workspace Focus Switch']   -> []
 *
 * The two tiers are complementary, not duplicates: identity holds what the user
 * says about themselves, this holds what the workspace did this session.
 * Persisting this one would build a second long-term habit store beside a
 * working one.
 *
 * `06-habit-intelligence.md` does describe a long-term engine -- "patterns
 * spanning multiple weeks", "extended verification windows", a status ladder
 * running to `HabitEstablished`. That half was never built, and two things in
 * the same document say why it cannot be built here as written:
 *
 *   - §3 forbids it: "Create Memories: It does not log persistent history event
 *     nodes." An engine prohibited from writing durable state cannot be rebuilt
 *     from one.
 *   - §5 sources its cross-session evidence from "Archived Reflection
 *     Outcomes... from earlier sessions". Reflection has no production
 *     producer -- only `initialize`, `getContext` and `shutdown` are ever
 *     called -- so that input is empty. ADR-011, which says the same, is still
 *     status `Proposed`.
 *
 * So the ladder above `BehaviorObserved` is unreachable today, and closing that
 * gap is a product decision about where long-term habits should live rather
 * than a persistence bug to fix here.
 */
class HabitService {
  private habits: ObservedHabit[] = [];
  private evidenceLog: HabitEvidence[] = [];
  private currentContext: HabitContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private lastProjectId: string | null | undefined = undefined;
  /** Whether `lastProjectId` reflects restored state rather than the seed. */
  private baselineRestored = false;

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

    const initialStoreState = getWorkspaceProvider().getState();
    this.lastProjectId = initialStoreState.lastProjectId;
    this.baselineRestored = getWorkspaceProvider().isHydrated?.() ?? true;

    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
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
    const provider = getWorkspaceProvider();
    const state = provider.getState();
    const activeProject = state.lastProjectId;

    // Restoring persisted state is not the user switching focus. `__root.tsx`
    // initializes this engine synchronously at boot, against the unhydrated
    // seed (`lastProjectId: null`), and hydration then lands the persisted
    // project in one emission -- which read as a switch and recorded a habit
    // on every start. Until the provider has hydrated, and on the emission
    // that hydrates it, the project is taken as the baseline instead. No user
    // action can precede that: routes render only once the store is hydrated.
    if (!this.baselineRestored) {
      this.lastProjectId = activeProject;
      this.baselineRestored = provider.isHydrated?.() ?? true;
      return;
    }

    // Detect project transitions (Workspace Focus Switch)
    if (activeProject !== this.lastProjectId) {
      const previous = this.lastProjectId;
      this.lastProjectId = activeProject;

      // Reassignment after a delete is reconciliation, not behaviour.
      //
      // `akira.deleteProject` removes the project and, when it was the active
      // one, picks a survivor as `lastProjectId` in the SAME emission. The
      // engine saw only "active project changed" and recorded the user
      // switching focus -- but the user deleted something, and the new project
      // was chosen by the store, not by them. A habit built from that says the
      // user works on a project they may never have opened.
      //
      // The signal is the deleted project itself: on that emission `previous`
      // has already gone from `state.projects`, and on every deliberate switch
      // it is still there. `touchProject` and `addProject` move
      // `lastProjectId` while leaving the old project in place, so they are
      // unaffected; boot is already handled by the baseline branch above.
      //
      // Keyed on the previous id rather than on the habit's name, so nothing
      // here depends on how the observation happens to be labelled.
      const previousWasDeleted = previous != null && !state.projects.some((p) => p.id === previous);

      if (activeProject && !previousWasDeleted) {
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
    this.baselineRestored = false;
  }
}

export const habitService = new HabitService();
export type { HabitService };
