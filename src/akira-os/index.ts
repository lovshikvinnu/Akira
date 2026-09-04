export * from "./projects";
export * from "./notes";
export * from "./vault";
export * from "./sessions";
export * from "./settings";
export * from "./presence";
export * from "./search";
export * from "./tasks";
export * from "./timeline";
export { getInitialState } from "../persistence/store-init";
export { akira, useAkira, useAkiraHydrated, selectors } from "../persistence/akira-store";
export type {
  Project,
  Task,
  Note,
  ChatMessage,
  HabitStreak,
  Profile,
  WorkSession,
  AkiraState,
} from "../persistence/akira-store";
export * from "./tools/registry";

// --- Observability composition ---
//
// Observability is an AKIRA OS capability, so AKIRA OS is what activates it.
// Importing this entry point yields a system that is actually watching the
// platform bus; see ../observability/composition.ts for what that wires and
// ADR-022 for why the subsystem is shaped the way it is.
//
// This is the client/shared half. The server runtime has its own module
// instances -- and therefore its own event bus -- so it composes separately in
// src/instrumentation/server/index.ts.
//
// Safe to import anywhere: the subsystem holds no timers, opens no connections,
// subscribes to nothing, and imports no Node-only module, so it adds nothing to
// the browser bundle it cannot run.
import "../observability/auto-compose";

export {
  initializeObservability,
  shutdownObservability,
  isObservabilityInitialized,
} from "../observability/composition";
