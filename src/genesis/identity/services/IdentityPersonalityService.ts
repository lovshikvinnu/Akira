import {
  IdentityPersonality,
  PersonalityTrait,
  PersonalityStatus,
  TraitStrength,
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

export class IdentityPersonalityService {
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

  public getPersonalityTraits(identityId: string): IdentityPersonality[] {
    return this.repository.getPersonalityTraits(identityId);
  }

  public getPersonalityTrait(traitId: string): IdentityPersonality | null {
    return this.repository.getPersonalityTrait(traitId);
  }

  public createPersonalityTrait(
    identityId: string,
    trait: PersonalityTrait,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityPersonality {
    // 1. Represent Personality Trait as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Personality", trait, {
      supportingIdentityReferences,
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

    // Derived score aggregates evidence counts and supporting dimensions references
    const traitScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );
    
    let strengthLevel: "Low" | "Moderate" | "High" | "Extreme" = "Low";
    if (traitScore <= 0.25) {
      strengthLevel = "Low";
    } else if (traitScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (traitScore <= 0.85) {
      strengthLevel = "High";
    } else {
      strengthLevel = "Extreme";
    }

    // 3. Compute initial confidence
    identityConfidenceService.calculateConfidence(node.id);

    const traitId = uid();
    const now = new Date().toISOString();

    const personality: IdentityPersonality = {
      id: traitId,
      identityId,
      trait,
      strength: {
        score: traitScore,
        level: strengthLevel,
        updatedAt: now,
      },
      confidenceReference: node.id,
      supportingIdentityReferences,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastObserved: now,
      status: "Active",
    };

    this.repository.savePersonalityTrait(personality);

    // 4. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Derived personality trait: "${trait}"`,
      traitScore,
      "NodeAdded",
      traitId,
      `Derived personality trait "${trait}" with strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_PERSONALITY_CREATED as any,
      "Identity Personality Trait Created",
      `Derived trait: ${trait}`,
      null,
      null,
      { personality },
    );

    return personality;
  }

  public updatePersonalityTrait(
    traitId: string,
    patch: Partial<Omit<IdentityPersonality, "id" | "identityId">>,
  ): IdentityPersonality | null {
    const personality = this.repository.getPersonalityTrait(traitId);
    if (!personality) return null;

    const trait = patch.trait !== undefined ? patch.trait : personality.trait;
    const status = patch.status !== undefined ? patch.status : personality.status;
    const supportingIdentityReferences =
      patch.supportingIdentityReferences !== undefined
        ? patch.supportingIdentityReferences
        : personality.supportingIdentityReferences;
    const evidenceIds = patch.evidenceReferences !== undefined ? patch.evidenceReferences : personality.evidenceReferences;

    // Recalculate strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const traitScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );
    
    let strengthLevel: "Low" | "Moderate" | "High" | "Extreme" = "Low";
    if (traitScore <= 0.25) {
      strengthLevel = "Low";
    } else if (traitScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (traitScore <= 0.85) {
      strengthLevel = "High";
    } else {
      strengthLevel = "Extreme";
    }

    const hasSignificantShift =
      personality.strength.level !== strengthLevel || personality.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityPersonality = {
      ...personality,
      trait,
      status,
      supportingIdentityReferences,
      evidenceReferences: evidenceIds,
      strength: {
        score: traitScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph Personality node details
    identityGraphService.updateIdentityNode(personality.confidenceReference, {
      value: trait,
      metadata: { supportingIdentityReferences },
    });

    // Sync node evidence links
    const node = this.repository.getNode(personality.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updatePersonalityTrait(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        personality.identityId,
        `Personality trait "${trait}" updated`,
        traitScore,
        "NodeUpdated",
        traitId,
        `Personality trait status shifted to "${status}" and strength to "${strengthLevel}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_PERSONALITY_UPDATED as any,
      "Identity Personality Trait Updated",
      `Updated personality trait: ${trait}`,
      null,
      null,
      { personality: updated, patch },
    );

    return updated;
  }

  public archivePersonalityTrait(traitId: string): boolean {
    const personality = this.repository.getPersonalityTrait(traitId);
    if (!personality) return false;

    this.updatePersonalityTrait(traitId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_PERSONALITY_ARCHIVED as any,
      "Identity Personality Trait Archived",
      `Archived personality trait: ${personality.trait}`,
      null,
      null,
      { traitId },
    );

    return true;
  }
}

export const identityPersonalityService = new IdentityPersonalityService();
