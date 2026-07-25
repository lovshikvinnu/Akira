export interface ContextRequest {
  readonly query: string;
  readonly options?: Record<string, unknown>;
}

export interface CandidateContext {
  readonly id: string;
  readonly providerId: string;
  readonly type: string;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ContextCollection {
  readonly contexts: readonly CandidateContext[];
}

export interface ContextProvider {
  readonly id: string;
  retrieve(request: ContextRequest): readonly CandidateContext[];
}
