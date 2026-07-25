import {
  IdentityRelationship,
  RelationshipType,
  RelationshipStatus,
  RelationshipStrength,
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

export class IdentityRelationshipService {
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

  public getRelationships(identityId: string): IdentityRelationship[] {
    return this.repository.getRelationships(identityId);
  }

  public getRelationship(relationshipId: string): IdentityRelationship | null {
    return this.repository.getRelationship(relationshipId);
  }

  public createRelationship(
    identityId: string,
    targetEntityId: string,
    relationshipType: RelationshipType,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityRelationship {
    // 1. Represent Relationship as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Relationship", targetEntityId, {
      relationshipType,
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
    const relScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );

    let strengthLevel: "Distant" | "Casual" | "Close" | "Intimate" = "Distant";
    if (relScore <= 0.25) {
      strengthLevel = "Distant";
    } else if (relScore <= 0.55) {
      strengthLevel = "Casual";
    } else if (relScore <= 0.85) {
      strengthLevel = "Close";
    } else {
      strengthLevel = "Intimate";
    }

    // 3. Compute initial confidence
    identityConfidenceService.calculateConfidence(node.id);

    const relationshipId = uid();
    const now = new Date().toISOString();

    const relationship: IdentityRelationship = {
      id: relationshipId,
      identityId,
      targetEntityId,
      relationshipType,
      strength: {
        score: relScore,
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

    this.repository.saveRelationship(relationship);

    // 4. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Derived relationship with: "${targetEntityId}"`,
      relScore,
      "NodeAdded",
      relationshipId,
      `Derived relationship of type "${relationshipType}" with target "${targetEntityId}" with strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_RELATIONSHIP_CREATED as any,
      "Identity Relationship Created",
      `Derived relationship: ${targetEntityId} [${relationshipType}]`,
      null,
      null,
      { relationship },
    );

    return relationship;
  }

  public updateRelationship(
    relationshipId: string,
    patch: Partial<Omit<IdentityRelationship, "id" | "identityId">>,
  ): IdentityRelationship | null {
    const relationship = this.repository.getRelationship(relationshipId);
    if (!relationship) return null;

    const targetEntityId =
      patch.targetEntityId !== undefined ? patch.targetEntityId : relationship.targetEntityId;
    const relationshipType =
      patch.relationshipType !== undefined ? patch.relationshipType : relationship.relationshipType;
    const status = patch.status !== undefined ? patch.status : relationship.status;
    const supportingIdentityReferences =
      patch.supportingIdentityReferences !== undefined
        ? patch.supportingIdentityReferences
        : relationship.supportingIdentityReferences;
    const evidenceIds =
      patch.evidenceReferences !== undefined
        ? patch.evidenceReferences
        : relationship.evidenceReferences;

    // Recalculate strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const relScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );

    let strengthLevel: "Distant" | "Casual" | "Close" | "Intimate" = "Distant";
    if (relScore <= 0.25) {
      strengthLevel = "Distant";
    } else if (relScore <= 0.55) {
      strengthLevel = "Casual";
    } else if (relScore <= 0.85) {
      strengthLevel = "Close";
    } else {
      strengthLevel = "Intimate";
    }

    const hasSignificantShift =
      relationship.strength.level !== strengthLevel || relationship.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityRelationship = {
      ...relationship,
      targetEntityId,
      relationshipType,
      status,
      supportingIdentityReferences,
      evidenceReferences: evidenceIds,
      strength: {
        score: relScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph Relationship node details
    identityGraphService.updateIdentityNode(relationship.confidenceReference, {
      value: targetEntityId,
      metadata: { relationshipType, supportingIdentityReferences },
    });

    // Sync node evidence links
    const node = this.repository.getNode(relationship.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.saveRelationship(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        relationship.identityId,
        `Relationship with "${targetEntityId}" updated`,
        relScore,
        "NodeUpdated",
        relationshipId,
        `Relationship status shifted to "${status}" and strength to "${strengthLevel}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_RELATIONSHIP_UPDATED as any,
      "Identity Relationship Updated",
      `Updated relationship: ${targetEntityId}`,
      null,
      null,
      { relationship: updated, patch },
    );

    return updated;
  }

  public archiveRelationship(relationshipId: string): boolean {
    const relationship = this.repository.getRelationship(relationshipId);
    if (!relationship) return false;

    this.updateRelationship(relationshipId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_RELATIONSHIP_ARCHIVED as any,
      "Identity Relationship Archived",
      `Archived relationship with target: ${relationship.targetEntityId}`,
      null,
      null,
      { relationshipId },
    );

    return true;
  }
}

export const identityRelationshipService = new IdentityRelationshipService();
