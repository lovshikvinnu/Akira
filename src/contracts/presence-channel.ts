import type { PresenceContext } from "../akira-os/presence/types";
import { globalEventBus } from "../instrumentation/event-bus";
import { Events } from "./events";

/**
 * The one place GENESIS learns that presence changed.
 *
 * Presence reaches cognition over the platform event bus rather than through
 * `reality-adapter`, deliberately: it is a live signal about the session, not
 * something to remember, and it was removed from the cognitive stream for that
 * reason. But the bus has no topic channel, so every consumer that wanted
 * presence subscribed to *everything* and filtered:
 *
 *     globalEventBus.subscribe({
 *       id: "...",
 *       onEvent: (event) => {
 *         if (event.type !== Events.PRESENCE_UPDATED) return;
 *         this.latest = (event.payload as { context: PresenceContext }).context;
 *       },
 *     });
 *
 * Three copies of that existed across two GENESIS services -- two in
 * `context-resolution/service.ts`, one in `context/state/service.ts` -- each
 * repeating the same filter and the same unchecked cast of the payload. Three
 * copies of a cast is three chances for the payload shape to change under one
 * of them.
 *
 * It also put domain code directly on an infrastructure module. The
 * architecture rule "no direct Event Bus imports outside instrumentation"
 * exists to stop exactly that, and those services were the only production code
 * failing it that was not itself an integration point.
 *
 * So the subscription lives here, in `contracts`, next to `workspace-provider`
 * and for the same reason: it is the seam a domain module is allowed to depend
 * on. Callers get a typed context and an unsubscribe, and never see the bus.
 */
export function subscribeToPresence(
  id: string,
  onPresence: (context: PresenceContext) => void,
): () => void {
  const subscriber = {
    id,
    onEvent: (event: { type: string; payload: unknown }) => {
      if (event.type !== Events.PRESENCE_UPDATED) return;
      const payload = event.payload as { context?: PresenceContext } | null;
      // Guarded rather than cast blind. A presence event with no context is not
      // a presence update, and the three call sites this replaces would each
      // have stored `undefined` as though it were one.
      if (!payload?.context) return;
      onPresence(payload.context);
    },
  };

  globalEventBus.subscribe(subscriber);
  return () => globalEventBus.unsubscribe(subscriber);
}
