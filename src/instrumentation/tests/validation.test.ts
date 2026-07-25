import { isSerializable } from "../event";
import { defaultMiddlewarePipeline } from "../middleware";

const totalTests = 0;
const passedTests = 0;

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(fn: () => void, message: string) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message} -> Expected function to throw an error, but it succeeded.`);
  }
}

// ----------------------------------------------------

test("Serialization Check - Valid serializable values", () => {
  assertEquals(
    isSerializable({ key: "value", num: 123, bool: true, arr: [1, 2, 3], nested: { nil: null } })
      .serializable,
    true,
    "JSON primitives and nested objects must be serializable",
  );
});

test("Serialization Check - Functions must be rejected", () => {
  assertEquals(isSerializable({ fn: () => {} }).serializable, false, "Functions must be rejected");
});

test("Serialization Check - Symbols must be rejected", () => {
  assertEquals(
    isSerializable({ sym: Symbol("test") }).serializable,
    false,
    "Symbols must be rejected",
  );
});

test("Serialization Check - BigInt must be rejected", () => {
  assertEquals(
    isSerializable({ big: BigInt(9007199254740991) }).serializable,
    false,
    "BigInt must be rejected",
  );
});

test("Serialization Check - Circular references must be rejected", () => {
  const obj: any = { name: "circular" };
  obj.self = obj;
  assertEquals(isSerializable(obj).serializable, false, "Circular references must be rejected");
});

test("Serialization Check - Map and Set must be rejected", () => {
  assertEquals(isSerializable({ map: new Map() }).serializable, false, "Map must be rejected");
  assertEquals(isSerializable({ set: new Set() }).serializable, false, "Set must be rejected");
});

test("Serialization Check - Promise must be rejected", () => {
  assertEquals(
    isSerializable({ promise: Promise.resolve() }).serializable,
    false,
    "Promise must be rejected",
  );
});

test("Serialization Check - Custom class instances must be rejected", () => {
  class CustomClass {
    constructor(public name = "test") {}
  }
  assertEquals(
    isSerializable({ instance: new CustomClass() }).serializable,
    false,
    "Custom class instances must be rejected",
  );
});

test("Middleware Pipeline - Rejection of invalid inputs", () => {
  // Test middleware throwing on malformed payloads
  assertThrows(() => {
    defaultMiddlewarePipeline({
      type: "test.event",
      source: "test",
      payload: { map: new Map() } as any,
      version: 1,
    });
  }, "Pipeline must fail when serialization validation fails");
});

// ----------------------------------------------------
