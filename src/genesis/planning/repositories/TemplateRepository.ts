import { PlanningTemplate, GoalCategory } from "../types";

export interface TemplateRepository {
  getTemplate(id: string, version?: number): PlanningTemplate | null;
  getTemplateByCategory(category: GoalCategory, version?: number): PlanningTemplate | null;
  registerTemplate(template: PlanningTemplate): PlanningTemplate;
  listTemplates(): PlanningTemplate[];
  validateTemplate(template: PlanningTemplate): { isValid: boolean; error?: string };
}
