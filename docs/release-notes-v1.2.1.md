<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# PCB Scene3D Viewer 1.2.1

Version 1.2.1 removes the host-specific OCCT integration layer and consumes the
installed importer package directly.

## Compatibility changes

- Requires `@sunbox/occt-import-js ^0.0.28`.
- STEP workers now load from the scoped package path
  `/node_modules/@sunbox/occt-import-js/dist/occt-import-js-worker.js`.
- The no-worker path dynamically imports the package ESM factory and resolves
  its WASM through the same package directory.
- Classic script injection, global `occtimportjs` lookup, unscoped package
  aliases, and app-vendored importer paths are no longer used.
- The package worker stays persistent across imports and failed model or worker
  requests remain retryable through the existing cache/reset behavior.
- Byte-backed model inputs are copied into loader ownership before worker
  transfer, so the caller's typed arrays and buffers are never detached.
- Rejected no-worker ESM initialization attempts are evicted, allowing a later
  load to recover from transient module or WASM delivery failures.

Hosts serving browser dependencies must expose the installed package `dist/`
directory byte-for-byte at
`/node_modules/@sunbox/occt-import-js/dist/`. No copied JavaScript, WASM, or
custom worker is required.

## Performance

The viewer consumes the optimized 0.0.28 importer build and continues to retain
typed mesh arrays, compact face-color runs, persistent worker reuse, and parsed
model caching. This avoids script duplication and keeps large STEP payloads off
the main browser thread when workers are available.
