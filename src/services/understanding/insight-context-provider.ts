import { insightEngine } from "./insight-engine";
import { serializeInsight } from "./insight-serializer";

/**
 * Retrieves the serialized insights context block for inclusion in the AI context.
 * Supports Mode A (Stable: all insights) and Mode B (Recent: updated in the last 5 minutes
 * when user prompt contains "new" or "recent").
 */
export function getInsightContext(userPrompt?: string): string {
  let insights = insightEngine.getInsights();
  if (insights.length === 0) {
    return "";
  }

  if (userPrompt) {
    const lower = userPrompt.toLowerCase();
    // Mode B: Filter for recent insights if query asks for "new" or "recent"
    if (lower.includes("new") || lower.includes("recent")) {
      const now = Date.now();
      const fiveMinutesMs = 5 * 60 * 1000;
      insights = insights.filter((ins) => {
        const updatedAtTime = new Date(ins.updatedAt).getTime();
        return now - updatedAtTime <= fiveMinutesMs;
      });
    }
  }

  if (insights.length === 0) {
    return "";
  }

  const blocks = insights.map(serializeInsight).join("\n\n");
  return `[INSIGHTS]\n\n${blocks}`;
}
