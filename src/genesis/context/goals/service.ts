import { Goal, GoalContext, GoalEvidence, GoalStatus } from "./types";
import { buildGoalContext } from "./builder";
import { goalEvents } from "./events";
import { createGoal, updateGoalStatus, updateGoalProgress, applyUserCorrection } from "./rules";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * ORPHANED, and the third engine in this shape.
 *
 * `__root.tsx` calls `initialize()` and `context-resolution/service.ts` reads
 * `getContext()`, so it is wired at both ends. What is missing is the middle:
 * `addGoal` is the only way a Goal enters this registry and nothing outside
 * this module calls it. Measured on a workspace with a live project, two
 * completed tasks and a stated aspiration, `goalContext.basis` was still 0.
 *
 * The user does not lose goals to this. The prompt's Goals block is built by
 * `contextRules.extractGoals` from project arcs and identity aspirations, a
 * different path entirely -- on that same workspace it printed
 * "Complete Project Arc: Kitchen Renovation (Reason: Active project)" and
 * "become a commercial pilot (Reason: Stated aspiration)". So this is duplicate
 * architecture rather than a hole: two goal models, one of them fed.
 *
 * It no longer manufactures certainty. `buildGoalContext` still computes 1.0 as
 * the mean of an empty set, but it reports `basis: activeGoals.length` beside
 * it and every aggregate skips a zero-basis engine, so an empty registry
 * contributes nothing rather than maximum confidence.
 *
 * ACTIVATION BOUNDARY: a caller for `addGoal`. Whoever writes one is deciding
 * which goal model the product means -- this registry, the identity graph's
 * aspirations, or the story-derived arcs `extractGoals` already reads. That is
 * a cognitive-model decision, not a missing wire, which is why it is recorded
 * here rather than resolved.
 *
 * See `context/knowledge/service.ts` and `context/relationships/service.ts` for
 * the same finding in the other two.
 */
