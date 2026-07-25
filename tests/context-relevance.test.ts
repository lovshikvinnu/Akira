/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { intentClassifier } from "../src/genesis/understanding/intent-classifier";
import { contextRelevanceSelector } from "../src/genesis/context/context-relevance-selector";
import { registerWorkspaceProvider } from "../src/contracts/workspace-provider";
import { ContextPackage } from "../src/genesis/context/types";
import { ResolvedContext } from "../src/genesis/context/context-resolution/types";

describe("BUG-005: Context Relevance Selector & Intent Classifier", () => {
  const mockProjects = [
    { id: "p1", name: "Verilog CP", tag: "verilog-cp" },
    { id: "p2", name: "Lovshik 2.0", tag: "lovshik-2" },
    { id: "p3", name: "AKIRA OS", tag: "akira-os" },
  ];

  const mockState = {
    projects: mockProjects,
    tasks: [],
    notes: [],
    chat: [],
    streaks: [],
    profile: {
      firstName: "Test",
      lastName: "User",
      onboardingCompleted: true,
      bio: "",
      dream: "",
      coreValues: [],
      focusPreferences: [],
    },
    lastProjectId: null,
    memories: [],
    sessions: [],
    activeSession: null,
    vaultFiles: [],
    vaultFolders: [],
  };

  beforeEach(() => {
    registerWorkspaceProvider({
      getState: () => mockState as any,
      subscribe: () => () => {},
    });
  });

  describe("Intent Classifier", () => {
    it("should classify standard goals / dreams correctly", () => {
      expect(intentClassifier.classifyCategory("My dream is to become a pilot.")).toBe("Goal");
      expect(intentClassifier.classifyCategory("What is my goal?")).toBe("Goal");
    });

    it("should classify interest category correctly", () => {
      expect(intentClassifier.classifyCategory("I love robotics.")).toBe("Interest");
    });

    it("should classify projects correctly", () => {
      expect(intentClassifier.classifyCategory("what projects am i have?")).toBe("Project");
      expect(intentClassifier.classifyCategory("what am i building?")).toBe("Project");
    });

    it("should classify workspace intents when referring to planning, continue, or tasks", () => {
      const projectNames = mockProjects.map((p) => p.name.toLowerCase());
      expect(intentClassifier.classifyWorkspaceIntent("Continue Verilog CP.", projectNames)).toBe(
        true,
      );
      expect(
        intentClassifier.classifyWorkspaceIntent("What's next for AKIRA OS?", projectNames),
      ).toBe(true);
      expect(intentClassifier.classifyWorkspaceIntent("Open Lovshik 2.0", projectNames)).toBe(true);
      expect(intentClassifier.classifyWorkspaceIntent("Let's do some planning", [])).toBe(true);
      expect(
        intentClassifier.classifyWorkspaceIntent("I need to see the project backlog", []),
      ).toBe(true);
    });

    it("should not classify workspace intents for personal goals/conversations", () => {
      const projectNames = mockProjects.map((p) => p.name.toLowerCase());
      expect(
        intentClassifier.classifyWorkspaceIntent("My dream is to become a pilot.", projectNames),
      ).toBe(false);
      expect(intentClassifier.classifyWorkspaceIntent("I love photography.", projectNames)).toBe(
        false,
      );
      expect(
        intentClassifier.classifyWorkspaceIntent("How do I become a pilot?", projectNames),
      ).toBe(false);
    });
  });

  describe("Context Relevance Selector", () => {
    const dummyPackage: ContextPackage = {
      contextSessionId: "session-123",
      activeCandidates: [],
      activeStories: [
        {
          id: "story-1",
          title: "Project Arc: Verilog CP",
          summary: "Working on Verilog CP CPU design",
          status: "Active",
          milestones: [],
          tags: ["project", "verilog"],
          createdAt: "",
          updatedAt: "",
        },
      ],
      identityObservations: [],
      currentGoals: [
        { data: "Complete Project Arc: Verilog CP", inclusionReason: "Active Project" },
        { data: "Become a pilot", inclusionReason: "User dream" },
      ],
      userPreferences: [],
      importantConstraints: [],
      recentActivitySummary: [],
      createdAt: "",
    };

    const dummyResolved: ResolvedContext = {
      origin: "ContextResolutionEngine",
      status: "ResolvedContextConstructed",
      overallConfidence: 0.9,
      provenance: {
        companionState: {
          currentFocus: "Coding",
          activeProject: { id: "p1", name: "Verilog CP" },
          activeGoal: "Build CPU decoder",
          pendingQuestions: [],
          currentDiscussion: "",
          evidence: {
            evidenceLog: [],
            snapshot: {
              sessionIdentifier: "1",
              temporalReference: 123,
              sessionIntent: "Building",
              activeStories: [],
              activeGoals: [],
              relevantMemories: [],
              identityObservations: [],
              currentConstraints: [],
              recentActivity: [],
              initialProject: null,
            },
          },
          contextConfidence: 0.9,
        },
      },
      currentPriorities: ["Active Focus: Coding", "Goal Priority: Project Verilog CP"],
      relevantContext: ["Active Project: Verilog CP"],
      supportingEvidence: [],
      activeGoals: [
        {
          id: "g1",
          title: "Build CPU decoder",
          description: "",
          status: "Active",
          progressPercentage: 50,
          confidence: 0.9,
          supportedTaskIds: ["task-1"],
        },
      ],
      currentFocus: "Coding",
      importantRelationships: [],
      relevantHabits: [],
      knowledgeRelevance: [],
      reflectionRelevance: [],
      conflictsExposed: [],
    };

    it("should filter out workspace/projects when intent is personal goal", () => {
      const selection = contextRelevanceSelector.selectContext(
        "My dream is to become a pilot.",
        dummyPackage,
        dummyResolved,
      );

      expect(selection.workspaceRelevant).toBe(false);

      // Package filtering checks
      expect(selection.contextPackage?.activeStories).toHaveLength(0);
      expect(selection.contextPackage?.currentGoals).toHaveLength(1);
      expect(selection.contextPackage?.currentGoals[0].data).toBe("Become a pilot");

      // ResolvedContext filtering checks
      expect(selection.resolvedContext?.provenance.companionState?.activeProject).toBeNull();
      expect(selection.resolvedContext?.currentPriorities).toHaveLength(0);
      expect(selection.resolvedContext?.relevantContext).toHaveLength(0);
      expect(selection.resolvedContext?.activeGoals).toHaveLength(0);

      // Understandings filtering checks
      const mockUnderstandings = [
        {
          id: "u1",
          category: "Goal",
          canonicalKey: "pilot",
          confidence: "High",
          status: "Active",
          supportingMemoryIds: [],
          supportingStoryIds: [],
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "u2",
          category: "Project",
          canonicalKey: "verilog",
          confidence: "High",
          status: "Active",
          supportingMemoryIds: [],
          supportingStoryIds: [],
          createdAt: "",
          updatedAt: "",
        },
      ];
      const filtered = selection.filterUnderstandings(mockUnderstandings as any);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe("Goal");
    });

    it("should include workspace/projects when continuing a project", () => {
      const selection = contextRelevanceSelector.selectContext(
        "Continue Verilog CP.",
        dummyPackage,
        dummyResolved,
      );

      expect(selection.workspaceRelevant).toBe(true);

      // Package filtering checks (no filtering)
      expect(selection.contextPackage?.activeStories).toHaveLength(1);
      expect(selection.contextPackage?.currentGoals).toHaveLength(2);

      // ResolvedContext checks
      expect(selection.resolvedContext?.provenance.companionState?.activeProject).toEqual({
        id: "p1",
        name: "Verilog CP",
      });
      expect(selection.resolvedContext?.currentPriorities).toContain("Active Focus: Coding");
      expect(selection.resolvedContext?.relevantContext).toContain("Active Project: Verilog CP");
    });

    it("should support mixed context (personal goal + continuing project)", () => {
      const selection = contextRelevanceSelector.selectContext(
        "I want to become a pilot. Can we continue Verilog CP?",
        dummyPackage,
        dummyResolved,
      );

      expect(selection.workspaceRelevant).toBe(true);
      expect(selection.contextPackage?.activeStories).toHaveLength(1);
      expect(selection.contextPackage?.currentGoals).toHaveLength(2);
    });

    it("should support dynamic project detection", () => {
      // Create a temporary project dynamically
      mockState.projects.push({
        id: "p4",
        name: "Secret Space Mission",
        tag: "secret-space",
      } as any);

      // Run selection on a query matching the new project name
      const selection = contextRelevanceSelector.selectContext(
        "Let's check Secret Space Mission.",
        dummyPackage,
        dummyResolved,
      );

      expect(selection.workspaceRelevant).toBe(true);
    });
  });
});
