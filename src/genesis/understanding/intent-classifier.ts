import { UnderstandingCategory } from "./types";

/**
 * Classifies user intent from their query using simple rules.
 * Returns the target UnderstandingCategory to filter, or null if no specific intent matches.
 */
export function classifyIntent(prompt: string): UnderstandingCategory | null {
  const lower = prompt
    .toLowerCase()
    .trim()
    .replace(/[?,.!:;]/g, "");

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
    lower.includes("theme") ||
    lower.includes("like") ||
    lower.includes("dislike") ||
    lower.includes("hate")
  ) {
    return "Preference";
  }

  // Interest Intent
  if (lower.includes("interest") || lower.includes("love") || lower.includes("enjoy")) {
    return "Interest";
  }

  // Value Intent
  if (
    lower.includes("value") ||
    lower.includes("believe") ||
    lower.includes("important to me") ||
    lower.includes("care deeply about")
  ) {
    return "Value";
  }

  return null;
}

/**
 * Determines whether workspace/projects are relevant to the user's prompt.
 */
export function classifyWorkspaceIntent(prompt: string, projectNamesAndTags: string[]): boolean {
  const lower = prompt.toLowerCase();

  // 1. Mentions a project by name or tag
  for (const nameOrTag of projectNamesAndTags) {
    if (lower.includes(nameOrTag)) {
      return true;
    }
  }

  // 2. Keyword/intent patterns for workspace actions
  const patterns = [
    /\bprojects?\b/,
    /\bplans?\b/,
    /\bplanning\b/,
    /\broadmaps?\b/,
    /\bmilestones?\b/,
    /\bbacklogs?\b/,
    /\btasks?\b/,
    /\bimplementation\b/,
    /\bimplement\b/,
    /\bbuild\b/,
    /\bbuilding\b/,
    /\bdevelop\b/,
    /\bdeveloping\b/,
    /\bcoding\b/,
    /\bcode\b/,
    /\brepos?\b/,
    /\brepository\b/,
    /\bgit\b/,
    /\bcommits?\b/,
    /\bpush\b/,
    /\bpull\b/,
    /\barchitecture\b/,
    /\bdesigns?\b/,
    /\bstructures?\b/,
    /\bcontinue\b/,
    /\bwhat'?s next\b/,
    /\bwhat is next\b/,
    /\bactive work\b/,
    /\bworking on\b/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}

export const intentClassifier = {
  classifyCategory: classifyIntent,
  classifyWorkspaceIntent,
};
