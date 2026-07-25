import { PlanningTemplate, GoalCategory } from "../types";
import { TemplateRepository } from "./TemplateRepository";

export class InMemoryTemplateRepository implements TemplateRepository {
  private templates: Map<string, PlanningTemplate> = new Map();

  constructor() {
    this.loadBuiltInTemplates();
  }

  private loadBuiltInTemplates(): void {
    const builtIn: PlanningTemplate[] = [
      {
        id: "template-career-pilot",
        version: 1,
        category: GoalCategory.Career,
        title: "Become a Pilot",
        milestones: [
          {
            title: "Career Preparation",
            description: "Research and medical pre-requisites",
            order: 1,
            tasks: [
              {
                title: "Research flight schools",
                description: "Find certified flight training providers",
                estimatedEffort: 4,
              },
              {
                title: "Obtain medical certificate",
                description: "Pass FAA Class 1 or 2 medical exam",
                estimatedEffort: 3,
              },
              {
                title: "Apply for student pilot certificate",
                description: "Register in IACRA system",
                estimatedEffort: 2,
              },
            ],
          },
          {
            title: "Training",
            description: "Practical flight hours",
            order: 2,
            tasks: [
              {
                title: "Ground school instruction",
                description: "Study aerodynamics and regulations",
                estimatedEffort: 40,
              },
              {
                title: "Dual flight training hours",
                description: "Fly with certified flight instructor",
                estimatedEffort: 30,
              },
              {
                title: "First solo flight training",
                description: "Complete solo takeoffs and landings",
                estimatedEffort: 10,
              },
            ],
          },
          {
            title: "Certification",
            description: "Pass testing requirements",
            order: 3,
            tasks: [
              {
                title: "Pass written knowledge test",
                description: "Achieve 70%+ score on FAA written exam",
                estimatedEffort: 5,
              },
              {
                title: "Complete solo cross-country flights",
                description: "Fly to destinations 50nm+ away",
                estimatedEffort: 15,
              },
              {
                title: "Pass practical checkride test",
                description: "Pass oral and flight exam with examiner",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Career Launch",
            description: "Commercial hours and application",
            order: 4,
            tasks: [
              {
                title: "Build flight hours",
                description: "Accumulate total flight time requirements",
                estimatedEffort: 100,
              },
              {
                title: "Obtain commercial pilot license",
                description: "Pass commercial checkride check",
                estimatedEffort: 8,
              },
              {
                title: "Apply to regional airlines",
                description: "Submit resumes to regional air carriers",
                estimatedEffort: 6,
              },
            ],
          },
        ],
      },
      {
        id: "template-learning-verilog",
        version: 1,
        category: GoalCategory.Learning,
        title: "Learn Verilog",
        milestones: [
          {
            title: "Fundamentals",
            description: "Basic syntax and digital logic",
            order: 1,
            tasks: [
              {
                title: "Learn digital logic basics",
                description: "Study gates, boolean algebra, and muxes",
                estimatedEffort: 6,
              },
              {
                title: "Understand Verilog syntax & data types",
                description: "Study wires, regs, and basic keywords",
                estimatedEffort: 5,
              },
              {
                title: "Set up ModelSim or EDA playground",
                description: "Verify simulation environment is running",
                estimatedEffort: 2,
              },
            ],
          },
          {
            title: "Practice",
            description: "Writing simple logic blocks",
            order: 2,
            tasks: [
              {
                title: "Write multiplexers and decoders",
                description: "Implement combinational logic designs",
                estimatedEffort: 4,
              },
              {
                title: "Implement flip-flops and registers",
                description: "Implement sequential logic designs",
                estimatedEffort: 5,
              },
              {
                title: "Write testbenches for basic modules",
                description: "Learn initial block and clock generation",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Projects",
            description: "Building complete hardware blocks",
            order: 3,
            tasks: [
              {
                title: "Build a finite state machine (FSM)",
                description: "Implement traffic light controller or sequence detector",
                estimatedEffort: 8,
              },
              {
                title: "Implement an ALU module",
                description: "Support add, sub, and, or operations",
                estimatedEffort: 6,
              },
              {
                title: "Simulate and verify ALU design",
                description: "Run testbench vectors on simulation",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Advanced Topics",
            description: "FPGA synthesis and timing",
            order: 4,
            tasks: [
              {
                title: "Learn non-blocking vs blocking assignments",
                description: "Avoid race conditions in sequential blocks",
                estimatedEffort: 5,
              },
              {
                title: "Understand timing and constraints",
                description: "Study clock skew and setup/hold times",
                estimatedEffort: 8,
              },
              {
                title: "Synthesize design onto FPGA board",
                description: "Map pins and download bitstream to hardware",
                estimatedEffort: 10,
              },
            ],
          },
        ],
      },
      {
        id: "template-project-akira",
        version: 1,
        category: GoalCategory.Project,
        title: "Build AKIRA",
        milestones: [
          {
            title: "Research",
            description: "Analyze goal and requirements",
            order: 1,
            tasks: [
              {
                title: "Read product requirements",
                description: "Align on features and objectives",
                estimatedEffort: 2,
              },
              {
                title: "Evaluate target frameworks (React/Vite)",
                description: "Confirm stack capabilities and limits",
                estimatedEffort: 3,
              },
              {
                title: "Define AI capabilities layout",
                description: "Outline cognition services structure",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Architecture",
            description: "System blueprint and contracts",
            order: 2,
            tasks: [
              {
                title: "Design cognition pipeline structures",
                description: "Define flow from prompt to LLM output",
                estimatedEffort: 6,
              },
              {
                title: "Draft database schema (SQLite/WAL)",
                description: "Define schemas for persisting plans and tasks",
                estimatedEffort: 5,
              },
              {
                title: "Establish module contracts",
                description: "Specify TypeScript boundaries and interfaces",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Implementation",
            description: "Writing the core codebase",
            order: 3,
            tasks: [
              {
                title: "Build local repository layers",
                description: "Implement Map-backed caches and persistence calls",
                estimatedEffort: 8,
              },
              {
                title: "Implement facade services",
                description: "Write main entry services orchestrating pipeline",
                estimatedEffort: 10,
              },
              {
                title: "Create event bus integration",
                description: "Configure system event recording and dispatch",
                estimatedEffort: 6,
              },
            ],
          },
          {
            title: "Testing",
            description: "Quality assurance checks",
            order: 4,
            tasks: [
              {
                title: "Write unit tests for repositories",
                description: "Verify basic persistence CRUD functions",
                estimatedEffort: 5,
              },
              {
                title: "Write integration tests for services",
                description: "Verify full service workflow integrations",
                estimatedEffort: 6,
              },
              {
                title: "Validate cyclic dependency checks",
                description: "Test reachability cycle detection logic",
                estimatedEffort: 4,
              },
            ],
          },
          {
            title: "Release",
            description: "Build pipeline and deployment",
            order: 5,
            tasks: [
              {
                title: "Perform build optimizations",
                description: "Optimize assets bundle size and loading",
                estimatedEffort: 4,
              },
              {
                title: "Run validation architecture scripts",
                description: "Run lint, format, and dependency checks",
                estimatedEffort: 2,
              },
              {
                title: "Deploy v2.20 Planning Capability",
                description: "Merge to main branch and release foundation",
                estimatedEffort: 3,
              },
            ],
          },
        ],
      },
      {
        id: "template-health-fitness",
        version: 1,
        category: GoalCategory.Health,
        title: "Improve Fitness",
        milestones: [
          {
            title: "Assessment",
            description: "Medical checks and measurements",
            order: 1,
            tasks: [
              {
                title: "Consult a physician for health check",
                description: "Ensure safety before starting strenuous exercise",
                estimatedEffort: 2,
              },
              {
                title: "Record baseline weight and metrics",
                description: "Log resting heart rate, weight, and fat %",
                estimatedEffort: 1,
              },
              {
                title: "Set specific, measurable fitness goals",
                description: "Define target metrics and timeframes",
                estimatedEffort: 2,
              },
            ],
          },
          {
            title: "Routine",
            description: "Establishing workout habits",
            order: 2,
            tasks: [
              {
                title: "Design 3-day weekly workout schedule",
                description: "Schedule resistance training sessions",
                estimatedEffort: 3,
              },
              {
                title: "Learn correct form for basic exercises",
                description: "Study squat, deadlift, and press mechanics",
                estimatedEffort: 4,
              },
              {
                title: "Establish active recovery habits",
                description: "Plan stretches and light walks on off days",
                estimatedEffort: 2,
              },
            ],
          },
          {
            title: "Nutrition",
            description: "Fueling progress correctly",
            order: 3,
            tasks: [
              {
                title: "Calculate daily caloric requirements",
                description: "Find total daily energy expenditure (TDEE)",
                estimatedEffort: 1,
              },
              {
                title: "Plan meal prep and protein target",
                description: "Schedule macro distribution and prep day",
                estimatedEffort: 4,
              },
              {
                title: "Track daily water consumption",
                description: "Aim for 3+ liters of water daily",
                estimatedEffort: 1,
              },
            ],
          },
          {
            title: "Tracking",
            description: "Logging progress and tuning",
            order: 4,
            tasks: [
              {
                title: "Log workouts in detail",
                description: "Track sets, reps, and weights lifted",
                estimatedEffort: 3,
              },
              {
                title: "Measure progress metrics weekly",
                description: "Log weight and run regular assessments",
                estimatedEffort: 2,
              },
              {
                title: "Adjust routine based on performance trends",
                description: "Adapt caloric targets and intensity levels",
                estimatedEffort: 3,
              },
            ],
          },
        ],
      },
    ];

    for (const t of builtIn) {
      this.registerTemplate(t);
    }
  }

  public getTemplate(id: string, version?: number): PlanningTemplate | null {
    const all = Array.from(this.templates.values());
    const matches = all.filter((t) => t.id === id);

    if (matches.length === 0) return null;

    if (version !== undefined) {
      return matches.find((t) => t.version === version) || null;
    }

    // Default to latest version
    return matches.reduce(
      (latest, current) => (current.version > latest.version ? current : latest),
      matches[0],
    );
  }

  public getTemplateByCategory(category: GoalCategory, version?: number): PlanningTemplate | null {
    const all = Array.from(this.templates.values());
    const matches = all.filter((t) => t.category === category);

    if (matches.length === 0) return null;

    if (version !== undefined) {
      return matches.find((t) => t.version === version) || null;
    }

    // Default to latest version
    return matches.reduce(
      (latest, current) => (current.version > latest.version ? current : latest),
      matches[0],
    );
  }

  public registerTemplate(template: PlanningTemplate): PlanningTemplate {
    const validation = this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.error}`);
    }

    const key = `${template.id}:${template.version}`;
    if (this.templates.has(key)) {
      throw new Error(
        `Template with ID ${template.id} and version ${template.version} is already registered.`,
      );
    }

    this.templates.set(key, {
      ...template,
      milestones: template.milestones.map((m) => ({
        ...m,
        tasks: m.tasks.map((t) => ({ ...t })),
      })),
    });

    return this.getTemplate(template.id, template.version)!;
  }

  public listTemplates(): PlanningTemplate[] {
    return Array.from(this.templates.values());
  }

  public validateTemplate(template: PlanningTemplate): { isValid: boolean; error?: string } {
    if (!template.id) return { isValid: false, error: "Template ID is required." };
    if (!template.version || template.version < 1) {
      return { isValid: false, error: "Template version must be a positive integer." };
    }
    if (!template.title) return { isValid: false, error: "Template title is required." };
    if (!template.category) return { isValid: false, error: "Template category is required." };

    if (!template.milestones || template.milestones.length === 0) {
      return { isValid: false, error: "Template must contain at least one milestone." };
    }

    const orders = new Set<number>();
    for (const m of template.milestones) {
      if (!m.title) return { isValid: false, error: "Milestone title is required." };
      if (m.order === undefined || m.order <= 0) {
        return { isValid: false, error: `Invalid milestone order: ${m.order}` };
      }
      if (orders.has(m.order)) {
        return { isValid: false, error: `Duplicate milestone order: ${m.order}` };
      }
      orders.add(m.order);

      if (!m.tasks || m.tasks.length === 0) {
        return { isValid: false, error: `Milestone "${m.title}" must contain at least one task.` };
      }

      for (const t of m.tasks) {
        if (!t.title) return { isValid: false, error: "Task title is required." };
        if (t.estimatedEffort === undefined || t.estimatedEffort < 0) {
          return { isValid: false, error: `Invalid task effort value: ${t.estimatedEffort}` };
        }
      }
    }

    return { isValid: true };
  }

  public clear(): void {
    this.templates.clear();
    this.loadBuiltInTemplates();
  }
}
