import { Understanding, UnderstandingConfidence } from "./types";

/**
 * Capitalizes each word and cleans up separators (dashes/underscores) for display.
 * Retains special casing for known entities (e.g. "akira" -> "AKIRA").
 */
function getConceptTitle(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower === "akira") return "AKIRA";

  return concept
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolves the concept name inside the sentence template.
 * Maps special terms (e.g., "pilot" in Goal category) to natural phrases.
 */
function formatSentenceConcept(category: string, concept: string): string {
  const lower = concept.toLowerCase();
  if (category === "Goal" && (lower === "pilot" || lower === "pilot-license")) {
    return "becoming a pilot";
  }
  if (lower === "akira") return "AKIRA";

  if (
    category === "Project" ||
    category === "Knowledge" ||
    category === "Relationship" ||
    category === "Interest" ||
    category === "Value"
  ) {
    return concept
      .split(/[-_]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return concept.replace(/[-_]+/g, " ");
}

/**
 * Formats the confidence score or label to fit the target presentation template.
 */
function formatConfidence(confidence: UnderstandingConfidence): string {
  if (typeof confidence === "number") {
    let label = "Low";
    if (confidence >= 0.85) {
      label = "High";
    } else if (confidence >= 0.6) {
      label = "Medium";
    }
    return `${label} (${confidence})`;
  }
  return confidence;
}

/**
 * Serializes a single Understanding object into a deterministic natural-language summary block.
 */
export function serializeUnderstanding(u: Understanding): string {
  const rawConcept = u.canonicalKey.includes(":") ? u.canonicalKey.split(":")[1] : u.canonicalKey;
  const displayTitle = getConceptTitle(rawConcept);
  const sentenceConcept = formatSentenceConcept(u.category, rawConcept);

  let sentence = "";
  switch (u.category) {
    case "Goal":
      sentence = `The user has consistently demonstrated a long-term commitment toward ${sentenceConcept}.`;
      break;
    case "Project":
      sentence = `The user is actively building ${sentenceConcept}.`;
      break;
    case "Knowledge":
      sentence = `The user is actively learning ${sentenceConcept}.`;
      break;
    case "Habit":
      sentence = `The user consistently demonstrates the habit of ${sentenceConcept}.`;
      break;
    case "Relationship":
      sentence = `${sentenceConcept} is a recurring important relationship.`;
      break;
    case "Preference":
      sentence = `The user consistently prefers ${sentenceConcept}.`;
      break;
    case "Interest":
      sentence = `The user has expressed an interest in ${sentenceConcept}.`;
      break;
    case "Value":
      sentence = `The user values ${sentenceConcept}.`;
      break;
    default:
      sentence = `The user is associated with ${sentenceConcept}.`;
  }

  const confidenceStr = formatConfidence(u.confidence);

  return `${u.category}\n• ${displayTitle}\n${sentence}\nConfidence: ${confidenceStr}`;
}

/**
 * Serializes an array of understandings into a cohesive text block suitable for injection.
 */
export function serializeUnderstandings(understandings: Understanding[]): string {
  if (understandings.length === 0) {
    return "UNDERSTANDINGS\n\n(No understandings resolved yet.)";
  }

  const serializedBlocks = understandings.map(serializeUnderstanding).join("\n\n");
  return `UNDERSTANDINGS\n\n${serializedBlocks}`;
}
