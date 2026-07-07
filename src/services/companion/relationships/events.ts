import { RelationshipContext, PersonRelationship } from "./types";

export type RelationshipEventType =
  | "person_observed"
  | "relationship_created"
  | "relationship_updated"
  | "relationship_corrected"
  | "relationship_context_updated";

export interface RelationshipEngineEvent {
  type: RelationshipEventType;
  relationshipContext: RelationshipContext;
  targetRelationship?: PersonRelationship;
  timestamp: number;
}

export type RelationshipCallback = (event: RelationshipEngineEvent) => void;

const listeners = new Set<RelationshipCallback>();

export const relationshipEvents = {
  /**
   * Subscribe to Relationship Context changes.
   */
  subscribe(callback: RelationshipCallback): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },

  /**
   * Publish a Relationship Engine transition.
   */
  publish(
    type: RelationshipEventType,
    context: RelationshipContext,
    targetRelationship?: PersonRelationship,
  ): void {
    const event: RelationshipEngineEvent = {
      type,
      relationshipContext: context,
      targetRelationship,
      timestamp: Date.now(),
    };

    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error executing relationship update callback:", err);
      }
    });
  },
};
