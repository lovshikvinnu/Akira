import { ReflectionReport, ReflectionContext, ReflectionEvidence } from "./types";

/**
 * Builds the immutable ReflectionContext package.
 */
export function buildReflectionContext(
  reports: ReflectionReport[],
  evidenceLog: ReflectionEvidence[],
): ReflectionContext {
  const activeReflection = reports.length > 0 ? reports[reports.length - 1] : null;
  const archivedReflections = reports.slice(0, -1);

  // Compute aggregated confidence
  // `confidence` here is a mean over reflection reports, so with none of them it is
  // an average of nothing. It stays 1.0 for the readers that only ever look at
  // it when there is something to look at, and `basis` is what tells an
  // aggregate whether that number was measured or defaulted.
  let confidence = 1.0;
  if (reports.length > 0) {
    const totalConfidence = reports.reduce((sum, r) => sum + r.confidence, 0);
    confidence = Number((totalConfidence / reports.length).toFixed(2));
  }

  return {
    origin: "ReflectionEngine",
    evidence: {
      evidenceLog: [...evidenceLog],
      historicalReflections: [...reports],
    },
    confidence,
    basis: reports.length,
    activeReflection,
    archivedReflections,
  };
}
