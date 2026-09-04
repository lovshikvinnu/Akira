/**
 * Production reachability guard for the observability subsystem.
 *
 * The regression this exists to catch is invisible to every other check in the
 * repository:
 *
 *     source looks correct
 *            v
 *     bundler tree-shakes the composition away
 *            v
 *     production silently loses observability, and all tests still pass
 *
 * That is not hypothetical. It happened during the work that introduced this
 * subsystem: `package.json` declared `"sideEffects": false`, which is a claim
 * that no module in the package has import-time side effects. Under it,
 * `src/observability/auto-compose.ts` -- whose entire purpose *is* an
 * import-time side effect -- was dropped from the production client bundle.
 * The build passed, `tsc` passed, and the whole suite passed, because vitest
 * does not tree-shake. Production simply had no observability.
 *
 * `package.json` now names that file explicitly, which makes the *filename* a
 * reachability fuse: rename or move `auto-compose.ts` without updating the
 * `sideEffects` entry and the subsystem silently disappears again.
 *
 * Why this is a script and not a vitest test:
 *
 *   - `.output/` is gitignored, so on a fresh clone or a CI job that has not
 *     built, a test would find no artifacts. It would then either fail
 *     spuriously or skip silently -- and a guard that skips silently when its
 *     evidence is missing is precisely the failure mode being guarded against.
 *   - A script owns its own build, so "artifacts missing" cannot happen. There
 *     is no ambiguous state and nothing to skip.
 *   - It keeps a ~20s production build out of the default `vitest` run.
 *
 * Why the markers are read out of the source rather than hardcoded here:
 * a hardcoded string turns any legitimate rename into a false alarm. Reading
 * the expected value from the source file means a deliberate rename updates the
 * expectation automatically, while a tree-shaken module still fails -- the
 * string is simply absent from the build. The guard stays sensitive to the real
 * regression and blind to cosmetic change.
 *
 * Usage:
 *   npm run verify:observability              # builds, then verifies
 *   npm run verify:observability -- --no-build  # verifies existing artifacts
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLIENT_DIR = path.join(REPO_ROOT, ".output", "public");
const SERVER_DIR = path.join(REPO_ROOT, ".output", "server");

let failures = 0;

function pass(message: string): void {
  console.log(`  [PASS] ${message}`);
}

function fail(message: string): void {
  console.error(`  [FAIL] ${message}`);
  failures++;
}

/** Aborts outright: the guard could not be evaluated, which is not a pass. */
function abort(message: string): never {
  console.error(`\n[ABORT] ${message}`);
  process.exit(2);
}

/**
 * Extracts a marker's expected value from the source that defines it.
 *
 * If the pattern stops matching, the source has been restructured and this
 * guard can no longer describe what it is looking for. That aborts rather than
 * passes -- an unevaluatable guard must never look like a green one.
 */
function markerFromSource(relativePath: string, pattern: RegExp, label: string): string {
  const file = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(file)) {
    abort(`Cannot read marker "${label}": ${relativePath} does not exist.`);
  }
  const match = fs.readFileSync(file, "utf8").match(pattern);
  if (!match || !match[1]) {
    abort(
      `Cannot read marker "${label}" from ${relativePath}. ` +
        `The source shape changed; update this guard's pattern.`,
    );
  }
  return match[1];
}

/** Every JavaScript file emitted under `dir`. */
function bundledFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function assertMarkerPresent(
  files: string[],
  marker: string,
  label: string,
  surface: string,
): void {
  const found = files.some((file) => fs.readFileSync(file, "utf8").includes(marker));
  if (found) {
    pass(`${surface}: ${label} is present in the built output`);
  } else {
    fail(
      `${surface}: ${label} (${JSON.stringify(marker)}) is MISSING from the built output. ` +
        `Observability was tree-shaken out of the ${surface} bundle. ` +
        `Check that package.json "sideEffects" still names src/observability/auto-compose.ts ` +
        `and that the AKIRA OS / server entry points still import it.`,
    );
  }
}

// ---------------------------------------------------------------------------

console.log("Observability production reachability guard\n");

// 1. The config-level fuse: the sideEffects entry must point at a real file.
//    Cheap, and it catches a rename before the build even runs.
console.log("Configuration");
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const sideEffects: unknown = pkg.sideEffects;

if (!Array.isArray(sideEffects)) {
  fail(
    `package.json "sideEffects" is ${JSON.stringify(sideEffects)}, not an array. ` +
      `A blanket false drops auto-compose.ts and silently disables observability.`,
  );
} else {
  const missing = sideEffects.filter(
    (entry) => typeof entry === "string" && !fs.existsSync(path.join(REPO_ROOT, entry)),
  );
  if (missing.length > 0) {
    fail(`package.json "sideEffects" names files that do not exist: ${missing.join(", ")}`);
  } else {
    pass(`package.json "sideEffects" names ${sideEffects.length} existing file(s)`);
  }
}

// 2. Markers, read from the source that defines them.
console.log("\nMarkers (read from source)");
const deliveryPrefix = markerFromSource(
  "src/observability/integration/event-bus-observer.ts",
  /export const DELIVERY_OPERATION_PREFIX\s*=\s*"([^"]+)"/,
  "delivery operation prefix",
);
const healthRationale = markerFromSource(
  "src/observability/health/health-registry.ts",
  /rationale:\s*"([^"]+)"/,
  "health registration rationale",
);
pass(`delivery operation prefix = ${JSON.stringify(deliveryPrefix)}`);
pass(`health registration rationale = ${JSON.stringify(healthRationale)}`);

// 3. Build, unless explicitly reusing existing artifacts.
const skipBuild = process.argv.includes("--no-build");
if (skipBuild) {
  console.log("\nBuild\n  [SKIP] --no-build: verifying existing artifacts");
} else {
  console.log("\nBuild\n  running `vite build` ...");
  try {
    execSync("npx vite build", { cwd: REPO_ROOT, stdio: "pipe" });
    pass("production build succeeded");
  } catch (err) {
    const output = err instanceof Error && "stderr" in err ? String(err.stderr) : String(err);
    abort(`Production build failed, so reachability cannot be verified.\n${output}`);
  }
}

if (!fs.existsSync(CLIENT_DIR) || !fs.existsSync(SERVER_DIR)) {
  abort(`Build output missing (${CLIENT_DIR}, ${SERVER_DIR}). Run without --no-build.`);
}

// 4. The real check: does the composition survive bundling, on both surfaces?
//    Both matter. The client bus carries UI-originated events; the server bus
//    is where the SQLite persistence and timeline writes happen, which are the
//    deliveries most worth observing.
const clientFiles = bundledFiles(CLIENT_DIR);
const serverFiles = bundledFiles(SERVER_DIR);

console.log(`\nClient bundle (${clientFiles.length} files)`);
assertMarkerPresent(clientFiles, deliveryPrefix, "delivery operation prefix", "client");
assertMarkerPresent(clientFiles, healthRationale, "health registration rationale", "client");

console.log(`\nServer bundle (${serverFiles.length} files)`);
assertMarkerPresent(serverFiles, deliveryPrefix, "delivery operation prefix", "server");
assertMarkerPresent(serverFiles, healthRationale, "health registration rationale", "server");

console.log("");
if (failures > 0) {
  console.error(`Observability reachability FAILED (${failures} check(s)).`);
  process.exit(1);
}
console.log("Observability is reachable in both production bundles.");
