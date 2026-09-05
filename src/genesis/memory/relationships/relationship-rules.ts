import { Memory } from "../../validation/types";
import { RelationshipBasis, RelationshipType } from "./types";

export interface RelationshipRule {
  name: string;
  evaluate(
    newMemory: Memory,
    existingMemory: Memory,
  ): {
    detected: boolean;
    type?: RelationshipType;
    /** Required whenever `detected` is true. See {@link RelationshipBasis}. */
    basis?: RelationshipBasis;
    evidence?: string;
  };
}

export const relationshipRules: RelationshipRule[] = [
  {
    name: "Project Membership Rule",
    evaluate(newMemory, existingMemory) {
      if (
        newMemory.relatedProjectId &&
        existingMemory.relatedProjectId &&
        newMemory.relatedProjectId === existingMemory.relatedProjectId
      ) {
        return {
          detected: true,
          type: "Part Of",
          // The user put both memories in this project.
          basis: "Fact",
          evidence: `Both memories belong to Project ID: ${newMemory.relatedProjectId}.`,
        };
      }
      return { detected: false };
    },
  },
  {
    name: "Activity Sequence Rule",
    evaluate(newMemory, existingMemory) {
      if (
        newMemory.reason === "Repeated Activity" &&
        existingMemory.reason === "Repeated Activity" &&
        newMemory.relatedProjectId &&
        newMemory.relatedProjectId === existingMemory.relatedProjectId
      ) {
        const newTime = new Date(newMemory.timestamp).getTime();
        const oldTime = new Date(existingMemory.timestamp).getTime();
        if (newTime > oldTime) {
          return {
            detected: true,
            type: "Continues",
            // Same project and later in time. That one session carries on from
            // another is this module's reading, not something the user said.
            basis: "Inference",
            evidence: `Work session on "${newMemory.title}" continues progress of previous session "${existingMemory.title}" in project.`,
          };
        }
      }
      return { detected: false };
    },
  },
  {
    name: "Milestone Causality Rule",
    evaluate(newMemory, existingMemory) {
      if (
        newMemory.reason === "Milestone" &&
        existingMemory.reason === "Milestone" &&
        newMemory.relatedProjectId &&
        newMemory.relatedProjectId === existingMemory.relatedProjectId
      ) {
        const isCompletion =
          newMemory.explanation.toLowerCase().includes("completed") ||
          newMemory.explanation.toLowerCase().includes("100%");
        const isCreation =
          existingMemory.explanation.toLowerCase().includes("initiated") ||
          existingMemory.explanation.toLowerCase().includes("created");
        if (isCompletion && isCreation) {
          return {
            detected: true,
            type: "Caused By",
            // Causality, decided by looking for "completed"/"100%" against
            // "initiated"/"created" in prose. The strongest claim here and the
            // least evidenced, so it is recorded as a reading of the record.
            basis: "Inference",
            evidence: `Project completion milestone is caused by starting project "${existingMemory.title}" initially.`,
          };
        }
      }
      return { detected: false };
    },
  },
  {
    name: "Cross-Reference Rule",
    evaluate(newMemory, existingMemory) {
      if (
        newMemory.relatedNoteId &&
        existingMemory.relatedNoteId &&
        newMemory.relatedNoteId === existingMemory.relatedNoteId
      ) {
        return {
          detected: true,
          type: "References",
          // Same note id, set when the user wrote against that note.
          basis: "Fact",
          evidence: `Both memories reference the same Note ID: ${newMemory.relatedNoteId}.`,
        };
      }
      return { detected: false };
    },
  },
];

export function registerRelationshipRule(rule: RelationshipRule) {
  relationshipRules.unshift(rule);
}