class GoalService {
  private goals: Goal[] = [];
  private evidenceLog: GoalEvidence[] = [];
  private currentContext: GoalContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  /**
   * Initializes the Goal Engine, synchronizing with the active workspace tasks.
   */
  public initialize(): GoalContext {
    this.goals = [];
    this.evidenceLog = [];

    // Bootstrap initial goals from store
    this.syncFromStore(true);

    // Subscribe to store modifications to keep workspace milestones aligned
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
      this.syncFromStore(false);
    });

    return this.currentContext!;
  }

  /**
   * Retrieve active Goal Context.
   */
  public getContext(): GoalContext | null {
    return this.currentContext;
  }

  /**
   * Manually append a new tracking goal.
   */
  public addGoal(title: string, description: string, parentId: string | null = null): Goal {
    const id = uid();
    const goal = createGoal(id, title, description, parentId);
    this.goals.push(goal);

    this.evidenceLog.push({
      id: uid(),
      source: "companion_state",
      timestamp: Date.now(),
      description: `Goal manually created: "${title}"`,
      verified: false,
      goalId: id,
      targetProperty: "status",
      value: "Created",
    });

    this.rebuildContext();
    goalEvents.publish("goal_created", this.currentContext!, goal);
    return goal;
  }

  /**
   * Updates goal status.
   */
  public setGoalStatus(id: string, status: GoalStatus): void {
    const index = this.goals.findIndex((g) => g.id === id);
    if (index === -1) return;

    const previous = this.goals[index];
    const updated = updateGoalStatus(previous, status);
    this.goals[index] = updated;

    this.evidenceLog.push({
      id: uid(),
      source: "companion_state",
      timestamp: Date.now(),
      description: `Goal status transitioned from ${previous.status} to ${status}`,
      verified: false,
      goalId: id,
      targetProperty: "status",
      value: status,
    });

    this.rebuildContext();
    goalEvents.publish("goal_updated", this.currentContext!, updated);

    if (status === "Completed") {
      goalEvents.publish("goal_completed", this.currentContext!, updated);
    }
  }

  /**
   * Updates goal progress.
   */
  public setGoalProgress(id: string, percentage: number): void {
    const index = this.goals.findIndex((g) => g.id === id);
    if (index === -1) return;

    const previous = this.goals[index];
    const updated = updateGoalProgress(previous, percentage);
    this.goals[index] = updated;

    this.evidenceLog.push({
      id: uid(),
      source: "workspace_event",
      timestamp: Date.now(),
      description: `Goal progress updated to ${percentage}%`,
      verified: false,
      goalId: id,
      targetProperty: "progressPercentage",
      value: String(percentage),
    });

    this.rebuildContext();
    goalEvents.publish("goal_updated", this.currentContext!, updated);

    if (updated.status === "Completed" && previous.status !== "Completed") {
      goalEvents.publish("goal_completed", this.currentContext!, updated);
    }
  }

  /**
   * Applies an explicit user correction to a target goal.
   * Treats correction as verified evidence, setting confidence to 1.0.
   */
  public correctGoal(
    id: string,
    property:
      | "status"
      | "progressPercentage"
      | "blockers"
      | "prerequisites"
      | "title"
      | "description"
      | "supportedTaskIds",
    value: string,
    description: string,
  ): void {
    const index = this.goals.findIndex((g) => g.id === id);
    if (index === -1) return;

    const previous = this.goals[index];
    const corrected = applyUserCorrection(previous, property, value);
    this.goals[index] = corrected;

    this.evidenceLog.push({
      id: uid(),
      source: "user_correction",
      timestamp: Date.now(),
      description: `User corrected ${property}: ${description}`,
      verified: true,
      goalId: id,
      targetProperty: property,
      value,
    });

    this.rebuildContext();
    goalEvents.publish("goal_corrected", this.currentContext!, corrected);
    goalEvents.publish("goal_updated", this.currentContext!, corrected);

    eventService.record(
      "note_created",
      "Goal Corrected",
      `Goal "${corrected.title}" correction registered: ${description}`,
      corrected.parentId,
      null,
      { corrected },
    );
  }

  /**
   * Synchronizes active goals with the current global store tasks.
   * Contributes to goal progress if goals are supported by tasks.
   * Tasks are NEVER automatically promoted to Goals, and Goals are NEVER implicitly created from Tasks.
   */
  private syncFromStore(isInitial: boolean): void {
    const store = getWorkspaceProvider().getState();
    let hasChanges = false;

    this.goals.forEach((goal, index) => {
      if (goal.supportedTaskIds && goal.supportedTaskIds.length > 0) {
        // Find tasks supporting this goal
        const supportingTasks = store.tasks.filter((t) => goal.supportedTaskIds.includes(t.id));
        if (supportingTasks.length > 0) {
          const completedTasksCount = supportingTasks.filter((t) => t.completed || t.done).length;
          const calculatedProgress = Math.round(
            (completedTasksCount / supportingTasks.length) * 100,
          );

          if (goal.progressPercentage !== calculatedProgress) {
            const previous = goal;
            const updated = updateGoalProgress(previous, calculatedProgress);
            this.goals[index] = updated;
            hasChanges = true;

            if (!isInitial) {
              this.evidenceLog.push({
                id: uid(),
                source: "workspace_event",
                timestamp: Date.now(),
                description: `Goal progress calculated from supporting tasks: ${completedTasksCount}/${supportingTasks.length} done (${calculatedProgress}%)`,
                verified: false,
                goalId: goal.id,
                targetProperty: "progressPercentage",
                value: String(calculatedProgress),
              });
            }
          }
        }
      }
    });

    if (hasChanges || isInitial) {
      this.rebuildContext();
    }
  }

  private rebuildContext(): void {
    this.currentContext = buildGoalContext(this.goals, this.evidenceLog);
    goalEvents.publish("goal_context_updated", this.currentContext);
  }

  /**
   * Release subscriptions.
   */
  public shutdown(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.goals = [];
    this.evidenceLog = [];
    this.currentContext = null;
  }
}

export const goalService = new GoalService();
export type { GoalService };
