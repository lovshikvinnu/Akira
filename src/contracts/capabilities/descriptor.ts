import { z } from "zod";

/**
 * Capability Kind per Contract K7 / Target Architecture §7.1.
 * A capability is either a Command ("Do this") or a Query ("Tell me this"), never both.
 */
export type CapabilityKind = "Command" | "Query";

/**
 * Capability Permissions per Contract K7 / Target Architecture §7.1.
 */
export interface CapabilityPermissions {
  /** Permitted for internal non-VAJRA callers (e.g. direct UI user actions under Rule N1) */
  allowInternal?: boolean;
  /** Permitted for VAJRA mission routing */
  allowVajra?: boolean;
  /** Permitted for external read queries (e.g. MCP v0 per Decision D4) */
  allowExternalMcp?: boolean;
  /** Whether explicit human confirmation is required prior to execution */
  confirmationRequired?: boolean;
}

/**
 * Capability Activation Tier per Contract K22 / Target Architecture §8.1.
 * Tier 0: Process lifetime (boot)
 * Tier 1: Warm platform capability
 * Tier 2: On-demand capability
 */
export type ActivationTier = 0 | 1 | 2;

/**
 * Capability Cost Class per Contract K7.
 */
export type CostClass = "local_cheap" | "local_heavy" | "model_call" | "external_tool";

/**
 * Execution Characteristics per Contract K7.
 */
export interface ExecutionCharacteristics {
  isSynchronous: boolean;
  isIdempotent: boolean;
  isReadOnly: boolean;
  isReversible?: boolean;
  sideEffectClass?: string;
  isCancellable?: boolean;
}

/**
 * Minimum Conceptual Capability Descriptor per Contract K7.
 */
export interface CapabilityDescriptor<TInput = unknown, TOutput = unknown> {
  /** Domain-oriented stable identifier (e.g. 'project.read') */
  name: string;
  /** Semver version of the input/output contract */
  version: string;
  /** Owning subsystem (e.g. 'AKIRA OS · workspace', 'GENESIS · Memory') */
  owner: string;
  /** Kind: Command or Query */
  kind: CapabilityKind;
  /** Schema of accepted input */
  inputSchema: z.ZodType<TInput>;
  /** Schema or type description of output payload */
  outputSchema?: z.ZodType<TOutput>;
  /** Permissions governing invocation */
  permissions: CapabilityPermissions;
  /** Activation tier */
  activationTier: ActivationTier;
  /** Availability state */
  isAvailable: boolean;
  /** Relative cost classification */
  costClass: CostClass;
  /** Execution characteristics */
  executionCharacteristics: ExecutionCharacteristics;
  /** Expected emitted observations and events */
  observability?: {
    emitsEvents?: string[];
    emitsObservations?: string[];
  };
}
