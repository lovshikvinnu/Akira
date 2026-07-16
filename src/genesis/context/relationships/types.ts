import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";
import { KnowledgeContext } from "../knowledge/types";

export type RelationshipStatus =
  | "PersonObserved"
  | "RelationshipIdentified"
  | "RelationshipUnderstood"
  | "RelationshipRefined"
  | "RelationshipEvolved"
  | "RelationshipArchived";

export interface PersonRelationship {
  id: string;
  name: string;
  role: string; // e.g. "Collaborator", "Mentor", "Family", "Unspecified"
  status: RelationshipStatus;
  significance: number; // 1 to 10 scale representing interpersonal impact
  sharedDomains: string[]; // related learning domains
  sharedProjectIds: string[]; // related workspace projects
  sharedGoalIds: string[]; // related goal objectives
  interactionFrequency: number;
  lastInteractionTimestamp: number;
  openDiscussions: string[]; // pending topics / plans
  recentDevelopments: string[]; // resolved milestones / achievements
  confidence: number; // 0.0 to 1.0 representing understanding certainty
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipEvidence {
  id: string;
  source:
    | "user_correction"
    | "workspace_event"
    | "dialogue_analysis"
    | "presence_context"
    | "reflection_outcome";
  timestamp: number;
  description: string;
  verified: boolean;
  relationshipId: string;
  targetProperty:
    | "status"
    | "significance"
    | "role"
    | "sharedProjectIds"
    | "openDiscussions"
    | "recentDevelopments";
  value: string;
}

export interface RelationshipContext {
  // Provenance Preservation metadata
  origin: "RelationshipEngine";
  evidence: {
    evidenceLog: RelationshipEvidence[];
    relationshipsSnapshot: PersonRelationship[];
  };
  confidence: number; // Aggregated confidence rating across active relationships

  // Primary output properties
  importantPeople: PersonRelationship[];
  relationshipSignificance: { relationshipId: string; rating: number }[];
  sharedContext: {
    relationshipId: string;
    domains: string[];
    projectIds: string[];
    goalIds: string[];
  }[];
  recentDevelopments: { relationshipId: string; descriptions: string[] }[];
  openDiscussions: { relationshipId: string; topics: string[] }[];
  continuity: { relationshipId: string; frequency: number; lastActive: number }[];
}
