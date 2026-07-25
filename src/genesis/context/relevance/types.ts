import { CandidateContext, ContextRequest } from "../intelligence/types";

export interface ScoredContext {
  readonly context: CandidateContext;
  readonly score: number;
}

export interface ScoredContextCollection {
  readonly scoredContexts: readonly ScoredContext[];
}

export interface RelevanceStrategy {
  readonly id: string;
  evaluate(request: ContextRequest, candidate: CandidateContext): number;
}

export interface ScoreAggregator {
  aggregate(scores: readonly number[]): number;
}
