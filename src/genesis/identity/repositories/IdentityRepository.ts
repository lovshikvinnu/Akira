import {
  Identity,
  IdentityGraph,
  IdentityNode,
  IdentityEdge,
  IdentityEvidence,
  IdentityConfidence,
  IdentityVersion,
  IdentitySnapshot,
  IdentityTimeline,
  IdentityInterest,
  IdentitySkill,
  IdentityGoal,
  IdentityHabit,
  IdentityPreference,
  IdentityValue,
  IdentityRelationship,
  IdentityPersonality,
} from "../types";

export interface IdentityRepository {
  getIdentity(): Identity | null;
  createIdentity(identity: Identity): Identity;
  updateIdentity(identity: Identity): Identity;
  getGraph(): IdentityGraph;
  saveGraph(graph: IdentityGraph): void;
  getNode(nodeId: string): IdentityNode | null;
  saveNode(node: IdentityNode): void;
  getNodes(): IdentityNode[];
  removeNode(nodeId: string): void;
  getEdge(edgeId: string): IdentityEdge | null;
  saveEdge(edge: IdentityEdge): void;
  getEdges(): IdentityEdge[];
  removeEdge(edgeId: string): void;

  // Evidence Operations
  getEvidence(evidenceId: string): IdentityEvidence | null;
  getEvidenceByNode(nodeId: string): IdentityEvidence[];
  saveEvidence(evidence: IdentityEvidence): void;
  updateEvidence(evidence: IdentityEvidence): void;
  deleteEvidence(evidenceId: string): void;

  /**
   * Optional bulk read of every evidence record in the store.
   * Declared optional because no implementation provides it yet;
   * IdentityValidationService probes for it and degrades to [] when absent.
   */
  findEvidence?(): IdentityEvidence[];

  // Transaction Placeholders (Reserved for future execution boundaries)
  beginTransaction(): void;
  commitTransaction(): void;
  rollbackTransaction(): void;

  // Confidence Operations
  getConfidence(nodeId: string): IdentityConfidence | null;
  saveConfidence(nodeId: string, confidence: IdentityConfidence): void;
  updateConfidence(nodeId: string, confidence: IdentityConfidence): void;
  getConfidenceHistory(nodeId: string): IdentityConfidence[]; // Reserved

  // Evolution Operations
  getVersions(identityId: string): IdentityVersion[];
  getVersion(versionId: string): IdentityVersion | null;
  createVersion(version: IdentityVersion): void;
  getTimeline(identityId: string): IdentityTimeline | null;
  saveTimeline(timeline: IdentityTimeline): void;
  createSnapshot(snapshot: IdentitySnapshot): void;
  getSnapshot(snapshotId: string): IdentitySnapshot | null;

  // Reserved Evolution APIs
  restoreVersion(versionId: string): void; // Reserved
  compareVersions(versionIdA: string, versionIdB: string): number; // Reserved

  // Interest Operations
  getInterests(identityId: string): IdentityInterest[];
  getInterest(interestId: string): IdentityInterest | null;
  saveInterest(interest: IdentityInterest): void;
  updateInterest(interest: IdentityInterest): void;
  removeInterest(interestId: string): void;

  // Reserved Interest APIs
  mergeInterests(interestIdA: string, interestIdB: string): void; // Reserved
  splitInterest(interestId: string, topics: string[]): void; // Reserved

  // Skill Operations
  getSkills(identityId: string): IdentitySkill[];
  getSkill(skillId: string): IdentitySkill | null;
  saveSkill(skill: IdentitySkill): void;
  updateSkill(skill: IdentitySkill): void;
  removeSkill(skillId: string): void;

  // Reserved Skill APIs
  mergeSkills(skillIdA: string, skillIdB: string): void; // Reserved
  compareSkills(skillIdA: string, skillIdB: string): number; // Reserved

  // Goal Operations
  getGoals(identityId: string): IdentityGoal[];
  getGoal(goalId: string): IdentityGoal | null;
  saveGoal(goal: IdentityGoal): void;
  updateGoal(goal: IdentityGoal): void;
  removeGoal(goalId: string): void;
  mergeGoals(goalIdA: string, goalIdB: string): void; // Reserved

  // Habit Operations
  getHabits(identityId: string): IdentityHabit[];
  getHabit(habitId: string): IdentityHabit | null;
  saveHabit(habit: IdentityHabit): void;
  updateHabit(habit: IdentityHabit): void;
  removeHabit(habitId: string): void;
  mergeHabits(habitIdA: string, habitIdB: string): void; // Reserved

  // Preference Operations
  getPreferences(identityId: string): IdentityPreference[];
  getPreference(preferenceId: string): IdentityPreference | null;
  savePreference(preference: IdentityPreference): void;
  updatePreference(preference: IdentityPreference): void;
  removePreference(preferenceId: string): void;
  mergePreferences(preferenceIdA: string, preferenceIdB: string): void; // Reserved

  // Value Operations
  getValues(identityId: string): IdentityValue[];
  getValue(valueId: string): IdentityValue | null;
  saveValue(value: IdentityValue): void;
  updateValue(value: IdentityValue): void;
  removeValue(valueId: string): void;
  mergeValues(valueIdA: string, valueIdB: string): void; // Reserved

  // Relationship Operations
  getRelationships(identityId: string): IdentityRelationship[];
  getRelationship(relationshipId: string): IdentityRelationship | null;
  saveRelationship(relationship: IdentityRelationship): void;
  updateRelationship(relationship: IdentityRelationship): void;
  removeRelationship(relationshipId: string): void;
  mergeRelationships(relIdA: string, relIdB: string): void; // Reserved

  // Personality Operations
  getPersonalityTraits(identityId: string): IdentityPersonality[];
  getPersonalityTrait(traitId: string): IdentityPersonality | null;
  savePersonalityTrait(trait: IdentityPersonality): void;
  updatePersonalityTrait(trait: IdentityPersonality): void;
  removePersonalityTrait(traitId: string): void;
  rebuildPersonalityProfile(identityId: string): void; // Reserved
}
