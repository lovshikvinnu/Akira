import {
  IdentitySkill,
  SkillCategory,
  SkillLevel,
  SkillStatus,
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

export class IdentitySkillService {
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
   * Retrieves all skills for a given identity.
   */
  public getSkills(identityId: string): IdentitySkill[] {
    return this.repository.getSkills(identityId);
  }

  /**
   * Retrieves a single skill profile.
   */
  public getSkill(skillId: string): IdentitySkill | null {
    return this.repository.getSkill(skillId);
  }

  /**
   * Creates a skill profile, registers a matching graph Skill node, links evidence, and tracks evolution.
   */
  public createSkill(
    identityId: string,
    name: string,
    category: SkillCategory,
    initialEvidenceIds?: string[],
  ): IdentitySkill {
    // 1. Represent skill using the dedicated "Skill" aspect node type
    const node = identityGraphService.addIdentityNode("Skill", name, {
      category,
      skillName: name,
    });

    const evidenceIds = initialEvidenceIds || [];

    // Link initial evidence
    for (const evId of evidenceIds) {
      identityEvidenceService.linkEvidenceToNode(node.id, evId);
    }

    // 2. Fetch linked evidence weights to calculate deterministic skill level
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const skillScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let skillLevel: SkillLevel = "Novice";
    if (skillScore <= 0.25) {
      skillLevel = "Novice";
    } else if (skillScore <= 0.55) {
      skillLevel = "Intermediate";
    } else if (skillScore <= 0.85) {
      skillLevel = "Advanced";
    } else {
      skillLevel = "Expert";
    }

    // 3. Compute initial confidence values via Confidence Engine
    identityConfidenceService.calculateConfidence(node.id);

    const skillId = uid();
    const now = new Date().toISOString();

    const skill: IdentitySkill = {
      id: skillId,
      identityId,
      name,
      category,
      level: skillLevel,
      confidenceReference: node.id,
      evidenceReferences: evidenceIds,
      firstObserved: now,
      lastObserved: now,
      status: "Active",

      // Reserved properties
      proficiencyTrend: "Stable",
      evidenceCount: evidenceIds.length,
      averageWeight,
      lastEvidenceAt:
        evidenceList.length > 0 ? evidenceList[evidenceList.length - 1].createdAt : now,
    };

    // 4. Save and trigger evolution log entry
    this.repository.saveSkill(skill);

    identityEvolutionService.createVersion(
      identityId,
      `Created skill topic: "${name}"`,
      skillScore,
      "NodeAdded",
      skillId,
      `Created skill "${name}" in category "${category}" with level "${skillLevel}"`,
    );

    eventService.record(
      Events.IDENTITY_SKILL_CREATED as any,
      "Identity Skill Created",
      `Created skill: ${name} [${category}]`,
      null,
      null,
      { skill },
    );

    return skill;
  }

  /**
   * Patches a skill profile and tracks evolution updates.
   */
  public updateSkill(
    skillId: string,
    patch: Partial<Omit<IdentitySkill, "id" | "identityId">>,
  ): IdentitySkill | null {
    const skill = this.repository.getSkill(skillId);
    if (!skill) return null;

    const name = patch.name !== undefined ? patch.name : skill.name;
    const category = patch.category !== undefined ? patch.category : skill.category;
    const status = patch.status !== undefined ? patch.status : skill.status;
    const evidenceIds =
      patch.evidenceReferences !== undefined ? patch.evidenceReferences : skill.evidenceReferences;

    // Recalculate levels
    const evidenceList = evidenceIds
      .map((id) => this.repository.getEvidence(id))
      .filter((ev): ev is IdentityEvidence => ev !== null);

    const averageWeight =
      evidenceList.length > 0
        ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
        : 1.0;

    const skillScore = Math.max(0.0, Math.min(1.0, evidenceList.length * 0.25 * averageWeight));

    let skillLevel: SkillLevel = "Novice";
    if (skillScore <= 0.25) {
      skillLevel = "Novice";
    } else if (skillScore <= 0.55) {
      skillLevel = "Intermediate";
    } else if (skillScore <= 0.85) {
      skillLevel = "Advanced";
    } else {
      skillLevel = "Expert";
    }

    const hasSignificantShift = skill.level !== skillLevel || skill.status !== status;

    const now = new Date().toISOString();
    const updated: IdentitySkill = {
      ...skill,
      name,
      category,
      status,
      evidenceReferences: evidenceIds,
      level: skillLevel,
      lastObserved: now,

      // Sync reserved fields
      evidenceCount: evidenceIds.length,
      averageWeight,
      lastEvidenceAt:
        evidenceList.length > 0
          ? evidenceList[evidenceList.length - 1].createdAt
          : skill.lastEvidenceAt,
    };

    // Update graph Skill node details
    identityGraphService.updateIdentityNode(skill.confidenceReference, {
      value: name,
      metadata: { category },
    });

    // Sync node evidence links
    const node = this.repository.getNode(skill.confidenceReference);
    if (node) {
      node.evidenceIds = [...evidenceIds];
      this.repository.saveNode(node);
      // Refresh confidence
      identityConfidenceService.refreshConfidence(node.id);
    }

    this.repository.updateSkill(updated);

    if (hasSignificantShift) {
      identityEvolutionService.createVersion(
        skill.identityId,
        `Skill "${name}" status/level shift`,
        skillScore,
        "NodeUpdated",
        skillId,
        `Skill level shifted to "${skillLevel}" and status to "${status}"`,
      );
    }

    eventService.record(
      Events.IDENTITY_SKILL_UPDATED as any,
      "Identity Skill Updated",
      `Updated skill: ${name}`,
      null,
      null,
      { skill: updated, patch },
    );

    return updated;
  }

  /**
   * Archives a skill profile, sets status, and creates evolution versions.
   */
  public archiveSkill(skillId: string): boolean {
    const skill = this.repository.getSkill(skillId);
    if (!skill) return false;

    this.updateSkill(skillId, { status: "Archived" });

    eventService.record(
      Events.IDENTITY_SKILL_ARCHIVED as any,
      "Identity Skill Archived",
      `Archived skill: ${skill.name}`,
      null,
      null,
      { skillId },
    );

    return true;
  }
}

export const identitySkillService = new IdentitySkillService();
