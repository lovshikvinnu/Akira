import { ScoreAggregator } from "./types";

export class AverageScoreAggregator implements ScoreAggregator {
  /**
   * Aggregates multiple scores by computing their arithmetic mean.
   * If the list of scores is empty, returns 0.0.
   */
  public aggregate(scores: readonly number[]): number {
    if (!scores || scores.length === 0) {
      return 0.0;
    }
    const sum = scores.reduce((acc, score) => acc + score, 0);
    return sum / scores.length;
  }
}
