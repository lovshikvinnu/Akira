import { KnowledgeNode, KnowledgeNodeType, KnowledgeStatus, KnowledgeEvidence } from "./types";
import * as CONSTANTS from "./constants";

/**
 * Creates a new KnowledgeNode in the initial "Observed" status.
 */
export function observeNode(
  id: string,
  type: KnowledgeNodeType,
  name: string,
  description: string,
  domainId: string | null = null,
): KnowledgeNode {
  return {
    id,
    type,
    name: name.trim(),
    description: description.trim(),
    status: "Observed",
    domainId,
    confidence: CONSTANTS.KNOWLEDGE_OBSERVED_CONFIDENCE,
    evidenceIds: [],
    lastSeenAt: Date.now(),
  };
}

/**
 * Transitions a KnowledgeNode's status, adjusting its base confidence.
 */
export function updateNodeStatus(node: KnowledgeNode, newStatus: KnowledgeStatus): KnowledgeNode {
  if (node.status === newStatus) {
    return node;
  }

  let confidence = node.confidence;
  switch (newStatus) {
    case "Observed":
      confidence = CONSTANTS.KNOWLEDGE_OBSERVED_CONFIDENCE;
      break;
    case "Inferred":
      confidence = CONSTANTS.KNOWLEDGE_INFERRED_CONFIDENCE;
      break;
    case "Refined":
      confidence = CONSTANTS.KNOWLEDGE_REFINED_CONFIDENCE;
      break;
    case "Reinforced":
      confidence = CONSTANTS.KNOWLEDGE_REINFORCED_CONFIDENCE;
      break;
    case "Updated":
      confidence = CONSTANTS.KNOWLEDGE_UPDATED_CONFIDENCE;
      break;
    case "Deprecated":
      confidence = CONSTANTS.KNOWLEDGE_DEPRECATED_CONFIDENCE;
      break;
  }

  return {
    ...node,
    status: newStatus,
    confidence,
    lastSeenAt: Date.now(),
  };
}

/**
 * Handles explicit user corrections according to the Evidence Verification principle.
 */
export function applyUserCorrection(
  node: KnowledgeNode,
  property: "status" | "confidence" | "description" | "name",
  value: string,
): KnowledgeNode {
  const updated: KnowledgeNode = {
    ...node,
    lastSeenAt: Date.now(),
  };

  if (property === "status") {
    updated.status = value as KnowledgeStatus;
    // Map default confidence for status transition but override if user verified
    updated.confidence = CONSTANTS.KNOWLEDGE_VERIFIED_CONFIDENCE;
  } else if (property === "confidence") {
    updated.confidence = Math.min(1.0, Math.max(0, parseFloat(value) || 0));
  } else if (property === "description") {
    updated.description = value;
    updated.confidence = CONSTANTS.KNOWLEDGE_VERIFIED_CONFIDENCE;
  } else if (property === "name") {
    updated.name = value;
    updated.confidence = CONSTANTS.KNOWLEDGE_VERIFIED_CONFIDENCE;
  }

  return updated;
}
