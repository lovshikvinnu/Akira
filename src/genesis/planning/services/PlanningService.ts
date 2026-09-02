import {
  Plan,
  Milestone,
  Task,
  Dependency,
  Progress,
  Blocker,
  PlanningGraph,
  PlanningGraphNode,
  PlanningGraphEdge,
  GoalCategory,
  PlanningTemplate,
  PlanAnalysisResult,
  PlanDiagnostics,
  Recommendation,
} from "../types";
import { PlanRepository } from "../repositories/PlanRepository";
import { BlockerRepository } from "../repositories/BlockerRepository";
import { MilestoneRepository } from "../repositories/MilestoneRepository";
import { TaskRepository } from "../repositories/TaskRepository";
import { DependencyRepository } from "../repositories/DependencyRepository";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { InMemoryPlanRepository } from "../repositories/InMemoryPlanRepository";
import { InMemoryBlockerRepository } from "../repositories/InMemoryBlockerRepository";
import { InMemoryMilestoneRepository } from "../repositories/InMemoryMilestoneRepository";
import { InMemoryTaskRepository } from "../repositories/InMemoryTaskRepository";
import { InMemoryDependencyRepository } from "../repositories/InMemoryDependencyRepository";
import { InMemoryTemplateRepository } from "../repositories/InMemoryTemplateRepository";

import { milestoneService } from "./MilestoneService";
import { taskService } from "./TaskService";
import { dependencyService } from "./DependencyService";
import { progressService } from "./ProgressService";
import { planningValidationService } from "./PlanningValidationService";
import { goalDecompositionService } from "./GoalDecompositionService";
import { blockerAnalysisService } from "./BlockerAnalysisService";
import { nextActionService } from "./NextActionService";
import { planAnalysisService } from "./PlanAnalysisService";
import { planningGraphBuilder } from "./PlanningGraphBuilder";
import { recommendationService } from "./RecommendationService";
import { recommendationRuleEngine } from "./RecommendationRuleEngine";
import { adaptivePlanningService } from "./AdaptivePlanningService";

