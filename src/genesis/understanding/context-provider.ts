import { understandingEngine } from "./engine";
import { serializeUnderstanding } from "./serializer";
import { UnderstandingCategory, Understanding } from "./types";
import { classifyIntent } from "./intent-classifier";

/**
 * Retrieves the serialized understandings context block for inclusion in the AI context.
 * Filters understandings based on user prompt intent using simple rule routing.
 */
export function getUnderstandingContext(
  userPrompt?: string,
  filter?: (u: Understanding[]) => Understanding[],
): string {
  let understandings = understandingEngine.getUnderstandings();
  if (understandings.length === 0) {
    return "";
  }

  if (userPrompt) {
    const categoryFilter = classifyIntent(userPrompt);
    if (categoryFilter) {
      understandings = understandings.filter((u) => u.category === categoryFilter);
    }
  }

  if (filter) {
    understandings = filter(understandings);
  }

  if (understandings.length === 0) {
    return "";
  }

  const blocks = understandings.map(serializeUnderstanding).join("\n\n");
  return `[UNDERSTANDINGS]\n\n${blocks}`;
}
