import { Memory } from "../validation/types";
import { RelationshipType } from "./types";

export interface RelationshipRule {
  name: string;
  evaluate(
    newMemory: Memory,
    existingMemory: Memory,
  ): {
    detected: boolean;
    type?: RelationshipType;
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