import { eventService } from "../../events/event-service";
import { Events, DomainEventName } from "../../../contracts/events";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class PlanningService {
  private planRepo!: PlanRepository;
  private blockerRepo!: BlockerRepository;
  private milestoneRepo!: MilestoneRepository;
  private taskRepo!: TaskRepository;
  private dependencyRepo!: DependencyRepository;
  private templateRepo!: TemplateRepository;

  constructor(
    planRepo?: PlanRepository,
    blockerRepo?: BlockerRepository,
    milestoneRepo?: MilestoneRepository,
    taskRepo?: TaskRepository,
    dependencyRepo?: DependencyRepository,
    templateRepo?: TemplateRepository,
  ) {
    this.planRepo = planRepo || new InMemoryPlanRepository();
    this.blockerRepo = blockerRepo || new InMemoryBlockerRepository();
    this.milestoneRepo = milestoneRepo || new InMemoryMilestoneRepository();
    this.taskRepo = taskRepo || new InMemoryTaskRepository();
    this.dependencyRepo = dependencyRepo || new InMemoryDependencyRepository();
    this.templateRepo = templateRepo || new InMemoryTemplateRepository();

    this.initializeDelegates();
  }

  public initialize(
    planRepo: PlanRepository,
    blockerRepo: BlockerRepository,
    milestoneRepo: MilestoneRepository,
    taskRepo: TaskRepository,
    dependencyRepo: DependencyRepository,
    templateRepo?: TemplateRepository,
  ): void {
    this.planRepo = planRepo;
    this.blockerRepo = blockerRepo;
    this.milestoneRepo = milestoneRepo;
    this.taskRepo = taskRepo;
    this.dependencyRepo = dependencyRepo;
    if (templateRepo) {
      this.templateRepo = templateRepo;
    }

    this.initializeDelegates();
  }

  private initializeDelegates(): void {
    planningValidationService.initialize(
      this.planRepo,
      this.milestoneRepo,
      this.taskRepo,
      this.dependencyRepo,
      this.blockerRepo,
    );

    milestoneService.initialize(this.milestoneRepo);
    taskService.initialize(this.taskRepo);
    dependencyService.initialize(this.dependencyRepo);
    progressService.initialize(this.planRepo, this.milestoneRepo, this.taskRepo);
    goalDecompositionService.initialize(this.templateRepo, this.planRepo);

    blockerAnalysisService.initialize(
      this.planRepo,
      this.blockerRepo,
      this.milestoneRepo,
      this.taskRepo,
      this.dependencyRepo,
    );
    nextActionService.initialize(
      this.planRepo,
      this.milestoneRepo,
      this.taskRepo,
      this.dependencyRepo,
    );
    planAnalysisService.initialize(
      this.planRepo,
      this.milestoneRepo,
      this.taskRepo,
      this.dependencyRepo,
      this.blockerRepo,
    );
    planningGraphBuilder.initialize(
      this.planRepo,
      this.milestoneRepo,
      this.taskRepo,
      this.dependencyRepo,
      this.blockerRepo,
    );
  }

  public getPlanRepository(): PlanRepository {
    return this.planRepo;
  }
  public getBlockerRepository(): BlockerRepository {
    return this.blockerRepo;
  }
  public getMilestoneRepository(): MilestoneRepository {
    return this.milestoneRepo;
  }
  public getTaskRepository(): TaskRepository {
    return this.taskRepo;
  }
  public getDependencyRepository(): DependencyRepository {
    return this.dependencyRepo;
  }

  // --- Plan CRUD ---
  public createPlan(input: Omit<Plan, "id" | "createdAt" | "updatedAt">): Plan {
    const plan: Plan = {
      ...input,
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!planningValidationService.validatePlanStatus(plan.status)) {
      throw new Error(`Invalid plan status: ${plan.status}`);
    }
    if (!planningValidationService.validatePlanPriority(plan.priority)) {
      throw new Error(`Invalid plan priority: ${plan.priority}`);
    }

    const created = this.planRepo.createPlan(plan);

    eventService.record(
      Events.PLAN_CREATED as DomainEventName,
      "Plan Created",
      `Plan "${created.title}" initialized.`,
      null,
      null,
      { plan: created },
    );

    return created;
  }

  public updatePlan(
    id: string,
    input: Partial<Omit<Plan, "id" | "createdAt" | "updatedAt">>,
  ): Plan {
    const existing = this.planRepo.getPlan(id);
    if (!existing) {
      throw new Error(`Plan with ID ${id} does not exist.`);
    }

    const updated: Plan = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    if (input.status && !planningValidationService.validatePlanStatus(updated.status)) {
      throw new Error(`Invalid plan status: ${updated.status}`);
    }
    if (input.priority && !planningValidationService.validatePlanPriority(updated.priority)) {
      throw new Error(`Invalid plan priority: ${updated.priority}`);
    }

    const saved = this.planRepo.updatePlan(updated);

    eventService.record(
      Events.PLAN_UPDATED as DomainEventName,
      "Plan Updated",
      `Plan "${saved.title}" updated.`,
      null,
      null,
      { plan: saved },
    );

    return saved;
  }

  public archivePlan(id: string): Plan {
    const plan = this.updatePlan(id, { status: "Archived" });

    eventService.record(
      Events.PLAN_ARCHIVED as DomainEventName,
      "Plan Archived",
      `Plan "${plan.title}" archived.`,
      null,
      null,
      { plan },
    );

    return plan;
  }

  public getPlan(id: string): Plan | null {
    return this.planRepo.getPlan(id);
  }

  public listPlans(): Plan[] {
    return this.planRepo.listPlans();
  }

  // --- Reserved Plan Lifecycle events ---
  public activatePlan(id: string): Plan {
    const plan = this.updatePlan(id, { status: "Active" });
    eventService.record(
      Events.PLAN_ACTIVATED as DomainEventName,
      "Plan Activated",
      `Plan "${plan.title}" is now active.`,
      null,
      null,
      { plan },
    );
    return plan;
  }

  public pausePlan(id: string): Plan {
    const plan = this.updatePlan(id, { status: "Paused" });
    eventService.record(
      Events.PLAN_PAUSED as DomainEventName,
      "Plan Paused",
      `Plan "${plan.title}" has been paused.`,
      null,
      null,
      { plan },
    );
    return plan;
  }

  public resumePlan(id: string): Plan {
    const plan = this.updatePlan(id, { status: "Active" });
    eventService.record(
      Events.PLAN_RESUMED as DomainEventName,
      "Plan Resumed",
      `Plan "${plan.title}" has been resumed.`,
      null,
      null,
      { plan },
    );
    return plan;
  }

  // --- Blocker Operations ---
  public createBlocker(input: Omit<Blocker, "id" | "createdAt">): Blocker {
    const blocker: Blocker = {
      ...input,
      id: uid(),
      createdAt: new Date().toISOString(),
    };

    const validation = planningValidationService.validateBlocker(blocker);
    if (!validation.isValid) {
      throw new Error(validation.error || "Blocker validation failed.");
    }

    return this.blockerRepo.createBlocker(blocker);
  }

  public updateBlocker(
    id: string,
    input: Partial<Omit<Blocker, "id" | "planId" | "createdAt">>,
  ): Blocker {
    const existing = this.blockerRepo.getBlocker(id);
    if (!existing) {
      throw new Error(`Blocker with ID ${id} does not exist.`);
    }

    const updated: Blocker = {
      ...existing,
      ...input,
    };

    const validation = planningValidationService.validateBlocker(updated);
    if (!validation.isValid) {
      throw new Error(validation.error || "Blocker validation failed.");
    }

    return this.blockerRepo.updateBlocker(updated);
  }

  public resolveBlocker(id: string): Blocker {
    return this.updateBlocker(id, { resolved: true });
  }

  public listBlockers(planId?: string): Blocker[] {
    return this.blockerRepo.listBlockers(planId);
  }

  // --- Public API Facade Delegation ---
  public createMilestone(input: Omit<Milestone, "id" | "createdAt" | "updatedAt">): Milestone {
    return milestoneService.createMilestone(input);
  }

  public createTask(input: Omit<Task, "id" | "createdAt" | "updatedAt">): Task {
    return taskService.createTask(input);
  }

  public createDependency(input: Omit<Dependency, "id">): Dependency {
    return dependencyService.createDependency(input);
  }

  public getProgress(planId: string): Progress | null {
    return progressService.getProgress(planId);
  }

  // --- Graph Layer Dynamic Generator ---
  public getPlanningGraph(planId: string): PlanningGraph {
    const graph = planningGraphBuilder.build(planId);

    eventService.record(
      Events.PLANNING_GRAPH_GENERATED as DomainEventName,
      "Planning Graph Generated",
      `Planning graph generated for plan ${planId}`,
      null,
      null,
      { planId, graph },
    );

    return graph;
  }

  // --- Sprint 2 Public API Facades ---
  public getTemplateRepository(): TemplateRepository {
    return this.templateRepo;
  }

  public classifyGoal(title: string, description: string): GoalCategory {
    return goalDecompositionService.classifyGoal(title, description);
  }

  public decomposeGoal(goalId: string, templateId: string, options?: { force?: boolean }): Plan {
    return goalDecompositionService.decomposeGoal(goalId, templateId, options);
  }

  public createPlanFromGoal(
    goalId: string,
    title: string,
    description: string,
    options?: { force?: boolean },
  ): Plan {
    return goalDecompositionService.createPlanFromGoal(goalId, title, description, options);
  }

  public registerTemplate(template: PlanningTemplate): PlanningTemplate {
    return this.templateRepo.registerTemplate(template);
  }

  public getTemplate(id: string, version?: number): PlanningTemplate | null {
    return this.templateRepo.getTemplate(id, version);
  }

  public listTemplates(): PlanningTemplate[] {
    return this.templateRepo.listTemplates();
  }

  // --- Sprint 3 Public API Facades ---
  public analyzePlan(planId: string): PlanAnalysisResult {
    return planAnalysisService.analyzePlan(planId);
  }

  public getNextAction(planId: string): Task | null {
    return nextActionService.getNextAction(planId);
  }

  public getAvailableTasks(planId: string): Task[] {
    return nextActionService.getAvailableTasks(planId);
  }

  public getBlockedTasks(planId: string): Task[] {
    return blockerAnalysisService.getBlockedTasks(planId);
  }

  public getPlanDiagnostics(planId: string): PlanDiagnostics {
    return planAnalysisService.getPlanDiagnostics(planId);
  }

  // --- Sprint 4 Public API Facades ---
  public getRecommendations(planId: string): Recommendation[] {
    return recommendationService.getRecommendations(planId);
  }

  public evaluatePlan(planId: string): { status: string; recommendations: Recommendation[] } {
    return adaptivePlanningService.evaluatePlan(planId);
  }

  public evaluatePlanningGraph(graph: PlanningGraph): Recommendation[] {
    return recommendationService.evaluatePlanningGraph(graph);
  }

  public listRecommendationRules(): string[] {
    return recommendationRuleEngine.listRecommendationRules();
  }
}

export const planningService = new PlanningService();
