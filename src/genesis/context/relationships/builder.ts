import { PersonRelationship, RelationshipContext, RelationshipEvidence } from "./types";

/**
 * Builds the RelationshipContext from the registered relationships list and evidence history.
 */
export function buildRelationshipContext(
  relationships: PersonRelationship[],
  evidenceLog: RelationshipEvidence[],
): RelationshipContext {
  // Active connections (everything except archived ones)
  const activePeople = relationships.filter((r) => r.status !== "RelationshipArchived");

  // Significance mapping
  const relationshipSignificance = activePeople.map((r) => ({
    relationshipId: r.id,
    rating: r.significance,
  }));

  // Shared context mapping
  const sharedContext = activePeople.map((r) => ({
    relationshipId: r.id,
    domains: r.sharedDomains,
    projectIds: r.sharedProjectIds,
    goalIds: r.sharedGoalIds,
  }));

  // Recent developments mapping
  const recentDevelopments = activePeople.map((r) => ({
    relationshipId: r.id,
    descriptions: r.recentDevelopments,
  }));

  // Open discussions mapping
  const openDiscussions = activePeople.map((r) => ({
    relationshipId: r.id,
    topics: r.openDiscussions,
  }));

  // Continuity mapping
  const continuity = activePeople.map((r) => ({
    relationshipId: r.id,
    frequency: r.interactionFrequency,
    lastActive: r.lastInteractionTimestamp,
  }));

  // Compute aggregated active confidence
  // `confidence` here is a mean over known people, so with none of them it is
  // an average of nothing. It stays 1.0 for the readers that only ever look at
  // it when there is something to look at, and `basis` is what tells an
  // aggregate whether that number was measured or defaulted.
  let confidence = 1.0;
  if (activePeople.length > 0) {
    const totalConfidence = activePeople.reduce((sum, r) => sum + r.confidence, 0);
    confidence = Number((totalConfidence / activePeople.length).toFixed(2));
  }

  return {
    origin: "RelationshipEngine",
    evidence: {
      evidenceLog: [...evidenceLog],
      relationshipsSnapshot: [...relationships],
    },
    confidence,
    basis: activePeople.length,
    importantPeople: activePeople,
    relationshipSignificance,
    sharedContext,
    recentDevelopments,
    openDiscussions,
    continuity,
  };
}
