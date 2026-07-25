import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  planningService,
  milestoneService,
  taskService,
  dependencyService,
  progressService,
  planningValidationService,
  InMemoryPlanRepository,
  InMemoryBlockerRepository,
  InMemoryMilestoneRepository,
  InMemoryTaskRepository,
  InMemoryDependencyRepository,
  InMemoryTemplateRepository,
  GoalCategory,
  PlanningTemplate,
  goalDecompositionService,
  goalClassifier,
  blockerAnalysisService,
  nextActionService,
  planAnalysisService,
  planningGraphBuilder,
  recommendationService,
  recommendationRuleEngine,
  adaptivePlanningService,
  Plan,
  Milestone,
  Task,
  Dependency,
  Recommendation,
  Blocker,
  MemoryEvent,
} from "../src/genesis";
import { eventService } from "../src/genesis/events/event-service";
import { Events } from "../src/contracts/events";

describe("GENESIS Cognitive Engine - Planning Capability Module", () => {
  let planRepo: InMemoryPlanRepository;
  let blockerRepo: InMemoryBlockerRepository;
  let milestoneRepo: InMemoryMilestoneRepository;
  let taskRepo: InMemoryTaskRepository;
  let dependencyRepo: InMemoryDependencyRepository;
  let templateRepo: InMemoryTemplateRepository;

  const recordedEvents: MemoryEvent[] = [];
  let unsubEventService: () => void;

  beforeEach(() => {
    planRepo = new InMemoryPlanRepository();
    blockerRepo = new InMemoryBlockerRepository();
    milestoneRepo = new InMemoryMilestoneRepository();
    taskRepo = new InMemoryTaskRepository();
    dependencyRepo = new InMemoryDependencyRepository();
    templateRepo = new InMemoryTemplateRepository();

    // Initialize services with new clean repositories
    planningService.initialize(
      planRepo,
      blockerRepo,
      milestoneRepo,
      taskRepo,
      dependencyRepo,
      templateRepo,
    );

    recordedEvents.length = 0;
    unsubEventService = eventService.onRecord((evt) => {
      recordedEvents.push(evt);
    });
  });

  afterEach(() => {
    if (unsubEventService) {
      unsubEventService();
    }
    recommendationRuleEngine.clearRules();
  });

  describe("Initialization and Repository Injection", () => {
    it("should initialize services with repositories correctly", () => {
      expect(planningService.getPlanRepository()).toBe(planRepo);
      expect(planningService.getBlockerRepository()).toBe(blockerRepo);
      expect(planningService.getMilestoneRepository()).toBe(milestoneRepo);
      expect(planningService.getTaskRepository()).toBe(taskRepo);
      expect(planningService.getDependencyRepository()).toBe(dependencyRepo);
    });
  });

  describe("Plan Operations", () => {
    it("should create a new plan successfully", () => {
      const plan = planningService.createPlan({
        title: "Sprint 1 Foundation",
        description: "Set up deterministic repositories and validation",
        status: "Draft",
        priority: "High",
        goalId: "goal-123",
      });

      expect(plan.id).toBeDefined();
      expect(plan.title).toBe("Sprint 1 Foundation");
      expect(plan.description).toBe("Set up deterministic repositories and validation");
      expect(plan.status).toBe("Draft");
      expect(plan.priority).toBe("High");
      expect(plan.goalId).toBe("goal-123");
      expect(plan.createdAt).toBeDefined();
      expect(plan.updatedAt).toBeDefined();

      // Check event
      const event = recordedEvents.find((e) => e.eventType === Events.PLAN_CREATED);
      expect(event).toBeDefined();
      expect(event.metadata.plan.id).toBe(plan.id);
    });

    it("should update a plan and emit an event", () => {
      vi.useFakeTimers();
      const plan = planningService.createPlan({
        title: "Sprint 1 Foundation",
        description: "Set up deterministic repositories and validation",
        status: "Draft",
        priority: "High",
      });

      vi.advanceTimersByTime(1000);

      const updated = planningService.updatePlan(plan.id, {
        title: "Sprint 1 Foundation Updated",
        status: "Active",
      });

      expect(updated.title).toBe("Sprint 1 Foundation Updated");
      expect(updated.status).toBe("Active");
      expect(updated.updatedAt).not.toBe(plan.updatedAt);

      const event = recordedEvents.find((e) => e.eventType === Events.PLAN_UPDATED);
      expect(event).toBeDefined();
      expect(event.metadata.plan.title).toBe("Sprint 1 Foundation Updated");
      vi.useRealTimers();
    });

    it("should archive a plan and emit an event", () => {
      const plan = planningService.createPlan({
        title: "Sprint 1 Foundation",
        description: "Set up deterministic repositories and validation",
        status: "Active",
        priority: "High",
      });

      const archived = planningService.archivePlan(plan.id);
      expect(archived.status).toBe("Archived");

      const event = recordedEvents.find((e) => e.eventType === Events.PLAN_ARCHIVED);
      expect(event).toBeDefined();
    });

    it("should validate plan status and priority on creation/update", () => {
      expect(() =>
        planningService.createPlan({
          title: "Bad Plan",
          description: "",
          status: "InvalidStatus" as unknown as PlanStatus,
          priority: "High",
        }),
      ).toThrow();

      expect(() =>
        planningService.createPlan({
          title: "Bad Plan 2",
          description: "",
          status: "Draft",
          priority: "SuperHigh" as unknown as PlanPriority,
        }),
      ).toThrow();
    });

    it("should support plan lifecycle activation, pause, and resume", () => {
      const plan = planningService.createPlan({
        title: "Sprint 1",
        description: "Plan lifecycle test",
        status: "Draft",
        priority: "Medium",
      });

      planningService.activatePlan(plan.id);
      expect(planRepo.getPlan(plan.id)!.status).toBe("Active");
      expect(recordedEvents.some((e) => e.eventType === Events.PLAN_ACTIVATED)).toBe(true);

      planningService.pausePlan(plan.id);
      expect(planRepo.getPlan(plan.id)!.status).toBe("Paused");
      expect(recordedEvents.some((e) => e.eventType === Events.PLAN_PAUSED)).toBe(true);

      planningService.resumePlan(plan.id);
      expect(planRepo.getPlan(plan.id)!.status).toBe("Active");
      expect(recordedEvents.some((e) => e.eventType === Events.PLAN_RESUMED)).toBe(true);
    });
  });

  describe("Milestone Operations", () => {
    let plan: Plan;

    beforeEach(() => {
      plan = planningService.createPlan({
        title: "Plan for Milestones",
        description: "Milestone testing sandbox",
        status: "Active",
        priority: "Medium",
      });
    });

    it("should create a milestone successfully", () => {
      const milestone = planningService.createMilestone({
        planId: plan.id,
        title: "Establish Architecture",
        description: "Decouple repositories",
        order: 1,
        status: "Pending",
      });

      expect(milestone.id).toBeDefined();
      expect(milestone.planId).toBe(plan.id);
      expect(milestone.order).toBe(1);
      expect(milestone.status).toBe("Pending");

      const event = recordedEvents.find((e) => e.eventType === Events.MILESTONE_CREATED);
      expect(event).toBeDefined();
      expect(event.metadata.milestone.title).toBe("Establish Architecture");
    });

    it("should prevent duplicate milestone orders in the same plan", () => {
      planningService.createMilestone({
        planId: plan.id,
        title: "Milestone 1",
        description: "Order 1",
        order: 1,
        status: "Pending",
      });

      expect(() =>
        planningService.createMilestone({
          planId: plan.id,
          title: "Milestone 2",
          description: "Duplicate Order 1",
          order: 1,
          status: "Pending",
        }),
      ).toThrow();
    });

    it("should reject milestone creation with invalid plan ID", () => {
      expect(() =>
        planningService.createMilestone({
          planId: "non-existent-plan-id",
          title: "Detached Milestone",
          description: "Invalid plan",
          order: 1,
          status: "Pending",
        }),
      ).toThrow();
    });

    it("should complete a milestone and emit an event", () => {
      const milestone = planningService.createMilestone({
        planId: plan.id,
        title: "Establish Architecture",
        description: "Decouple repositories",
        order: 1,
        status: "Pending",
      });

      const completed = milestoneService.completeMilestone(milestone.id);
      expect(completed.status).toBe("Completed");

      const event = recordedEvents.find((e) => e.eventType === Events.MILESTONE_COMPLETED);
      expect(event).toBeDefined();
    });
  });

  describe("Task Operations", () => {
    let plan: Plan;
    let milestone: Milestone;

    beforeEach(() => {
      plan = planningService.createPlan({
        title: "Plan for Tasks",
        description: "Task testing sandbox",
        status: "Active",
        priority: "Medium",
      });
      milestone = planningService.createMilestone({
        planId: plan.id,
        title: "Milestone 1",
        description: "Milestone 1 desc",
        order: 1,
        status: "Active",
      });
    });

    it("should create a task successfully", () => {
      const task = planningService.createTask({
        milestoneId: milestone.id,
        title: "Implement PlanRepository",
        description: "Write PlanRepository and InMemoryPlanRepository",
        status: "Pending",
        estimatedEffort: 4,
      });

      expect(task.id).toBeDefined();
      expect(task.milestoneId).toBe(milestone.id);
      expect(task.status).toBe("Pending");
      expect(task.estimatedEffort).toBe(4);

      const event = recordedEvents.find((e) => e.eventType === Events.TASK_CREATED);
      expect(event).toBeDefined();
    });

    it("should reject task creation with non-existent milestone reference", () => {
      expect(() =>
        planningService.createTask({
          milestoneId: "non-existent-milestone-id",
          title: "Orphaned Task",
          description: "No milestone owner",
          status: "Pending",
          estimatedEffort: 1,
        }),
      ).toThrow();
    });

    it("should complete a task and emit a task.completed event", () => {
      const task = planningService.createTask({
        milestoneId: milestone.id,
        title: "Implement PlanRepository",
        description: "Write PlanRepository and InMemoryPlanRepository",
        status: "InProgress",
        estimatedEffort: 4,
      });

      const completed = taskService.completeTask(task.id);
      expect(completed.status).toBe("Completed");

      const event = recordedEvents.find((e) => e.eventType === Events.TASK_COMPLETED);
      expect(event).toBeDefined();
    });
  });

  describe("Dependency Operations", () => {
    let plan: Plan;
    let milestone: Milestone;
    let taskA: Task;
    let taskB: Task;
    let taskC: Task;

    beforeEach(() => {
      plan = planningService.createPlan({
        title: "Dependency Plan",
        description: "Dependency sandbox",
        status: "Active",
        priority: "Medium",
      });
      milestone = planningService.createMilestone({
        planId: plan.id,
        title: "Milestone A",
        description: "Milestone for dependencies",
        order: 1,
        status: "Active",
      });
      taskA = planningService.createTask({
        milestoneId: milestone.id,
        title: "Task A",
        description: "",
        status: "Pending",
        estimatedEffort: 2,
      });
      taskB = planningService.createTask({
        milestoneId: milestone.id,
        title: "Task B",
        description: "",
        status: "Pending",
        estimatedEffort: 2,
      });
      taskC = planningService.createTask({
        milestoneId: milestone.id,
        title: "Task C",
        description: "",
        status: "Pending",
        estimatedEffort: 2,
      });
    });

    it("should create a dependency successfully and emit an event", () => {
      const dep = planningService.createDependency({
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
        type: "FinishToStart",
      });

      expect(dep.id).toBeDefined();
      expect(dep.predecessorTaskId).toBe(taskA.id);
      expect(dep.successorTaskId).toBe(taskB.id);

      const event = recordedEvents.find((e) => e.eventType === Events.DEPENDENCY_CREATED);
      expect(event).toBeDefined();
    });

    it("should reject self-dependencies", () => {
      expect(() =>
        planningService.createDependency({
          predecessorTaskId: taskA.id,
          successorTaskId: taskA.id,
          type: "FinishToStart",
        }),
      ).toThrow();
    });

    it("should reject duplicate dependencies", () => {
      planningService.createDependency({
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
        type: "FinishToStart",
      });

      expect(() =>
        planningService.createDependency({
          predecessorTaskId: taskA.id,
          successorTaskId: taskB.id,
          type: "StartToStart",
        }),
      ).toThrow();
    });

    it("should reject dependencies pointing to non-existent tasks", () => {
      expect(() =>
        planningService.createDependency({
          predecessorTaskId: "non-existent-task",
          successorTaskId: taskB.id,
          type: "FinishToStart",
        }),
      ).toThrow();

      expect(() =>
        planningService.createDependency({
          predecessorTaskId: taskA.id,
          successorTaskId: "non-existent-task",
          type: "FinishToStart",
        }),
      ).toThrow();
    });

    it("should detect and reject cyclic dependencies", () => {
      // Create A -> B
      planningService.createDependency({
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
        type: "FinishToStart",
      });

      // Create B -> C
      planningService.createDependency({
        predecessorTaskId: taskB.id,
        successorTaskId: taskC.id,
        type: "FinishToStart",
      });

      // Proposed C -> A (Creates cycle: A -> B -> C -> A)
      expect(() =>
        planningService.createDependency({
          predecessorTaskId: taskC.id,
          successorTaskId: taskA.id,
          type: "FinishToStart",
        }),
      ).toThrow();
    });

    it("should remove dependencies and emit an event", () => {
      const dep = planningService.createDependency({
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
        type: "FinishToStart",
      });

      dependencyService.removeDependency(dep.id);

      expect(dependencyRepo.getDependency(dep.id)).toBeNull();
      const event = recordedEvents.find((e) => e.eventType === Events.DEPENDENCY_REMOVED);
      expect(event).toBeDefined();
    });
  });

  describe("Progress Derivation & Repository Independence", () => {
    let plan: Plan;
    let milestone: Milestone;
    let task1: Task;
    let task2: Task;

    beforeEach(() => {
      plan = planningService.createPlan({
        title: "Progress Plan",
        description: "Sandbox for progress",
        status: "Active",
        priority: "Medium",
      });
      milestone = planningService.createMilestone({
        planId: plan.id,
        title: "Milestone A",
        description: "",
        order: 1,
        status: "Pending",
      });
      task1 = planningService.createTask({
        milestoneId: milestone.id,
        title: "Task 1",
        description: "",
        status: "Pending",
        estimatedEffort: 2,
      });
      task2 = planningService.createTask({
        milestoneId: milestone.id,
        title: "Task 2",
        description: "",
        status: "Pending",
        estimatedEffort: 2,
      });
    });

    it("should return 100% progress for a plan with no tasks and milestones", () => {
      const emptyPlan = planningService.createPlan({
        title: "Empty Plan",
        description: "",
        status: "Active",
        priority: "Low",
      });

      const prog = planningService.getProgress(emptyPlan.id);
      expect(prog).not.toBeNull();
      expect(prog!.percentage).toBe(100);
      expect(prog!.totalTasks).toBe(0);
      expect(prog!.totalMilestones).toBe(0);
    });

    it("should calculate correct partial progress as tasks are completed", () => {
      // 0% completion initially
      let prog = planningService.getProgress(plan.id);
      expect(prog!.percentage).toBe(0);
      expect(prog!.completedTasks).toBe(0);
      expect(prog!.totalTasks).toBe(2);

      // Complete 1 out of 2 tasks (50% progress)
      taskService.completeTask(task1.id);
      prog = planningService.getProgress(plan.id);
      expect(prog!.percentage).toBe(50);
      expect(prog!.completedTasks).toBe(1);
      expect(prog!.totalTasks).toBe(2);

      // Verify that progress updated event is fired
      const event = recordedEvents.find(
        (e) => e.eventType === Events.PROGRESS_UPDATED && e.metadata.progress.percentage === 50,
      );
      expect(event).toBeDefined();

      // Complete 2 out of 2 tasks (100% progress)
      taskService.completeTask(task2.id);
      prog = planningService.getProgress(plan.id);
      expect(prog!.percentage).toBe(100);
      expect(prog!.completedTasks).toBe(2);
    });

    it("should verify that progress calculation is strictly derived and has no direct repository mutation", () => {
      // Verify no 'Progress' store table exists in repositories. Progress is fully computed on the fly.
      const initialProgress = progressService.calculateProgress(plan.id);
      expect(initialProgress.percentage).toBe(0);

      // Modify the plan title: verify progress does not change.
      planningService.updatePlan(plan.id, { title: "Updated Progress Plan" });
      const currentProgress = progressService.calculateProgress(plan.id);
      expect(currentProgress.percentage).toBe(0);
    });

    it("should compute progress based on milestones if milestone has no tasks", () => {
      const milestonePlan = planningService.createPlan({
        title: "Milestone Only Plan",
        description: "",
        status: "Active",
        priority: "Low",
      });

      const ms1 = planningService.createMilestone({
        planId: milestonePlan.id,
        title: "MS1",
        description: "",
        order: 1,
        status: "Pending",
      });

      const ms2 = planningService.createMilestone({
        planId: milestonePlan.id,
        title: "MS2",
        description: "",
        order: 2,
        status: "Pending",
      });

      let prog = progressService.calculateProgress(milestonePlan.id);
      expect(prog.percentage).toBe(0);
      expect(prog.totalTasks).toBe(0);
      expect(prog.totalMilestones).toBe(2);

      milestoneService.completeMilestone(ms1.id);
      prog = progressService.calculateProgress(milestonePlan.id);
      expect(prog.percentage).toBe(50);
      expect(prog.completedMilestones).toBe(1);

      milestoneService.completeMilestone(ms2.id);
      prog = progressService.calculateProgress(milestonePlan.id);
      expect(prog.percentage).toBe(100);
      expect(prog.completedMilestones).toBe(2);
    });
  });

  describe("Blocker Operations", () => {
    let plan: Plan;

    beforeEach(() => {
      plan = planningService.createPlan({
        title: "Blocked Plan",
        description: "Sandbox for blockers",
        status: "Active",
        priority: "High",
      });
    });

    it("should create a blocker successfully", () => {
      const blocker = planningService.createBlocker({
        planId: plan.id,
        reason: "Missing resources",
        severity: "High",
        resolved: false,
      });

      expect(blocker.id).toBeDefined();
      expect(blocker.planId).toBe(plan.id);
      expect(blocker.reason).toBe("Missing resources");
      expect(blocker.severity).toBe("High");
      expect(blocker.resolved).toBe(false);
      expect(blocker.createdAt).toBeDefined();
    });

    it("should reject blocker with invalid plan reference", () => {
      expect(() =>
        planningService.createBlocker({
          planId: "non-existent-plan-id",
          reason: "Unknown",
          severity: "Medium",
          resolved: false,
        }),
      ).toThrow();
    });

    it("should update a blocker and resolve it successfully", () => {
      const blocker = planningService.createBlocker({
        planId: plan.id,
        reason: "Blocked by dependency",
        severity: "Critical",
        resolved: false,
      });

      const updated = planningService.updateBlocker(blocker.id, {
        severity: "High",
      });
      expect(updated.severity).toBe("High");

      const resolved = planningService.resolveBlocker(blocker.id);
      expect(resolved.resolved).toBe(true);
    });

    it("should list blockers and filter by plan ID", () => {
      const blockerA = planningService.createBlocker({
        planId: plan.id,
        reason: "Blocker A",
        severity: "Medium",
        resolved: false,
      });

      const planB = planningService.createPlan({
        title: "Plan B",
        description: "",
        status: "Active",
        priority: "Low",
      });

      const blockerB = planningService.createBlocker({
        planId: planB.id,
        reason: "Blocker B",
        severity: "Low",
        resolved: false,
      });

      const planABlockers = planningService.listBlockers(plan.id);
      expect(planABlockers.length).toBe(1);
      expect(planABlockers[0].id).toBe(blockerA.id);

      const allBlockers = planningService.listBlockers();
      expect(allBlockers.length).toBe(2);
    });
  });

  describe("Graph Layer", () => {
    it("should generate the full graph of nodes and edges matching Goal -> Plan -> Milestone -> Task hierarchy", () => {
      const plan = planningService.createPlan({
        title: "Graph Plan",
        description: "Sandbox for graph building",
        status: "Active",
        priority: "High",
        goalId: "goal-xyz",
      });

      const ms1 = planningService.createMilestone({
        planId: plan.id,
        title: "Design",
        description: "Design diagrams",
        order: 1,
        status: "Active",
      });

      const t1 = planningService.createTask({
        milestoneId: ms1.id,
        title: "Figma Mockup",
        description: "",
        status: "Pending",
        estimatedEffort: 6,
      });

      const t2 = planningService.createTask({
        milestoneId: ms1.id,
        title: "UML diagram",
        description: "",
        status: "Pending",
        estimatedEffort: 3,
      });

      // Add a blocker
      planningService.createBlocker({
        planId: plan.id,
        reason: "No Figma license",
        severity: "Low",
        resolved: false,
      });

      // Add dependency t1 -> t2
      planningService.createDependency({
        predecessorTaskId: t1.id,
        successorTaskId: t2.id,
        type: "FinishToStart",
      });

      const graph = planningService.getPlanningGraph(plan.id);

      // Verify Nodes
      const planNode = graph.nodes.find((n) => n.type === "Plan");
      expect(planNode).toBeDefined();
      expect((planNode!.data as Plan).id).toBe(plan.id);

      const goalNode = graph.nodes.find((n) => n.type === "Goal");
      expect(goalNode).toBeDefined();

      const msNode = graph.nodes.find((n) => n.type === "Milestone");
      expect(msNode).toBeDefined();
      expect((msNode!.data as Milestone).id).toBe(ms1.id);

      const taskNodes = graph.nodes.filter((n) => n.type === "Task");
      expect(taskNodes.length).toBe(2);

      const blockerNode = graph.nodes.find((n) => n.type === "Blocker");
      expect(blockerNode).toBeDefined();

      const progressNode = graph.nodes.find((n) => n.type === "Progress");
      expect(progressNode).toBeDefined();

      // Verify Edges
      const goalToPlanEdge = graph.edges.find((e) => e.type === "goal_to_plan");
      expect(goalToPlanEdge).toBeDefined();
      expect(goalToPlanEdge!.sourceId).toBe("goal-xyz");
      expect(goalToPlanEdge!.targetId).toBe(plan.id);

      const planToMsEdge = graph.edges.find((e) => e.type === "plan_to_milestone");
      expect(planToMsEdge).toBeDefined();
      expect(planToMsEdge!.sourceId).toBe(plan.id);
      expect(planToMsEdge!.targetId).toBe(ms1.id);

      const msToTaskEdges = graph.edges.filter((e) => e.type === "milestone_to_task");
      expect(msToTaskEdges.length).toBe(2);

      const planToBlockerEdge = graph.edges.find((e) => e.type === "plan_to_blocker");
      expect(planToBlockerEdge).toBeDefined();

      const planToProgressEdge = graph.edges.find((e) => e.type === "plan_to_progress");
      expect(planToProgressEdge).toBeDefined();

      const taskDepEdge = graph.edges.find((e) => e.type === "task_dependency");
      expect(taskDepEdge).toBeDefined();
      expect(taskDepEdge!.sourceId).toBe(t1.id);
      expect(taskDepEdge!.targetId).toBe(t2.id);
    });
  });

  describe("Sprint 2 - Goal Decomposition & Template Management", () => {
    describe("Goal Classification", () => {
      it("should classify a goal into Career correctly based on keywords", () => {
        const cat = planningService.classifyGoal(
          "Become a Pilot next year",
          "Prepare for flight training",
        );
        expect(cat).toBe(GoalCategory.Career);
      });

      it("should classify a goal into Learning correctly based on keywords", () => {
        const cat = planningService.classifyGoal(
          "Learn Verilog programming",
          "Study fundamentals and solve projects",
        );
        expect(cat).toBe(GoalCategory.Learning);
      });

      it("should classify a goal into Project correctly", () => {
        const cat = planningService.classifyGoal(
          "Build AKIRA desktop app",
          "Develop cognition service pipeline architecture",
        );
        expect(cat).toBe(GoalCategory.Project);
      });

      it("should classify a goal into Health correctly", () => {
        const cat = planningService.classifyGoal(
          "Improve my Fitness routine",
          "Log workout and nutrition tracking metrics",
        );
        expect(cat).toBe(GoalCategory.Health);
      });

      it("should default to GoalCategory.Other for unknown inputs", () => {
        const cat = planningService.classifyGoal("Buy a new couch", "Sofa store search");
        expect(cat).toBe(GoalCategory.Other);
      });
    });

    describe("Template Repository Operations", () => {
      it("should retrieve built-in templates correctly", () => {
        const templates = planningService.listTemplates();
        expect(templates.length).toBeGreaterThanOrEqual(4);

        const pilotTemplate = planningService.getTemplate("template-career-pilot");
        expect(pilotTemplate).not.toBeNull();
        expect(pilotTemplate!.category).toBe(GoalCategory.Career);
        expect(pilotTemplate!.title).toBe("Become a Pilot");
      });

      it("should register a new template successfully", () => {
        const newTemplate: PlanningTemplate = {
          id: "custom-finance-template",
          version: 1,
          category: GoalCategory.Finance,
          title: "Save Money Plan",
          milestones: [
            {
              title: "Budget Setup",
              description: "Assess expenses",
              order: 1,
              tasks: [
                {
                  title: "Track daily spend",
                  description: "Log drinks and meals",
                  estimatedEffort: 2,
                },
              ],
            },
          ],
        };

        const registered = planningService.registerTemplate(newTemplate);
        expect(registered.id).toBe("custom-finance-template");

        const found = planningService.getTemplate("custom-finance-template", 1);
        expect(found).not.toBeNull();
        expect(found!.title).toBe("Save Money Plan");
      });

      it("should reject registering a template with duplicate id and version", () => {
        const template = planningService.getTemplate("template-career-pilot")!;
        expect(() => planningService.registerTemplate(template)).toThrow();
      });

      it("should validate template version and integrity constraints", () => {
        const invalidTemplate: PlanningTemplate = {
          id: "bad-template",
          version: 0, // Invalid version
          category: GoalCategory.Learning,
          title: "Bad Title",
          milestones: [],
        };
        expect(() => planningService.registerTemplate(invalidTemplate)).toThrow();
      });
    });

    describe("Goal Decomposition & Plan Generation", () => {
      it("should decompose a goal and generate milestones and tasks in order", () => {
        const plan = planningService.createPlanFromGoal(
          "goal-verilog-101",
          "Learn Verilog and FPGA synthesis",
          "Study syntax and write simple logic testbenches",
        );

        expect(plan).toBeDefined();
        expect(plan.goalId).toBe("goal-verilog-101");
        expect(plan.metadata!.templateId).toBe("template-learning-verilog");

        const milestones = milestoneService.listMilestones(plan.id);
        expect(milestones.length).toBe(4);
        expect(milestones[0].title).toBe("Fundamentals");
        expect(milestones[1].title).toBe("Practice");
        expect(milestones[2].title).toBe("Projects");
        expect(milestones[3].title).toBe("Advanced Topics");

        const fundMs = milestones[0];
        const tasks = taskService.listTasks(fundMs.id);
        expect(tasks.length).toBe(3);
        expect(tasks[0].title).toBe("Learn digital logic basics");
        expect(tasks[1].title).toBe("Understand Verilog syntax & data types");
        expect(tasks[2].title).toBe("Set up ModelSim or EDA playground");

        expect(recordedEvents.some((e) => e.eventType === Events.PLAN_GENERATED)).toBe(true);
        expect(recordedEvents.some((e) => e.eventType === Events.GOAL_DECOMPOSED)).toBe(true);
        expect(recordedEvents.some((e) => e.eventType === Events.TEMPLATE_APPLIED)).toBe(true);
        expect(recordedEvents.some((e) => e.eventType === Events.MILESTONE_GENERATED)).toBe(true);
        expect(recordedEvents.some((e) => e.eventType === Events.TASK_GENERATED)).toBe(true);
      });

      it("should prevent duplicate plan decomposition", () => {
        const plan1 = planningService.createPlanFromGoal(
          "goal-fitness-999",
          "Improve Fitness and lose weight",
          "Workout schedule and diet tracking",
        );

        const plan2 = planningService.createPlanFromGoal(
          "goal-fitness-999",
          "Improve Fitness and lose weight",
          "Workout schedule and diet tracking",
        );

        expect(plan2.id).toBe(plan1.id);

        const allPlans = planningService.listPlans();
        const fitnessPlans = allPlans.filter((p) => p.goalId === "goal-fitness-999");
        expect(fitnessPlans.length).toBe(1);
      });

      it("should force decomposition if explicitly requested", () => {
        const plan1 = planningService.createPlanFromGoal(
          "goal-fitness-999",
          "Improve Fitness and lose weight",
          "Workout schedule and diet tracking",
        );

        const plan2 = planningService.createPlanFromGoal(
          "goal-fitness-999",
          "Improve Fitness and lose weight",
          "Workout schedule and diet tracking",
          { force: true },
        );

        expect(plan2.id).not.toBe(plan1.id);

        const allPlans = planningService.listPlans();
        const fitnessPlans = allPlans.filter((p) => p.goalId === "goal-fitness-999");
        expect(fitnessPlans.length).toBe(2);
      });
    });
  });

  describe("Sprint 3 - Plan Analysis & Next Action Engine", () => {
    describe("GoalClassifier", () => {
      it("should classify goal title/description correctly", () => {
        expect(goalClassifier.classifyGoal("Learn Python coding", "")).toBe(GoalCategory.Learning);
        expect(goalClassifier.classifyGoal("Get a promotion to manager", "")).toBe(
          GoalCategory.Career,
        );
        expect(goalClassifier.classifyGoal("Workout and run", "")).toBe(GoalCategory.Health);
        expect(goalClassifier.classifyGoal("Buy groceries", "")).toBe(GoalCategory.Other);
      });

      it("should classify category name string correctly", () => {
        expect(goalClassifier.classifyCategory("job")).toBe(GoalCategory.Career);
        expect(goalClassifier.classifyCategory("school")).toBe(GoalCategory.Education);
        expect(goalClassifier.classifyCategory("money")).toBe(GoalCategory.Finance);
        expect(goalClassifier.classifyCategory("development")).toBe(GoalCategory.Project);
        expect(goalClassifier.classifyCategory("fitness")).toBe(GoalCategory.Health);
        expect(goalClassifier.classifyCategory("lifestyle")).toBe(GoalCategory.Personal);
        expect(goalClassifier.classifyCategory("unknown-category")).toBe(GoalCategory.Other);
      });
    });

    describe("Plan Analysis & Diagnostics", () => {
      it("should analyze a complete plan and produce empty issues", () => {
        const plan = planningService.createPlan({
          title: "Analysis Test Plan",
          description: "Testing diagnostics",
          status: "Draft",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "Desc",
          order: 1,
          status: "Pending",
        });

        const task = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 3,
        });

        const diag = planningService.getPlanDiagnostics(plan.id);
        expect(diag.orphanTasksCount).toBe(0);
        expect(diag.unreachableTasksCount).toBe(0);
        expect(diag.hasCycles).toBe(false);
        expect(diag.issues.length).toBe(0);
      });

      it("should detect incomplete milestones, orphans, and cycle diagnostics", () => {
        const plan = planningService.createPlan({
          title: "Diagnostic Test Plan",
          description: "Testing diagnostics",
          status: "Draft",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "Desc",
          order: 1,
          status: "Pending",
        });

        const orphanTask = taskRepo.createTask({
          id: "orphan-task-id",
          milestoneId: "fake-milestone-id",
          title: "Orphan Task",
          description: "Orphan",
          status: "Pending",
          estimatedEffort: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const t1 = taskService.createTask({
          milestoneId: ms.id,
          title: "Cyclic Task 1",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 2,
        });

        const t2 = taskService.createTask({
          milestoneId: ms.id,
          title: "Cyclic Task 2",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 2,
        });

        dependencyRepo.createDependency({
          id: "dep-1",
          predecessorTaskId: t1.id,
          successorTaskId: t2.id,
          type: "FinishToStart",
        });
        dependencyRepo.createDependency({
          id: "dep-2",
          predecessorTaskId: t2.id,
          successorTaskId: t1.id,
          type: "FinishToStart",
        });

        const diag = planningService.getPlanDiagnostics(plan.id);
        expect(diag.orphanTasksCount).toBe(1);
        expect(diag.hasCycles).toBe(true);
        expect(diag.unreachableTasksCount).toBe(2);
        expect(diag.issues.length).toBeGreaterThan(0);
      });
    });

    describe("Next Action Selection Rules", () => {
      it("should determine first executable task based on dependency order and status", () => {
        const plan = planningService.createPlan({
          title: "Next Action Plan",
          description: "Testing next action",
          status: "Draft",
          priority: "High",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "Desc",
          order: 1,
          status: "Pending",
        });

        const t1 = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 2,
        });

        const t2 = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 2",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 3,
        });

        dependencyService.createDependency({
          predecessorTaskId: t1.id,
          successorTaskId: t2.id,
          type: "FinishToStart",
        });

        expect(planningService.getNextAction(plan.id)!.id).toBe(t1.id);
        expect(planningService.getAvailableTasks(plan.id).map((t) => t.id)).toContain(t1.id);
        expect(planningService.getAvailableTasks(plan.id).map((t) => t.id)).not.toContain(t2.id);

        taskService.completeTask(t1.id);

        expect(planningService.getNextAction(plan.id)!.id).toBe(t2.id);
        expect(planningService.getAvailableTasks(plan.id).map((t) => t.id)).toContain(t2.id);
      });

      it("should exclude completed and blocked tasks from next action", () => {
        const plan = planningService.createPlan({
          title: "Exclusion Plan",
          description: "Exclusions",
          status: "Draft",
          priority: "Low",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "M1",
          description: "D",
          order: 1,
          status: "Pending",
        });

        const t1 = taskService.createTask({
          milestoneId: ms.id,
          title: "T1",
          description: "D",
          status: "Completed",
          estimatedEffort: 2,
        });

        const t2 = taskService.createTask({
          milestoneId: ms.id,
          title: "T2",
          description: "D",
          status: "Blocked",
          estimatedEffort: 2,
        });

        expect(planningService.getNextAction(plan.id)).toBeNull();
        expect(planningService.getBlockedTasks(plan.id).map((t) => t.id)).toContain(t2.id);
      });
    });

    describe("Blocker Detection", () => {
      it("should detect missing predecessors, unresolved blockers, and stalled milestones", () => {
        const plan = planningService.createPlan({
          title: "Blocker Detection Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "Desc",
          order: 1,
          status: "Active",
        });

        const t1 = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "Desc",
          status: "Pending",
          estimatedEffort: 2,
        });

        dependencyRepo.createDependency({
          id: "fake-dep-id",
          predecessorTaskId: "fake-predecessor-task-id",
          successorTaskId: t1.id,
          type: "FinishToStart",
        });

        const diag = planningService.getPlanDiagnostics(plan.id);
        expect(diag.issues.some((i) => i.includes("missing predecessor"))).toBe(true);

        planningService.createBlocker({
          planId: plan.id,
          reason: "Lack of access credentials",
          severity: "Critical",
          resolved: false,
        });

        const analysis = planningService.analyzePlan(plan.id);
        expect(analysis.unresolvedBlockers.length).toBe(1);
        expect(analysis.blockedTasks.length).toBe(1);

        const stalledMs = blockerAnalysisService.detectStalledMilestones(plan.id);
        expect(stalledMs.length).toBe(1);
        expect(stalledMs[0].id).toBe(ms.id);
      });
    });

    describe("Graph Traversal and Event Emittance", () => {
      it("should traverse nodes and edges deterministically and emit planning.graph.generated", () => {
        const plan = planningService.createPlan({
          title: "Traversal Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const graph = planningService.getPlanningGraph(plan.id);
        expect(graph.nodes.length).toBeGreaterThan(0);
        expect(graph.edges.length).toBeGreaterThan(0);

        expect(recordedEvents.some((e) => e.eventType === Events.PLANNING_GRAPH_GENERATED)).toBe(
          true,
        );
      });
    });
  });

  describe("Sprint 4 - Recommendation & Adaptive Planning Engine", () => {
    describe("PlanningGraphBuilder", () => {
      it("should construct an immutable snapshot PlanningGraph and emit built event", () => {
        const plan = planningService.createPlan({
          title: "Graph Builder Plan",
          description: "Desc",
          status: "Draft",
          priority: "Medium",
        });

        const graph = planningService.getPlanningGraph(plan.id);
        expect(graph).toBeDefined();
        expect(graph.plan.id).toBe(plan.id);

        expect(graph.milestones).toBeDefined();
        expect(graph.tasks).toBeDefined();

        expect(Object.isFrozen(graph)).toBe(true);
        expect(Object.isFrozen(graph.plan)).toBe(true);
        expect(Object.isFrozen(graph.tasks)).toBe(true);
        expect(() => {
          (graph as any).plan = {} as any;
        }).toThrow();

        expect(recordedEvents.some((e) => e.eventType === Events.PLANNING_GRAPH_BUILT)).toBe(true);
      });

      it("should reject invalid plan ID graph construction", () => {
        expect(() => planningService.getPlanningGraph("fake-plan")).toThrow();
      });
    });

    describe("Recommendation Rules", () => {
      it("should generate StartAvailableTask recommendations", () => {
        const plan = planningService.createPlan({
          title: "Recommendation Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "M1",
          description: "D",
          order: 1,
          status: "Pending",
        });

        const task = taskService.createTask({
          milestoneId: ms.id,
          title: "Ready Task",
          description: "D",
          status: "Pending",
          estimatedEffort: 2,
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs.some((r) => r.type === "StartAvailableTask")).toBe(true);
        const taskRec = recs.find((r) => r.type === "StartAvailableTask")!;
        expect(taskRec.relatedTaskId).toBe(task.id);
        expect(taskRec.rationale).toContain("zero incomplete predecessors");

        expect(recordedEvents.some((e) => e.eventType === Events.RECOMMENDATION_CREATED)).toBe(
          true,
        );
        expect(recordedEvents.some((e) => e.eventType === Events.RECOMMENDATIONS_GENERATED)).toBe(
          true,
        );
      });

      it("should generate ResolveBlocker recommendations", () => {
        const plan = planningService.createPlan({
          title: "Blocker Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        planningService.createBlocker({
          planId: plan.id,
          reason: "Needs credentials",
          severity: "High",
          resolved: false,
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs.some((r) => r.type === "ResolveBlocker")).toBe(true);
        const blockerRec = recs.find((r) => r.type === "ResolveBlocker")!;
        expect(blockerRec.priority).toBe("High");
      });

      it("should generate CompleteMilestone recommendations", () => {
        const plan = planningService.createPlan({
          title: "Complete Milestone Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "D",
          order: 1,
          status: "Pending",
        });

        const task = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "D",
          status: "Completed",
          estimatedEffort: 2,
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs.some((r) => r.type === "CompleteMilestone")).toBe(true);
        const msRec = recs.find((r) => r.type === "CompleteMilestone")!;
        expect(msRec.relatedMilestoneId).toBe(ms.id);
      });

      it("should generate ArchiveCompletedPlan recommendations", () => {
        const plan = planningService.createPlan({
          title: "Archive Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "Milestone 1",
          description: "D",
          order: 1,
          status: "Completed",
        });

        const task = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "D",
          status: "Completed",
          estimatedEffort: 2,
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs.some((r) => r.type === "ArchiveCompletedPlan")).toBe(true);
      });

      it("should generate ResumePausedPlan recommendations", () => {
        const plan = planningService.createPlan({
          title: "Paused Plan",
          description: "Desc",
          status: "Paused",
          priority: "Medium",
        });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "M1",
          description: "D",
          order: 1,
          status: "Pending",
        });

        taskService.createTask({
          milestoneId: ms.id,
          title: "Incomplete Task",
          description: "D",
          status: "Pending",
          estimatedEffort: 3,
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs.some((r) => r.type === "ResumePausedPlan")).toBe(true);
      });
    });

    describe("Adaptive Planning Health Diagnostics", () => {
      it("should detect stalled, inactive, and completed plan health status", () => {
        const plan = planningService.createPlan({
          title: "Health Diagnostic Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        let evalResult = planningService.evaluatePlan(plan.id);
        expect(evalResult.status).toBe("Healthy");

        planningService.updatePlan(plan.id, { status: "Paused" });
        evalResult = planningService.evaluatePlan(plan.id);
        expect(evalResult.status).toBe("Inactive");

        planningService.updatePlan(plan.id, { status: "Active" });
        planningService.createBlocker({
          planId: plan.id,
          reason: "Lack of API keys",
          severity: "Critical",
          resolved: false,
        });
        evalResult = planningService.evaluatePlan(plan.id);
        expect(evalResult.status).toBe("Stalled");

        const blockers = blockerRepo.listBlockers(plan.id);
        blockerRepo.updateBlocker({ ...blockers[0], resolved: true });

        const ms = milestoneService.createMilestone({
          planId: plan.id,
          title: "M1",
          description: "D",
          order: 1,
          status: "Completed",
        });
        const task = taskService.createTask({
          milestoneId: ms.id,
          title: "Task 1",
          description: "D",
          status: "Completed",
          estimatedEffort: 2,
        });

        evalResult = planningService.evaluatePlan(plan.id);
        expect(evalResult.status).toBe("Completed");

        expect(recordedEvents.some((e) => e.eventType === Events.RECOMMENDATION_EVALUATED)).toBe(
          true,
        );
        expect(
          recordedEvents.some((e) => e.eventType === Events.ADAPTIVE_EVALUATION_COMPLETED),
        ).toBe(true);
      });
    });

    describe("Rule Engine Operations", () => {
      it("should evaluate registered rules and enforce ordering and duplicate suppression", () => {
        const plan = planningService.createPlan({
          title: "Rule Engine Plan",
          description: "Desc",
          status: "Active",
          priority: "Medium",
        });

        const rules = planningService.listRecommendationRules();
        expect(rules).toContain("StartAvailableTask");
        expect(rules).toContain("ResolveBlocker");

        recommendationRuleEngine.registerRule("CustomTestRule", {
          name: "CustomTestRule",
          evaluate: (graph) => [
            {
              id: "custom-rec-1",
              type: "StartAvailableTask",
              priority: "Critical",
              title: "Custom Title",
              description: "Custom Desc",
              rationale: "Custom Rat",
              createdAt: new Date().toISOString(),
            },
            {
              id: "custom-rec-1",
              type: "StartAvailableTask",
              priority: "Critical",
              title: "Custom Title",
              description: "Custom Desc",
              rationale: "Custom Rat",
              createdAt: new Date().toISOString(),
            },
          ],
        });

        const recs = planningService.getRecommendations(plan.id);
        expect(recs[0].id).toBe("custom-rec-1");

        const customRecs = recs.filter((r) => r.id === "custom-rec-1");
        expect(customRecs.length).toBe(1);
      });
    });
  });
});
