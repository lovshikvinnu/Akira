/**
 * GENESIS production composition and reachability.
 *
 * The defect this guards against: `storyBuilder` and `importanceBuilder` were
 * fully implemented, fully unit tested, and never ran in the application. They
 * subscribe inside an `initialize()` invoked at module scope, and the only
 * importers of their modules were `src/genesis/stories/index.ts` and
 * `src/genesis/importance/index.ts` — barrels nothing imports. Every test that
 * imported a builder directly supplied the very side effect production lacked,
 * so the whole suite passed while memories never became stories.
 *
 * The rule that makes these tests meaningful, and the reason they live apart
 * from the subsystem suites:
 *
 *     THIS FILE MAY IMPORT GENESIS ONLY THROUGH `src/genesis/index.ts`.
 *
 * A direct submodule import re-creates the missing side effect and silently
 * voids the test. Types are exempt — they erase at compile time.
 */
process.env.AKIRA_DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// The one permitted import: exactly what src/routes/*.tsx uses.
const genesis = await import("../src/genesis/index");

const REPO_ROOT = path.resolve(__dirname, "..");
const SRC = path.join(REPO_ROOT, "src");
const GENESIS_DIR = path.join(SRC, "genesis");
const ENTRY = path.join(GENESIS_DIR, "index.ts");

// ---------------------------------------------------------------------------
// Static reachability — the guard that prevents this defect class recurring
// ---------------------------------------------------------------------------

/** Resolves an import specifier to a file on disk, or null for bare packages. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/** Static `import`/`export ... from` specifiers. Dynamic imports are ignored. */
function staticSpecifiers(source: string): string[] {
  const found: string[] = [];
  const withClause = /(?:^|\n)\s*(?:import|export)\s[\s\S]*?from\s*["']([^"']+)["']/g;
  const sideEffectOnly = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const re of [withClause, sideEffectOnly]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) found.push(m[1]);
  }
  return found;
}

/** Every file transitively reachable from the production entry point. */
function reachableFromEntry(): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of staticSpecifiers(fs.readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved) walk(resolved);
    }
  };
  walk(ENTRY);
  return seen;
}

function genesisSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) genesisSourceFiles(full, acc);
    else if (/\.tsx?$/.test(full) && !/\.test\./.test(full)) acc.push(full);
  }
  return acc;
}

/** A call at column 0 that wires a processor up — the self-initialising pattern. */
const SELF_INIT = /^([a-zA-Z_$][\w$]*)\.(initialize|start)\s*\(\s*\)\s*;/;

interface SelfInitialising {
  file: string;
  line: number;
  subject: string;
}

function selfInitialisingModules(): SelfInitialising[] {
  const found: SelfInitialising[] = [];
  for (const file of genesisSourceFiles(GENESIS_DIR)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      const m = SELF_INIT.exec(text);
      if (m) found.push({ file, line: i + 1, subject: m[1] });
    });
  }
  return found;
}

const relative = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

describe("GENESIS production reachability", () => {
  it("reaches every self-initialising processor from the production entry point", () => {
    const reachable = reachableFromEntry();
    const orphaned = selfInitialisingModules()
      .filter((m) => !reachable.has(m.file))
      .map((m) => `${relative(m.file)}:${m.line} (${m.subject})`);

    // An orphan here is a processor that works in its own unit tests and never
    // runs in the app. Either import it from the composition module, or delete it.
    expect(orphaned).toEqual([]);
  });

  it("names every self-initialising processor in the composition manifest", () => {
    const manifest = new Set(genesis.GENESIS_COGNITIVE_PROCESSORS.map((p) => p.name));

    // eventService is intentionally excluded: it is the AKIRA OS event-bus
    // intake, owned by the event-pipeline remediation task.
    const exempt = new Set(["eventService"]);

    const unmanaged = selfInitialisingModules()
      .map((m) => m.subject)
      .filter((subject) => !manifest.has(subject) && !exempt.has(subject));

    expect([...new Set(unmanaged)]).toEqual([]);
  });

  it("exposes the two previously orphaned builders through the manifest", () => {
    const names = genesis.GENESIS_COGNITIVE_PROCESSORS.map((p) => p.name);
    expect(names).toContain("storyBuilder");
    expect(names).toContain("importanceBuilder");
  });
});

