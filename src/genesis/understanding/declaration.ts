/**
 * First-person declaration parsing, shared by the two things that need it.
 *
 * This was a closure inside `PersonalDeclarationRule.evaluate`, which was fine
 * while the only consumer was that rule reading memories. The chat boundary
 * added a second consumer that has to answer the same question *before* a
 * memory exists: `chatDeclarationPromoter` decides whether a conversation turn
 * is worth promoting into the durable stream at all.
 *
 * Extracted rather than duplicated, because two copies of a parser this shape
 * -- forty-odd literal prefixes, each with its own slicing -- would drift on
 * the first phrasing anyone added to one of them, and the drift would show up
 * as "the same sentence is remembered when typed in a note and forgotten when
 * typed in chat".
 *
 * WHAT IT IS
 * ----------
 * Keyword-and-suffix matching over raw text, moved verbatim. It is not good:
 * it matches `"i want to become "` and has no bare `"i want to "`, so
 * "I want to run a marathon" parses as nothing at all. Nothing here improves
 * that, deliberately -- this change moves the boundary chat crosses, and
 * widening what counts as a declaration at the same time would make it
 * impossible to tell which change altered a result.
 *
 * WHY IT STILL STRIPS "User query submitted to AKIRA:"
 * ---------------------------------------------------
 * Chat turns are no longer written to the durable stream, so nothing produced
 * from here on carries that wrapper. But the stream still holds the ones
 * written before the boundary moved, and they age out rather than being
 * migrated. Until they do, this is what keeps extracting declarations from
 * them.
 */

/** A category of self-statement, and the payload the user asserted. */
export interface Declaration {
  category: "Goal" | "Interest" | "Preference" | "Value" | "Habit";
  content: string;
}

export function parseDeclaration(text: string): Declaration | null {
  let clean = text.trim();
  const prefixes = [
    "User query submitted to AKIRA:",
    "User query:",
    "Query submitted to AKIRA:",
    "User query submitted:",
  ];
  for (const prefix of prefixes) {
    if (clean.toLowerCase().startsWith(prefix.toLowerCase())) {
      clean = clean.slice(prefix.length).trim();
    }
  }

  // Strip surrounding quotes
  clean = clean.replace(/^["']|["']$/g, "").trim();

  // Strip trailing punctuation
  clean = clean.replace(/[^\w\s]+$/, "").trim();
  const lower = clean.toLowerCase();

  const normalizePayload = (payload: string) => {
    const index = clean.toLowerCase().indexOf(payload.toLowerCase());
    let normalized = payload.trim();
    if (index === 0 && normalized.length > 0) {
      const first = normalized.charAt(0);
      if (
        normalized.length > 1 &&
        normalized.charAt(1) === normalized.charAt(1).toUpperCase() &&
        normalized.charAt(1) !== " "
      ) {
        // Keep acronyms/proper nouns as is
      } else {
        normalized = first.toLowerCase() + normalized.slice(1);
      }
    }
    return normalized.replace(/\s+/g, " ");
  };

  // Goal
  if (lower.startsWith("my dream is ")) {
    let content = clean.slice("my dream is ".length).trim();
    if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }
  if (lower.startsWith("my goal is ")) {
    let content = clean.slice("my goal is ".length).trim();
    if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }
  if (lower.startsWith("i want to become ")) {
    const content = clean.slice("i want to become ".length).trim();
    if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
  }
  if (lower.startsWith("i aspire to ")) {
    const content = clean.slice("i aspire to ".length).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }
  if (lower.startsWith("my ambition is ")) {
    let content = clean.slice("my ambition is ".length).trim();
    if (content.toLowerCase().startsWith("to ")) content = content.slice(3).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }
  if (lower.startsWith("i hope to become ")) {
    const content = clean.slice("i hope to become ".length).trim();
    if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
  }
  if (lower.startsWith("i plan to become ")) {
    const content = clean.slice("i plan to become ".length).trim();
    if (content) return { category: "Goal", content: "become " + normalizePayload(content) };
  }
  if (lower.endsWith(" is my dream")) {
    const content = clean.slice(0, clean.length - " is my dream".length).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }
  if (lower.endsWith(" is my goal")) {
    const content = clean.slice(0, clean.length - " is my goal".length).trim();
    if (content) return { category: "Goal", content: normalizePayload(content) };
  }

  // Interest
  if (lower.startsWith("i love ")) {
    const content = clean.slice("i love ".length).trim();
    if (content && content.toLowerCase() !== "it") {
      return { category: "Interest", content: normalizePayload(content) };
    }
  }
  if (lower.startsWith("i'm interested in ")) {
    const content = clean.slice("i'm interested in ".length).trim();
    if (content) return { category: "Interest", content: normalizePayload(content) };
  }
  if (lower.startsWith("i am interested in ")) {
    const content = clean.slice("i am interested in ".length).trim();
    if (content) return { category: "Interest", content: normalizePayload(content) };
  }
  if (lower.startsWith("i enjoy ")) {
    const content = clean.slice("i enjoy ".length).trim();
    if (content) return { category: "Interest", content: normalizePayload(content) };
  }

  // Preference
  if (lower.startsWith("i prefer ")) {
    const content = clean.slice("i prefer ".length).trim();
    if (content) return { category: "Preference", content: normalizePayload(content) };
  }
  if (lower.startsWith("i like ")) {
    const content = clean.slice("i like ".length).trim();
    if (content) return { category: "Preference", content: normalizePayload(content) };
  }
  if (lower.startsWith("i dislike ")) {
    const content = clean.slice("i dislike ".length).trim();
    if (content) return { category: "Preference", content: "dislike " + normalizePayload(content) };
  }
  if (lower.startsWith("i hate ")) {
    const content = clean.slice("i hate ".length).trim();
    if (content) return { category: "Preference", content: "hate " + normalizePayload(content) };
  }

  // Value
  if (lower.startsWith("i value ")) {
    const content = clean.slice("i value ".length).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }
  if (lower.startsWith("i believe ")) {
    let content = clean.slice("i believe ".length).trim();
    if (content.toLowerCase().startsWith("in ")) content = content.slice(3).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }
  if (lower.endsWith(" is important to me")) {
    const content = clean.slice(0, clean.length - " is important to me".length).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }
  if (lower.startsWith("what's important to me is ")) {
    const content = clean.slice("what's important to me is ".length).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }
  if (lower.startsWith("what is important to me is ")) {
    const content = clean.slice("what is important to me is ".length).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }
  if (lower.startsWith("i care deeply about ")) {
    const content = clean.slice("i care deeply about ".length).trim();
    if (content) return { category: "Value", content: normalizePayload(content) };
  }

  // Habit
  if (lower.startsWith("i usually ")) {
    const content = clean.slice("i usually ".length).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }
  if (lower.startsWith("i always ")) {
    const content = clean.slice("i always ".length).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }
  if (lower.startsWith("every morning i ")) {
    const content = clean.slice("every morning i ".length).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }
  if (lower.startsWith("every day i ")) {
    const content = clean.slice("every day i ".length).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }
  if (lower.endsWith(" every morning")) {
    let content = clean.slice(0, clean.length - " every morning".length).trim();
    if (content.toLowerCase().startsWith("i ")) content = content.slice(2).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }
  if (lower.endsWith(" every day")) {
    let content = clean.slice(0, clean.length - " every day".length).trim();
    if (content.toLowerCase().startsWith("i ")) content = content.slice(2).trim();
    if (content) return { category: "Habit", content: normalizePayload(content) };
  }

  return null;
}
