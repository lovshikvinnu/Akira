import {
  IdentityHabit,
  HabitFrequency,
  HabitStatus,
  HabitStrength,
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

export class IdentityHabitService {
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
    identityGraphService.setRepository(repository);
  }

  public getRepository(): IdentityRepository {
    return this.repository;
  }

  public getHabits(identityId: string): IdentityHabit[] {
    return this.repository.getHabits(identityId);
  }

  public getHabit(habitId: string): IdentityHabit | null {
    return this.repository.getHabit(habitId);
  }

  public createHabit(
    identityId: string,
    name: string,
    frequency: HabitFrequency,
    initialEvidenceIds?: string[],
  ): IdentityHabit {
    // 1. Represent Habit as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Habit", name, {
      frequency,
    });

    const evidenceIds = initialEvidenceIds || [];
    
    // Link initial evidence
    for (const evId of evidenceIds) {
      identityEvidenceService.linkEvidenceToNode(node.id, evId);
    }

    // 2. Fetch linked evidence weights to calculate deterministic strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const habitScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));
    
    let strengthLevel: "Weak" | "Establishing" | "Strong" | "Automatic" = "Weak";
    if (habitScore <= 0.25) {
      strengthLevel = "Weak";
    } else if (habitScore <= 0.55) {
      strengthLevel = "Establishing";
    } else if (habitScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Automatic";
    }

    // 3. Compute initial confidence
    identityConfidenceService.calculateConfidence(node.id);

    const habitId = uid();
    const now = new Date().toISOString();

    const habit: IdentityHabit = {
      id: habitId,
      identityId,
      name,
      frequency,
      strength: {
        score: habitScore,
        level: strengthLevel,
        updatedAt: now,
      },
      status: "Active",
      confidenceReference: node.id,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastObserved: now,
    };

    this.repository.saveHabit(habit);

    // 4. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Created habit: "${name}"`,
      habitScore,
      "NodeAdded",
      habitId,
      `Created habit "${name}" with frequency "${frequency}" and strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_HABIT_CREATED as any,
      "Identity Habit Created",
      `Created habit: ${name} [${frequency}]`,
      null,
      null,
      { habit },
    );

    return habit;
  }

  public updateHabit(
    habitId: string,
    patch: Partial<Omit<IdentityHabit, "id" | "identityId">>,
  ): IdentityHabit | null {
    const habit = this.repository.getHabit(habitId);
    if (!habit) return null;

    const name = patch.name !== undefined ? patch.name : habit.name;
    const frequency = patch.frequency !== undefined ? patch.frequency : habit.frequency;
    const status = patch.status !== undefined ? patch.status : habit.status;
    const evidenceIds = patch.evidenceReferences !== undefined ? patch.evidenceReferences : habit.evidenceReferences;

    // Recalculate strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const habitScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));
    
    let strengthLevel: "Weak" | "Establishing" | "Strong" | "Automatic" = "Weak";
    if (habitScore <= 0.25) {
      strengthLevel = "Weak";
    } else if (habitScore <= 0.55) {
      strengthLevel = "Establishing";
    } else if (habitScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Automatic";
    }

    const hasSignificantShift =
      habit.strength.level !== strengthLevel || habit.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityHabit = {
      ...habit,
      name,
      frequency,
      status,
      evidenceReferences: evidenceIds,
      strength: {
        score: habitScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph Habit node details
    identityGraphService.updateIdentityNode(habit.confidenceReference, {
      value: name,
      metadata: { frequency },
    });

    // Sync node evidence links
    const node = this.repository.getNode(habit.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updateHabit(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        habit.identityId,
        `Habit "${name}" updated`,
        habitScore,
        "NodeUpdated",
        habitId,
        `Habit status shifted to "${status}" and strength to "${strengthLevel}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_HABIT_UPDATED as any,
      "Identity Habit Updated",
      `Updated habit topic: ${name}`,
      null,
      null,
      { habit: updated, patch },
    );

    return updated;
  }

  public archiveHabit(habitId: string): boolean {
    const habit = this.repository.getHabit(habitId);
    if (!habit) return false;

    this.updateHabit(habitId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_HABIT_ARCHIVED as any,
      "Identity Habit Archived",
      `Archived habit: ${habit.name}`,
      null,
      null,
      { habitId },
    );

    return true;
  }
}

export const identityHabitService = new IdentityHabitService();
