import {
  IdentityValue,
  ValueCategory,
  ValueStatus,
  ValueStrength,
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

export class IdentityValueService {
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

  public getValues(identityId: string): IdentityValue[] {
    return this.repository.getValues(identityId);
  }

  public getValue(valueId: string): IdentityValue | null {
    return this.repository.getValue(valueId);
  }

  public createValue(
    identityId: string,
    name: string,
    category: ValueCategory,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityValue {
    // 1. Represent Value as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Value", name, {
      category,
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
    const valScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );
    
    let strengthLevel: "Low" | "Moderate" | "Strong" | "Immutable" = "Low";
    if (valScore <= 0.25) {
      strengthLevel = "Low";
    } else if (valScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (valScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Immutable";
    }

    // 3. Compute initial confidence
    identityConfidenceService.calculateConfidence(node.id);

    const valueId = uid();
    const now = new Date().toISOString();

    const value: IdentityValue = {
      id: valueId,
      identityId,
      name,
      category,
      strength: {
        score: valScore,
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

    this.repository.saveValue(value);

    // 4. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Derived value: "${name}"`,
      valScore,
      "NodeAdded",
      valueId,
      `Derived value "${name}" under category "${category}" with strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_VALUE_CREATED as any,
      "Identity Value Created",
      `Derived value: ${name} [${category}]`,
      null,
      null,
      { value },
    );

    return value;
  }

  public updateValue(
    valueId: string,
    patch: Partial<Omit<IdentityValue, "id" | "identityId">>,
  ): IdentityValue | null {
    const value = this.repository.getValue(valueId);
    if (!value) return null;

    const name = patch.name !== undefined ? patch.name : value.name;
    const category = patch.category !== undefined ? patch.category : value.category;
    const status = patch.status !== undefined ? patch.status : value.status;
    const supportingIdentityReferences =
      patch.supportingIdentityReferences !== undefined
        ? patch.supportingIdentityReferences
        : value.supportingIdentityReferences;
    const evidenceIds = patch.evidenceReferences !== undefined ? patch.evidenceReferences : value.evidenceReferences;

    // Recalculate strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const valScore = Math.max(
      0.0,
      Math.min(
        1.0,
        (evidenceList.length + supportingIdentityReferences.length) * 0.2 * averageWeight,
      ),
    );
    
    let strengthLevel: "Low" | "Moderate" | "Strong" | "Immutable" = "Low";
    if (valScore <= 0.25) {
      strengthLevel = "Low";
    } else if (valScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (valScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Immutable";
    }

    const hasSignificantShift =
      value.strength.level !== strengthLevel || value.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityValue = {
      ...value,
      name,
      category,
      status,
      supportingIdentityReferences,
      evidenceReferences: evidenceIds,
      strength: {
        score: valScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph Value node details
    identityGraphService.updateIdentityNode(value.confidenceReference, {
      value: name,
      metadata: { category, supportingIdentityReferences },
    });

    // Sync node evidence links
    const node = this.repository.getNode(value.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updateValue(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        value.identityId,
        `Value "${name}" updated`,
        valScore,
        "NodeUpdated",
        valueId,
        `Value status shifted to "${status}" and strength to "${strengthLevel}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_VALUE_UPDATED as any,
      "Identity Value Updated",
      `Updated value: ${name}`,
      null,
      null,
      { value: updated, patch },
    );

    return updated;
  }

  public archiveValue(valueId: string): boolean {
    const value = this.repository.getValue(valueId);
    if (!value) return false;

    this.updateValue(valueId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_VALUE_ARCHIVED as any,
      "Identity Value Archived",
      `Archived value: ${value.name}`,
      null,
      null,
      { valueId },
    );

    return true;
  }
}

export const identityValueService = new IdentityValueService();
