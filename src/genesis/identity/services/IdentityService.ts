import {
  Identity,
  IdentityNode,
  IdentityEdge,
  IdentityGraph,
  IdentityAspectType,
  IdentityEdgeType,
  IdentityEvidence,
  EvidenceSourceType,
  EvidenceMetadata,
  IdentityConfidence,
  ConfidenceExplanation,
  IdentityVersion,
  IdentitySnapshot,
  IdentityTimeline,
  IdentityInterest,
  InterestCategory,
  IdentitySkill,
  SkillCategory,
  IdentityGoal,
  GoalCategory,
  GoalPriority,
  IdentityHabit,
  HabitFrequency,
  IdentityPreference,
  PreferenceCategory,
  IdentityValue,
  ValueCategory,
  IdentityRelationship,
  RelationshipType,
  IdentityPersonality,
  PersonalityTrait,
  IdentityProfile,
  IdentitySummary,
  IdentityHealth,
  IdentityCompleteness,
} from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { identityGraphService } from "./IdentityGraphService";
import { identityEvidenceService } from "./IdentityEvidenceService";
import { identityConfidenceService } from "./IdentityConfidenceService";
import { identityEvolutionService } from "./IdentityEvolutionService";
import { identityInterestService } from "./IdentityInterestService";
import { identitySkillService } from "./IdentitySkillService";
import { identityGoalService } from "./IdentityGoalService";
import { identityHabitService } from "./IdentityHabitService";
import { identityPreferenceService } from "./IdentityPreferenceService";
import { identityValueService } from "./IdentityValueService";
import { identityRelationshipService } from "./IdentityRelationshipService";
import { identityPersonalityService } from "./IdentityPersonalityService";
import { identityValidationService } from "./IdentityValidationService";
import { identityContextProvider, IdentityContextProvider } from "./IdentityContextProvider";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class IdentityService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  /**
   * Initializes the Identity module and its delegated services.
   */
  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
    identityGraphService.initialize(this.repository);
    identityEvidenceService.initialize(this.repository);
    identityConfidenceService.initialize(this.repository);
    identityEvolutionService.initialize(this.repository);
    identityInterestService.initialize(this.repository);
    identitySkillService.initialize(this.repository);
    identityGoalService.initialize(this.repository);
    identityHabitService.initialize(this.repository);
    identityPreferenceService.initialize(this.repository);
    identityValueService.initialize(this.repository);
    identityRelationshipService.initialize(this.repository);
    identityPersonalityService.initialize(this.repository);
    identityValidationService.initialize(this.repository);
    identityContextProvider.initialize(this.repository);
  }

  /**
   * Updates the active repository implementation across all services.
   */
  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
    identityGraphService.setRepository(repository);
    identityEvidenceService.setRepository(repository);
    identityConfidenceService.setRepository(repository);
    identityEvolutionService.setRepository(repository);
    identityInterestService.setRepository(repository);
    identitySkillService.setRepository(repository);
    identityGoalService.setRepository(repository);
    identityHabitService.setRepository(repository);
    identityPreferenceService.setRepository(repository);
    identityValueService.setRepository(repository);
    identityRelationshipService.setRepository(repository);
    identityPersonalityService.setRepository(repository);
    identityValidationService.setRepository(repository);
    identityContextProvider.setRepository(repository);
  }

  /**
   * Gets the active repository.
   */
  public getRepository(): IdentityRepository {
    return this.repository;
  }

  /**
   * Retrieves the current identity profile.
   */
  public getIdentity(): Identity | null {
    return this.repository.getIdentity();
  }

  /**
   * Retrieves a specific aspect of the identity (represented as a node in the graph).
   */
  public getIdentityAspect(aspectId: string): IdentityNode | null {
    return this.getIdentityNode(aspectId);
  }

  /**
   * Creates a new root identity profile.
   */
  public createIdentity(input: { nodes?: IdentityNode[]; edges?: IdentityEdge[] }): Identity {
    const identityId = uid();
    const identity: Identity = {
      id: identityId,
      nodes: input.nodes || [],
      edges: input.edges || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = this.repository.createIdentity(identity);

    eventService.record(
      Events.IDENTITY_CREATED as any,
      "Identity Created",
      `Created identity foundation with profile: ${identityId}`,
      null,
      null,
      { identity: created },
    );

    // Track evolution history
    identityEvolutionService.createVersion(
      identityId,
      "Root identity created",
      1,
      "RootCreated",
      identityId,
      "Initial root identity initialized",
    );

    return created;
  }

  /**
   * Updates the root identity details.
   */
  public updateIdentity(
    id: string,
    patch: Partial<Omit<Identity, "id" | "createdAt">>,
  ): Identity | null {
    const existing = this.repository.getIdentity();
    if (!existing || existing.id !== id) return null;

    const updated = this.repository.updateIdentity({
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });

    eventService.record(
      Events.IDENTITY_UPDATED as any,
      "Identity Updated",
      `Updated identity profile: ${id}`,
      null,
      null,
      { identity: updated, patch },
    );

    // Track evolution history
    identityEvolutionService.createVersion(
      id,
      "Root identity updated",
      1,
      "RootUpdated",
      id,
      `Updated root identity profile fields: ${Object.keys(patch).join(", ")}`,
    );

    return updated;
  }

  /* Delegated Graph APIs (with Evolution integration) */

  public getIdentityGraph(): IdentityGraph {
    return identityGraphService.getIdentityGraph();
  }

  public getIdentityNode(nodeId: string): IdentityNode | null {
    return identityGraphService.getIdentityNode(nodeId);
  }

  public getIdentityNodes(): IdentityNode[] {
    return identityGraphService.getIdentityNodes();
  }

  public addIdentityNode(
    aspectType: IdentityAspectType,
    value: string,
    metadata?: Record<string, unknown>,
  ): IdentityNode {
    const node = identityGraphService.addIdentityNode(aspectType, value, metadata);
    const identity = this.getIdentity();
    if (identity) {
      identityEvolutionService.createVersion(
        identity.id,
        `Added aspect node: ${aspectType} - ${value}`,
        node.confidence?.score || 0,
        "NodeAdded",
        node.id,
        `Added aspect node with value "${value}" to the graph`,
      );
    }
    return node;
  }

  public updateIdentityNode(
    nodeId: string,
    patch: Partial<Omit<IdentityNode, "id" | "createdAt">>,
  ): IdentityNode | null {
    const node = identityGraphService.updateIdentityNode(nodeId, patch);
    if (node) {
      const identity = this.getIdentity();
      if (identity) {
        identityEvolutionService.createVersion(
          identity.id,
          `Updated aspect node value to: ${node.value}`,
          node.confidence?.score || 0,
          "NodeUpdated",
          node.id,
          `Updated node property values: ${Object.keys(patch).join(", ")}`,
        );
      }
    }
    return node;
  }

  public removeIdentityNode(nodeId: string): boolean {
    const node = this.getIdentityNode(nodeId);
    if (!node) return false;

    const aspectType = node.aspectType;
    const value = node.value;
    const success = identityGraphService.removeIdentityNode(nodeId);

    if (success) {
      const identity = this.getIdentity();
      if (identity) {
        identityEvolutionService.createVersion(
          identity.id,
          `Deleted aspect node: ${aspectType} - ${value}`,
          0,
          "NodeDeleted",
          nodeId,
          `Removed aspect node "${value}" of type "${aspectType}" from the graph`,
        );
      }
    }
    return success;
  }

  public addIdentityEdge(
    sourceId: string,
    targetId: string,
    type: IdentityEdgeType,
    metadata?: Record<string, unknown>,
  ): IdentityEdge {
    const edge = identityGraphService.addIdentityEdge(sourceId, targetId, type, metadata);
    const identity = this.getIdentity();
    if (identity) {
      identityEvolutionService.createVersion(
        identity.id,
        `Added relationship edge: ${type}`,
        1,
        "EdgeAdded",
        edge.id,
        `Created relation "${type}" connecting aspect ${sourceId} to ${targetId}`,
      );
    }
    return edge;
  }

  public removeIdentityEdge(edgeId: string): boolean {
    const edge = this.repository.getEdge(edgeId);
    if (!edge) return false;

    const type = edge.type;
    const success = identityGraphService.removeIdentityEdge(edgeId);

    if (success) {
      const identity = this.getIdentity();
      if (identity) {
        identityEvolutionService.createVersion(
          identity.id,
          `Deleted relationship edge: ${type}`,
          1,
          "EdgeDeleted",
          edgeId,
          `Removed relationship edge "${type}" (id: ${edgeId})`,
        );
      }
    }
    return success;
  }

  public getIdentityEdges(): IdentityEdge[] {
    return identityGraphService.getIdentityEdges();
  }

  /* Delegated Evidence APIs */

  public getEvidence(evidenceId: string): IdentityEvidence | null {
    return identityEvidenceService.getEvidence(evidenceId);
  }

  public getEvidenceByNode(nodeId: string): IdentityEvidence[] {
    return identityEvidenceService.getEvidenceByNode(nodeId);
  }

  public addEvidence(
    nodeId: string,
    sourceType: EvidenceSourceType,
    sourceId: string,
    contentReference?: string,
    metadata?: EvidenceMetadata,
  ): IdentityEvidence {
    const evidence = identityEvidenceService.addEvidence(
      nodeId,
      sourceType,
      sourceId,
      contentReference,
      metadata,
    );
    // Refresh confidence after adding evidence
    this.refreshConfidence(nodeId);
    return evidence;
  }

  public updateEvidence(
    evidenceId: string,
    patch: Partial<Omit<IdentityEvidence, "id" | "nodeId" | "createdAt">>,
  ): IdentityEvidence | null {
    const evidence = identityEvidenceService.updateEvidence(evidenceId, patch);
    if (evidence) {
      this.refreshConfidence(evidence.nodeId);
    }
    return evidence;
  }

  public removeEvidence(evidenceId: string): boolean {
    const evidence = this.getEvidence(evidenceId);
    if (!evidence) return false;
    const nodeId = evidence.nodeId;
    const success = identityEvidenceService.removeEvidence(evidenceId);
    if (success && nodeId) {
      this.refreshConfidence(nodeId);
    }
    return success;
  }

  public linkEvidenceToNode(nodeId: string, evidenceId: string): boolean {
    const success = identityEvidenceService.linkEvidenceToNode(nodeId, evidenceId);
    if (success) {
      this.refreshConfidence(nodeId);
    }
    return success;
  }

  public unlinkEvidenceFromNode(nodeId: string, evidenceId: string): boolean {
    const success = identityEvidenceService.unlinkEvidenceFromNode(nodeId, evidenceId);
    if (success) {
      this.refreshConfidence(nodeId);
    }
    return success;
  }

  public findEvidence(): IdentityEvidence[] {
    return identityEvidenceService.findEvidence();
  }

  /* Delegated Confidence APIs */

  public getConfidence(nodeId: string): IdentityConfidence | null {
    return identityConfidenceService.getConfidence(nodeId);
  }

  public calculateConfidence(nodeId: string): IdentityConfidence {
    return identityConfidenceService.calculateConfidence(nodeId);
  }

  public refreshConfidence(nodeId: string): IdentityConfidence {
    return identityConfidenceService.refreshConfidence(nodeId);
  }

  public explainConfidence(nodeId: string): ConfidenceExplanation | null {
    return identityConfidenceService.explainConfidence(nodeId);
  }

  public compareConfidence(nodeIdA: string, nodeIdB: string): number {
    const a = this.getConfidence(nodeIdA);
    const b = this.getConfidence(nodeIdB);
    if (!a || !b) return 0;
    return a.score - b.score;
  }

  /* Delegated Evolution APIs */

  public getTimeline(identityId: string): IdentityTimeline | null {
    return identityEvolutionService.getTimeline(identityId);
  }

  public getVersions(identityId: string): IdentityVersion[] {
    return identityEvolutionService.getVersions(identityId);
  }

  public getVersion(versionId: string): IdentityVersion | null {
    return identityEvolutionService.getVersion(versionId);
  }

  public getLatestVersion(identityId: string): IdentityVersion | null {
    return identityEvolutionService.getLatestVersion(identityId);
  }

  public createSnapshot(identityId: string, changeSummary: string): IdentitySnapshot {
    return identityEvolutionService.createSnapshot(identityId, changeSummary);
  }

  /* Reserved Evolution APIs (Without implementation) */

  public restoreVersion(versionId: string): boolean {
    return false;
  }

  public compareVersions(versionIdA: string, versionIdB: string): string {
    return "";
  }

  /* Delegated Interest APIs */

  public getInterests(identityId: string): IdentityInterest[] {
    return identityInterestService.getInterests(identityId);
  }

  public getInterest(interestId: string): IdentityInterest | null {
    return identityInterestService.getInterest(interestId);
  }

  public createInterest(
    identityId: string,
    topic: string,
    category: InterestCategory,
    initialEvidenceIds?: string[],
  ): IdentityInterest {
    return identityInterestService.createInterest(identityId, topic, category, initialEvidenceIds);
  }

  public updateInterest(
    interestId: string,
    patch: Partial<Omit<IdentityInterest, "id" | "identityId">>,
  ): IdentityInterest | null {
    return identityInterestService.updateInterest(interestId, patch);
  }

  public archiveInterest(interestId: string): boolean {
    return identityInterestService.archiveInterest(interestId);
  }

  /* Reserved Interest APIs (Without implementation) */

  public mergeInterests(interestIdA: string, interestIdB: string): void {
    // Reserved placeholder
  }

  public findRelatedInterests(interestId: string): IdentityInterest[] {
    // Reserved placeholder
    return [];
  }

  /* Delegated Skill APIs */

  public getSkills(identityId: string): IdentitySkill[] {
    return identitySkillService.getSkills(identityId);
  }

  public getSkill(skillId: string): IdentitySkill | null {
    return identitySkillService.getSkill(skillId);
  }

  public createSkill(
    identityId: string,
    name: string,
    category: SkillCategory,
    initialEvidenceIds?: string[],
  ): IdentitySkill {
    return identitySkillService.createSkill(identityId, name, category, initialEvidenceIds);
  }

  public updateSkill(
    skillId: string,
    patch: Partial<Omit<IdentitySkill, "id" | "identityId">>,
  ): IdentitySkill | null {
    return identitySkillService.updateSkill(skillId, patch);
  }

  public archiveSkill(skillId: string): boolean {
    return identitySkillService.archiveSkill(skillId);
  }

  /* Reserved Skill APIs (Without implementation) */

  public mergeSkills(skillIdA: string, skillIdB: string): void {
    // Reserved placeholder
  }

  public compareSkills(skillIdA: string, skillIdB: string): number {
    // Reserved placeholder
    return 0;
  }

  /* Delegated Goal APIs */

  public getGoals(identityId: string): IdentityGoal[] {
    return identityGoalService.getGoals(identityId);
  }

  public getGoal(goalId: string): IdentityGoal | null {
    return identityGoalService.getGoal(goalId);
  }

  public createGoal(
    identityId: string,
    title: string,
    description: string,
    category: GoalCategory,
    priority: GoalPriority,
    initialEvidenceIds?: string[],
  ): IdentityGoal {
    return identityGoalService.createGoal(
      identityId,
      title,
      description,
      category,
      priority,
      initialEvidenceIds,
    );
  }

  public updateGoal(
    goalId: string,
    patch: Partial<Omit<IdentityGoal, "id" | "identityId">>,
  ): IdentityGoal | null {
    return identityGoalService.updateGoal(goalId, patch);
  }

  public archiveGoal(goalId: string): boolean {
    return identityGoalService.archiveGoal(goalId);
  }

  /* Reserved Goal APIs (Without implementation) */

  public mergeGoals(goalIdA: string, goalIdB: string): void {
    // Reserved placeholder
  }

  /* Delegated Habit APIs */

  public getHabits(identityId: string): IdentityHabit[] {
    return identityHabitService.getHabits(identityId);
  }

  public getHabit(habitId: string): IdentityHabit | null {
    return identityHabitService.getHabit(habitId);
  }

  public createHabit(
    identityId: string,
    name: string,
    frequency: HabitFrequency,
    initialEvidenceIds?: string[],
  ): IdentityHabit {
    return identityHabitService.createHabit(identityId, name, frequency, initialEvidenceIds);
  }

  public updateHabit(
    habitId: string,
    patch: Partial<Omit<IdentityHabit, "id" | "identityId">>,
  ): IdentityHabit | null {
    return identityHabitService.updateHabit(habitId, patch);
  }

  public archiveHabit(habitId: string): boolean {
    return identityHabitService.archiveHabit(habitId);
  }

  /* Reserved Habit APIs (Without implementation) */

  public mergeHabits(habitIdA: string, habitIdB: string): void {
    // Reserved placeholder
  }

  /* Delegated Preference APIs */

  public getPreferences(identityId: string): IdentityPreference[] {
    return identityPreferenceService.getPreferences(identityId);
  }

  public getPreference(preferenceId: string): IdentityPreference | null {
    return identityPreferenceService.getPreference(preferenceId);
  }

  public createPreference(
    identityId: string,
    category: PreferenceCategory,
    value: string,
    initialEvidenceIds?: string[],
  ): IdentityPreference {
    return identityPreferenceService.createPreference(
      identityId,
      category,
      value,
      initialEvidenceIds,
    );
  }

  public updatePreference(
    preferenceId: string,
    patch: Partial<Omit<IdentityPreference, "id" | "identityId">>,
  ): IdentityPreference | null {
    return identityPreferenceService.updatePreference(preferenceId, patch);
  }

  public archivePreference(preferenceId: string): boolean {
    return identityPreferenceService.archivePreference(preferenceId);
  }

  /* Reserved Preference APIs (Without implementation) */

  public mergePreferences(preferenceIdA: string, preferenceIdB: string): void {
    // Reserved placeholder
  }

  /* Delegated Value APIs */

  public getValues(identityId: string): IdentityValue[] {
    return identityValueService.getValues(identityId);
  }

  public getValue(valueId: string): IdentityValue | null {
    return identityValueService.getValue(valueId);
  }

  public createValue(
    identityId: string,
    name: string,
    category: ValueCategory,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityValue {
    return identityValueService.createValue(
      identityId,
      name,
      category,
      supportingIdentityReferences,
      initialEvidenceIds,
    );
  }

  public updateValue(
    valueId: string,
    patch: Partial<Omit<IdentityValue, "id" | "identityId">>,
  ): IdentityValue | null {
    return identityValueService.updateValue(valueId, patch);
  }

  public archiveValue(valueId: string): boolean {
    return identityValueService.archiveValue(valueId);
  }

  /* Reserved Value APIs (Without implementation) */

  public mergeValues(valueIdA: string, valueIdB: string): void {
    // Reserved placeholder
  }

  /* Delegated Relationship APIs */

  public getRelationships(identityId: string): IdentityRelationship[] {
    return identityRelationshipService.getRelationships(identityId);
  }

  public getRelationship(relationshipId: string): IdentityRelationship | null {
    return identityRelationshipService.getRelationship(relationshipId);
  }

  public createRelationship(
    identityId: string,
    targetEntityId: string,
    relationshipType: RelationshipType,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityRelationship {
    return identityRelationshipService.createRelationship(
      identityId,
      targetEntityId,
      relationshipType,
      supportingIdentityReferences,
      initialEvidenceIds,
    );
  }

  public updateRelationship(
    relationshipId: string,
    patch: Partial<Omit<IdentityRelationship, "id" | "identityId">>,
  ): IdentityRelationship | null {
    return identityRelationshipService.updateRelationship(relationshipId, patch);
  }

  public archiveRelationship(relationshipId: string): boolean {
    return identityRelationshipService.archiveRelationship(relationshipId);
  }

  /* Reserved Relationship APIs (Without implementation) */

  public mergeRelationships(relIdA: string, relIdB: string): void {
    // Reserved placeholder
  }

  /* Delegated Personality APIs */

  public getPersonalityTraits(identityId: string): IdentityPersonality[] {
    return identityPersonalityService.getPersonalityTraits(identityId);
  }

  public getPersonalityTrait(traitId: string): IdentityPersonality | null {
    return identityPersonalityService.getPersonalityTrait(traitId);
  }

  public createPersonalityTrait(
    identityId: string,
    trait: PersonalityTrait,
    supportingIdentityReferences: string[],
    initialEvidenceIds?: string[],
  ): IdentityPersonality {
    return identityPersonalityService.createPersonalityTrait(
      identityId,
      trait,
      supportingIdentityReferences,
      initialEvidenceIds,
    );
  }

  public updatePersonalityTrait(
    traitId: string,
    patch: Partial<Omit<IdentityPersonality, "id" | "identityId">>,
  ): IdentityPersonality | null {
    return identityPersonalityService.updatePersonalityTrait(traitId, patch);
  }

  public archivePersonalityTrait(traitId: string): boolean {
    return identityPersonalityService.archivePersonalityTrait(traitId);
  }

  /* Reserved Personality APIs (Without implementation) */

  public rebuildPersonalityProfile(identityId: string): void {
    // Reserved placeholder
  }

  /* Sprint 5 Delegated APIs */

  public getIdentityProfile(identityId: string): IdentityProfile {
    return identityContextProvider.getCurrentProfile(identityId);
  }

  public getIdentityContext(identityId: string): IdentityProfile {
    return identityContextProvider.getCurrentProfile(identityId);
  }

  public getIdentitySummary(identityId: string): IdentitySummary {
    return identityContextProvider.getIdentitySummary(identityId);
  }

  public getIdentityHealth(identityId: string): IdentityHealth {
    return identityContextProvider.getIdentityHealth(identityId);
  }

  public getIdentityCompleteness(identityId: string): IdentityCompleteness {
    return identityContextProvider.getIdentityCompleteness(identityId);
  }

  public validateIdentity(identityId: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    return identityValidationService.validateIdentity(identityId);
  }
}

export const identityService = new IdentityService();
export type { IdentityService as IdentityFoundationCoordinatorService };
