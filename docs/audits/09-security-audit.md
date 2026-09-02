# 09 — Security Audit

**Threat model.** AKIRA is a local-first, single-user desktop application: a TanStack Start server bound to localhost, a SQLite file under `%APPDATA%\AKIRA`, a vault directory beside it, and a browser client. Relevant adversaries are therefore: (a) another local process or local user account, (b) a web page in the user's browser reaching localhost, (c) a third-party module loaded through the Platform Runtime, (d) anyone who obtains a built client bundle.

Findings are limited to those with a concrete code location and a realistic path. Two theoretical issues that were probed and **found not to be exploitable** are recorded at the end, so the negative result is on record.

---

## SEC-001 — HIGH — Module loading is unsandboxed code execution, and `manifest.startup` escapes the module directory

**Location:** `src/runtime/module-loader.ts:70-97`

```ts
if (fileStat?.isDirectory()) {
  if (resolvedManifest && resolvedManifest.startup) {
    entryFile = path.isAbsolute(resolvedManifest.startup)
      ? resolvedManifest.startup                                  // ← absolute path honoured verbatim
      : path.join(normalizedPath, resolvedManifest.startup);      // ← relative, never confined
  }
}
const importTarget = `file:///${entryFile.replace(/\\/g, "/")}`;
moduleExports = await import(importTarget);                        // ← full Node privileges
```

**Attack path (adversary c):**
1. The user installs a third-party module — the stated purpose of the Manifest System, Dependency Resolver and Capability Registry (ADR-016…ADR-020).
2. `ManifestLoader.discover(modulesDir)` finds `modules/innocuous-theme/manifest.yaml`.
3. That manifest declares `startup: C:\Users\<user>\AppData\Roaming\AKIRA\payload.js`, or `startup: ../../../../payload.js`. `ModuleManifestSchema` types `startup` as `z.string().optional()` — no path validation, no confinement check.
4. `ModuleLoader.load` resolves it and `await import()`s it in-process. The module then has `fs`, `child_process`, the SQLite connection singleton, and the user's API keys.

**Missing controls, all absent:**
- No confinement of `entryFile` to `normalizedPath` (a `path.relative(...).startsWith("..")` check would suffice).
- No allowlist of module directories.
- No signature, hash, or integrity verification.
- No VM, worker, or `permissions`-restricted execution context.
- No capability gating — see SEC-005.
- `path.normalize` is applied to `modulePath` but not to the manifest-derived `entryFile`.

**Realism caveat:** no module-installation UI exists today and `ModuleLoader` has no production call site (BND-007), so this is currently **unreachable**. It is nevertheless a HIGH finding because the module system is the declared foundation for TITAN, FORGE and third-party modules, and shipping it in this state is the intended next step.

---

## SEC-002 — HIGH — Provider API keys are inlined into the client bundle and stored in plaintext

Two independent exposures.

### (a) `VITE_*` environment variables are compiled into the browser bundle

**Location:** `src/genesis/context/ai/provider-manager.ts:266-274`
```ts
getApiKey(provider: string): string {
  if (this.keys[provider]) return this.keys[provider];
  if (provider === "Gemini")     return (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
  if (provider === "OpenRouter") return (import.meta.env.VITE_OPENROUTER_API_KEY as string) || "";
  return "";
}
```

Vite statically replaces every `import.meta.env.VITE_*` reference with a literal at build time and ships it to the browser — this is documented Vite behaviour and the reason for the `VITE_` prefix convention. `provider-manager.ts` is client code (it guards on `typeof window`, subscribes React listeners, and is exported through `src/genesis/index.ts` into the client hydration graph, BND-003).

**Attack path (adversary d):** anyone who loads the app — or obtains a built bundle — opens devtools, searches the JS for `AIza` or `sk-or-`, and has a working billable API key. No authentication is required because the key is in the served asset.

**Aggravating detail:** there is no `.env.example` and `.gitignore` covers `.env` / `.env.*`, so there is no documented guidance steering a developer away from setting these at build time.

### (b) Keys are persisted in plaintext in the SQLite `settings` table

**Location:** `src/genesis/context/ai/provider-manager.ts:212, 231`
```ts
const nextKeysStr = JSON.stringify(this.keys);       // { "Gemini": "AIza…", "OpenRouter": "sk-or-…" }
…
await settingsService.set("akira:ai:keys", nextKeysStr);
```

**Attack path (adversary a):** any process running as the user reads `%APPDATA%\AKIRA\akira.db` (a plain file, no encryption, `journal_mode = WAL`) and runs `SELECT value FROM settings WHERE key = 'akira:ai:keys'`. No OS keychain (DPAPI / Credential Manager on Windows), no encryption at rest, no key derivation.

### (c) Gemini keys travel in the URL query string

`src/genesis/context/ai/providers/gemini-provider.ts:104, 249`
```ts
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
```
The provider's API requires this form, but combined with client-side execution the key lands in browser history, `Referer` headers on any redirect, and any intercepting proxy's access log. A server-side proxy RPC — which this codebase already has the machinery for (53 `createServerFn` handlers) — would eliminate both (a) and (c).

**Architectural note:** all AI calls are made with `fetch` directly from the browser to the third-party provider. This is the one place where the otherwise-consistent client/server split is abandoned, and it is the place where it matters most.

---

## SEC-003 — MEDIUM — `resolveSafePath` prefix check permits escape into sibling directories (CONFIRMED by probe)

**Location:** `src/akira-os/vault/VaultValidationService.ts:24-31`
```ts
resolveSafePath(relativePath: string): string {
  const root = getVaultRoot();
  const resolved = path.resolve(path.join(root, relativePath));
  if (!resolved.startsWith(root)) {                    // ← string prefix, not path prefix
    throw new Error("Security Violation: Access denied outside the Vault boundary.");
  }
  return resolved;
}
```

**Probe result** (executed in an isolated throwaway test, since removed; no production code was modified):

```
ROOT: …\AKIRA\AuditVault
INPUT: ../AuditVault_secrets/keys.txt  => ALLOWED: …\AKIRA\AuditVault_secrets\keys.txt   ← ESCAPED
INPUT: ../../invalid/secret.db         => BLOCKED
INPUT: sub/../ok.txt                   => ALLOWED: …\AKIRA\AuditVault\ok.txt              (correct)
```

Because `…\AuditVault_secrets\…` string-starts-with `…\AuditVault`, the guard passes. Any sibling path whose name extends the vault root's name is reachable. The correct predicate is `resolved === root || resolved.startsWith(root + path.sep)`.

**Attack path (adversaries a, b):** `resolveSafePath` is called with a database-sourced `file.storagePath` at 6 sites and with an RPC-derived value inside `uploadFile`. Its inputs are not currently attacker-chosen from the network, so exploitation requires first writing a crafted `storage_path` — which is reachable given that `persistRenameFile` / `persistMoveFile` / the migration RPC all have identity validators (SEC-004). Then `getRawFileBase64Rpc` returns the file's bytes base64-encoded, and `permanentDeleteFile` unlinks it.

**Severity rationale:** the guard is correct for the common `../../` case, the vault root sits in a per-user directory, and a two-step precondition is needed. But this is a security control that does not do what it says, it is called on every file read/move/delete, and `src/akira-os/vault/vault.test.ts:128` tests only the `../../` case — so the gap is invisible to the suite.

**Also in this file:** `sanitizeFilename` (`path.basename` + `replace(/[\\/:*?"<>|]/g, "_")`) correctly strips separators, but does not reject Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) or trailing dots/spaces. Low impact — these become file names, not devices, when combined with a full path — but worth noting.

---

## SEC-004 — MEDIUM — 40 of 41 RPC endpoints accept unvalidated input, and none are authenticated

**Evidence:** see PLT-001. `grep ".validator(" | wc -l` → 41; those containing `z.` → 1.

**Attack path (adversary b — a web page in the user's browser):** `createServerFn` handlers are HTTP endpoints on the dev/preview server. A page the user visits can attempt a cross-origin `fetch` or a form POST to `http://localhost:<port>/_serverFn/...`. There is no CSRF token, no `Origin`/`Host` allowlist, no `SameSite` protection (the endpoints are not cookie-authenticated — they are simply unauthenticated), and no per-request authorization. `src/server.ts` adds no origin checks.

Reachable operations include `persistDeleteFile`, `persistPermanentDeleteFile`, `persistDeleteFolder`, `persistClearSearchHistory`, `getRawFileBase64Rpc` (exfiltrates any vault file as base64), `persistSetSetting` (arbitrary key/value into the settings table), and `migrateLegacyState`.

**Severity rationale, honestly stated:** modern browsers block cross-origin *reads* by default, so `getRawFileBase64Rpc`'s response is unreadable to a plain cross-origin page — CORS protects confidentiality here. But CORS does not prevent the *request* from being sent, so the state-changing endpoints (delete file, purge folder, set setting) are exposed to a classic CSRF-style drive-by, and DNS-rebinding defeats the origin distinction entirely. That makes this a real MEDIUM, not a theoretical one.

**Cheapest mitigations, both absent:** validate `Origin`/`Host` in `src/server.ts`, and replace the 40 identity validators with `zod` schemas (`zod` is already a dependency; see DAT-009 for the `id` field trap that must be handled at the same time).

---

## SEC-005 — MEDIUM — The Permission Framework grants nothing and denies nothing

**Location:** `src/runtime/permissions/permission-manager.ts:37-43`
```ts
public require(permissionId: string): PermissionDescriptor {
  const perm = this.catalog.get(permissionId);
  if (!perm) throw new PermissionNotFoundError(permissionId);
  return perm;                       // "this permission exists" ≠ "you may use it"
}
```

There is no grant store, no per-module permission set, no `isGrantedTo(moduleId, permissionId)`, and no revocation. `ModuleContext` (`src/runtime/module-context.ts:29-34`) exposes `logger`, `eventBus`, `configuration`, `runtime` — and no permission object, so a module cannot check a permission even voluntarily.

`require()` has **zero production call sites** (`runtime-manager.ts` references `PermissionManager` only at lines 4, 29, 47 — import, field, construction).

**Attack path (adversary c):** a module declares `permissions: ["storage.read"]` in its manifest and then calls anything it likes. Nothing consults the declaration. Combined with SEC-001 (in-process `import()` with full Node privileges) there is no privilege boundary at all between a loaded module and the host.

**Where this compounds:** the SDK is the layer that is *supposed* to enforce this — `SDKContext.permissions.require(...)` is called before every delegation (16 sites). But `PermissionManager` is typed `unknown` in `sdk-context.ts` (DEP-006), the SDK is not wired to the runtime, and every failure is rewritten as `PermissionRequiredError` (DEP-005), so a genuine denial is indistinguishable from a disk error.

---

## SEC-006 — LOW — Developer mode is a client-side flag that only reveals diagnostics

`localStorage["akira:dev_mode"]` gates: the stack trace in the error boundary (`src/routes/__root.tsx:56`), the dev-mode toggle in settings (`src/routes/settings.tsx:48,85`), and `requiresDevMode` tools in the sidebar registry (per `ARCHITECTURE.md` §3.2).

Any script on the origin can set it. This is **not** a privilege-escalation path — the gated capabilities are diagnostic views and navigation entries, and every RPC behind them is already unauthenticated (SEC-004), so the flag grants nothing that is not otherwise reachable. Recorded for completeness: it is a UX affordance, not a security control, and should not be treated as one.

---

## SEC-007 — LOW — Dependency vulnerabilities: 4 high, 1 moderate, all in build tooling

`npm audit` result: `{ critical: 0, high: 4, moderate: 1, low: 0, total: 5 }`

| Severity | Package | Class | Reachable at runtime? |
| :--- | :--- | :--- | :--- |
| high | `brace-expansion` | DoS via unbounded expansion / intermediate arrays | No — transitive dev tooling (glob/eslint) |
| high | `browserslist` | Unbounded memory growth; crash via untrusted `browserslist-stats.json` | No — build-time only; no custom stats file in the repo |
| high | `js-yaml` | Quadratic CPU in `!!omap` resolution | No — **not** used by AKIRA; the module system deliberately uses its own parser (see PLT-021) |
| high | `nanoid` | Infinite loop when `size` is zero | No — no `nanoid` import in `src/`; AKIRA uses `crypto.randomUUID()` |
| moderate | `postcss` | Arbitrary `.map` read via attacker-controlled `sourceMappingURL` | No — build-time, CSS authored in-repo |

**Assessment:** none of these are in AKIRA's runtime dependency path, all are denial-of-service or build-time classes, and there is no untrusted input reaching any of them. This is a routine `npm update` hygiene item, not a security incident. Reported at LOW deliberately.

**Genuine supply-chain observations, separate from the audit numbers:**
- Runtime dependencies are conventional and few: `better-sqlite3`, `zod`, `react`, TanStack, Radix, `recharts`, `date-fns`. No obscure or unmaintained packages in the runtime path.
- `nitro@3.0.260603-beta` is a **beta** build tool pinned in `devDependencies`.
- `@lovable.dev/vite-tanstack-config@^2.6.2` is a third-party build plugin that controls the entire Vite pipeline (plugins, aliases, env injection, import protection) via a caret range. A compromised or changed minor version silently changes build semantics — and it is what disables `importProtection` (PLT-004).
- `package-lock.json` is committed (good), but there is no `npm ci` step anywhere because there is no CI (TST-001).

---

## Probed and found NOT exploitable

Recorded so the negative results are documented rather than left as open suspicions.

### Prototype pollution via the hand-rolled YAML manifest parser — **NOT exploitable**

`src/runtime/manifest/manifest-loader.ts:parseYaml` performs `currentContainer[key] = val` with `key` taken from untrusted file content, which is the classic pollution shape.

Probe input:
```yaml
__proto__:
  polluted: true
id: evil
```
Probe result: `Object.prototype.polluted === undefined` and `({}).polluted === undefined`.

Reason: assigning `obj["__proto__"] = {}` *replaces that object's own prototype* rather than creating an own property, so all subsequent nested writes land on the replacement object and are scoped to the parsed manifest. No global pollution occurs. The parser has a real defect (silent data loss — PLT-021) but not this one.

### Cross-origin read of vault file contents — **blocked by the browser**

`getRawFileBase64Rpc` returns file bytes with no authentication (SEC-004), but a cross-origin page cannot read the response body without permissive CORS headers, and none are set. The *request* still reaches the handler, which is why the state-changing endpoints remain a MEDIUM.

### SQL injection — **not found**

Every repository uses `better-sqlite3` prepared statements with `?` or `:named` bind parameters. `SqliteTimelineRepository.findPaged` builds its `IN (...)` clause by generating parameter *names* (`proj_0`, `proj_1`, …) and binding values separately — correct. `SqliteSearchRepository` passes the FTS5 query through a bound parameter. No string concatenation of user values into SQL was found anywhere in `src/`.

### Unsafe dynamic execution — **not found beyond SEC-001**

No `eval`, no `new Function`, no `child_process`, no `vm` usage in `src/`. The only dynamic execution is `await import()`: 40+ legitimate code-splitting/server-isolation sites, plus the one genuinely dangerous case in `ModuleLoader` (SEC-001).

### Secrets committed to the repository — **none found**

No `.env` files exist. `git ls-files` shows no key material. The tracked `temp_e2e_akira.db*` artefacts (DAT-011) were checked and contain only schema and test rows.

---

## Security posture summary

| Boundary | State |
| :--- | :--- |
| SQL injection | **Clean** — prepared statements throughout |
| Dynamic execution (`eval`/`Function`/`child_process`) | **Clean** — none present |
| Committed secrets | **Clean** — none |
| Prototype pollution | **Clean** — probed and disproven |
| Input validation at the RPC boundary | **Absent** (1 of 41) |
| RPC authentication / origin checking | **Absent** |
| Path confinement (vault) | **Present but incorrect** — prefix bypass confirmed |
| Secret storage at rest | **Plaintext SQLite; no OS keychain** |
| Secret exposure in client bundle | **`VITE_*` inlining ships keys to the browser** |
| Module sandboxing | **Absent** |
| Permission enforcement | **Absent** (catalog only) |
| Dependency hygiene | 5 advisories, all build-time, none reachable |
| File-type verification | **Good** — real magic-byte checks on upload |
| Content integrity | **Good** — SHA-256 stream hashing |
| Storage-layer constraints | **Good** — `CHECK`s, FKs, cascade rules |

**The two changes with the largest security return, in order:** move AI provider calls behind a server RPC so no key ever reaches the client bundle or a URL query string; and replace the 40 identity validators with `zod` schemas while adding an `Origin`/`Host` check in `src/server.ts`. Both use machinery the codebase already has.
