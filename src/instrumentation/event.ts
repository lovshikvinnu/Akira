/**
 * Recursively checks if a value is JSON-serializable.
 * Detects circular references, functions, symbols, BigInts, undefined, Map, Set, Promise, and custom prototypes.
 */
export function isSerializable(
  val: any,
  visited = new Set<any>(),
): { serializable: boolean; reason?: string } {
  if (val === null) {
    return { serializable: true };
  }

  if (val === undefined) {
    return { serializable: false, reason: "Value is undefined" };
  }

  const type = typeof val;
  if (type === "string" || type === "boolean") {
    return { serializable: true };
  }

  if (type === "number") {
    if (isNaN(val) || !isFinite(val)) {
      return { serializable: false, reason: "Number is NaN or Infinity" };
    }
    return { serializable: true };
  }

  if (type === "symbol" || type === "function" || type === "bigint") {
    return { serializable: false, reason: `Value type ${type} is not serializable` };
  }

  if (visited.has(val)) {
    return { serializable: false, reason: "Circular reference detected" };
  }

  if (val instanceof Date) {
    // Dates are serializable via toISOString() in JSON.stringify
    return { serializable: true };
  }

  if (val instanceof RegExp || val instanceof Map || val instanceof Set || val instanceof Promise) {
    return {
      serializable: false,
      reason: `Value is an instance of non-serializable class ${val.constructor.name}`,
    };
  }

  if (Array.isArray(val)) {
    visited.add(val);
    for (let i = 0; i < val.length; i++) {
      const res = isSerializable(val[i], visited);
      if (!res.serializable) {
        return {
          serializable: false,
          reason: `Array element at index ${i}: ${res.reason}`,
        };
      }
    }
    visited.delete(val);
    return { serializable: true };
  }

  if (type === "object") {
    // Reject objects with custom prototypes to prevent class instance leakage
    const proto = Object.getPrototypeOf(val);
    if (proto !== null && proto !== Object.prototype) {
      return {
        serializable: false,
        reason: `Value is a class instance with custom prototype ${proto?.constructor?.name}`,
      };
    }

    visited.add(val);
    for (const key of Object.keys(val)) {
      const res = isSerializable(val[key], visited);
      if (!res.serializable) {
        return {
          serializable: false,
          reason: `Object property "${key}": ${res.reason}`,
        };
      }
    }
    visited.delete(val);
    return { serializable: true };
  }

  return { serializable: false, reason: `Unknown type: ${type}` };
}

/**
 * Validates whether a value is a valid ISO 8601 UTC/local timestamp string.
 */
export function isValidTimestamp(timestamp: any): boolean {
  if (typeof timestamp !== "string") return false;
  const time = Date.parse(timestamp);
  if (isNaN(time)) return false;
  try {
    const d = new Date(timestamp);
    return !isNaN(d.getTime());
  } catch {
    return false;
  }
}
