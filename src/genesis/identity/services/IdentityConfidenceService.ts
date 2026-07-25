import { IdentityConfidence, ConfidenceExplanation, ConfidenceLevel } from "../types";
import { IdentityRepository } from "../repositories/IdentityRepository";
import { InMemoryIdentityRepository } from "../repositories/InMemoryIdentityRepository";
import { eventService } from "../../events/event-service";
import { Events } from "../../../contracts/events";

export class IdentityConfidenceService {
  private repository: IdentityRepository;

  constructor(repository?: IdentityRepository) {
    this.repository = repository || new InMemoryIdentityRepository();
  }

  /**
   * Initializes the service, optionally setting a new repository.
   */
  public initialize(repository?: IdentityRepository): void {
    if (repository) {
      this.repository = repository;
    }
  }

  /**
   * Set the active repository dynamically.
   */
  public setRepository(repository: IdentityRepository): void {
    this.repository = repository;
  }

  /**
   * Get the active repository.
   */
  public getRepository(): IdentityRepository {
    return this.repository;
  }

  /**
   * Helper to retrieve cached confidence from storage.
   */
  public getConfidence(nodeId: string): IdentityConfidence | null {
    return this.repository.getConfidence(nodeId);
  }

  /**
   * Re-evaluates confidence score and level deterministically, saves it, and emits events if changed.
   */
  public refreshConfidence(nodeId: string): IdentityConfidence {
    return this.calculateConfidence(nodeId);
  }

  /**
   * Calculates confidence based on evidence count, weight, recency, and contradictions.
   */
  public calculateConfidence(nodeId: string): IdentityConfidence {
    const node = this.repository.getNode(nodeId);
    if (!node) {
      throw new Error(`Cannot calculate confidence: aspect node "${nodeId}" does not exist.`);
    }

    const evidenceList = this.repository.getEvidenceByNode(nodeId);
    const edges = this.repository.getEdges();

    const evidenceCount = evidenceList.length;

    // 1. Evidence Weights
    const averageWeight =
      evidenceCount > 0 ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceCount : 0;

    // 2. Recency Factor
    let recencyFactor = 1.0;
    if (evidenceCount > 0) {
      const newestTimestamp = Math.max(
        ...evidenceList.map((ev) => new Date(ev.createdAt).getTime()),
      );
      const daysOld = (Date.now() - newestTimestamp) / (1000 * 60 * 60 * 24);
      if (daysOld > 30) {
        recencyFactor = 0.7;
      } else if (daysOld > 7) {
        recencyFactor = 0.9;
      }
    }

    // 3. Contradiction count (conflicts_with relationships)
    const contradictionCount = edges.filter(
      (edge) =>
        edge.type === "conflicts_with" && (edge.sourceId === nodeId || edge.targetId === nodeId),
    ).length;

    // 4. Explicit Confirmation
    const explicitConfirmation =
      !!node.metadata?.confirmed ||
      evidenceList.some(
        (ev) => ev.originEngine === "UserConfirmation" || ev.sourceType === "UserDirect",
      );

    // Scoring heuristics
    let score = 0.0;
    let level: ConfidenceLevel = "Unknown";
    let explanationSummary = "";

    if (explicitConfirmation) {
      score = 1.0;
      level = "Confirmed";
      explanationSummary = `Aspect "${node.value}" is explicitly confirmed by the user.`;
    } else if (evidenceCount === 0) {
      score = 0.0;
      level = "Unknown";
      explanationSummary = `No supporting evidence exists for aspect "${node.value}".`;
    } else {
      // Base score is calculated from count and average weight (e.g. 4 solid items reach ~1.0)
      const baseScore = evidenceCount * 0.25 * averageWeight;
      // Penalty for contradictions
      const contradictionPenalty = contradictionCount * 0.35;
      // Combined with recency decay
      score = (baseScore - contradictionPenalty) * recencyFactor;
      // Clamp between 0.0 and 1.0
      score = Math.max(0.0, Math.min(1.0, score));

      // Level boundaries
      if (score === 0) {
        level = "Unknown";
      } else if (score <= 0.2) {
        level = "Weak";
      } else if (score <= 0.45) {
        level = "Possible";
      } else if (score <= 0.75) {
        level = "Likely";
      } else if (score < 1.0) {
        level = "Strong";
      } else {
        level = "Confirmed";
      }

      explanationSummary = `Confidence is calculated as ${level} (score: ${score.toFixed(2)}) for aspect "${node.value}" based on ${evidenceCount} items, average weight of ${averageWeight.toFixed(1)}, and recency factor of ${recencyFactor.toFixed(1)}.`;
      if (contradictionCount > 0) {
        explanationSummary += ` Deducted ${contradictionPenalty.toFixed(2)} due to ${contradictionCount} contradiction conflict(s).`;
      }
    }

    const confidence: IdentityConfidence = {
      score,
      level,
      explanation: explanationSummary,
      supportingEvidenceCount: evidenceCount,
      calculatedAt: new Date().toISOString(),
    };

    // Check change
    const existing = this.repository.getConfidence(nodeId);
    const hasChanged = !existing || existing.score !== score || existing.level !== level;

    this.repository.saveConfidence(nodeId, confidence);

    if (hasChanged) {
      const eventType = existing
        ? Events.IDENTITY_CONFIDENCE_UPDATED
        : Events.IDENTITY_CONFIDENCE_CALCULATED;

      eventService.record(
        eventType as any,
        existing ? "Identity Confidence Updated" : "Identity Confidence Calculated",
        `Confidence level updated to "${level}" (score: ${score.toFixed(2)}) for node: ${nodeId}`,
        null,
        null,
        { nodeId, confidence },
      );
    }

    return confidence;
  }

  /**
   * Generates a structural breakdown of confidence factors.
   */
  public explainConfidence(nodeId: string): ConfidenceExplanation | null {
    const node = this.repository.getNode(nodeId);
    if (!node) return null;

    const confidence = this.getConfidence(nodeId) || this.calculateConfidence(nodeId);
    const evidenceList = this.repository.getEvidenceByNode(nodeId);
    const edges = this.repository.getEdges();

    const contradictionCount = edges.filter(
      (edge) =>
        edge.type === "conflicts_with" && (edge.sourceId === nodeId || edge.targetId === nodeId),
    ).length;

    const explicitConfirmation =
      !!node.metadata?.confirmed ||
      evidenceList.some(
        (ev) => ev.originEngine === "UserConfirmation" || ev.sourceType === "UserDirect",
      );

    return {
      summary: confidence.explanation,
      factorBreakdown: {
        score: confidence.score,
        level: confidence.level,
        evidenceCount: confidence.supportingEvidenceCount,
        averageWeight:
          evidenceList.length > 0
            ? evidenceList.reduce((sum, ev) => sum + ev.weight, 0) / evidenceList.length
            : 0,
        contradictionCount,
        explicitConfirmation,
        calculatedAt: confidence.calculatedAt,
      },
    };
  }
}

export const identityConfidenceService = new IdentityConfidenceService();
