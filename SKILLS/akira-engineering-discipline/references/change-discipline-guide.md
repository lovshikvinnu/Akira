# Change Discipline & Anti-Refactoring Guide

This guide provides concrete rules for maintaining high engineering discipline and producing minimal, reviewable, non-destructive changes in AKIRA.

---

## 1. The Evidence-First Standard

> **"Existing validated behavior is presumed intentional until evidence shows otherwise."**

### Requirements for Changing Existing Code:
1. **Never Assume Defect Without Reproduction:**
   - If existing code appears redundant, unusually structured, or verbose, do not replace it on aesthetic grounds.
   - It often accounts for subtle edge cases, historical integration quirks, or specific platform constraints.
2. **Documenting Evidence:**
   - Before modifying or replacing non-trivial logic, cite concrete evidence (e.g., a failing test case, specific error trace, or reproduction input).
3. **Targeted Repair over Wholesale Replacement:**
   - Fix the specific branch or edge-case handling rather than rewriting the surrounding component or module.

---

## 2. Minimal-Diff Engineering Checklist

Before finalizing any commit or reporting completion, review the proposed diff against this checklist:

### Pre-Edit Checklist:
- [ ] Have I produced a concise plan stating exactly which files need modification?
- [ ] Have I searched for existing components/utilities to avoid reinventing them?
- [ ] Is the proposed change scoped strictly to the requested feature or fix?

### Post-Edit Diff Review Checklist:
- [ ] **Zero Unrelated Cleanups:** Did I leave untouched lines, helper functions, and adjacent components clean and un-modified?
- [ ] **Zero Formatting Churn:** Did I avoid re-formatting entire files with different prettier/linter configurations?
- [ ] **Zero Gratuitous Renaming:** Are existing variable names, prop names, and interfaces preserved unless renaming was the explicit task?
- [ ] **Preserved Legacy Comments & Annotations:** Did I preserve existing comments, docstrings, and type definitions?
- [ ] **No Unnecessary Dependencies:** Did I solve the problem using standard platform capabilities and existing packages rather than adding new `npm` packages?
- [ ] **No Dead Code Left Behind:** If an edit replaced a specific helper branch, is the diff clean with no orphaned commented-out blocks?

---

## 3. Anti-Patterns & Refactoring Defenses

| Anti-Pattern | Why It Is Dangerous | Required Disciplined Alternative |
|---|---|---|
| **The "Drive-by Cleanup"** (reformatting or renaming untouched code in the same file) | Obscures meaningful changes in git blame, introduces merge conflicts, and risks silent regressions. | Touch only the specific lines required for the functional change. |
| **The "Aesthetic Rewrite"** (replacing a working multi-step algorithm with a clever single-liner) | Often drops edge-case handling that was discovered and fixed in prior iterations. | Keep the validated implementation; patch only the defective condition with regression tests. |
| **The "Speculative Generalization"** (extracting single-use logic into a reusable generic library) | Increases cognitive load and creates unneeded abstractions before requirements are proven. | Keep logic local until multiple distinct modules demonstrably require the same abstraction. |
| **"Green Tests Equal Success"** | Unit tests only test what they assert. They cannot verify whether unstated architectural boundaries or UX flows were broken. | Combine unit tests with diff reviews and architectural verification checks. |
