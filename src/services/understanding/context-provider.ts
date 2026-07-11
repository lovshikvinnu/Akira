import { understandingEngine } from "./engine";
import { serializeUnderstanding } from "./serializer";
import { UnderstandingCategory } from "./types";

/**
 * Classifies user intent from their query using simple rules.
 * Returns the target UnderstandingCategory to filter, or null if no specific intent matches.
 */
function classifyIntent(prompt: string): UnderstandingCategory | null {
  const lower = prompt.toLowerCase().trim().replace(/[?,.!:;]/g, "");

  // General Questions asking about overall understanding should return all categories
  if (
    lower.includes("understand about me") ||
    lower.includes("what do you understand") ||
    lower.includes("what you understand")
  ) {
    return null;
  }

  // Goal Intent
  if (
    lower.includes("what's my goal") ||
    lower.includes("what is my goal") ||
    lower.includes("what's my dream") ||
    lower.includes("what is my dream") ||
    lower.includes("my goal") ||
    lower.includes("my dream") ||
    lower.includes("goal") ||
    lower.includes("dream") ||
    lower.includes("aspiration") ||
    lower.includes("target") ||
    lower.includes("objective")
  ) {
    return "Goal";
  }

  // Knowledge / Learning Intent
  if (
    lower.includes("what am i learning") ||
    lower.includes("what skills am i developing") ||
    lower.includes("what subjects am i studying") ||
    lower.includes("learning") ||
    lower.includes("learn") ||
    lower.includes("study") ||
    lower.includes("studying") ||
    lower.includes("knowledge") ||
    lower.includes("read") ||
    lower.includes("course") ||
    lower.includes("exam")
  ) {
    return "Knowledge";
  }

  // Project Intent
  if (
    lower.includes("what projects am i have") ||
    lower.includes("what projects am am i have") ||
    lower.includes("what am i building") ||
    lower.includes("project") ||
    lower.includes("build") ||
    lower.includes("building") ||
    lower.includes("working on") ||
    lower.includes("developing") ||
    lower.includes("coding")
  ) {
    return "Project";
  }

  // Habit Intent
  if (
    lower.includes("habit") ||
    lower.includes("routine") ||
    lower.includes("streak") ||
    lower.includes("daily checklist")
  ) {
    return "Habit";
  }

  // Relationship Intent
  if (
    lower.includes("relationship") ||
    lower.includes("friend") ||
    lower.includes("contact") ||
    lower.includes("instructor") ||
    lower.includes("person") ||
    lower.includes("people")
  ) {
    return "Relationship";
  }

  // Preference Intent
  if (
    lower.includes("prefer") ||
    lower.includes("preference") ||
    lower.includes("settings") ||
    lower.includes("color") ||
    lower.includes("theme")
  ) {
    return "Preference";
  }

  return null;
}

/**
 * Retrieves the serialized understandings context block for inclusion in the AI context.
 * Filters understandings based on user prompt intent using simple rule routing.
 */
export function getUnderstandingContext(userPrompt?: string): string {
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

  if (understandings.length === 0) {
    return "";
  }

  const blocks = understandings.map(serializeUnderstanding).join("\n\n");
  return `[UNDERSTANDINGS]\n\n${blocks}`;
}
