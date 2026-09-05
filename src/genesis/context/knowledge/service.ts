import {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeStatus,
  KnowledgeEvidence,
  KnowledgeRelationship,
  KnowledgeContext,
} from "./types";
import { buildKnowledgeContext } from "./builder";
import { knowledgeEvents } from "./events";
import { observeNode, updateNodeStatus, applyUserCorrection } from "./rules";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { goalService } from "../goals/service";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * ORPHANED. Started at boot, read by the resolver, and permanently empty.
 *
 * Unlike a dormant module this one is fully wired at both ends: `__root.tsx`
 * calls `initialize()`, and `context-resolution/service.ts` reads
 * `getContext()`. What is missing is in the middle -- `addNode` is the only way
 * a `KnowledgeNode` comes into existence and nothing calls it. So `nodes` is
 * always `[]`, and every derived figure is derived from nothing.
 *
 * It used to be worse than idle. `builder.ts` computes its aggregate as
 * `let confidence = 1.0; if (nodes.length > 0) { ...mean... }`, so an empty
 * registry still reports 1.0 -- and `resolveUnifiedContext` averaged that in
 * merely because the context object existed. Measured at boot with no user
 * data, this engine and `context/relationships` were the only two contributors
 * and the resolved certainty came out at 1: maximum confidence assembled
 * entirely out of absence.
 *
 * That path is closed. The builder now also reports `basis`, the number of
 * records its average was taken over, and every aggregate skips an engine whose
 * basis is 0. The 1.0 above is still computed and is still meaningless; what
 * changed is that nothing consumes it as a measurement.
 *
 * Not reconnected here. A producer needs an acquisition pipeline and an
 * ontology for what counts as a Concept, a Skill and a Domain, which is a
 * cognitive-model decision rather than a missing wire.
 *
 * ACTIVATION BOUNDARY: a caller for `addNode`. The empty-set default above
 * should be settled at the same time -- an engine holding nothing is not
 * certain of anything, and changing it moves `initiative/rules.ts`, so it is a
 * decision rather than a repair.
 */
class KnowledgeService {
  private nodes: KnowledgeNode[] = [];
  private relationships: KnowledgeRelationship[] = [];
  private evidenceLog: KnowledgeEvidence[] = [];
  private currentContext: KnowledgeContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;

