import { Plan, GoalCategory, PlanningTemplate, Milestone, Task } from "../types";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { PlanRepository } from "../repositories/PlanRepository";
import { InMemoryTemplateRepository } from "../repositories/InMemoryTemplateRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { milestoneService } from "./MilestoneService";
import { taskService } from "./TaskService";
import { goalClassifier } from "./GoalClassifier";
import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class GoalDecompositionService {
  private templateRepo!: TemplateRepository;
  private planRepo!: PlanRepository;

  constructor(templateRepo?: TemplateRepository, planRepo?: PlanRepository) {
    this.templateRepo = templateRepo || new InMemoryTemplateRepository();
    this.planRepo = planRepo || new InMemoryPlanRepository();
  }

  public initialize(templateRepo: TemplateRepository, planRepo: PlanRepository): void {
    this.templateRepo = templateRepo;
    this.planRepo = planRepo;
  }

  /**
   * Deterministically classifies a goal by title and description keywords.
   */
  public classifyGoal(title: string, description: string): GoalCategory {
    return goalClassifier.classifyGoal(title, description);
  }

  /**
   * Decomposes a goal into a Plan, Milestones, and Tasks using a specific template.
   */
  public decomposeGoal(goalId: string, templateId: string, options?: { force?: boolean }): Plan {
    const template = this.templateRepo.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template with ID ${templateId} does not exist.`);
    }

    // Prevent duplicate decomposition unless forced
    const existingPlans = this.planRepo.listPlans();
    const existing = existingPlans.find((p) => p.goalId === goalId);
    if (existing && !options?.force) {
      return existing;
    }

    // Generate Plan
    const plan: Plan = {
      id: uid(),
      goalId,
      title: template.title,
      description: `Plan generated from template "${template.title}" to achieve goal: ${goalId}`,
      status: "Draft",
      priority: "Medium",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        templateId: template.id,
        templateVersion: template.version,
      },
    };

    const createdPlan = this.planRepo.createPlan(plan);

    // Record Event: PlanGenerated
    eventService.record(
      Events.PLAN_GENERATED as DomainEventName,
      "Plan Generated",
      `Plan "${createdPlan.title}" generated for goal ${goalId}`,
      null,
      null,
      { plan: createdPlan },
    );

    // Generate Milestones and Tasks sequentially to preserve ordering
    for (const tm of template.milestones) {
      const milestone = milestoneService.createMilestone({
        planId: createdPlan.id,
        title: tm.title,
        description: tm.description,
        order: tm.order,
        status: "Pending",
      });

      // Record Event: MilestoneGenerated
      eventService.record(
        Events.MILESTONE_GENERATED as DomainEventName,
        "Milestone Generated",
        `Milestone "${milestone.title}" generated in plan ${createdPlan.id}`,
        null,
        null,
        { milestone },
      );

      for (const tt of tm.tasks) {
        const task = taskService.createTask({
          milestoneId: milestone.id,
          title: tt.title,
          description: tt.description,
          status: "Pending",
          estimatedEffort: tt.estimatedEffort,
        });

        // Record Event: TaskGenerated
        eventService.record(
          Events.TASK_GENERATED as DomainEventName,
          "Task Generated",
          `Task "${task.title}" generated in milestone ${milestone.id}`,
          null,
          null,
          { task },
        );
      }
    }

    // Record Event: TemplateApplied
    eventService.record(
      Events.TEMPLATE_APPLIED as DomainEventName,
      "Template Applied",
      `Template "${template.id}" applied to plan ${createdPlan.id}`,
      null,
      null,
      { templateId: template.id, planId: createdPlan.id },
    );

    // Record Event: GoalDecomposed
    eventService.record(
      Events.GOAL_DECOMPOSED as DomainEventName,
      "Goal Decomposed",
      `Goal ${goalId} successfully decomposed into plan ${createdPlan.id}`,
      null,
      null,
      { goalId, plan: createdPlan },
    );

    return createdPlan;
  }

  /**
   * Helper to decompose a goal by classifying it and matching the best template automatically.
   */
  public createPlanFromGoal(
    goalId: string,
    title: string,
    description: string,
    options?: { force?: boolean },
  ): Plan {
    const category = this.classifyGoal(title, description);

    let template = this.templateRepo.getTemplateByCategory(category);

    if (!template) {
      template = this.templateRepo.getTemplate("template-project-akira");
      if (!template) {
        throw new Error(`No template available to decompose goal category: ${category}`);
      }
    }

    return this.decomposeGoal(goalId, template.id, options);
  }
}

export const goalDecompositionService = new GoalDecompositionService();
