export type TelemetryMetadataValue =
  string | number | boolean | null | TelemetryMetadata | TelemetryMetadataArray;

export interface TelemetryMetadata {
  readonly [key: string]: TelemetryMetadataValue;
}

type TelemetryMetadataArray = ReadonlyArray<TelemetryMetadataValue>;

/**
 * Deep freezes an object to guarantee immutability, with circular reference safety.
 */
export function deepFreeze<T extends Record<string, any>>(obj: T, seen = new WeakSet()): T {
  if (seen.has(obj)) {
    return obj;
  }
  seen.add(obj);

  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = obj[name];
    if (value && typeof value === "object") {
      deepFreeze(value, seen);
    }
  }
  return Object.freeze(obj);
}

/**
 * Validates metadata to ensure it contains only JSON-serializable primitives and contains no circular references.
 */
export function validateMetadata(obj: any, seen = new WeakSet()): void {
  if (obj === null || typeof obj === "undefined") {
    return;
  }

  if (typeof obj !== "object") {
    const type = typeof obj;
    if (type !== "string" && type !== "number" && type !== "boolean") {
      throw new Error(`Invalid metadata value type: ${type}`);
    }
    if (type === "number" && (isNaN(obj) || !isFinite(obj))) {
      throw new Error(`Invalid metadata numeric value: ${obj}`);
    }
    return;
  }

  if (seen.has(obj)) {
    throw new Error("Circular reference detected in metadata");
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      validateMetadata(item, seen);
    }
  } else {
    for (const key of Object.keys(obj)) {
      validateMetadata(obj[key], seen);
    }
  }
}
