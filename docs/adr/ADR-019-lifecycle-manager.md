# ADR-019: Centralized Lifecycle Manager

## Status
Accepted

## Context
In previous sprints, the `RuntimeManager` directly mutated module state. As the platform runtime scales, state transitions (loading, starting, pausing, stopping, and handling timeouts/exceptions) introduce complex side-effects, resource cleanups, event reporting, and policy execution. Coupling state mutations inside `RuntimeManager` makes it difficult to maintain and enforce state machine consistency.

We need a centralized lifecycle engine that isolates transition rules and executes lifecycle routines independently.

## Decision
We will introduce a dedicated `LifecycleManager` to execute all module state changes.

Key decisions:
1. **Centralized Ownership**: `LifecycleManager` is the single authority responsible for mutating `ModuleState`. No other class may directly alter state variables. `RuntimeManager` orchestrates high-level system flows, delegating all state executions to the `LifecycleManager`.
2. **Transition Validation**: Every state change must run through a validation check. Attempting an illegal transition (e.g. `UNLOADED -> RUNNING`) throws a typed `LifecycleTransitionError`.
3. **Graceful Rollback**: If a startup sequence of multiple modules fails midway, the manager triggers a rollback, stopping and unloading only the modules started *during that specific boot sequence* in reverse order, leaving previously active modules unaffected.
4. **Time-bounded Execution (Timeouts)**: Transitions execute within configurable timeout limits to prevent hung modules from locking up the platform. If a timeout is exceeded, the module is marked `FAILED` and cleans up to `UNLOADED`.
5. **Event Emission**: All successful and failed transitions are published through the central `EventBus` to support diagnostics, metric collection, and real-time logging.
6. **Failure Policy Abstraction**: Support pluggable startup policies (`StrictPolicy`, `ContinueOnFailurePolicy`) allowing developers to customize how the boot engine handles module failures.

## Consequences
* **Decoupling**: Centralizing lifecycle rules separates business coordination (`RuntimeManager`) from the raw state machine execution.
* **Deterministic Stability**: The state of the entire platform remains robust, with rollback routines ensuring clean state states during boot failures.
* **Observer Extensibility**: Interceptor hooks allow observer registries to react to transitions cleanly without polluting state transitions.

## Future Extensibility
* **Diagnostics & Analytics**: Standardized lifecycle events enable a core diagnostics module to build active module health maps and record uptime performance.
* **Capability Resolution**: The resolver and lifecycle manager will coordinate to dynamically pause and reload modules when abstract capability requirements change.
* **Sandbox & Permissions**: Sandboxed modules can be initialized within restricted permission contexts prior to transition to the `RUNNING` state.
