export enum GoalCategory {
  Career = "Career",
  Education = "Education",
  Learning = "Learning",
  Project = "Project",
  Health = "Health",
  Finance = "Finance",
  Personal = "Personal",
  Other = "Other",
}

export enum PlanHealthStatus {
  Inactive = "Inactive",
  Completed = "Completed",
  Stalled = "Stalled",
  Healthy = "Healthy",
}

export type PlanStatus = "Draft" | "Active" | "Paused" | "Completed" | "Archived";
export type PlanPriority = "Low" | "Medium" | "High" | "Critical";

export interface Plan {
  id: string;
  goalId?: string;
  title: string;
  description: string;
  status: PlanStatus;
  priority: PlanPriority;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type MilestoneStatus = "Pending" | "Active" | "Completed" | "Archived";

export interface Milestone {
  id: string;
  planId: string;
  title: string;
  description: string;
  order: number;
  status: MilestoneStatus;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "Pending" | "InProgress" | "Completed" | "Blocked";

export interface Task {
  id: string;
  milestoneId: string;
  title: string;
  description: string;
  status: TaskStatus;
  estimatedEffort: number; // e.g. hours or story points
  createdAt: string;
  updatedAt: string;
}

export type DependencyType = "FinishToStart" | "StartToStart" | "FinishToFinish";

export interface Dependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: DependencyType;
}

export interface Progress {
  planId: string;
  completedTasks: number;
  totalTasks: number;
  completedMilestones: number;
  totalMilestones: number;
  percentage: number; // 0 to 100
}

export type BlockerSeverity = "Low" | "Medium" | "High" | "Critical";

export interface Blocker {
  id: string;
  planId: string;
  reason: string;
  severity: BlockerSeverity;
  resolved: boolean;
  createdAt: string;
}

// Graph Layer representation
export type PlanningGraphNodeType =
  "Plan" | "Milestone" | "Task" | "Dependency" | "Progress" | "Blocker" | "Goal";

export interface PlanningGraphNode {
  id: string;
  type: PlanningGraphNodeType;
  data: Plan | Milestone | Task | Dependency | Progress | Blocker | { id: string };
}

export interface PlanningGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type:
    | "goal_to_plan"
    | "plan_to_milestone"
    | "milestone_to_task"
    | "plan_to_blocker"
    | "plan_to_progress"
    | "task_dependency";
}

export interface PlanningGraph {
  nodes: PlanningGraphNode[];
  edges: PlanningGraphEdge[];
  plan: Readonly<Plan>;
  milestones: ReadonlyArray<Readonly<Milestone>>;
  tasks: ReadonlyArray<Readonly<Task>>;
  dependencies: ReadonlyArray<Readonly<Dependency>>;
  blockers: ReadonlyArray<Readonly<Blocker>>;
  progress: Readonly<Progress>;
}

export interface TemplateTask {
  title: string;
  description: string;
  estimatedEffort: number;
}

export interface TemplateMilestone {
  title: string;
  description: string;
  order: number;
  tasks: TemplateTask[];
}

export interface PlanningTemplate {
  id: string;
  version: number;
  category: GoalCategory;
  title: string;
  milestones: TemplateMilestone[];
}

export interface PlanDiagnostics {
  planId: string;
  orphanTasksCount: number;
  unreachableTasksCount: number;
  incompleteMilestonesCount: number;
  hasCycles: boolean;
  diagnosticsGeneratedAt: string;
  issues: string[];
}

export interface PlanAnalysisResult {
  planId: string;
  diagnostics: PlanDiagnostics;
  nextAction: Task | null;
  availableTasks: Task[];
  blockedTasks: Task[];
  waitingTasks: Task[];
  completedTasks: Task[];
  unresolvedBlockers: Blocker[];
  analyzedAt: string;
}

export type RecommendationType =
  | "StartAvailableTask"
  | "ResolveBlocker"
  | "CompleteMilestone"
  | "ReviewDependency"
  | "ArchiveCompletedPlan"
  | "ResumePausedPlan";

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: "Low" | "Medium" | "High" | "Critical";
  title: string;
  description: string;
  rationale: string;
  relatedTaskId?: string;
  relatedMilestoneId?: string;
  createdAt: string;
}
