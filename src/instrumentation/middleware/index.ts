/* eslint-disable @typescript-eslint/no-explicit-any */
import { isSerializable, isValidTimestamp } from "../event";

export type Middleware = (event: any) => any;

/**
 * Composes multiple middleware functions from left to right.
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return (event: any) => {
    return middlewares.reduce((acc, mw) => mw(acc), event);
  };
}

/**
 * Generates and injects a unique event ID (UUID) if not already present.
 */
export const eventIdGenerator: Middleware = (event: any) => {
  if (event && !event.id) {
    return { ...event, id: generateUUID() };
  }
  return event;
};

/**
 * Injects the current UTC timestamp as ISO 8601 string if not already present.
 */
export const timestampInjector: Middleware = (event: any) => {
  if (event && !event.timestamp) {
    return { ...event, timestamp: new Date().toISOString() };
  }
  return event;
};

/**
 * Generates and injects a unique correlation ID if not already present.
 */
export const correlationIdGenerator: Middleware = (event: any) => {
  if (event && !event.correlationId) {
    return { ...event, correlationId: generateUUID() };
  }
  return event;
};

/**
 * Rejects event if payload or metadata is not serializable.
 */
export const serializationValidator: Middleware = (event: any) => {
  if (!event) {
    throw new Error("Validation Error: Event object is missing");
  }

  if (event.payload === undefined) {
    throw new Error("Validation Error: Payload is missing or undefined");
  }

  const payloadCheck = isSerializable(event.payload);
  if (!payloadCheck.serializable) {
    throw new Error(
      `Validation Error: Payload is not serializable. Reason: ${payloadCheck.reason}`,
    );
  }

  if (event.metadata !== undefined && event.metadata !== null) {
    const metadataCheck = isSerializable(event.metadata);
    if (!metadataCheck.serializable) {
      throw new Error(
        `Validation Error: Metadata is not serializable. Reason: ${metadataCheck.reason}`,
      );
    }
  }

  return event;
};

/**
 * Enforces schema constraints and rejects events with missing, invalid or malformed structural properties.
 */
export const validator: Middleware = (event: any) => {
  if (!event) {
    throw new Error("Validation Error: Event object is missing");
  }

  // 1. Check ID
  if (!event.id || typeof event.id !== "string" || event.id.trim() === "") {
    throw new Error("Validation Error: Missing or invalid event ID");
  }

  // 2. Check type
  if (!event.type || typeof event.type !== "string" || event.type.trim() === "") {
    throw new Error("Validation Error: Missing or invalid event type");
  }

  // 3. Check source
  if (!event.source || typeof event.source !== "string" || event.source.trim() === "") {
    throw new Error("Validation Error: Missing or invalid event source");
  }

  // 4. Check timestamp
  if (!event.timestamp || !isValidTimestamp(event.timestamp)) {
    throw new Error(`Validation Error: Missing or invalid event timestamp: ${event.timestamp}`);
  }

  // 5. Check version
  if (event.version === undefined || event.version === null) {
    throw new Error("Validation Error: Missing event version");
  }
  const versionType = typeof event.version;
  if (versionType !== "string" && versionType !== "number") {
    throw new Error("Validation Error: Event version must be a string or a number");
  }
  if (event.version.toString().trim() === "") {
    throw new Error("Validation Error: Event version cannot be empty");
  }

  // 6. Optional field type verification
  if (
    event.entityId !== undefined &&
    event.entityId !== null &&
    typeof event.entityId !== "string"
  ) {
    throw new Error("Validation Error: entityId must be a string");
  }

  if (event.actor !== undefined && event.actor !== null && typeof event.actor !== "string") {
    throw new Error("Validation Error: actor must be a string");
  }

  if (
    event.correlationId !== undefined &&
    event.correlationId !== null &&
    typeof event.correlationId !== "string"
  ) {
    throw new Error("Validation Error: correlationId must be a string");
  }

  return event;
};

/**
 * Default composed middleware pipeline executing sequentially
 */
export const defaultMiddlewarePipeline = composeMiddleware(
  eventIdGenerator,
  timestampInjector,
  correlationIdGenerator,
  serializationValidator,
  validator,
);

// Helper for uuid generation
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
