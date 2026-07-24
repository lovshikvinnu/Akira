# AKIRA Platform SDK

## Philosophy
The Platform SDK is the **only** public interface that AKIRA modules may use to interact with the operating system. It sits on top of the stable Runtime and provides a thin, versioned abstraction layer. All business‑logic lives in the Runtime; the SDK simply enforces permissions, validates input, delegates to runtime services, and translates errors.

## Public API Overview
| Service | Exported API | Key Methods |
|---------|--------------|-------------|
| Workspace | `akira.workspace` | `read(...): Promise<any>`<br>`write(...): Promise<any>` |
| Storage   | `akira.storage`   | `get(key: string): Promise<any>`<br>`set(key: string, value: any): Promise<void>`<br>`delete(key: string): Promise<void>` |
| Timeline  | `akira.timeline`  | `append(event: any): Promise<void>`<br>`query(...): Promise<any>` |
| Analytics | `akira.analytics` | `track(eventName: string, payload?: any): Promise<void>` |
| Memory    | `akira.memory`    | `read(key: string): Promise<any>`<br>`write(key: string, value: any): Promise<void>` |
| Search    | `akira.search`    | `query(...): Promise<any>` |
| Notifications | `akira.notifications` | `send(...): Promise<any>` |
| Events    | `akira.events`    | `publish(eventName: string, payload?: any): Promise<void>`<br>`subscribe(eventName: string, handler: (...args) => void): Promise<any>` |

All APIs are **thin wrappers** – they perform:
1. Permission enforcement via `PermissionManager.require()`.
2. Minimal input validation (type‑safety is provided by TypeScript).
3. Delegation to the corresponding runtime service.
4. Error translation into SDK‑specific error types.

## Initialization
```ts
import { AkiraSDK } from './sdk';
import { SDKContext } from './sdk/core/sdk-context';

// The Runtime constructs the context and passes it to the SDK.
const context: SDKContext = runtime.createSDKContext();
const akira = new AkiraSDK(context);
```
The SDK validates version compatibility during construction and throws `SDKVersionMismatchError` if the Runtime version does not match `SDK_VERSION`.

## Permission Model
Every SDK call implicitly checks the required permission before delegating. Permissions are defined as simple strings, e.g. `"storage.read"`, `"workspace.write"`. Modules never call `PermissionManager` directly; the SDK does it automatically.

## Error Handling
All runtime exceptions are caught and re‑thrown as one of the following SDK errors:
- `SDKError` – base class.
- `PermissionRequiredError` – when a permission check fails.
- `SDKVersionMismatchError` – version incompatibility.
- `UnsupportedFeatureError` – for APIs not available in the current SDK version.

## Testing Strategy
Unit tests are placed under `tests/sdk/`. They cover:
- SDK initialization & version compatibility.
- Wrapper methods delegating correctly.
- Automatic permission enforcement.
- Proper translation of runtime errors.
The goal is **100 % public SDK coverage**.

## Extension Guidelines
1. **Never import runtime internals** in new SDK files.
2. Add a new wrapper class under `src/sdk/<feature>/` that implements the thin‑wrapper pattern.
3. Register the wrapper in `src/sdk/core/akira-sdk.ts` and expose it via a getter.
4. Add corresponding unit tests.
5. Update `SDK.md` with the new API documentation.

---
*© 2026 AKIRA Team – Platform SDK v1.0.0*
