import {
  IdentityInterest,
  InterestCategory,
  InterestStatus,
  InterestStrength,
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

export class IdentityInterestService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  /**
   * Initializes the service, optionally setting a new repository.
   */
  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
  }

  /**
   * Set the active repository dynamically.
   */
  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
  }

  /**
   * Get the active repository.
   */
  public getRepository(): IdentityRepository {
    return this.repository;
  }

  /**
   * Retrieves all interests for a given identity.
   */
  public getInterests(identityId: string): IdentityInterest[] {
    return this.repository.getInterests(identityId);
  }

  /**
   * Retrieves a single interest profile.
   */
  public getInterest(interestId: string): IdentityInterest | null {
    return this.repository.getInterest(interestId);
  }

  /**
   * Creates a user interest profile, registers a matching graph Node, links evidence, and tracks evolution.
   */
  public createInterest(
    identityId: string,
    topic: string,
    category: InterestCategory,
    initialEvidenceIds?: string[],
  ): IdentityInterest {
    // 1. Represent interest as a Preference Node in the Graph
    const node = identityGraphService.addIdentityNode("Preference", topic, {
      category,
      interestTopic: topic,
    });

    const evidenceIds = initialEvidenceIds || [];

    // Link any initial evidence to the node
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

    const strengthScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let strengthLevel: "Low" | "Medium" | "High" | "Extreme" = "Low";
    if (strengthScore <= 0.25) {
      strengthLevel = "Low";
    } else if (strengthScore <= 0.55) {
      strengthLevel = "Medium";
    } else if (strengthScore <= 0.85) {
      strengthLevel = "High";
    } else {
      strengthLevel = "Extreme";
    }

    // 3. Compute initial confidence values via Confidence Engine
    identityConfidenceService.calculateConfidence(node.id);

    const interestId = uid();
    const now = new Date().toISOString();

    const interest: IdentityInterest = {
      id: interestId,
      identityId,
      topic,
      category,
      strength: {
        score: strengthScore,
        level: strengthLevel,
        updatedAt: now,
      },
      confidenceReference: node.id,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastObserved: now,
      status: "Active",
    };

    // 4. Save and trigger evolution log entry
    this.repository.saveInterest(interest);

    identityEvolutionService.createVersion(
      identityId,
      `Created interest topic: "${topic}"`,
      strengthScore,
      "NodeAdded",
      interestId,
      `Created interest topic "${topic}" in category "${category}" with strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_INTEREST_CREATED as any,
      "Identity Interest Created",
      `Created interest: ${topic} [${category}]`,
      null,
      null,
      { interest },
    );

    return interest;
  }

  /**
   * Patches an interest profile and tracks evolution updates.
   */
  public updateInterest(
    interestId: string,
    patch: Partial<Omit<IdentityInterest, "id" | "identityId">>,
  ): IdentityInterest | null {
    const interest = this.repository.getInterest(interestId);
    if (!interest) return null;

    const topic = patch.topic !== undefined ? patch.topic : interest.topic;
    const category = patch.category !== undefined ? patch.category : interest.category;
    const status = patch.status !== undefined ? patch.status : interest.status;
    const evidenceIds =
      patch.evidenceReferences !== undefined
        ? patch.evidenceReferences
        : interest.evidenceReferences;

    // Recalculate strength if evidence links shifted
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const strengthScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let strengthLevel: "Low" | "Medium" | "High" | "Extreme" = "Low";
    if (strengthScore <= 0.25) {
      strengthLevel = "Low";
    } else if (strengthScore <= 0.55) {
      strengthLevel = "Medium";
    } else if (strengthScore <= 0.85) {
      strengthLevel = "High";
    } else {
      strengthLevel = "Extreme";
    }

    const hasSignificantShift =
      interest.strength.level !== strengthLevel || interest.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityInterest = {
      ...interest,
      topic,
      category,
      status,
      evidenceReferences: evidenceIds,
      strength: {
        score: strengthScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph preference node details
    identityGraphService.updateIdentityNode(interest.confidenceReference, {
      value: topic,
      metadata: { category },
    });

    // Sync node evidence links
    const node = this.repository.getNode(interest.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      // Refresh confidence
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updateInterest(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        interest.identityId,
        `Interest "${topic}" status/strength shift`,
        strengthScore,
        "NodeUpdated",
        interestId,
        `Interest topic strength shifted to "${strengthLevel}" and status to "${status}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_INTEREST_UPDATED as any,
      "Identity Interest Updated",
      `Updated interest topic: ${topic}`,
      null,
      null,
      { interest: updated, patch },
    );

    return updated;
  }

  /**
   * Archives an interest profile, sets status, and creates evolution versions.
   */
  public archiveInterest(interestId: string): boolean {
    const interest = this.repository.getInterest(interestId);
    if (!interest) return false;

    this.updateInterest(interestId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_INTEREST_ARCHIVED as any,
      "Identity Interest Archived",
      `Archived interest topic: ${interest.topic}`,
      null,
      null,
      { interestId },
    );

    return true;
  }
}

export const identityInterestService = new IdentityInterestService();