// ---------------------------------------------------------------------------
// End-to-end: one real event through the whole downstream pipeline
// ---------------------------------------------------------------------------

describe("GENESIS downstream pipeline through the production entry point", () => {
  it("carries a task completion from event to understanding", () => {
    const projectId = "proj-e2e";

    const before = {
      candidates: genesis.candidateService.getCandidates().length,
      memories: genesis.memoryService.getMemories().length,
      stories: genesis.storyService.getStories().length,
      importance: genesis.importanceService.getAllImportance().length,
    };

    // The intake call the reality adapter will eventually make on the app's behalf.
    genesis.eventService.record(
      "task_completed",
      "Ship the composition fix",
      "Completed task: Ship the composition fix",
      projectId,
      null,
      { title: "Ship the composition fix", projectId },
    );

    // 1. event -> candidate
    const candidates = genesis.candidateService.getCandidates();
    expect(candidates.length).toBe(before.candidates + 1);
    expect(candidates[0].reason).toBe("Goal Progress");

    // 2. candidate -> validated memory
    const memories = genesis.memoryService.getMemories();
    expect(memories.length).toBe(before.memories + 1);
    const memory = memories[memories.length - 1];
    expect(memory.candidateId).toBe(candidates[0].id);
    expect(memory.relatedProjectId).toBe(projectId);

    // 3. memory -> story  (dead before this fix)
    const stories = genesis.storyService.getStories();
    expect(stories.length).toBeGreaterThan(before.stories);
    const story = stories.find((s) => s.summary.includes(`ID: ${projectId}`));
    expect(story, "a Project Arc story must exist for the project").toBeDefined();
    expect(story!.relatedMemoryIds).toContain(memory.id);

    // 4. memory + story -> importance  (dead before this fix)
    const importance = genesis.importanceService.getImportance(memory.id);
    expect(importance, "the promoted memory must carry an importance profile").toBeDefined();

    // 5. memory + story -> understanding
    expect(genesis.understandingEngine.getUnderstandings().length).toBeGreaterThan(0);
  });

  it("clusters a second memory for the same project into the same story", () => {
    const projectId = "proj-e2e-cluster";

    genesis.eventService.record(
      "task_completed",
      "First",
      "Completed task: First",
      projectId,
      null,
      {
        title: "First",
        projectId,
      },
    );
    const storiesAfterFirst = genesis.storyService
      .getStories()
      .filter((s) => s.summary.includes(`ID: ${projectId}`));
    expect(storiesAfterFirst.length).toBe(1);

    genesis.eventService.record(
      "task_completed",
      "Second",
      "Completed task: Second",
      projectId,
      null,
      {
        title: "Second",
        projectId,
      },
    );
    const storiesAfterSecond = genesis.storyService
      .getStories()
      .filter((s) => s.summary.includes(`ID: ${projectId}`));

    // Still one arc, now holding both memories.
    expect(storiesAfterSecond.length).toBe(1);
    expect(storiesAfterSecond[0].relatedMemoryIds.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Declared last on purpose: this is the only test that composes explicitly, and
// running it earlier would wire the pipeline for the E2E above and mask a
// regression in which the production entry point stops composing at import.
// ---------------------------------------------------------------------------

describe("GENESIS composition idempotency", () => {
  it("does not duplicate subscriptions when re-composed", () => {
    const before = genesis.memoryService.getMemories().length;
    genesis.initializeGenesisCognition();
    genesis.initializeGenesisCognition();

    genesis.eventService.record(
      "task_completed",
      "Idempotency probe",
      "Completed task: Idempotency probe",
      "proj-idem",
      null,
      { title: "Idempotency probe", projectId: "proj-idem" },
    );

    // One event must yield exactly one memory, not one per composition call.
    expect(genesis.memoryService.getMemories().length).toBe(before + 1);
  });
});
