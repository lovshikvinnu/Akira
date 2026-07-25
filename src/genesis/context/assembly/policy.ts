import { ScoredContext } from "../relevance/types";
import { SelectionPolicy } from "./types";

export class ThresholdSelectionPolicy implements SelectionPolicy {
  private readonly threshold: number;

  constructor(threshold: number) {
    if (
      typeof threshold !== "number" ||
      Number.isNaN(threshold) ||
      threshold < 0.0 ||
      threshold > 1.0
    ) {
      throw new Error(
        "Threshold must be a valid normalized number between 0.0 and 1.0 (inclusive).",
      );
    }
    this.threshold = threshold;
  }

  /**
   * Filters the scored contexts to retain only items with scores greater than or equal to the threshold.
   * Maintains the original array's ordering.
   */
  public select(scoredContexts: readonly ScoredContext[]): readonly ScoredContext[] {
    if (!scoredContexts) {
      return [];
    }
    return scoredContexts.filter((item) => item.score >= this.threshold);
  }
}
