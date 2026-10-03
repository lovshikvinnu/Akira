import { CapabilityDescriptor } from "./descriptor";
import { Result, CorrelationMetadata, CapabilityFailure } from "../results/result";

/**
 * Capability Execution Handler Function.
 */
export type CapabilityHandler<TInput = any, TOutput = any> = (
  input: TInput,
  correlation: CorrelationMetadata,
) => Promise<TOutput> | TOutput;

export interface RegisteredCapability<TInput = any, TOutput = any> {
  descriptor: CapabilityDescriptor<TInput, TOutput>;
  handler: CapabilityHandler<TInput, TOutput>;
}

/**
 * AKIRA OS Capability Registry Host per Contract K8 / Contract K14 / Decision D2.
 * Tracks registered capabilities, validates availability, and enforces Rule N3.
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, RegisteredCapability>();

  /**
   * Register a capability descriptor and handler.
   */
  register<TInput, TOutput>(
    descriptor: CapabilityDescriptor<TInput, TOutput>,
    handler: CapabilityHandler<TInput, TOutput>,
  ): void {
    if (!descriptor.name || descriptor.name.trim() === "") {
      throw new Error("Capability registration failed: descriptor name cannot be empty.");
    }

    if (this.capabilities.has(descriptor.name)) {
      throw new Error(
        `Capability registration failed: capability '${descriptor.name}' is already registered.`,
      );
    }

    // Rule N3 Enforcement: GENESIS exposes ONLY Query capabilities (no Commands to GENESIS or from GENESIS)
    if (
      descriptor.owner.toLowerCase().includes("genesis") &&
      descriptor.kind === "Command"
    ) {
      throw new Error(
        `Rule N3 Violation: GENESIS capability '${descriptor.name}' cannot be a Command capability. GENESIS exposes only Queries.`,
      );
    }

    this.capabilities.set(descriptor.name, { descriptor, handler });
  }

  /**
   * Check if a capability is registered.
   */
  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  /**
   * Get a registered capability entry by name.
   */
  get(name: string): RegisteredCapability | undefined {
    return this.capabilities.get(name);
  }

  /**
   * List all registered capability descriptors.
   */
  list(): CapabilityDescriptor[] {
    return Array.from(this.capabilities.values()).map((entry) => entry.descriptor);
  }

  /**
   * Unregister a capability.
   */
  unregister(name: string): boolean {
    return this.capabilities.delete(name);
  }

  /**
   * Invoke a capability by name with input validation and uniform Result wrapping.
   */
  async invoke<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    correlation: CorrelationMetadata,
  ): Promise<Result<TOutput, CapabilityFailure>> {
    const entry = this.capabilities.get(name);

    if (!entry || !entry.descriptor.isAvailable) {
      return Result.failure<CapabilityFailure>(
        {
          category: "capability_unavailable",
          message: `Capability '${name}' is not registered or unavailable.`,
        },
        correlation,
      );
    }

    // Input Validation using Descriptor's Zod Schema
    const parseResult = entry.descriptor.inputSchema.safeParse(input);
    if (!parseResult.success) {
      return Result.failure<CapabilityFailure>(
        {
          category: "invalid_request",
          message: `Input validation failed for capability '${name}'.`,
          details: parseResult.error.format(),
        },
        correlation,
      );
    }

    try {
      const output = await entry.handler(parseResult.data, correlation);
      return Result.success<TOutput>(output, correlation);
    } catch (err: any) {
      return Result.failure<CapabilityFailure>(
        {
          category: "execution_failure",
          message: err?.message || `Execution error in capability '${name}'.`,
          details: err,
        },
        correlation,
      );
    }
  }
}
