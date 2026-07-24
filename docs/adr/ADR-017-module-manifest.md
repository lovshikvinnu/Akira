# ADR-017: Module Manifest System

## Status
Accepted

## Context
In Sprint 1.1, we implemented the Module Runtime Core, allowing dynamic loading and lifecycle orchestration. However, the runtime lacked any metadata about modules prior to importing them. It had to execute module code (source files) to know its name, version, or hooks. This design is highly coupled, presents security risks (executing unverified code), and fails to check version constraints, dependencies, or routing collisions before source code is evaluated.

To establish a contract between modules and the host platform, we need a self-describing, declarative manifest format that can be parsed and validated prior to code execution.

## Decision
We will enforce a standardized **Module Manifest System** for all AKIRA OS modules.

Key decisions:
1. **Self-Describing Declarations**: Modules must package a `manifest.yaml` or `manifest.json` file in their root folder declaring metadata, routes, capability claims, events, and entry-points.
2. **Pre-Load Parsing & Validation**: The `RuntimeManager` will discover, read, and validate the manifest file *before* dynamic import executes. If validation fails (e.g. invalid version, duplicate routes, unknown keys), the module is rejected and marked `FAILED` immediately, without importing any source files.
3. **Strict Validation Schemas**: Use strict Zod schemas matching exact properties, rejecting unrecognized options to prevent silent bugs, typos, and schema creep.
4. **Platform Registry Checks**: Manifest validation checks against duplicate module IDs, duplicate capability claims, and duplicate route mappings across all running instances to guarantee resource safety.
5. **No External Parsers**: The manifest system will utilize native JSON parsing and a custom, lightweight, zero-dependency YAML parser. This ensures fast platform boot speeds and conforms to the core principle of minimizing unnecessary external dependencies.

## Consequences
* **Decoupled Discovery**: The platform can inspect, list, install, and disable modules by reading static manifest text files, avoiding code execution overhead.
* **Deterministic Security**: The runtime can block invalid, incompatible, or duplicate modules safely during the validation phase before execution starts.
* **Increased System Resilience**: Typos or outdated configuration details in a manifest are surfaced instantly as custom validation errors (`MissingFieldError`, `InvalidVersionError`, `UnknownPropertyError`).

## Future Extensibility
Establishing a declarative manifest allows seamless integration with:
* **Dependency Resolution**: Topologically sorting modules during boot based on their manifest `dependencies` list.
* **Capability Registry**: Mapping declared `capabilities` to resolve services dynamically across modules.
* **Permission Framework**: Enforcing sandbox security based on manifest-declared `permissions`.
* **SDK Versioning**: Verifying that the manifest `sdkVersion` matches the platform range prior to startup.
* **Marketplace & Installation**: Verifying package integrity and compatibility during remote downloads.
