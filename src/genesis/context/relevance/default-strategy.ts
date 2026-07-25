import { ContextRequest, CandidateContext } from "../intelligence/types";
import { RelevanceStrategy } from "./types";

/**
 * DefaultRelevanceStrategy
 *
 * NOTE: This strategy is an architectural validation strategy only. It exists to validate
 * the scoring pipeline and registry architecture rather than representing the intended
 * production relevance algorithm.
 */
export class DefaultRelevanceStrategy implements RelevanceStrategy {
  public readonly id = "default-strategy";

  /**
   * Performs a simple deterministic substring check to validate the scoring pipeline.
   * Returns 1.0 if the query is a substring of the candidate context content (case-insensitive),
   * and 0.0 otherwise.
   */
  public evaluate(request: ContextRequest, candidate: CandidateContext): number {
    if (!request || !request.query || !candidate || !candidate.content) {
      return 0.0;
    }
    const query = request.query.trim().toLowerCase();
    if (query === "") {
      return 0.0;
    }
    return candidate.content.toLowerCase().includes(query) ? 1.0 : 0.0;
  }
}
