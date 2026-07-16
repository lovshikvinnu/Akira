import { recallService } from "../recall/recall-service";
import { storyService } from "../stories/story-service";
import { identityService } from "../understanding/identity-service";
import { contextService } from "./context-service";
import { contextRules } from "./context-rules";
import { ContextPackage } from "./types";

let recallSub: (() => void) | null = null;
let storySub: (() => void) | null = null;
let identitySub: (() => void) | null = null;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const contextBuilder = {
  /**
   * Subscribe to Recall, Story, and Identity updates to trigger rebuilding context.
   */
  initialize(): void {
    if (!recallSub) {
      recallSub = recallService.subscribe(() => {
        this.rebuildContextPackage();
      });
    }

    if (!storySub) {
      storySub = storyService.subscribe(() => {
        this.rebuildContextPackage();
      });
    }

    if (!identitySub) {
      identitySub = identityService.subscribe(() => {
        this.rebuildContextPackage();
      });
    }

    // Generate initial context package on load
    this.rebuildContextPackage();
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
    if (recallSub) {
      recallSub();
      recallSub = null;
    }
    if (storySub) {
      storySub();
      storySub = null;
    }
    if (identitySub) {
      identitySub();
      identitySub = null;
    }
  },

  /**
   * Scan active recalled nodes, story lines, and traits to build a new Context Package.
   */
  rebuildContextPackage(): void {
    const rawCandidates = recallService.getRecallCandidates();
    const rawStories = storyService.getStories();
    const rawIdentity = identityService.getObservations();

    const activeCandidates = contextRules.filterActiveRecallCandidates(rawCandidates);
    const activeStories = contextRules.filterActiveStories(rawStories);
    const identityObservations = contextRules.filterIdentityObservations(rawIdentity);

    const currentGoals = contextRules.extractGoals(rawStories);
    const userPreferences = contextRules.extractUserPreferences(rawIdentity);
    const importantConstraints = contextRules.extractConstraints(rawIdentity);
    const recentActivitySummary = contextRules.compileRecentActivity(rawCandidates);

    const contextPackage: ContextPackage = {
      contextSessionId: uid(),
      activeCandidates,
      activeStories,
      identityObservations,
      currentGoals,
      userPreferences,
      importantConstraints,
      recentActivitySummary,
      createdAt: new Date().toISOString(),
    };

    contextService.updateContextPackage(contextPackage);
  },
};

// Automatic integration: initialize on load
contextBuilder.initialize();
