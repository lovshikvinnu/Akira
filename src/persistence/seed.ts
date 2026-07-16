import type { AkiraState } from "../shared/types/store-types";

export function seed(): AkiraState {
  return {
    projects: [],
    tasks: [],
    notes: [],
    chat: [],
    streaks: [],
    profile: {
      name: "Lovshik",
      role: "Developer",
      motto: "Building Akira",
    },
    lastProjectId: null,
    memories: [],
    sessions: [],
    activeSession: null,
  };
}
