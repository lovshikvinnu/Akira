/**
 * Event contract regression tests.
 *
 * The defect these guard against: `src/contracts/events.ts` declared
 * `TASK_CREATED` and `TASK_COMPLETED` twice — once for workspace tasks and
 * again for planning tasks. In a JavaScript object literal the later key wins
 * silently, so `Events.TASK_COMPLETED` resolved to "planning.task.completed"
 * while `akira-store` published the string "task.completed". The consumer in
 * GENESIS could therefore never match the producer, and the two workspace
 * strings could not be named through the registry at all.
 *
 * Note the first test reads the registry SOURCE rather than the imported
 * object. That is deliberate and load-bearing: by the time the module is
 * evaluated the duplicate has already collapsed to a single key, so the
 * compiled object cannot reveal the defect. Only the source can.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { Events } from "../src/contracts/events";

const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(REPO_ROOT, "src", "contracts", "events.ts");
const TIMELINE_SUBSCRIBER = path.join(
  REPO_ROOT,
  "src",
  "instrumentation",
  "subscribers",
  "timeline-subscriber.ts",
);

/** Every production file that publishes onto the platform event bus. */
const PUBLISHER_FILES = [
  "src/persistence/akira-store.ts",
  "src/akira-os/vault/VaultStorageService.ts",
  "src/akira-os/vault/VaultFolderService.ts",
  "src/akira-os/search/services/index.ts",
].map((f) => path.join(REPO_ROOT, f));

const read = (f: string) => fs.readFileSync(f, "utf8");

/** Key/value pairs in declaration order, straight from the registry source. */
function declarationsInSource(): Array<{ key: string; value: string; line: number }> {
  const out: Array<{ key: string; value: string; line: number }> = [];
  read(REGISTRY)
    .split(/\r?\n/)
    .forEach((text, i) => {
      const m = /^\s*([A-Z0-9_]+):\s*"([^"]+)"/.exec(text);
      if (m) out.push({ key: m[1], value: m[2], line: i + 1 });
    });
  return out;
}

/** `type: Events.SOMETHING` publish sites across the production publishers. */
function publishedConstants(): Array<{ file: string; key: string }> {
  const out: Array<{ file: string; key: string }> = [];
  for (const file of PUBLISHER_FILES) {
    for (const m of read(file).matchAll(/^\s*type:\s*Events\.([A-Z0-9_]+)/gm)) {
      out.push({ file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), key: m[1] });
    }
  }
  return out;
}

/** Bare string literals still used as an event type by a publisher. */
function publishedLiterals(): Array<{ file: string; value: string }> {
  const out: Array<{ file: string; value: string }> = [];
  for (const file of PUBLISHER_FILES) {
    for (const m of read(file).matchAll(/^\s*type:\s*"([^"]+)"/gm)) {
      out.push({ file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), value: m[1] });
    }
  }
  return out;
}

/** The Timeline subscriber's hard-coded allowlist. */
function timelineAllowlist(): string[] {
  const source = read(TIMELINE_SUBSCRIBER);
  const block = /allowed\w*\s*=\s*(?:new Set\()?\[([\s\S]*?)\]/i.exec(source);
  const region = block ? block[1] : source;
  return [...region.matchAll(/"([a-z]+(?:\.[a-z_]+)+)"/g)].map((m) => m[1]);
}

const publishedValues = (): Set<string> => {
  const registry = Events as unknown as Record<string, string>;
  return new Set(publishedConstants().map(({ key }) => registry[key]));
};

describe("event contract registry", () => {
  it("declares no key twice", () => {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];

    for (const { key, line } of declarationsInSource()) {
      const first = seen.get(key);
      if (first !== undefined) duplicates.push(`${key} (lines ${first} and ${line})`);
      else seen.set(key, line);
    }

    // A duplicate key is silently resolved by the last declaration, so the
    // shadowed constant becomes unnameable rather than raising an error.
    expect(duplicates).toEqual([]);
  });

  it("maps no two keys onto the same event string", () => {
    const byValue = new Map<string, string[]>();
    for (const { key, value } of declarationsInSource()) {
      byValue.set(value, [...(byValue.get(value) ?? []), key]);
    }
    const aliased = [...byValue.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([value, keys]) => `${value} <- ${keys.join(", ")}`);

    expect(aliased).toEqual([]);
  });

  it("keeps workspace and planning task events distinct", () => {
    // The exact regression: these four must never collapse onto two keys again.
    expect(Events.TASK_CREATED).toBe("task.created");
    expect(Events.TASK_COMPLETED).toBe("task.completed");
    expect(Events.PLANNING_TASK_CREATED).toBe("planning.task.created");
    expect(Events.PLANNING_TASK_COMPLETED).toBe("planning.task.completed");
  });
});

describe("event producers", () => {
  it("names every published event through the registry", () => {
    // A bare literal cannot be checked by the compiler and is how `note.updated`
    // drifted away from every one of its consumers.
    expect(publishedLiterals()).toEqual([]);
  });

  it("publishes only constants the registry actually declares", () => {
    const registry = Events as unknown as Record<string, string>;
    const undeclared = publishedConstants()
      .filter(({ key }) => registry[key] === undefined)
      .map(({ file, key }) => `${file}: Events.${key}`);

    expect(undeclared).toEqual([]);
  });

  it("still covers all 26 production publish sites", () => {
    // Guards against a publisher being dropped or silently reverted to a literal.
    expect(publishedConstants().length).toBe(26);
  });
});

describe("timeline allowlist reconciliation", () => {
  it("allowlists only event types that are actually published", () => {
    const published = publishedValues();
    const dead = timelineAllowlist().filter((type) => !published.has(type));

    // `note.edited` sat here unpublished while the producer emitted
    // `note.updated`, so note edits reached neither the Timeline nor GENESIS.
    expect(dead).toEqual([]);
  });

  it("documents the published types deliberately kept off the Timeline", () => {
    const allowlist = new Set(timelineAllowlist());
    const notShown = [...publishedValues()].filter((t) => !allowlist.has(t)).sort();

    // Declared in the registry, intentionally not surfaced in the user-facing
    // Timeline. Changing this set is a product decision, not a drift fix.
    expect(notShown).toEqual(["search.executed", "settings.updated", "task.reopened"]);
  });
});
