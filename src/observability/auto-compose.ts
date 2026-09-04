/**
 * Side-effect entry point: importing this module activates observability.
 *
 * Why this exists as its own file rather than a `composeObservability()` call at
 * the bottom of `src/akira-os/index.ts`, which is how `src/genesis/index.ts`
 * does the equivalent job:
 *
 * Calling an imported symbol at module scope from the AKIRA OS barrel makes
 * that symbol a live cross-chunk reference. `composition.ts` reaches
 * `globalEventBus`, which is also pulled in through the dynamically-imported
 * server chunk (`publisher.ts` -> `import("./server/index")`), and rolldown
 * panics computing the cross-chunk link -- "Symbol \"initializeObservability\"
 * ... should belong to a chunk". It is a bundler bug, and it reports itself as
 * one, but it fails the production build.
 *
 * A bare `import "./auto-compose"` imports no binding, so there is no symbol to
 * place and the panic does not arise. The behaviour is identical: the module
 * runs once, on first import, and composition is idempotent regardless.
 */

import { initializeObservability } from "./composition";

initializeObservability();
