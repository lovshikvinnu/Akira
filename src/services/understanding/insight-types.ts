import { UnderstandingConfidence } from "./types";

export type InsightCategory = "Parallel Commitments" | "Learning Momentum" | "Goal Alignment";

export type Insight = {
  id: string;
  canonicalKey: string;
  category: InsightCategory;
  confidence: UnderstandingConfidence;
  supportingUnderstandingIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type InsightFragment = {
  canonicalKey: string;
  category: InsightCategory;
  confidence: UnderstandingConfidence;
  supportingUnderstandingIds: string[];
};

export interface InsightRule {
  name: string;
  evaluate(understandings: import("./types").Understanding[]): InsightFragment[];
}
