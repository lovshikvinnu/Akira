import {
  PersonRelationship,
  RelationshipStatus,
  RelationshipEvidence,
  RelationshipContext,
} from "./types";
import { buildRelationshipContext } from "./builder";
import { relationshipEvents } from "./events";
import {
  observePerson,
  updateRelationshipStatus,
  recordInteraction,
  applyUserCorrection,
} from "./rules";
import { getWorkspaceProvider } from "../../../contracts/workspace-provider";
import { eventService } from "../../events/event-service";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

class RelationshipService {
  private relationships: PersonRelationship[] = [];
  private evidenceLog: RelationshipEvidence[] = [];
  private currentContext: RelationshipContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private lastProcessedChatTime = 0;

  /**
   * Initializes the Relationship Engine.
   */
  public initialize(): RelationshipContext {
    this.relationships = [];
    this.evidenceLog = [];
    this.lastProcessedChatTime = Date.now(); // only process new chat messages during this session

    this.rebuildContext();

    // Subscribe to store updates to analyze conversation logs for names
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
      this.processNewChatMessages();
    });

    return this.currentContext!;
  }

  /**
   * Retrieve active Relationship Context.
   */
  public getContext(): RelationshipContext | null {
    return this.currentContext;
  }

  /**
   * Records a new human mention.
   * Increments interaction frequency or registers initial PersonObserved baseline.
   */
  public recordObservation(name: string): PersonRelationship {
    const trimmedName = name.trim();
    const existingIndex = this.relationships.findIndex(
      (r) => r.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    if (existingIndex !== -1) {
      const previous = this.relationships[existingIndex];
      const updated = recordInteraction(previous);
      this.relationships[existingIndex] = updated;

      this.evidenceLog.push({
        id: uid(),
        source: "dialogue_analysis",
        timestamp: Date.now(),
        description: `Mention of "${trimmedName}" observed in conversation. Interaction count: ${updated.interactionFrequency}`,
        verified: false,
        relationshipId: updated.id,
        targetProperty: "status",
        value: updated.status,
      });

      this.rebuildContext();
      relationshipEvents.publish("relationship_updated", this.currentContext!, updated);
      return updated;
    } else {
      const id = uid();
      const node = observePerson(id, trimmedName);
      this.relationships.push(node);

      this.evidenceLog.push({
        id: uid(),
        source: "dialogue_analysis",
        timestamp: Date.now(),
        description: `Observed new person: "${trimmedName}"`,
        verified: false,
        relationshipId: id,
        targetProperty: "status",
        value: "PersonObserved",
      });

      this.rebuildContext();
      relationshipEvents.publish("person_observed", this.currentContext!, node);
      return node;
    }
  }

  /**
   * Applies explicit user corrections in accordance with the Evidence Verification principle.
   */
  public correctRelationship(
    id: string,
    property:
      | "status"
      | "significance"
      | "role"
      | "sharedProjectIds"
      | "openDiscussions"
      | "recentDevelopments",
    value: string,
    description: string,
  ): void {
    const index = this.relationships.findIndex((r) => r.id === id);
    if (index === -1) return;

    const previous = this.relationships[index];
    const corrected = applyUserCorrection(previous, property, value);
    this.relationships[index] = corrected;

    this.evidenceLog.push({
      id: uid(),
      source: "user_correction",
      timestamp: Date.now(),
      description: `User corrected ${property}: ${description}`,
      verified: true,
      relationshipId: id,
      targetProperty: property,
      value,
    });

    this.rebuildContext();
    relationshipEvents.publish("relationship_corrected", this.currentContext!, corrected);
    relationshipEvents.publish("relationship_updated", this.currentContext!, corrected);

    eventService.record(
      "note_created",
      "Relationship Context Corrected",
      `User correction applied to contact "${corrected.name}": ${description}`,
      null,
      null,
      { corrected },
    );
  }

  /**
   * Scans chat progression for mentioned names.
   * Matches capitalized names following markers like "with", "asked", "told", or direct "@mentions".
   */
  private processNewChatMessages(): void {
    const store = getWorkspaceProvider().getState();
    const chat = store.chat || [];
    let hasChanges = false;

    chat.forEach((msg) => {
      const msgTime = new Date(msg.createdAt).getTime();
      if (msgTime > this.lastProcessedChatTime) {
        this.lastProcessedChatTime = msgTime;

        // Parse mentions of people
        // Matches "@Name" or phrases like "talked to Bob", "with Alice"
        const patterns = [
          /@([A-Z][a-zA-Z0-9_]+)/g,
          /\b(?:with|to|told|asked|met)\s+([A-Z][a-z]+)\b/g,
        ];

        patterns.forEach((regex) => {
          let match;
          while ((match = regex.exec(msg.text)) !== null) {
            const name = match[1];
            if (name) {
              this.recordObservation(name);
              hasChanges = true;
            }
          }
        });
      }
    });

    if (hasChanges) {
      this.rebuildContext();
    }
  }

  private rebuildContext(): void {
    this.currentContext = buildRelationshipContext(this.relationships, this.evidenceLog);
    relationshipEvents.publish("relationship_context_updated", this.currentContext);
  }

  /**
   * Release subscriptions.
   */
  public shutdown(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.relationships = [];
    this.evidenceLog = [];
    this.currentContext = null;
  }
}

export const relationshipService = new RelationshipService();
export type { RelationshipService };
