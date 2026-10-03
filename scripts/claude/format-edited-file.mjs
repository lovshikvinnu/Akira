#!/usr/bin/env node
/**
 * PostToolUse(Edit|Write) hook: run Prettier on the file that was just written.
 *
 * WHY
 * ---
 * `core.autocrlf` is `true` on the Windows machines this repo is developed on,
 * while Prettier's `endOfLine` is `lf`. Every CRLF line therefore becomes a
 * `prettier/prettier: Delete CR` error: ~11,500 lint errors were measured on
 * this tree, ~99% of them exactly that, burying the ~96 real ones. Formatting
 * each file as it is written stops new ones appearing, which is both cheaper
 * and safer than a periodic bulk rewrite -- this working tree is sometimes
 * shared by a second session, and a 52-file whitespace commit would collide
 * with whatever it is mid-way through.
 *
 * WHY NOT npx
 * -----------
 * `spawnSync("npx.cmd", ...)` fails with EINVAL on Node 24 for Windows (spawning
 * a `.cmd` now requires a shell), and plain `npx` is ENOENT. Both failures are
 * silent from the hook's point of view -- the first version of this file
 * "passed" while formatting nothing. Resolving Prettier's own CJS entry and
 * running it under `process.execPath` avoids the shell, avoids npx's startup
 * cost, and cannot regress that way again.
 *
 * ERROR POLICY -- deliberately does not swallow real failures
 * -----------------------------------------------------------
 *   Prettier reformatted, or the file was already clean -> exit 0, silent.
 *   Prettier could not parse the file                   -> exit 2, message to
 *       Claude. A syntax error in a just-written file is worth interrupting for.
 *   Prettier is not installed (no node_modules)         -> exit 0, silent. That
 *       is an environment state, not a defect in the edit, and must not block
 *       editing. This is the ONLY silent-skip path, and it is conditioned on the
 *       binary genuinely being absent rather than on any invocation failure.
 *
 * Exit 2 is the code Claude Code feeds back to the model as actionable stderr.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, relative, isAbsolute } from "node:path";

/** Extensions Prettier owns in this repo. Anything else exits silently. */
const FORMATTABLE = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".css",
  ".scss",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".html",
]);

const PRETTIER_BIN = join(process.cwd(), "node_modules", "prettier", "bin", "prettier.cjs");

const ROOT = process.cwd();

/**
 * True when `file` lives inside the project root.
 *
 * Claude edits files outside the repo too (memory notes, scratch files). Those
 * are not this project's to reformat -- Prettier would apply AKIRA's .prettierrc
 * to something that never asked for it. Observed doing exactly that to a file
 * under ~/.claude/ before this check existed.
 */
function insideProject(file) {
  const rel = relative(ROOT, resolve(file));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

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
  process.exit(0); // A malformed hook payload is not the edit's fault.
}

// Prettier genuinely absent: skip quietly rather than block every edit.
if (!existsSync(PRETTIER_BIN)) process.exit(0);

const input = payload.tool_input ?? {};
const files = [
  ...new Set(
    [input.file_path, input.notebook_path, ...(input.edits ?? []).map((e) => e?.file_path)].filter(
      (p) => typeof p === "string" && p.length > 0,
    ),
  ),
].filter((f) => existsSync(f) && insideProject(f) && FORMATTABLE.has(extname(f).toLowerCase()));

if (files.length === 0) process.exit(0);

const res = spawnSync(
  process.execPath,
  [PRETTIER_BIN, "--write", "--ignore-unknown", "--log-level", "warn", ...files],
  { encoding: "utf-8", cwd: process.cwd() },
);

if (res.error) {
  console.error(`Could not run Prettier (${res.error.code ?? res.error.message}).`);
  process.exit(2);
}

if (res.status !== 0) {
  const detail = `${res.stderr ?? ""}${res.stdout ?? ""}`.trim();
  console.error(
    `Prettier could not format ${files.join(", ")}.\n${detail}\n\n` +
      "This usually means the file has a syntax error. Fix it before continuing.",
  );
  process.exit(2);
}

process.exit(0);
