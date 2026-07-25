import { GoalCategory } from "../types";

export class GoalClassifier {
  /**
   * Classifies a goal title and description deterministically into a GoalCategory.
   */
  public classifyGoal(title: string, description: string): GoalCategory {
    const text = `${title} ${description}`.toLowerCase();

    if (/\b(career|pilot|job|profession|work|employer|promotion|resume|interview)\b/.test(text)) {
      return GoalCategory.Career;
    }
    if (
      /\b(learn|study|verilog|python|programming|course|read|education|tutorial|skill|subject)\b/.test(
        text,
      )
    ) {
      return GoalCategory.Learning;
    }
    if (
      /\b(build|develop|code|design|app|software|akira|github|git|release|architecture|project)\b/.test(
        text,
      )
    ) {
      return GoalCategory.Project;
    }
    if (/\b(health|fitness|workout|gym|nutrition|diet|sleep|run|exercise|weight)\b/.test(text)) {
      return GoalCategory.Health;
    }
    if (/\b(finance|money|budget|save|invest|financial)\b/.test(text)) {
      return GoalCategory.Finance;
    }
    if (/\b(school|university|college|degree|class)\b/.test(text)) {
      return GoalCategory.Education;
    }
    if (/\b(personal|habit|hobby|life)\b/.test(text)) {
      return GoalCategory.Personal;
    }

    return GoalCategory.Other;
  }

  /**
   * Maps a generic string category to a GoalCategory enum value.
   */
  public classifyCategory(categoryName: string): GoalCategory {
    const normalized = categoryName.trim().toLowerCase();

    switch (normalized) {
      case "career":
      case "job":
      case "profession":
        return GoalCategory.Career;
      case "education":
      case "school":
      case "university":
        return GoalCategory.Education;
      case "learning":
      case "study":
      case "skill":
        return GoalCategory.Learning;
      case "project":
      case "build":
      case "development":
        return GoalCategory.Project;
      case "health":
      case "fitness":
      case "workout":
      case "nutrition":
        return GoalCategory.Health;
      case "finance":
      case "financial":
      case "money":
        return GoalCategory.Finance;
      case "personal":
      case "habit":
      case "lifestyle":
        return GoalCategory.Personal;
      default:
        return GoalCategory.Other;
    }
  }
}

export const goalClassifier = new GoalClassifier();
