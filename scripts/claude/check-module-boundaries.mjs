#!/usr/bin/env node
/**
 * PostToolUse(Edit|Write) hook: enforce the grep-checkable half of
 * MODULE_CONTRACT.md on the file that was just written.
 *
 * SCOPE -- deliberately narrow
 * ----------------------------
 * Only rules decidable from a single file's import list are checked here.
 * Rules 2.2 (routes hold no logic), 2.3 (services are the client entry point),
 * 2.5 (no viewport math) and 2.6 (registry registration) need judgement about
 * what the code *means*, not what it imports, and belong to the
 * `contract-auditor` subagent. A hook that guesses at those would cry wolf, and
 * a guard that cries wolf gets disabled.
 *
 * WHAT IS ENFORCED
 * ----------------
 *   Rule 2.1 (UI Isolation)     -- components/hooks must not import repositories.
 *   Rule 2.4 (Server Isolation) -- repositories and the SQLite driver are
 *                                  server-only; they must never reach a UI surface.
 *
 * The repository was verified clean against both when this was written, so the
 * guard preserves an invariant rather than reporting a backlog.
 *
 * DELIBERATE EXEMPTIONS -- each was a real match that is not a violation
 * ---------------------------------------------------------------------
 *   Type-only imports (`import type ...`, or `import { type A }`)
 *       A repository *contract* is an interface. `src/routes/search.tsx` and
 *       `src/app/shell/CommandPalette.tsx` both import `SearchHistoryEntry`
 *       from `@/contracts/repositories/...` as a type. Types are erased at
 *       compile time, so no connection crosses the boundary. Flagging these
 *       would make the guard wrong on day one.
 *
 *   Test and bench files (`*.test.ts(x)`, `*.bench.ts`, `*.spec.ts(x)`)
 *       `src/app/ui/timeline/timeline-performance.test.ts` imports
 *       `timelineRepository` and `getDatabaseConnection` on purpose: it is a
 *       persistence test that happens to sit under a UI folder, and TESTING.md
 *       section 1 mandates that colocation.
 *
 * Paths are normalised to forward slashes before matching, so the same patterns
 * work on Windows and POSIX.
 *
 * Exit 2 feeds the message back to Claude as actionable stderr.
 */
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const slash = (p) => p.split("\\").join("/");

/** UI surfaces: no repository may be imported into these. */
const UI_SURFACE = [
  /^src\/components\//,
  /^src\/hooks\//,
  /^src\/routes\//,
  /^src\/app\//,
  /\/components\//,
  /\/hooks\//,
];

/**
 * Module specifiers that carry a database connection with them.
 *
 * NOT listed, on purpose: `persistence/akira-store`. It looks like a
 * persistence module and it does import better-sqlite3, but MODULE_CONTRACT
 * rule 2.1 names the `akira` store as the *sanctioned* way for a component to
 * reach state ("Components must interact with state through client Hooks or
 * the `akira` store"). Three call sites rely on that -- VaultWorkspace.tsx,
 * useUploadQueue.ts and __root.tsx -- and flagging them would put this guard
 * in direct contradiction with the document it enforces.
 */
const FORBIDDEN = [
  { re: /persistence\/repositories/, what: "a SQLite repository" },
  { re: /persistence\/connection/, what: "the SQLite connection" },
  { re: /analytics\/repository\/Sqlite/, what: "a SQLite repository" },
  { re: /^better-sqlite3$/, what: "the better-sqlite3 driver" },
];

function readStdin() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

let payload = {};
try {
  payload = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0);
}

const input = payload.tool_input ?? {};
const files = [
  ...new Set(
    [input.file_path, ...(input.edits ?? []).map((e) => e?.file_path)].filter(
      (p) => typeof p === "string" && p.length > 0,
    ),
  ),
].filter((f) => existsSync(f) && /\.(ts|tsx)$/.test(f));

const violations = [];

for (const file of files) {
  const rel = slash(relative(process.cwd(), file) || file);

  // Colocated tests may cross the boundary on purpose (TESTING.md section 1).
  if (/\.(test|bench|spec)\.(ts|tsx)$/.test(rel)) continue;
  if (!UI_SURFACE.some((re) => re.test(rel))) continue;

  let src;
  try {
    src = readFileSync(file, "utf-8");
  } catch {
    continue;
  }

  src.split(/\r?\n/).forEach((line, i) => {
    const m =
      line.match(/^\s*import\s+(?:type\s+)?[^"']*from\s*["']([^"']+)["']/) ||
      line.match(/^\s*import\s*["']([^"']+)["']/) ||
      line.match(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/) ||
      line.match(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/);
    if (!m) return;

    // Type-only imports are erased at compile time -- nothing crosses.
    if (/^\s*import\s+type\b/.test(line)) return;
    const named = line.match(/import\s*\{([^}]*)\}/);
    if (named) {
      const bindings = named[1]
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      if (bindings.length > 0 && bindings.every((b) => b.startsWith("type "))) return;
    }

    const spec = m[1];
    for (const f of FORBIDDEN) {
      if (f.re.test(spec)) {
        violations.push({ rel, line: i + 1, what: f.what, text: line.trim() });
        break;
      }
    }
  });
}

if (violations.length === 0) process.exit(0);

const report = violations
  .map((v) => `  ${v.rel}:${v.line}\n    ${v.text}\n    imports ${v.what} into a UI surface.`)
  .join("\n\n");

console.error(
  "MODULE_CONTRACT violation -- Rule 2.1 (UI Isolation) / Rule 2.4 (Server Isolation)\n\n" +
    report +
    "\n\nComponents, hooks, routes and app shell code must never import repositories,\n" +
    "the SQLite connection, or better-sqlite3. Route the data instead:\n" +
    "  reads  -> a reactive hook or an `akira` store selector\n" +
    "  writes -> a client service in the owning module, which dispatches an RPC\n\n" +
    "See MODULE_CONTRACT.md rules 2.1, 2.3 and 2.4. If this import is a type only,\n" +
    "write it as `import type { ... }` and the guard will accept it.\n",
);
process.exit(2);
