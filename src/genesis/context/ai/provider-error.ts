/**
 * What to tell the user when a provider request fails.
 *
 * `routes/chat.tsx` built this inline and its default case did two things
 * wrong at once:
 *
 *     `I encountered an issue connecting to my cognitive core:
 *      ${error.message}. Please verify your network or retry.`
 *
 * It pasted the provider's own error text into the conversation, and it told
 * the user to check their network whatever had actually happened. A rate limit
 * matched none of the branches above it -- not a missing key, not a timeout --
 * so a 429 reached the user as raw provider text plus advice about a network
 * that was working fine.
 *
 * Pure and exported so the branches can be tested. A route mounts components
 * and dispatches; deciding what a failure means is not a route's job
 * (MODULE_CONTRACT 2.2).
 */

export type ProviderFailureKind = "no-key" | "invalid-key" | "rate-limited" | "network" | "unknown";

export interface ProviderFailure {
  kind: ProviderFailureKind;
  /** Shown to the user. Never contains provider or internal error text. */
  message: string;
}

/** Matched on the message because no provider here throws a typed error. */
function textOf(error: unknown): string {
  if (error instanceof Error) return error.message ?? "";
  return typeof error === "string" ? error : "";
}

export function describeProviderFailure(
  error: unknown,
  providerName: string,
  hasApiKey: boolean,
): ProviderFailure {
  const text = textOf(error).toLowerCase();

  if (!hasApiKey) {
    return {
      kind: "no-key",
      message:
        `I'm running in Local Companion Mode. To connect me to live cognitive services via ` +
        `${providerName}, please configure an API key in settings.`,
    };
  }

  // Before the key check below, which tests for the bare substring "key" and
  // would claim an invalid key for any message that happens to contain it.
  if (
    text.includes("rate limit") ||
    text.includes("rate-limit") ||
    text.includes("too many requests") ||
    text.includes("429") ||
    text.includes("quota")
  ) {
    return {
      kind: "rate-limited",
      message:
        `${providerName} is limiting how many requests it will take right now, so this one ` +
        `did not go through. Nothing is wrong with your connection or your key -- wait a ` +
        `moment and send it again.`,
    };
  }

  if (text.includes("api key") || text.includes("key")) {
    return {
      kind: "invalid-key",
      message:
        `My ${providerName} API key appears to be invalid. Please verify the API key ` +
        `configured in settings.`,
    };
  }

  // Only the cases that really are the network.
  if (text.includes("timeout") || text.includes("failed to fetch") || text.includes("network")) {
    return {
      kind: "network",
      message:
        "The connection timed out while awaiting a response. Let's try again in a moment when " +
        "your network stabilizes.",
    };
  }

  return {
    kind: "unknown",
    // Deliberately says nothing about the network and quotes nothing. The full
    // error still goes to `console.error` at the call site, which is where a
    // developer would look for it and where it cannot be mistaken for something
    // the user is expected to act on.
    message:
      `I couldn't get a response from ${providerName} just then. The details are in the ` +
      `developer console. Try again in a moment.`,
  };
}
