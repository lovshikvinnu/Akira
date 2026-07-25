// scripts/migrate-runall.ts
// Utility script that removes legacy `runAll()` test‑runner blocks and any stray `process.exit` calls
// from all test files under ./src. It is safe to run multiple times – after the first run the
// files become plain Vitest tests.

import { promises as fs } from "fs";
import * as path from "path";

// Recursively collect files under a directory that match a predicate.
async function collectFiles(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, predicate)));
    } else if (predicate(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function cleanContent(content: string): string {
  // Remove the whole async function runAll block (including its braces)
  const runAllBlock = /async\s+function\s+runAll\s*\([^)]*\)\s*{[\s\S]*?^}/m;
  let newContent = content.replace(runAllBlock, "");
  // Remove a stray `runAll();` call on its own line
  newContent = newContent.replace(/^\s*runAll\s*\(\s*\)\s*;\s*$/gm, "");
  // Comment out any remaining process.exit calls (should be none after the block removal)
  newContent = newContent.replace(/process\.exit\s*\(/g, "// process.exit(");
  return newContent;
}

async function main() {
  const testFiles = await collectFiles(path.resolve("src"), (name) =>
    /\.test\.[tj]sx?$/.test(name),
  );
  console.log(`Found ${testFiles.length} test files`);
  for (const file of testFiles) {
    const original = await fs.readFile(file, "utf8");
    const cleaned = cleanContent(original);
    if (cleaned !== original) {
      await fs.writeFile(file, cleaned, "utf8");
      console.log(`✅ Updated ${file}`);
    }
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
