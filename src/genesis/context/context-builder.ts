import { recallService } from "../recall/recall-service";
import { storyService } from "../stories/story-service";
import { identityService } from "../understanding/identity-service";
import { contextService } from "./context-service";
import { contextRules } from "./context-rules";
import { ContextPackage } from "./types";
import { isBatching, markDirty, registerFlusher, unregisterFlusher } from "../batch";

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
    registerFlusher("context", () => {
      this.rebuildContextPackage();
    });

    if (!recallSub) {
      recallSub = recallService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    if (!storySub) {
      storySub = storyService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    if (!identitySub) {
      identitySub = identityService.subscribe(() => {
        this.scheduleRebuild();
      });
    }

    // Generate initial context package on load
    this.rebuildContextPackage();
  },

  /**
   * Dispose subscriptions.
   */
  dispose(): void {
    unregisterFlusher("context");
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
   * Rebuilds now, or once at the end of the current cognitive transaction.
   *
   * Three subscriptions feed this, and a single event used to trigger all of
   * them repeatedly -- 263 rebuilds per completed task at 141 memories, because
   * every story append also produced an identity update, which triggered a
   * second rebuild of its own. The package is assembled wholly from current
   * recall, story and identity state, so one rebuild at the end is the same
   * package the last of those would have produced.
   */
  scheduleRebuild(): void {
    if (isBatching()) {
      markDirty("context");
      return;
    }
    this.rebuildContextPackage();
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
    // Given what the traits block already selected, so the two do not print
    // the same observation under two headings. See `extractUserPreferences`.
    const userPreferences = contextRules.extractUserPreferences(rawIdentity, identityObservations);
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
