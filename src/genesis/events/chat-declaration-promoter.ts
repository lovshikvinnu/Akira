import { eventService } from "./event-service";
import { parseDeclaration } from "../understanding/declaration";
import { MemoryEvent } from "../../shared/types/event-types";

/**
 * The durable half of the chat boundary.
 *
 * Raw conversation is Transient: a `chat_message` is published to every
 * subscriber and never written to the durable stream, because
 * `settingsService.updateChat` already persists the conversation. That is the
 * whole of "chat history records what was said".
 *
 * This is "GENESIS remembers what mattered". It watches those turns go past
 * and, when one of them actually asserts something about the user, records a
 * `declaration_captured` event carrying the sentence verbatim. That event is
 * Core, becomes a memory through the ordinary candidate pipeline, and is what
 * `PersonalDeclarationRule` then extracts into the identity graph.
 *
 * WHY A SUBSCRIBER RATHER THAN A CANDIDATE RULE
 * ---------------------------------------------
 * A candidate rule could have matched `chat_message` directly and produced the
 * memory in one step, and it would have been wrong in a way that only shows up
 * after a reload. Replay rebuilds cognition from the durable stream. A memory
 * built straight from a transient event would exist live and have no event to
 * be rebuilt from, so every declaration the user made in conversation would
 * disappear the next time they opened the app -- the one failure mode of this
 * milestone that loses meaning rather than merely costing capacity.
 *
 * Recording a durable event instead makes the promotion survive replay by the
 * same mechanism as everything else, with no special case in the reconstruction
 * path.
 *
 * WHY IT IS A ROUTE'S JOB TO DO NOTHING
 * -------------------------------------
 * The parse could have lived in `routes/chat.tsx`, next to the send handler.
 * Routes are controllers (MODULE_CONTRACT 2.2) and deciding what is worth
 * remembering is cognition, so it lives here and the route publishes a plain
 * fact about what the user did.
 *
 * ON RECORDING FROM INSIDE A CALLBACK
 * -----------------------------------
 * `record` runs its subscribers inside `runBatched`, and this subscriber
 * records. That nesting is the documented contract of `event-service.ts` -- a
 * subscriber that records its own event joins the open transaction rather than
 * settling inside it -- so the promotion is part of the same cognitive
 * transaction as the turn that caused it, and derived phases flush once.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not improve the parser. `parseDeclaration` matches `"i want to
 * become "` and has no bare `"i want to "`, so "I want to run a marathon" is
 * not promoted. Widening what counts as a declaration in the same change that
 * moves the chat boundary would make it impossible to attribute a difference in
 * what AKIRA remembers to one or the other.
 */
export const chatDeclarationPromoter = {
  /** Idempotent, like every processor in the composition manifest. */
  initialize(): void {
    if (unsubscribe) return;
    unsubscribe = eventService.onRecord(onEvent);
  },

  dispose(): void {
    if (!unsubscribe) return;
    unsubscribe();
    unsubscribe = null;
  },
};

let unsubscribe: (() => void) | null = null;

function onEvent(event: MemoryEvent): void {
  if (event.eventType !== "chat_message") return;

  // The turn as the user typed it. `description` carries it verbatim -- see
  // `routes/chat.tsx` -- so the parser reads the user's words rather than a
  // label built around them, and so does the memory this becomes.
  const text = (event.description || "").trim();
  if (!text) return;

  const declaration = parseDeclaration(text);
  if (!declaration) return;

  // Aspirations only. This is the gate, and it is narrower than "anything the
  // parser recognises" for a measured reason.
  //
  // `parseDeclaration` matches five categories, and four of them are how people
  // talk while working. Measured over two independently written corpora of
  // ordinary turns -- 20 and 26 messages, neither containing a deliberate
  // statement of identity -- it promoted 60% and 50% respectively:
  //
  //     "I hate this bug, it's taken all morning"      -> Preference
  //     "I always forget which flag disables the cache" -> Habit
  //     "I believe this regex is wrong"                 -> Value
  //     "I enjoy this kind of refactor"                 -> Interest
  //
  // Ungated, every one of those became a durable Core memory and a permanent
  // identity claim about the user. That put the flood this milestone exists to
  // remove straight back into Core, through the promotion path instead of
  // through intake -- measured at a reduced cap, it still evicted the founding
  // note. Venting about a bug is not a person telling you who they are.
  //
  // The split is clean rather than convenient: across four corpora every
  // genuine declaration parsed as Goal and every false positive parsed as one
  // of the other four. 5 of 5 admitted, 0 of 20 ordinary admitted.
  //
  // WHAT THIS DOES NOT NARROW
  // -------------------------
  // Notes. A captured note still reaches `PersonalDeclarationRule` with all
  // five categories intact, because writing something down is a deliberate act
  // of recording and a chat turn is not. The asymmetry is the point: this gate
  // applies to the incidental path only.
  //
  // Widening it needs a better parser, not a wider gate. A preference stated
  // once in conversation is indistinguishable here from a complaint, and until
  // that changes the safe direction is to forget it.
  if (declaration.category !== "Goal") return;

  eventService.record(
    "declaration_captured",
    "Declaration Captured",
    // The sentence, not the parsed payload. The payload is what identity wants;
    // the sentence is what recall scores and what the user would recognise if
    // they saw it quoted back. `PersonalDeclarationRule` re-parses it downstream
    // through the same function, so nothing is lost by keeping the original.
    text,
    event.relatedProjectId ?? null,
    null,
    {
      declarationCategory: declaration.category,
      declarationContent: declaration.content,
      sourceEventId: event.id,
    },
  );
}
