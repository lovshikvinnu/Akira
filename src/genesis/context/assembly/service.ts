import { ScoredContextCollection } from "../relevance/types";
import { SelectionPolicy, ContextAssemblyResult, SelectedContext } from "./types";

export class ContextAssemblyService {
  constructor(private readonly policy: SelectionPolicy) {}

  /**
   * Accepts a ScoredContextCollection, filters contexts using the selection policy,
   * and packages the remaining items into a frozen ContextAssemblyResult.
   *
   * This service preserves the exact ordering produced by the RelevanceEngine.
   * The result contains only the selected context items, with no metadata or telemetry.
   */
  public assemble(collection: ScoredContextCollection): ContextAssemblyResult {
    if (!collection) {
      throw new Error("ScoredContextCollection is required");
    }

    // Delegate selection to the configured policy
    const selectedScored = this.policy.select(collection.scoredContexts);

    // Map ScoredContext to SelectedContext, preserving ordering and applying shallow freeze
    const items: SelectedContext[] = selectedScored.map((item) => {
      const selectedItem: SelectedContext = {
        context: item.context,
        score: item.score,
      };
      return Object.freeze(selectedItem);
    });

    // Return the minimal, frozen ContextAssemblyResult
    return Object.freeze({
      items: Object.freeze(items),
    });
  }
}
