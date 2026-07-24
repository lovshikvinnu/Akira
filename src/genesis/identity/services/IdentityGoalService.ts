import {
  IdentityGoal,
  GoalCategory,
  GoalPriority,
  GoalStatus,
  IdentityNode,
  IdentityEvidence,
} from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { identityGraphService } from "./IdentityGraphService";
import { identityEvidenceService } from "./IdentityEvidenceService";
import { identityConfidenceService } from "./IdentityConfidenceService";
import { identityEvolutionService } from "./IdentityEvolutionService";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class IdentityGoalService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
  }

  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
  }

  public getRepository(): IdentityRepository {
    return this.repository;
  }

  public getGoals(identityId: string): IdentityGoal[] {
    return this.repository.getGoals(identityId);
  }

  public getGoal(goalId: string): IdentityGoal | null {
    return this.repository.getGoal(goalId);
  }

  public createGoal(
    identityId: string,
    title: string,
    description: string,
    category: GoalCategory,
    priority: GoalPriority,
    initialEvidenceIds?: string[],
  ): IdentityGoal {
    // 1. Represent Goal as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Goal", title, {
      category,
      priority,
      description,
    });

    const evidenceIds = initialEvidenceIds || [];
    
    // Link initial evidence
    for (const evId of evidenceIds) {
      identityEvidenceService.linkEvidenceToNode(node.id, evId);
    }

    // 2. Compute confidence
    identityConfidenceService.calculateConfidence(node.id);

    const goalId = uid();
    const now = new Date().toISOString();

    const goal: IdentityGoal = {
      id: goalId,
      identityId,
      title,
      description,
      category,
      priority,
      status: "Active",
      confidenceReference: node.id,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastUpdated: now,
    };

    this.repository.saveGoal(goal);

    // 3. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Created goal: "${title}"`,
      1.0,
      "NodeAdded",
      goalId,
      `Created goal "${title}" under category "${category}" with priority "${priority}"`,
    );

    eventService.record(
      Events.IDENTITY_GOAL_CREATED as any,
      "Identity Goal Created",
      `Created goal: ${title} [${category}]`,
      null,
      null,
      { goal },
    );

    return goal;
  }

  public updateGoal(
    goalId: string,
    patch: Partial<Omit<IdentityGoal, "id" | "identityId">>,
  ): IdentityGoal | null {
    const goal = this.repository.getGoal(goalId);
    if (!goal) return null;

    const title = patch.title !== undefined ? patch.title : goal.title;
    const description = patch.description !== undefined ? patch.description : goal.description;
    const category = patch.category !== undefined ? patch.category : goal.category;
    const priority = patch.priority !== undefined ? patch.priority : goal.priority;
    const status = patch.status !== undefined ? patch.status : goal.status;
    const evidenceIds = patch.evidenceReferences !== undefined ? patch.evidenceReferences : goal.evidenceReferences;

    const hasSignificantShift = goal.status !== status || goal.priority !== priority;

    const now = new Date().toISOString();
    const updated: IdentityGoal = {
      ...goal,
      title,
      description,
      category,
      priority,
      status,
      evidenceReferences: evidenceIds,
      lastUpdated: now,
    };

    // Update graph Goal node details
    identityGraphService.updateIdentityNode(goal.confidenceReference, {
      value: title,
      metadata: { category, priority, description },
    });

    // Sync node evidence links
    const node = this.repository.getNode(goal.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updateGoal(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        goal.identityId,
        `Goal "${title}" updated`,
        1.0,
        "NodeUpdated",
        goalId,
        `Goal status shifted to "${status}" and priority to "${priority}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_GOAL_UPDATED as any,
      "Identity Goal Updated",
      `Updated goal topic: ${title}`,
      null,
      null,
      { goal: updated, patch },
    );

    return updated;
  }

  public archiveGoal(goalId: string): boolean {
    const goal = this.repository.getGoal(goalId);
    if (!goal) return false;

    this.updateGoal(goalId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_GOAL_ARCHIVED as any,
      "Identity Goal Archived",
      `Archived goal: ${goal.title}`,
      null,
      null,
      { goalId },
    );

    return true;
  }
}

export const identityGoalService = new IdentityGoalService();
