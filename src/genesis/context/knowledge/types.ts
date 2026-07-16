import { PresenceContext } from "../../../akira-os/presence/types";
import { CompanionState } from "../state/types";
import { GoalContext } from "../goals/types";

export type KnowledgeNodeType = "Domain" | "Skill" | "Concept";

export type KnowledgeStatus =
  "Observed" | "Inferred" | "Refined" | "Reinforced" | "Updated" | "Deprecated";

export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  name: string;
  description: string;
  status: KnowledgeStatus;
  domainId: string | null; // Null for high-level domains
  confidence: number; // 0.0 to 1.0 representing certainty of mastery
  evidenceIds: string[];
  lastSeenAt: number;
}

export interface KnowledgeEvidence {
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
  nodeId: string;
  targetProperty: "status" | "confidence" | "description" | "name";
  value: string;
}

export interface KnowledgeRelationship {
  fromId: string;
  toId: string;
  type: "prerequisite" | "dependency" | "related";
}

export interface KnowledgeContext {
  // Provenance Preservation metadata
  origin: "KnowledgeEngine";
  evidence: {
    evidenceLog: KnowledgeEvidence[];
    nodesSnapshot: KnowledgeNode[];
  };
  confidence: number; // Aggregated confidence rating across all nodes

  // Primary output properties
  knownDomains: KnowledgeNode[];
  skills: KnowledgeNode[];
  concepts: KnowledgeNode[];
  knowledgeGaps: { nodeId: string; missingPrerequisiteNodeIds: string[] }[];
  relationships: KnowledgeRelationship[];
  learningProgress: { domainId: string; progressPercentage: number }[];
  areasRequiringClarification: string[]; // Node IDs with contradictions or high uncertainty
}
