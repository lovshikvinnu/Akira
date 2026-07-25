import {
  IdentityPreference,
  PreferenceCategory,
  PreferenceStatus,
  PreferenceStrength,
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

export class IdentityPreferenceService {
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

  public getPreferences(identityId: string): IdentityPreference[] {
    return this.repository.getPreferences(identityId);
  }

  public getPreference(preferenceId: string): IdentityPreference | null {
    return this.repository.getPreference(preferenceId);
  }

  public createPreference(
    identityId: string,
    category: PreferenceCategory,
    value: string,
    initialEvidenceIds?: string[],
  ): IdentityPreference {
    // 1. Represent Preference as a dedicated node in the graph
    const node = identityGraphService.addIdentityNode("Preference", value, {
      category,
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

    const prefScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let strengthLevel: "Low" | "Moderate" | "Strong" | "Immutable" = "Low";
    if (prefScore <= 0.25) {
      strengthLevel = "Low";
    } else if (prefScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (prefScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Immutable";
    }

    // 3. Compute initial confidence
    identityConfidenceService.calculateConfidence(node.id);

    const preferenceId = uid();
    const now = new Date().toISOString();

    const preference: IdentityPreference = {
      id: preferenceId,
      identityId,
      category,
      value,
      strength: {
        score: prefScore,
        level: strengthLevel,
        updatedAt: now,
      },
      status: "Active",
      confidenceReference: node.id,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastObserved: now,
    };

    this.repository.savePreference(preference);

    // 4. Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      `Created preference: "${value}"`,
      prefScore,
      "NodeAdded",
      preferenceId,
      `Created preference "${value}" under category "${category}" with strength "${strengthLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_PREFERENCE_CREATED as any,
      "Identity Preference Created",
      `Created preference: ${value} [${category}]`,
      null,
      null,
      { preference },
    );

    return preference;
  }

  public updatePreference(
    preferenceId: string,
    patch: Partial<Omit<IdentityPreference, "id" | "identityId">>,
  ): IdentityPreference | null {
    const preference = this.repository.getPreference(preferenceId);
    if (!preference) return null;

    const category = patch.category !== undefined ? patch.category : preference.category;
    const value = patch.value !== undefined ? patch.value : preference.value;
    const status = patch.status !== undefined ? patch.status : preference.status;
    const evidenceIds =
      patch.evidenceReferences !== undefined
        ? patch.evidenceReferences
        : preference.evidenceReferences;

    // Recalculate strength
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const prefScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let strengthLevel: "Low" | "Moderate" | "Strong" | "Immutable" = "Low";
    if (prefScore <= 0.25) {
      strengthLevel = "Low";
    } else if (prefScore <= 0.55) {
      strengthLevel = "Moderate";
    } else if (prefScore <= 0.85) {
      strengthLevel = "Strong";
    } else {
      strengthLevel = "Immutable";
    }

    const hasSignificantShift =
      preference.strength.level !== strengthLevel || preference.status !== status;

    const now = new Date().toISOString();
    const updated: IdentityPreference = {
      ...preference,
      category,
      value,
      status,
      evidenceReferences: evidenceIds,
      strength: {
        score: prefScore,
        level: strengthLevel,
        updatedAt: now,
      },
      lastObserved: now,
    };

    // Update graph Preference node details
    identityGraphService.updateIdentityNode(preference.confidenceReference, {
      value,
      metadata: { category },
    });

    // Sync node evidence links
    const node = this.repository.getNode(preference.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updatePreference(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        preference.identityId,
        `Preference "${value}" updated`,
        prefScore,
        "NodeUpdated",
        preferenceId,
        `Preference status shifted to "${status}" and strength to "${strengthLevel}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_PREFERENCE_UPDATED as any,
      "Identity Preference Updated",
      `Updated preference: ${value}`,
      null,
      null,
      { preference: updated, patch },
    );

    return updated;
  }

  public archivePreference(preferenceId: string): boolean {
    const preference = this.repository.getPreference(preferenceId);
    if (!preference) return false;

    this.updatePreference(preferenceId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_PREFERENCE_ARCHIVED as any,
      "Identity Preference Archived",
      `Archived preference: ${preference.value}`,
      null,
      null,
      { preferenceId },
    );

    return true;
  }
}

export const identityPreferenceService = new IdentityPreferenceService();
