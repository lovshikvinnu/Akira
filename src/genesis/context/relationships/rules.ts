import { PersonRelationship, RelationshipStatus } from "./types";
import * as CONSTANTS from "./constants";

/**
 * Creates a new PersonRelationship in the initial "PersonObserved" status.
 * Conforms to Person Identity Constraint: does not assume relationship yet.
 */
export function observePerson(id: string, name: string): PersonRelationship {
  const now = Date.now();
  return {
    id,
    name: name.trim(),
    role: "Unspecified",
    status: "PersonObserved",
    significance: 1,
    sharedDomains: [],
    sharedProjectIds: [],
    sharedGoalIds: [],
    interactionFrequency: 1,
    lastInteractionTimestamp: now,
    openDiscussions: [],
    recentDevelopments: [],
    confidence: CONSTANTS.CONFIDENCE_PERSON_OBSERVED,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transitions a relationship through its lifecycle status.
 */
export function updateRelationshipStatus(
  relationship: PersonRelationship,
  newStatus: RelationshipStatus,
): PersonRelationship {
  if (relationship.status === newStatus) {
    return relationship;
  }

  let confidence = relationship.confidence;
  switch (newStatus) {
    case "PersonObserved":
      confidence = CONSTANTS.CONFIDENCE_PERSON_OBSERVED;
      break;
    case "RelationshipIdentified":
      confidence = CONSTANTS.CONFIDENCE_RELATIONSHIP_IDENTIFIED;
      break;
    case "RelationshipUnderstood":
      confidence = CONSTANTS.CONFIDENCE_RELATIONSHIP_UNDERSTOOD;
      break;
    case "RelationshipRefined":
      confidence = CONSTANTS.CONFIDENCE_RELATIONSHIP_REFINED;
      break;
    case "RelationshipEvolved":
      confidence = CONSTANTS.CONFIDENCE_RELATIONSHIP_EVOLVED;
      break;
    case "RelationshipArchived":
      confidence = CONSTANTS.CONFIDENCE_RELATIONSHIP_ARCHIVED;
      break;
  }

  return {
    ...relationship,
    status: newStatus,
    confidence,
    updatedAt: Date.now(),
  };
}

/**
 * Increments frequency of interactions and triggers status promotions based on positive evidence.
 */
export function recordInteraction(relationship: PersonRelationship): PersonRelationship {
  const now = Date.now();
  const freq = relationship.interactionFrequency + 1;
  const updated: PersonRelationship = {
    ...relationship,
    interactionFrequency: freq,
    lastInteractionTimestamp: now,
    updatedAt: now,
  };

  return updated;
}

/**
 * Applies explicit user corrections in accordance with the Evidence Verification principle.
 */
export function applyUserCorrection(
  relationship: PersonRelationship,
  property:
    | "status"
    | "significance"
    | "role"
    | "sharedProjectIds"
    | "openDiscussions"
    | "recentDevelopments",
  value: string,
): PersonRelationship {
  const updated: PersonRelationship = {
    ...relationship,
    confidence: CONSTANTS.CONFIDENCE_RELATIONSHIP_VERIFIED,
    updatedAt: Date.now(),
  };

  if (property === "status") {
    updated.status = value as RelationshipStatus;
  } else if (property === "significance") {
    updated.significance = Math.min(10, Math.max(1, parseInt(value, 10) || 1));
  } else if (property === "role") {
    updated.role = value;
  } else if (property === "sharedProjectIds") {
    updated.sharedProjectIds = JSON.parse(value);
  } else if (property === "openDiscussions") {
    updated.openDiscussions = JSON.parse(value);
  } else if (property === "recentDevelopments") {
    updated.recentDevelopments = JSON.parse(value);
  }

  return updated;
}
