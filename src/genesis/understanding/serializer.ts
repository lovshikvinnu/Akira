import { Understanding, UnderstandingCategory, UnderstandingConfidence } from "./types";

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

/** The coarse level of a confidence that may be a label or a number. */
function confidenceLevel(confidence: UnderstandingConfidence): "High" | "Medium" | "Low" {
  if (typeof confidence !== "number") return confidence;
  if (confidence >= 0.85) return "High";
  if (confidence >= 0.6) return "Medium";
  return "Low";
}

/**
 * What can be said about a declared goal at a given evidence level.
 *
 * Every one of these describes statements, because statements are the only
 * evidence a `goal:` understanding has. None of them claims demonstrated
 * behaviour or sustained progress -- that would need the project and task
 * evidence this fragment never sees.
 */
function goalSentence(level: "High" | "Medium" | "Low", concept: string): string {
  switch (level) {
    case "High":
      return `The user has stated a goal of ${concept} repeatedly over time.`;
    case "Medium":
      return `The user has stated a goal of ${concept} on more than one occasion.`;
    default:
      return `The user has stated a goal of ${concept}.`;
  }
}

/** What each category is, as a noun, for describing one that is no longer active. */
const CATEGORY_NOUN: Record<UnderstandingCategory, string> = {
  Goal: "goal",
  Project: "project",
  Knowledge: "knowledge area",
  Habit: "habit",
  Relationship: "relationship",
  Preference: "preference",
  Interest: "interest",
  Value: "value",
};

/**
 * The sentence for an understanding that has stopped being current.
 *
 * `determineStatus` already resolves Active / Completed / Archived from the
 * linked stories and `builder.ts` merges it -- but nothing read it here, so
 * every block used the present tense whatever the status said. A project whose
 * arc had completed was still described as "The user is actively building X",
 * verbatim, in the live prompt. Reproduced by completing the arc and
 * re-serializing: status went Active -> Completed and the sentence did not
 * change at all.
 *
 * One form for every category rather than eight past-tense rewrites. The claim
 * that had to go is the present-tense one; naming the category and the state
 * retires it, and it cannot read as nonsense for whichever category reaches
 * here.
 *
 * Nothing is hidden. The understanding still appears, still carries its
 * confidence, and still references the memories and stories behind it. What
 * changes is the tense, not whether the model is told.
 */
function inactiveSentence(u: Understanding, displayTitle: string): string {
  const state = u.status === "Completed" ? "completed" : "archived";
  return `The user's ${CATEGORY_NOUN[u.category]} ${displayTitle} is ${state} and no longer active.`;
}

/**
 * Serializes a single Understanding object into a deterministic natural-language summary block.
 */
export function serializeUnderstanding(u: Understanding): string {
  // The label when the rule supplied one, because a key is not always words.
  // `project:<uuid>` is a correct identifier and an unreadable name; splitting
  // it here is what put "actively building 95880953 4989 45db 8a3f" in front of
  // the model. Keys that are already words are unaffected.
  const rawConcept = u.canonicalKey.includes(":") ? u.canonicalKey.split(":")[1] : u.canonicalKey;
  const displayTitle = u.label ? u.label : getConceptTitle(rawConcept);
  const sentenceConcept = u.label ? u.label : formatSentenceConcept(u.category, rawConcept);

  let sentence = "";
  switch (u.category) {
    case "Goal":
      // What this understanding actually knows is how many times the user has
      // *said* something, because only `PersonalDeclarationRule` emits a
      // `goal:` fragment. It has never seen work done towards it.
      //
      // The sentence was `has consistently demonstrated a long-term commitment`
      // unconditionally, so a note typed once and never revisited was reported
      // to the model as sustained, demonstrated behaviour. Even at "High" --
      // four separate declarations -- the honest ceiling is that they keep
      // saying it, not that they have shown it.
      sentence = goalSentence(confidenceLevel(u.confidence), sentenceConcept);
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

  // Only a still-active understanding gets the present-tense sentence
  // above. The Active wording stays byte-identical, so this narrows an
  // over-broad claim rather than restating every block.
  if (u.status !== "Active") {
    return `${u.category}\n• ${displayTitle}\n${inactiveSentence(u, displayTitle)}\nStatus: ${u.status}\nConfidence: ${confidenceStr}`;
  }

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
