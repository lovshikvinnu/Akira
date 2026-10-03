#!/usr/bin/env python3
"""
AKIRA Boundary Verification Helper

A strictly mechanical checker for explicit, documented codebase invariants:
1. No `process.exit` invocations in application source files (allowed only in CLI entrypoints).
2. UI presentation components must not directly import raw persistence/database repositories.
3. Mechanical file path and change sanity checks.

This script does NOT infer undocumented architecture or act as an architectural authority.
"""

import sys
import os
import re
from pathlib import Path

# Paths where process.exit is explicitly allowed (CLI entrypoints, test runners, scripts)
ALLOWED_PROCESS_EXIT_DIRS = {"scripts", "tests", "bin"}
ALLOWED_PROCESS_EXIT_FILES = {"setup.ts", "vitest.config.ts", "vite.config.ts"}

# Patterns identifying UI presentation files
UI_FILE_PATTERNS = [
    re.compile(r"src[/\\].*[/\\ components[/\\].*\.(tsx|jsx)$"),
    re.compile(r"src[/\\].*[/\\ routes[/\\].*\.(tsx|jsx)$"),
    re.compile(r"src[/\\ app[/\\].*\.(tsx|jsx)$"),
]

# Patterns for forbidden runtime persistence imports in UI (ignoring pure type imports)
FORBIDDEN_PERSISTENCE_IMPORTS = [
    re.compile(r"^import\s+(?!type\b).*\bfrom\s+['\"].*repositories/.*['\"]"),
    re.compile(r"^import\s+(?!type\b).*\bfrom\s+['\"].*persistence/connection['\"]"),
    re.compile(r"^import\s+(?!type\b).*\bfrom\s+['\"].*Sqlite.*Repository['\"]"),
    re.compile(r"^import\s+(?!type\b).*\b(?:sqlite[A-Za-z0-9_]*Repository|getDatabaseConnection)\b"),
]

def is_ui_file(file_path: Path) -> bool:
    """Check if the given file path represents a UI presentation component."""
    path_str = str(file_path).replace("\\", "/")
    for pattern in UI_FILE_PATTERNS:
        if pattern.search(path_str):
            return True
    return False

def check_file_invariants(file_path: Path) -> list[str]:
    """Mechanically verify a single source file against boundary invariants."""
    violations = []
    
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return [f"Could not read {file_path}: {e}"]

    # 1. Check for process.exit() in application source code
    rel_path = file_path.as_posix()
    is_cli_or_script = (
        any(part in ALLOWED_PROCESS_EXIT_DIRS for part in file_path.parts) or
        file_path.name in ALLOWED_PROCESS_EXIT_FILES
    )
    
    if not is_cli_or_script and "src/" in rel_path:
        for idx, line in enumerate(content.splitlines(), start=1):
            # Check for uncommented process.exit
            stripped = line.strip()
            if not stripped.startswith("//") and not stripped.startswith("/*"):
                if re.search(r"\bprocess\.exit\s*\(", line):
                    violations.append(
                        f"[Rule: No process.exit] {file_path}:{idx} - Application source code must not call process.exit()"
                    )

    # 2. Check for direct persistence/repository imports in UI presentation files
    if is_ui_file(file_path):
        for idx, line in enumerate(content.splitlines(), start=1):
            stripped = line.strip()
            if not stripped.startswith("//") and not stripped.startswith("/*"):
                for pattern in FORBIDDEN_PERSISTENCE_IMPORTS:
                    if pattern.search(line):
                        violations.append(
                            f"[Rule: UI Isolation] {file_path}:{idx} - UI component imports persistence layer directly: {stripped}"
                        )
                        break

    return violations

def run_verification(target_dir: Path) -> tuple[bool, list[str]]:
    """Scan all source files in target directory for mechanical violations."""
    all_violations = []
    
    extensions = {".ts", ".tsx", ".js", ".jsx"}
    
    for root, dirs, files in os.walk(target_dir):
        # Exclude dependency and build directories
        dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", "dist", ".output", "build"}]
        for f in files:
            file_path = Path(root) / f
            if file_path.suffix in extensions:
                violations = check_file_invariants(file_path)
                all_violations.extend(violations)
                
    return len(all_violations) == 0, all_violations

def main():
    root_dir = Path.cwd()
    if len(sys.argv) > 1:
        root_dir = Path(sys.argv[1]).resolve()

    src_dir = root_dir / "src"
    target = src_dir if src_dir.exists() else root_dir

    print(f"[VERIFY] Checking mechanical invariants in: {target}")
    passed, violations = run_verification(target)

    if passed:
        print("[PASS] Architectural boundary invariants verified successfully (zero mechanical violations).")
        sys.exit(0)
    else:
        print(f"[FAIL] Found {len(violations)} mechanical boundary violation(s):")
        for v in violations:
            print(f"  * {v}")
        sys.exit(1)

if __name__ == "__main__":
    main()
