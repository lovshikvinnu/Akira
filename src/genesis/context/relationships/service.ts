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

/**
 * LIVE, on explicit @mentions only.
 *
 * This said "ORPHANED ... the people list is always empty", which was true of
 * the useful half: the scan below fed `recordObservation` from two patterns,
 * and the second one -- any capitalised word after "with"/"to"/"told"/"asked"/
 * "met" -- was 21% precise. Marketing, London, Slack, Python, Friday and Claude
 * all became contacts. The engine had a producer; what it did not have was a
 * trustworthy one.
 *
 * The producer is now an @mention and nothing else, which the user writes on
 * purpose. `correctRelationship` still has no production caller, so
 * `sharedProjectIds` and the other corrected fields stay empty -- which matters
 * downstream: `resolveUnifiedContext` narrows relationships to the active
 * project by that field, and falls back to all of them when none carries a
 * link, precisely because the link data does not exist yet.
 *
 * Note for anyone tracing a bug filed against "relationships": this is the
 * contact engine, about people. `src/genesis/memory/relationships/` is a
 * different subsystem about links between memories, and that one is live --
 * it feeds importance, stories and retention. Similar names, opposite liveness.
 *
 * REMAINING BOUNDARY: a producer for `sharedProjectIds`. Associating a person
 * with a project automatically would mean deciding that someone mentioned while
 * a project was open belongs to it, which is the proximity inference the
 * project/aspiration rule was removed for. It needs a deliberate act by the
 * user, not a heuristic.
 */
/**
 * An explicit @mention of a person, and nothing else.
 *
 * Declared once at module scope rather than rebuilt per message: a `g` regex
 * carries `lastIndex` between calls, so a shared instance has to be reset
 * before each scan, which is what the loop below does.
 */
const MENTION_PATTERN = /@([A-Z][a-zA-Z0-9_]+)/g;

class RelationshipService {
  private relationships: PersonRelationship[] = [];
  private evidenceLog: RelationshipEvidence[] = [];
  private currentContext: RelationshipContext | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  /** Messages already scanned, so a shared millisecond cannot hide one. */
  private processedChatKeys = new Set<string>();

  /**
   * Initializes the Relationship Engine.
   */
  public initialize(): RelationshipContext {
    this.relationships = [];
    this.evidenceLog = [];
    // Cleared with the contacts it guards. Keeping a read-ledger across a
    // reset marks every message as already seen, so the contacts emptied on
    // the line above can never be rebuilt -- silently, because the engine
    // looks initialized. `__root.tsx` calls `shutdown()`/`initialize()` on
    // every remount, so this is reachable in the shipped app.
    this.processedChatKeys.clear();

    this.rebuildContext();

    // Subscribe to store updates to analyze conversation logs for names
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
    this.storeUnsubscribe = getWorkspaceProvider().subscribe(() => {
      this.processNewChatMessages();
    });

    // The chat log outlives the process; the contacts derived from it do not.
    // Reading what is already in the store makes this engine's state a
    // function of the log rather than of when it started listening -- at boot
    // it happens to be subscribed before hydration emits, but nothing here
    // enforces that ordering and a remount has no emit after it at all.
    this.processNewChatMessages();

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
      // Keyed on the message, not on the clock.
      //
      // This was `msgTime > this.lastProcessedChatTime`, which silently skipped
      // every message sharing the last processed millisecond -- so a burst of
      // messages, or any batch replayed together, was scanned once and the rest
      // dropped. It faked a good result during this investigation: a corpus of
      // ten sentences appeared to record only two people, until it turned out
      // eight had never been read.
      //
      // The message's own id. Keying on `createdAt|text` instead was wrong in
      // the same family as the bug it replaced: two messages with the same
      // words in the same millisecond -- ordinary across a reset, or any replay
      // of a conversation -- collided and the second was silently skipped.
      const messageKey = msg.id;
      if (!this.processedChatKeys.has(messageKey)) {
        this.processedChatKeys.add(messageKey);

        // Only an explicit @mention.
        //
        // There was a second pattern -- `\b(?:with|to|told|asked|met)\s+([A-Z][a-z]+)\b`
        // -- which recorded any capitalised word after one of five common
        // prepositions as a person the user knows. Measured over twenty
        // ordinary work sentences, five of which named a real person:
        //
        //     @Name mention                100% precision, 0 non-people
        //     preposition + Capitalised     21% precision, 15 non-people
        //
        // The fifteen were Marketing, Claude, London, Slack, Python, Done,
        // Gmail, Option, Main, Vitest, Production, Learn, Finance, Friday and
        // Spotify. Three of every four "contacts" were not people, and one of
        // them was AKIRA -- "asked Claude to summarise the doc" recorded Claude
        // as someone the user has a relationship with. They reach the model as
        // `• Contact: Marketing (Unspecified)`.
        //
        // Writing "@Sarah" is the user naming a person on purpose. Following a
        // preposition with a capital letter is grammar, and grammar is not
        // evidence of anything. The recall lost with it is real -- "met Daniel"
        // no longer records Daniel -- and that is the correct trade: a contact
        // list that is three-quarters wrong is worse than a shorter one that is
        // right, because the model cannot tell which quarter to believe.
        let match;
        MENTION_PATTERN.lastIndex = 0;
        while ((match = MENTION_PATTERN.exec(msg.text)) !== null) {
          const name = match[1];
          if (name) {
            this.recordObservation(name);
            hasChanges = true;
          }
        }
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
