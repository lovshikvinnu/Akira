import { CandidateContext } from "../intelligence/types";
import { ScoredContext } from "../relevance/types";

export interface SelectedContext {
  readonly context: CandidateContext;
  readonly score: number;
}

export interface ContextAssemblyResult {
  readonly items: readonly SelectedContext[];
}

export interface SelectionPolicy {
  select(scoredContexts: readonly ScoredContext[]): readonly ScoredContext[];
}
