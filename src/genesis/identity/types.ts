export type IdentityAspectType =
  | "Trait"
  | "Value"
  | "Preference"
  | "Habit"
  | "Skill"
  | "Interest"
  | "Goal"
  | "Personality"
  | "Relationship"
  | "Other";

export type IdentityNodeType = IdentityAspectType;

export type ConfidenceLevel =
  | "Unknown"
  | "Weak"
  | "Possible"
  | "Likely"
  | "Strong"
  | "Confirmed";

export interface ConfidenceFactors {
  evidenceCount: number;
  averageWeight: number;
  recencyFactor: number;
  contradictionCount: number;
  explicitConfirmation: boolean;
}

export interface ConfidenceExplanation {
  summary: string;
  factorBreakdown: Record<string, string | number | boolean>;
}

export interface IdentityConfidence {
  score: number; // 0.0 to 1.0
  level: ConfidenceLevel;
  calculatedAt: string;
  explanation: string;
  supportingEvidenceCount: number;
  confidenceHistory?: IdentityConfidence[]; // Reserved placeholder
}

export interface IdentityNode {
  id: string;
  aspectType: IdentityAspectType;
  value: string;
  confidence?: IdentityConfidence;
  evidenceIds: string[]; // references IdentityEvidence.id
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type IdentityEdgeType =
  | "related_to"
  | "supports"
  | "depends_on"
  | "derived_from"
  | "conflicts_with";

export interface IdentityEdge {
  id: string;
  sourceId: string; // references IdentityNode.id
  targetId: string; // references IdentityNode.id
  type: IdentityEdgeType;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityGraph {
  nodes: IdentityNode[];
  edges: IdentityEdge[];
  graphVersion: number;
}

export type EvidenceSourceType =
  | "Memory"
  | "Event"
  | "Note"
  | "UserDirect"
  | string;

export type EvidenceMetadata = Record<string, unknown>;

export interface EvidenceReference {
  sourceId: string;
  sourceType: EvidenceSourceType;
}

export interface IdentityEvidence {
  id: string;
  nodeId: string; // references IdentityNode.id
  sourceType: EvidenceSourceType;
  sourceId: string;
  contentReference?: string;
  metadata?: EvidenceMetadata;
  weight: number; // default: 1.0
  status: string; // default: "Active"
  originEngine: string; // default: "Manual"
  createdAt: string;
}

export interface Identity {
  id: string;
  nodes: IdentityNode[];
  edges: IdentityEdge[];
  createdAt: string;
  updatedAt: string;
}

// Keep a placeholder/structure for legacy IdentityAspect from the first design
export interface IdentityAspect {
  id: string;
  identityId: string;
  type: IdentityAspectType;
  value: string;
  confidence: IdentityConfidence;
  evidence: IdentityEvidence[];
  createdAt: string;
  updatedAt: string;
}

// Evolution Domain Models
export type IdentityChangeType =
  | "NodeAdded"
  | "NodeUpdated"
  | "NodeDeleted"
  | "EdgeAdded"
  | "EdgeDeleted"
  | "RootCreated"
  | "RootUpdated";

export interface IdentityChange {
  id: string;
  versionId: string;
  changeType: IdentityChangeType;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface IdentitySnapshot {
  id: string;
  identityId: string;
  nodes: IdentityNode[];
  edges: IdentityEdge[];
  graphVersion: number;
  timestamp: string;
  lastValidatedAt?: string; // Reserved
}

export interface IdentityVersion {
  versionId: string;
  identityId: string;
  createdAt: string;
  previousVersionId: string | null;
  changeSummary: string;
  confidenceSnapshotReference: string; // references associated confidence metadata
  calculationVersion: number;
  snapshotId: string;
}

export interface IdentityTimeline {
  identityId: string;
  timelineId: string;
  versions: IdentityVersion[];
  changes: IdentityChange[];
  updatedAt: string;
}

// Interest Domain Models
export type InterestCategory =
  | "Technology"
  | "Science"
  | "Art"
  | "Sports"
  | "Philosophy"
  | "Business"
  | "Lifestyle"
  | "Other";

export type InterestStatus =
  | "Active"
  | "Archived"
  | "Emerging"
  | "Suspended";

export interface InterestStrength {
  score: number; // 0.0 to 1.0
  level: "Low" | "Medium" | "High" | "Extreme";
  updatedAt: string;
}

export interface IdentityInterest {
  id: string;
  identityId: string;
  topic: string;
  category: InterestCategory;
  strength: InterestStrength;
  confidenceReference: string; // references graph nodeId representing this interest
  evidenceReferences: string[]; // references evidenceIds supporting this interest
  firstObserved: string;
  lastObserved: string;
  status: InterestStatus;
  decayModel?: Record<string, unknown>; // Reserved
  predictionModel?: Record<string, unknown>; // Reserved
}

// Skill Domain Models
export type SkillCategory =
  | "Technical"
  | "Creative"
  | "Communication"
  | "Analytical"
  | "Leadership"
  | "Other";

export type SkillLevel =
  | "Novice"
  | "Intermediate"
  | "Advanced"
  | "Expert";

export type SkillStatus =
  | "Emerging"
  | "Active"
  | "Dormant"
  | "Archived";

export interface IdentitySkill {
  id: string;
  identityId: string;
  name: string;
  category: SkillCategory;
  level: SkillLevel;
  confidenceReference: string; // references graph nodeId representing this skill
  evidenceReferences: string[]; // references evidenceIds supporting this skill
  firstObserved: string;
  lastObserved: string;
  status: SkillStatus;
  proficiencyTrend?: "Improving" | "Stable" | "Declining"; // Reserved
  masteryPrediction?: Record<string, unknown>; // Reserved
  evidenceCount?: number; // Reserved
  averageWeight?: number; // Reserved
  lastEvidenceAt?: string; // Reserved
}

// Goal Engine Domain Models
export type GoalCategory =
  | "Career"
  | "Health"
  | "Learning"
  | "Personal"
  | "Financial"
  | "Other";

export type GoalStatus =
  | "Active"
  | "Completed"
  | "Deferred"
  | "Archived";

export type GoalPriority =
  | "Low"
  | "Medium"
  | "High"
  | "Critical";

export interface IdentityGoal {
  id: string;
  identityId: string;
  title: string;
  description: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  confidenceReference: string; // graph nodeId representing the Goal
  evidenceReferences: string[]; // references evidenceIds
  firstObserved: string;
  lastUpdated: string;
  progressTracking?: Record<string, unknown>; // Reserved
  milestoneTracking?: Record<string, unknown>; // Reserved
  deadlinePrediction?: Record<string, unknown>; // Reserved
}

// Habit Engine Domain Models
export type HabitFrequency =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Other";

export type HabitStatus =
  | "Active"
  | "Paused"
  | "Archived";

export interface HabitStrength {
  score: number; // 0.0 to 1.0
  level: "Weak" | "Establishing" | "Strong" | "Automatic";
  updatedAt: string;
}

export interface IdentityHabit {
  id: string;
  identityId: string;
  name: string;
  frequency: HabitFrequency;
  strength: HabitStrength;
  status: HabitStatus;
  confidenceReference: string; // graph nodeId representing the Habit
  evidenceReferences: string[];
  firstObserved: string;
  lastObserved: string;
  streak?: number; // Reserved
  prediction?: Record<string, unknown>; // Reserved
}

// Preference Engine Domain Models
export type PreferenceCategory =
  | "Food"
  | "Media"
  | "WorkStyle"
  | "Environment"
  | "Communication"
  | "Other";

export type PreferenceStatus =
  | "Active"
  | "Archived";

export interface PreferenceStrength {
  score: number; // 0.0 to 1.0
  level: "Low" | "Moderate" | "Strong" | "Immutable";
  updatedAt: string;
}

export interface IdentityPreference {
  id: string;
  identityId: string;
  category: PreferenceCategory;
  value: string;
  strength: PreferenceStrength;
  status: PreferenceStatus;
  confidenceReference: string; // graph nodeId representing the Preference
  evidenceReferences: string[];
  firstObserved: string;
  lastObserved: string;
  ranking?: number; // Reserved
  alternatives?: string[]; // Reserved
}

// Value Engine Domain Models
export type ValueCategory =
  | "Personal"
  | "Social"
  | "Professional"
  | "Spiritual"
  | "Other";

export type ValueStatus =
  | "Active"
  | "Archived";

export interface ValueStrength {
  score: number; // 0.0 to 1.0
  level: "Low" | "Moderate" | "Strong" | "Immutable";
  updatedAt: string;
}

export interface IdentityValue {
  id: string;
  identityId: string;
  name: string;
  category: ValueCategory;
  strength: ValueStrength;
  confidenceReference: string; // graph nodeId representing the Value
  supportingIdentityReferences: string[]; // references supporting nodes (e.g. goal nodeId)
  evidenceReferences: string[]; // references evidenceIds
  firstObserved: string;
  lastObserved: string;
  status: ValueStatus;
  valueHierarchy?: string; // Reserved
  conflictingValues?: string[]; // Reserved
}

// Relationship Engine Domain Models
export type RelationshipType =
  | "Family"
  | "Friend"
  | "Professional"
  | "Mentor"
  | "Other";

export type RelationshipStatus =
  | "Active"
  | "Archived"
  | "Emerging";

export interface RelationshipStrength {
  score: number; // 0.0 to 1.0
  level: "Distant" | "Casual" | "Close" | "Intimate";
  updatedAt: string;
}

export interface IdentityRelationship {
  id: string;
  identityId: string;
  targetEntityId: string;
  relationshipType: RelationshipType;
  strength: RelationshipStrength;
  confidenceReference: string; // graph nodeId representing the Relationship
  supportingIdentityReferences: string[];
  evidenceReferences: string[];
  firstObserved: string;
  lastObserved: string;
  status: RelationshipStatus;
  interactionHistory?: Record<string, unknown>; // Reserved
  trustScore?: number; // Reserved
  reciprocity?: string; // Reserved
}

// Personality Engine Domain Models
export type PersonalityTrait =
  | "Openness"
  | "Conscientiousness"
  | "Extraversion"
  | "Agreeableness"
  | "Neuroticism"
  | "Other";

export type PersonalityStatus =
  | "Active"
  | "Archived";

export interface TraitStrength {
  score: number; // 0.0 to 1.0
  level: "Low" | "Moderate" | "High" | "Extreme";
  updatedAt: string;
}

export interface IdentityPersonality {
  id: string;
  identityId: string;
  trait: PersonalityTrait;
  strength: TraitStrength;
  confidenceReference: string; // graph nodeId representing the Personality Trait
  supportingIdentityReferences: string[];
  evidenceReferences: string[];
  firstObserved: string;
  lastObserved: string;
  status: PersonalityStatus;
  personalityProfile?: Record<string, unknown>; // Reserved
  personalityDimensions?: Record<string, unknown>; // Reserved
  traitInteractions?: Record<string, unknown>; // Reserved
}

// Sprint 5 Domain Models
export type IdentityHealthStatus =
  | "Healthy"
  | "Partial"
  | "Sparse"
  | "Conflicted";

export interface IdentityHealth {
  status: IdentityHealthStatus;
  reason: string;
  errors: string[];
  warnings: string[];
}

export interface IdentityCompleteness {
  score: number; // 0 to 100
  populatedDimensionsCount: number;
  totalDimensionsCount: number;
  dimensionStatus: Record<string, boolean>;
}

export interface IdentityProfile {
  identityId: string;
  profileVersion: number;
  generatedAt: string;
  interests: IdentityInterest[];
  skills: IdentitySkill[];
  goals: IdentityGoal[];
  habits: IdentityHabit[];
  preferences: IdentityPreference[];
  values: IdentityValue[];
  relationships: IdentityRelationship[];
  personalityTraits: IdentityPersonality[];
  confidenceSummary: {
    averageScore: number;
    highConfidenceAspectsCount: number;
    totalAspectsCount: number;
  };
  identityHealth: IdentityHealth;
  completeness: number; // 0 to 100
  recentChanges: IdentityChange[];
  profileHistory?: unknown; // Reserved
  profileDiff?: unknown; // Reserved
}

export interface IdentitySummary {
  primaryInterests: string[];
  strongestSkills: string[];
  activeGoals: string[];
  dominantHabits: string[];
  coreValues: string[];
  shortSummary: string;
  longSummary: string;
  conversationalSummary?: string; // Reserved
}
