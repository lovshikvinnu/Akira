export type SessionType = "Focus" | "Chat" | "Idle" | "Unknown";

export type ReturnState = "New" | "Same Day Return" | "Next Day Return" | "Long Absence";

export type TimePeriod = "Morning" | "Afternoon" | "Evening" | "Night";

/**
 * Presence Context output model.
 * In accordance with the Provenance Preservation principle, it preserves originating metadata.
 */
export interface PresenceContext {
  // Provenance metadata
  origin: "PresenceEngine";
  evidence: {
    lastSessionEnd?: number;
    currentSessionStart: number;
    lastEventTime?: number;
    recentProjectId?: string | null;
  };
  confidence: number; // aggregated baseline confidence

  // Computed presence parameters
  sessionType: SessionType;
  returnState: ReturnState;
  timePeriod: TimePeriod;
  absenceDuration: number; // duration since last session ended in temporal units
  firstSessionToday: boolean;
  resumedConversation: boolean;
  recentProjectReference: string | null;
  unusualAccessTime: boolean;
  continuityConfidence: number; // 0.0 to 1.0
  presenceConfidence: number; // 0.0 to 1.0
  generatedAt: number; // temporal reference moment
}

/**
 * Inputs required by the Presence Engine to build the context.
 */
export interface PresenceInputs {
  // The consistent temporal reference moment (e.g. current timestamp in ms)
  currentTemporalReference: number;

  // Previous session details
  lastSessionEndReference?: number;
  lastSessionStartReference?: number;

  // Interaction history details
  lastEventTemporalReference?: number;
  recentConversationEnded?: boolean;
  hasPriorHistory: boolean;
  recentProjectId?: string | null;

  // Active session parameters
  activeSessionType?: SessionType;

  // Local hour calculation indicator (mapping from temporal reference to 24h clock)
  localHourOfDay: number;
}
