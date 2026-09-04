export * from "../contracts/telemetry";
export * from "../models/severity";
export * from "../models/metadata";
export * from "../models/correlation";
export * from "../models/errors";
export * from "../models/record";
export * from "../services/telemetry-service";
export * from "../services/telemetry-factory";
export * from "../services/context";
export * from "../services/serializer";
export * from "../services/validator";
export * from "../services/pipeline";
export * from "../utils/clock";
export * from "../utils/id-generator";
export * from "../metrics/contracts";
export * from "../metrics/errors";
export * from "../metrics/registry";
export * from "../metrics/types";
export * from "../metrics/aggregation";

// --- Collection, evaluation and lifecycle ---
// Added when the subsystem was completed; see ADR-022. Prior to this the public
// surface exposed only record creation, and there was nowhere for a record to go.
export * from "../store/telemetry-store";
export * from "../store/retention";
export * from "../health/health-registry";
export * from "../performance/performance-monitor";
export * from "../resources/resource-sampler";
// Composition is deliberately NOT re-exported here. It is the subsystem's
// lifecycle seam, not part of its telemetry API, and AKIRA OS imports it
// directly from ../composition. Re-exporting it made the same symbol reachable
// through several barrels at once, which the bundler could not chunk.
