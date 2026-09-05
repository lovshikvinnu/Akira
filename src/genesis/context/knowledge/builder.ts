import { KnowledgeNode, KnowledgeContext, KnowledgeEvidence, KnowledgeRelationship } from "./types";

/**
 * Builds the KnowledgeContext from the current user nodes registry and relationship mappings.
 */
export function buildKnowledgeContext(
  nodes: KnowledgeNode[],
  relationships: KnowledgeRelationship[],
  evidenceLog: KnowledgeEvidence[],
): KnowledgeContext {
  const knownDomains = nodes.filter((n) => n.type === "Domain");
  const skills = nodes.filter((n) => n.type === "Skill");
  const concepts = nodes.filter((n) => n.type === "Concept");

  // Calculate learning progress across domains
  const learningProgress = knownDomains.map((domain) => {
    const subNodes = nodes.filter((n) => n.domainId === domain.id);
    if (subNodes.length === 0) {
      return { domainId: domain.id, progressPercentage: 0 };
    }

    // Progress is the ratio of nodes that have reached a verified/stable stage
    const stableNodes = subNodes.filter(
      (n) => n.status === "Refined" || n.status === "Reinforced" || n.status === "Updated",
    );
    const progressPercentage = Math.round((stableNodes.length / subNodes.length) * 100);
    return { domainId: domain.id, progressPercentage };
  });

  // Identify knowledge gaps
  // A gap exists when a concept or skill has a prerequisite node that has low confidence (< 0.60) or is Deprecated
  const knowledgeGaps: { nodeId: string; missingPrerequisiteNodeIds: string[] }[] = [];
  nodes.forEach((node) => {
    // Find all prerequisite relationships where node is the target (fromId -> node, fromId is prerequisite)
    const prereqRels = relationships.filter((r) => r.toId === node.id && r.type === "prerequisite");
    const missingPrerequisites: string[] = [];

    prereqRels.forEach((rel) => {
      const prereqNode = nodes.find((n) => n.id === rel.fromId);
      if (!prereqNode || prereqNode.confidence < 0.6 || prereqNode.status === "Deprecated") {
        missingPrerequisites.push(rel.fromId);
      }
    });

    if (missingPrerequisites.length > 0) {
      knowledgeGaps.push({
        nodeId: node.id,
        missingPrerequisiteNodeIds: missingPrerequisites,
      });
    }
  });

  // Identify areas requiring clarification (nodes marked with low confidence or Deprecated status)
  const areasRequiringClarification = nodes
    .filter((n) => n.status === "Deprecated" || n.confidence < 0.4)
    .map((n) => n.id);

  // Compute aggregated confidence
  // `confidence` here is a mean over knowledge nodes, so with none of them it is
  // an average of nothing. It stays 1.0 for the readers that only ever look at
  // it when there is something to look at, and `basis` is what tells an
  // aggregate whether that number was measured or defaulted.
  let confidence = 1.0;
  if (nodes.length > 0) {
    const totalConfidence = nodes.reduce((sum, n) => sum + n.confidence, 0);
    confidence = Number((totalConfidence / nodes.length).toFixed(2));
  }

  return {
    origin: "KnowledgeEngine",
    evidence: {
      evidenceLog: [...evidenceLog],
      nodesSnapshot: [...nodes],
    },
    confidence,
    basis: nodes.length,
    knownDomains,
    skills,
    concepts,
    knowledgeGaps,
    relationships,
    learningProgress,
    areasRequiringClarification,
  };
}
