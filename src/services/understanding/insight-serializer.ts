import { Insight } from "./insight-types";

/**
 * Serializes a single Insight object into a deterministic natural-language statement.
 */
export function serializeInsight(ins: Insight): string {
  let statement = "";
  switch (ins.category) {
    case "Parallel Commitments":
      statement = "The user is actively pursuing multiple long-term commitments simultaneously.";
      break;
    case "Goal Alignment":
      statement = "Current learning activities directly reinforce long-term goals.";
      break;
    case "Learning Momentum":
      statement = "Technical learning is actively supporting ongoing projects.";
      break;
    default:
      statement = "The user demonstrates emergent thematic connections.";
  }

  // Format confidence
  let confidenceStr: string | number = ins.confidence;
  if (typeof ins.confidence === "number") {
    let label = "Low";
    if (ins.confidence >= 0.85) {
      label = "High";
    } else if (ins.confidence >= 0.6) {
      label = "Medium";
    }
    confidenceStr = `${label} (${ins.confidence})`;
  }

  return `${ins.category}\n${statement}\nConfidence: ${confidenceStr}`;
}