  public initialize(): KnowledgeContext {
    this.nodes = [];
    this.relationships = [];
    this.evidenceLog = [];

    this.rebuildContext();

    // Subscribe to store updates to analyze workspace events
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
      this.processWorkspaceActivities();
    });

    return this.currentContext!;
  }

  /**
   * Retrieve active Knowledge Context.
   */
  public getContext(): KnowledgeContext | null {
    return this.currentContext;
  }

  /**
   * Add a new Knowledge node.
   */
  public addNode(
    name: string,
    type: KnowledgeNodeType,
    description: string,
    domainId: string | null = null,
  ): KnowledgeNode {
    const id = uid();
    const node = observeNode(id, type, name, description, domainId);
    this.nodes.push(node);

    this.evidenceLog.push({
      id: uid(),
      source: "dialogue_analysis",
      timestamp: Date.now(),
      description: `Observed new knowledge entity: "${name}" (${type})`,
      verified: false,
      nodeId: id,
      targetProperty: "status",
      value: "Observed",
    });

    this.rebuildContext();
    knowledgeEvents.publish("knowledge_observed", this.currentContext!, node);
    return node;
  }

  /**
   * Transition node status.
   */
  public setNodeStatus(id: string, status: KnowledgeStatus): void {
    const index = this.nodes.findIndex((n) => n.id === id);
    if (index === -1) return;

    const previous = this.nodes[index];
    const updated = updateNodeStatus(previous, status);
    this.nodes[index] = updated;

    this.evidenceLog.push({
      id: uid(),
      source: "reflection_outcome",
      timestamp: Date.now(),
      description: `Knowledge status updated from ${previous.status} to ${status}`,
      verified: false,
      nodeId: id,
      targetProperty: "status",
      value: status,
    });

    this.rebuildContext();
    knowledgeEvents.publish("knowledge_updated", this.currentContext!, updated);
  }

  /**
   * Registers a conceptual prerequisite or dependency connection.
   */
  public addRelationship(
    fromId: string,
    toId: string,
    type: "prerequisite" | "dependency" | "related",
  ): void {
    const exists = this.relationships.some(
      (r) => r.fromId === fromId && r.toId === toId && r.type === type,
    );
    if (exists) return;

    this.relationships.push({ fromId, toId, type });
    this.rebuildContext();
  }

  /**
   * Applies explicit user corrections in accordance with the Evidence Verification principle.
   */
  public correctKnowledge(
    id: string,
    property: "status" | "confidence" | "description" | "name",
    value: string,
    description: string,
  ): void {
    const index = this.nodes.findIndex((n) => n.id === id);
    if (index === -1) return;

    const previous = this.nodes[index];
    const corrected = applyUserCorrection(previous, property, value);
    this.nodes[index] = corrected;

    this.evidenceLog.push({
      id: uid(),
      source: "user_correction",
      timestamp: Date.now(),
      description: `User corrected ${property}: ${description}`,
      verified: true,
      nodeId: id,
      targetProperty: property,
      value,
    });

    this.rebuildContext();
    knowledgeEvents.publish("knowledge_corrected", this.currentContext!, corrected);
    knowledgeEvents.publish("knowledge_updated", this.currentContext!, corrected);

    eventService.record(
      "note_created",
      "Knowledge Context Corrected",
      `User correction applied to Knowledge Node "${corrected.name}": ${description}`,
      null,
      null,
      { corrected },
    );
  }

  /**
   * Analyzes workspace events (completed tasks) to refine skill and concepts.
   */
  private processWorkspaceActivities(): void {
    const store = getWorkspaceProvider().getState();
    const completedTasks = store.tasks.filter((t) => t.completed || t.done);
    let hasChanges = false;

    completedTasks.forEach((task) => {
      // Find concept or skill matching task keyword
      const matchedNodeIndex = this.nodes.findIndex(
        (n) =>
          task.title.toLowerCase().includes(n.name.toLowerCase()) &&
          (n.status === "Observed" || n.status === "Inferred"),
      );

      if (matchedNodeIndex !== -1) {
        const node = this.nodes[matchedNodeIndex];
        const nextStatus: KnowledgeStatus = node.status === "Observed" ? "Inferred" : "Refined";
        const updated = updateNodeStatus(node, nextStatus);

        this.nodes[matchedNodeIndex] = updated;
        hasChanges = true;

        this.evidenceLog.push({
          id: uid(),
          source: "workspace_event",
          timestamp: Date.now(),
          description: `Mastery demonstrated by completing task: "${task.title}"`,
          verified: false,
          nodeId: node.id,
          targetProperty: "status",
          value: nextStatus,
        });
      }
    });

    // Check Goal Context to scan for newly active gaps
    const goalContext = goalService.getContext();
    if (goalContext && goalContext.activeGoals.length > 0) {
      const activeGoalTitles = goalContext.activeGoals.map((g) => g.title.toLowerCase());

      // If any of our nodes are prerequisite for a topic related to the active goal,
      // and their status is "Observed" / "Inferred" or "Deprecated", flag gap events.
      this.relationships.forEach((rel) => {
        if (rel.type === "prerequisite") {
          const targetNode = this.nodes.find((n) => n.id === rel.toId);
          const prereqNode = this.nodes.find((n) => n.id === rel.fromId);

          if (
            targetNode &&
            prereqNode &&
            activeGoalTitles.some((title) => title.includes(targetNode.name.toLowerCase()))
          ) {
            if (prereqNode.confidence < 0.6 || prereqNode.status === "Deprecated") {
              // Gap identified
              knowledgeEvents.publish("knowledge_gap_detected", this.currentContext!, prereqNode);
            }
          }
        }
      });
    }

    if (hasChanges) {
      this.rebuildContext();
    }
  }

  private rebuildContext(): void {
    this.currentContext = buildKnowledgeContext(this.nodes, this.relationships, this.evidenceLog);
    knowledgeEvents.publish("knowledge_context_updated", this.currentContext);
  }

  /**
   * Shuts down subscriptions and clears cached contexts.
   */
  public shutdown(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.nodes = [];
    this.relationships = [];
    this.evidenceLog = [];
    this.currentContext = null;
  }
}

export const knowledgeService = new KnowledgeService();
export type { KnowledgeService };
