/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { intentResolver, IntentHistoryMessage } from "../src/genesis/understanding/intent-resolver";
import { contextRelevanceSelector } from "../src/genesis/context/context-relevance-selector";
import { promptBuilder } from "../src/genesis/context/ai/prompt-builder";
import { aiContextEngine } from "../src/genesis/context/ai/context-engine";
import { registerWorkspaceProvider } from "../src/contracts/workspace-provider";
import { providerRegistry } from "../src/genesis/context/ai/provider-registry";
import { AIProvider } from "../src/genesis/context/ai/provider-interface";

describe("BUG-006: Intent Resolution & Ambiguity Handling", () => {
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

  describe("Intent Resolution Confidence Rules", () => {
    it("should classify ambiguous low confidence single-word inputs as clarificationRequired", () => {
      const res = intentResolver.resolveIntent("pilot");
      expect(res.clarificationRequired).toBe(true);
      expect(res.ambiguous).toBe(true);
      expect(res.confidence).toBeLessThan(0.5);
      expect(res.candidates).toEqual([
        { name: "career" },
        { name: "project" },
        { name: "aviation term" },
        { name: "testing methodology" },
      ]);

      const resPython = intentResolver.resolveIntent("python");
      expect(resPython.clarificationRequired).toBe(true);
      expect(resPython.candidates.map((c) => c.name)).toContain("programming language");

      const resApple = intentResolver.resolveIntent("apple");
      expect(resApple.clarificationRequired).toBe(true);
      expect(resApple.candidates.map((c) => c.name)).toContain("fruit");
    });

    it("should classify explicit personal declarations as high confidence without clarification", () => {
      const res = intentResolver.resolveIntent("My dream is to become a pilot.");
      expect(res.clarificationRequired).toBe(false);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.intent?.type).toBe("Goal");
    });

    it("should classify explicit project references as high confidence without clarification", () => {
      const res = intentResolver.resolveIntent("Continue Verilog CP.");
      expect(res.clarificationRequired).toBe(false);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.intent?.type).toBe("Project");
    });

    it("should classify explicit implementation requests as high confidence without clarification", () => {
      const res = intentResolver.resolveIntent("Build a UART module.");
      expect(res.clarificationRequired).toBe(false);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.intent?.type).toBe("Workspace");
    });

    it("should resolve single-word continue contextually with conversation history", () => {
      const history: IntentHistoryMessage[] = [
        { role: "user", text: "Let's work on Verilog CP." },
        { role: "akira", text: "Great, I've loaded that project context." },
      ];
      const res = intentResolver.resolveIntent("continue", history);
      expect(res.clarificationRequired).toBe(false);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.intent?.type).toBe("Workspace");
      expect(res.intent?.detail).toBe("verilog-cp");
    });
  });

  describe("Context Relevance Selector Integration", () => {
    it("should skip workspace/project enrichment when clarificationRequired is true", () => {
      const intentRes = intentResolver.resolveIntent("pilot");
      expect(intentRes.clarificationRequired).toBe(true);

      const dummyPackage: any = {
        contextSessionId: "session-123",
        activeCandidates: [],
        activeStories: [{ id: "story-1", title: "Project Arc: Verilog CP", status: "Active" }],
        currentGoals: [{ data: "Complete Project Arc: Verilog CP" }, { data: "Become a pilot" }],
      };
      const dummyResolved: any = {
        overallConfidence: 0.9,
        provenance: {
          companionState: {
            activeProject: { id: "p1", name: "Verilog CP" },
          },
        },
        currentPriorities: ["Active Focus: Coding"],
        relevantContext: ["Active Project: Verilog CP"],
        activeGoals: [{ id: "g1", title: "Build CPU decoder" }],
      };

      const selection = contextRelevanceSelector.selectContext(
        "pilot",
        dummyPackage,
        dummyResolved,
        intentRes,
      );

      expect(selection.workspaceRelevant).toBe(false);
      expect(selection.contextPackage?.activeStories).toHaveLength(0);
      expect(selection.resolvedContext?.provenance.companionState?.activeProject).toBeNull();
      expect(selection.resolvedContext?.activeGoals).toHaveLength(0);
    });
  });

  describe("Prompt Builder Metadata Integration", () => {
    it("should embed intent resolution result as structured metadata in system instructions", () => {
      const intentRes = intentResolver.resolveIntent("pilot");
      const selection = contextRelevanceSelector.selectContext("pilot", undefined, undefined, intentRes);
      const systemInstruction = promptBuilder.buildSystemInstruction("pilot", selection, intentRes);

      expect(systemInstruction).toContain("Intent Resolution");
      expect(systemInstruction).toContain("Confidence:\nLow");
      expect(systemInstruction).toContain("Clarification Required:\nYes");
      expect(systemInstruction).toContain("- aircraft pilot");
      expect(systemInstruction).toContain("- pilot project");
      expect(systemInstruction).toContain("- aviation term");
      expect(systemInstruction).toContain("- pilot testing");
      expect(systemInstruction).toContain("Instruction:\nAsk one concise clarification question.");
    });
  });

  describe("Cognitive Engine Clarification Handler", () => {
    let originalProvider: any;

    beforeEach(() => {
      originalProvider = providerRegistry.getActiveProvider();
    });

    afterEach(() => {
      if (originalProvider) {
        providerRegistry.setActiveProvider(originalProvider.name);
      }
    });

    it("should invoke LLM provider and pass structured clarification instruction on executeRequest for ambiguous inputs", async () => {
      const mockProvider: AIProvider = {
        name: "MockGemini",
        generateContent: vi.fn().mockImplementation((req) => {
          // Verify that structured instruction metadata was included in prompt/systemInstruction
          expect(req.systemInstruction).toContain("Intent Resolution");
          expect(req.systemInstruction).toContain("Clarification Required:\nYes");
          expect(req.systemInstruction).toContain("- aircraft pilot");

          return Promise.resolve({
            responseId: "mock-res",
            provider: "MockGemini",
            model: "mock-model",
            content: "Are you referring to becoming an aircraft pilot, a pilot project, or pilot testing?",
            finishReason: "stop",
            timestamp: new Date().toISOString(),
          } as any);
        }),
      };
      providerRegistry.registerProvider(mockProvider);
      providerRegistry.setActiveProvider("MockGemini");

      const response = await aiContextEngine.executeRequest("pilot");

      expect(mockProvider.generateContent).toHaveBeenCalled();
      expect(response.content).toBe("Are you referring to becoming an aircraft pilot, a pilot project, or pilot testing?");
    });

    it("should invoke LLM provider and stream clarification on executeRequestStream for ambiguous inputs", async () => {
      const mockProvider: AIProvider = {
        name: "MockGemini",
        generateContent: vi.fn(),
        generateContentStream: vi.fn().mockImplementation((req, onChunk) => {
          expect(req.systemInstruction).toContain("Intent Resolution");
          expect(req.systemInstruction).toContain("Clarification Required:\nYes");

          onChunk("Are you referring to ");
          onChunk("becoming an aircraft pilot?");

          return Promise.resolve({
            responseId: "mock-res-stream",
            provider: "MockGemini",
            model: "mock-model-stream",
            content: "Are you referring to becoming an aircraft pilot?",
            finishReason: "stop",
            timestamp: new Date().toISOString(),
          } as any);
        }),
      };
      providerRegistry.registerProvider(mockProvider);
      providerRegistry.setActiveProvider("MockGemini");

      let streamedContent = "";
      const onChunk = (chunk: string) => {
        streamedContent += chunk;
      };

      const response = await aiContextEngine.executeRequestStream("pilot", onChunk);

      expect(mockProvider.generateContentStream).toHaveBeenCalled();
      expect(streamedContent).toBe("Are you referring to becoming an aircraft pilot?");
      expect(response.content).toBe("Are you referring to becoming an aircraft pilot?");
    });
  });
});
