import { ReflectionReport, ReflectionEvidence, ReflectionContext } from "./types";
import { buildReflectionContext } from "./builder";
import { reflectionEvents } from "./events";
import { synthesizeReflectionReport, applyUserReflectionCorrection } from "./rules";
import { GoalContext } from "../../context/goals/types";
import { KnowledgeContext } from "../../context/knowledge/types";
import { HabitContext } from "../../context/habits/types";
import { RelationshipContext } from "../../context/relationships/types";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

class ReflectionService {
  private historicalReports: ReflectionReport[] = [];
  private evidenceLog: ReflectionEvidence[] = [];
  private currentContext: ReflectionContext | null = null;

  /**
   * Initializes the Reflection Engine and loads archived historical contexts from prior sessions.
   * Hydrates the read-only baseline for active companion session boots.
   */
  public initialize(initialReports?: ReflectionReport[]): ReflectionContext {
    this.historicalReports = initialReports ? [...initialReports] : [];
    this.evidenceLog = [];
    this.rebuildContext();
    return this.currentContext!;
  }

  /**
   * Directly sets historical reports (injected by Companion platform layer).
   */
  public setHistoricalReports(reports: ReflectionReport[]): void {
    this.historicalReports = [...reports];
    this.rebuildContext();
  }

  /**
   * Retrieve active read-only Reflection Context.
   */
  public getContext(): ReflectionContext | null {
    return this.currentContext;
  }

  /**
   * Retrospectively analyzes active contexts and compiles a finalized ReflectionContext.
   * Invoked ONLY at interaction/session conclusion (Temporal Decoupling Constraint).
   */
  public finalizeSession(
    goals: GoalContext | null,
    knowledge: KnowledgeContext | null,
    habits: HabitContext | null,
    relationships: RelationshipContext | null,
  ): ReflectionContext {
    reflectionEvents.publish("session_finalized", this.currentContext!);

    // Synthesize the new reflection report using finalized inputs
    const report = synthesizeReflectionReport(goals, knowledge, habits, relationships);
    this.historicalReports.push(report);

    this.rebuildContext();
    reflectionEvents.publish("reflection_prepared", this.currentContext!, report);
    reflectionEvents.publish("reflection_context_finalized", this.currentContext!, report);

    eventService.record(
      "note_created",
      "Reflection Context Compiled",
      `Retrospective growth reflection synthesized for period ending ${new Date(
        report.timePeriod.endedAt,
      ).toLocaleDateString()}`,
      null,
      null,
      { report },
    );

    return this.currentContext!;
  }

  /**
   * Applies user-initiated corrections to a reflection report (Evidence Verification principle).
   */
  public correctReflection(
    id: string,
    property: "progressSummary" | "growthSummary" | "patternSummary",
    value: string,
    explanation: string,
  ): void {
    const index = this.historicalReports.findIndex((r) => r.id === id);
    if (index === -1) return;

    const previous = this.historicalReports[index];
    const corrected = applyUserReflectionCorrection(previous, property, value);
    this.historicalReports[index] = corrected;

    const correctionEvidence: ReflectionEvidence = {
      id: uid(),
      timestamp: Date.now(),
      description: `User corrected reflection summary "${property}": ${explanation}`,
      source: "user_correction",
      verified: true,
    };

    this.evidenceLog.push(correctionEvidence);
    corrected.evidence.push(correctionEvidence);

    this.rebuildContext();
    reflectionEvents.publish("reflection_corrected", this.currentContext!, corrected);

    eventService.record(
      "note_created",
      "Reflection Context Corrected",
      `User correction applied to reflection "${corrected.id}": ${explanation}`,
      null,
      null,
      { corrected },
    );
  }

  private rebuildContext(): void {
    this.currentContext = buildReflectionContext(this.historicalReports, this.evidenceLog);
  }

  /**
   * Resets active cached contexts.
   */
  public shutdown(): void {
    this.historicalReports = [];
    this.evidenceLog = [];
    this.currentContext = null;
  }
}

export const reflectionService = new ReflectionService();
export type { ReflectionService };
