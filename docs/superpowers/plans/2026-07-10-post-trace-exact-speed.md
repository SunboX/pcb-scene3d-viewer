# Post-Trace Exact Rendering Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce exact cold 3D completion time by overlapping OCCT work with board detail and eliminating repeated small-polygon linear scans.

**Architecture:** Keep progressive rendering and geometry outputs unchanged. Change only scheduling in `PcbScene3dRuntime`, and reuse the existing `PcbScene3dAabbIndex` after a small polygon has demonstrated enough repeated query work to amortize construction.

**Tech Stack:** JavaScript ES modules, Node test runner, Three.js runtime, existing AABB index, OCCT web worker.

## Global Constraints

- Preserve exact candidate membership and source ordering for promoted small polygons.
- Preserve rendered geometry, placement, colors, diagnostics, readiness semantics, disposal behavior, and failure handling.
- Keep every source and test module under 1000 lines and add JSDoc for every new function or method.
- Use only generic repo-owned synthetic data in tests and benchmarks.
- Run repository-owned commands only: `npm test`, `npm run check:format`, and `npm run benchmark:exact-geometry`.

---

### Task 1: Adaptive exact prepared-polygon queries

**Files:**
- Modify: `src/PcbScene3dPreparedPolygon.mjs`
- Modify: `tests/pcb-scene3d-prepared-polygon.test.mjs`
- Modify: `scripts/benchmark-exact-geometry.mjs`

**Interfaces:**
- Consumes: `PcbScene3dAabbIndex.queryInto(bounds, target, { stable })` and the existing conservative segment-envelope resolver.
- Produces: unchanged `querySegments(bounds, target)` output with adaptive lazy index promotion.

- [ ] **Step 1: Write a failing promotion test**

  Import `PcbScene3dAabbIndex`, wrap its public `queryInto` method in a counting delegate, create a generic 32-segment polygon, and assert that the first query stays linear while repeated queries eventually invoke the index. Restore the original method in `finally`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test --test-name-pattern='promotes repeated small segment queries' tests/pcb-scene3d-prepared-polygon.test.mjs`

  Expected: FAIL because a polygon at or below the current 64-segment limit never constructs or queries an index.

- [ ] **Step 3: Add exact differential coverage**

  Generate deterministic finite queries plus missing/non-finite bounds and a polygon containing degenerate/non-finite segments. Compute the existing conservative expected candidates in source order and assert every post-promotion result is deeply equal.

- [ ] **Step 4: Implement minimal adaptive promotion**

  Add a private accumulated segment-query-work counter and a fixed construction budget. For small polygons, use the existing linear path until the next scan would meet the budget; then use `#resolveSegmentIndex().queryInto(bounds, target, { stable: true })`. Keep immediate indexed behavior unchanged for polygons above the linear limit.

- [ ] **Step 5: Verify GREEN and run the prepared-polygon suite**

  Run: `node --test tests/pcb-scene3d-prepared-polygon.test.mjs`

  Expected: all focused tests pass with no failures.

- [ ] **Step 6: Add and run a generic repeated-query benchmark case**

  Extend `scripts/benchmark-exact-geometry.mjs` with a 32- or 64-segment generic loop and deterministic query grid. Print elapsed time and candidate count so before/after commits can be compared while candidate totals remain identical.

  Run: `npm run benchmark:exact-geometry`

  Expected: the repeated-query case completes with the same candidate count and materially less time than the recorded pre-change run.

- [ ] **Step 7: Commit Task 1**

  Run: `git add src/PcbScene3dPreparedPolygon.mjs tests/pcb-scene3d-prepared-polygon.test.mjs scripts/benchmark-exact-geometry.mjs && git commit -m 'fix: adapt repeated exact polygon queries'`

### Task 2: Overlap external-model import with deferred detail

**Files:**
- Modify: `src/PcbScene3dRuntime.mjs`
- Create: `tests/pcb-scene3d-runtime-deferred-models.test.mjs`

**Interfaces:**
- Consumes: existing `#loadExternalModels()`, deferred surface/copper stages, render scheduling, disposal checks, and diagnostic hook.
- Produces: a handled external-model promise started at deferred-detail entry and consumed at the existing final integration point.

- [ ] **Step 1: Write a failing scheduling test**

  Build the existing fake runtime harness in a new sub-1000-line test module. Hold `PcbScene3dExternalModels.loadIntoScene` on a controllable promise, record ordered events from surface/copper builders and model loading, and assert model loading starts before either deferred builder completes.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node --test tests/pcb-scene3d-runtime-deferred-models.test.mjs`

  Expected: FAIL because current runtime starts external models after copper.

- [ ] **Step 3: Add lifecycle assertions**

  Assert readiness still settles after copper, model rejection reaches the existing deferred-detail diagnostic message without an unhandled rejection, disposal prevents the final render, and a successful model load still produces the final render.

- [ ] **Step 4: Implement minimal handled overlap**

  At deferred-detail entry, start `#loadExternalModels()` and convert fulfillment/rejection into a settled result object. Keep artwork, copper, readiness, and yields in their current order. At the existing model await point, await the settled result and rethrow a captured error into the existing catch before the final render.

- [ ] **Step 5: Verify GREEN and runtime suites**

  Run: `node --test tests/pcb-scene3d-runtime-deferred-models.test.mjs tests/pcb-scene3d-runtime-render-scheduling.test.mjs tests/pcb-scene3d-runtime-static-bodies.test.mjs tests/pcb-scene3d-runtime.test.mjs`

  Expected: all focused tests pass with no failures.

- [ ] **Step 6: Commit Task 2**

  Run: `git add src/PcbScene3dRuntime.mjs tests/pcb-scene3d-runtime-deferred-models.test.mjs && git commit -m 'fix: overlap model import with board detail'`

### Task 3: Integrate and profile

**Files:**
- Verify: all viewer source and tests
- Copy after merge: viewer `src/` into ECAD Forge `node_modules/pcb-scene3d-viewer/src/`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: reviewed local `main` and an ECAD Forge server using the exact local viewer source.

- [ ] **Step 1: Run full verification**

  Run: `npm test && npm run check:format && npm run benchmark:exact-geometry`

  Expected: zero test/format failures and benchmark output with stable candidate totals.

- [ ] **Step 2: Review the complete branch diff**

  Compare the branch with its merge base, verify the two changes remain output-exact, and resolve every important review finding before integration.

- [ ] **Step 3: Fast-forward local viewer main**

  Run the repository's established local fast-forward merge workflow after review and verification.

- [ ] **Step 4: Copy the local library into ECAD Forge**

  Replace only the installed viewer package source/manifest from local viewer `main`, then byte-compare the copied files.

- [ ] **Step 5: Profile the exact supplied URL**

  Load the exact URL through the existing port-3000 server, capture the final visual state and performance timings, and compare copper completion and final presentation with 3.27 seconds and 24.0 seconds respectively.

