# Post-Trace Exact Rendering Acceleration Design

## Context

The July 10 post-change browser trace reaches the first base-board frame at
about 5.2 seconds, finishes deferred copper at about 11.2 seconds, and presents
the complete assembly at about 24.0 seconds. The STEP payload is already
downloaded at 1.2 seconds, but OCCT does not start until deferred copper has
finished. The copper task itself spends most of its 3.27 seconds repeatedly
scanning small prepared-polygon segment arrays.

The approved mode is aggressive exact optimization: rendered geometry,
placement, colors, selection behavior, diagnostics, readiness semantics, and
failure handling must remain unchanged.

## Approaches Considered

1. **Overlap independent work and adapt exact broad-phase queries (chosen).**
   Start external-model loading after the base graph exists, while surface
   artwork and copper continue on the main thread. Promote repeatedly queried
   small polygons from source-order linear scans to the existing exact AABB
   index. This directly addresses the measured critical path and copper stack
   without changing tessellation parameters or output.
2. **Persist imported STEP meshes.** An IndexedDB cache could remove most of
   the import time on repeat visits, but it does not improve a cold load and
   adds invalidation, storage, serialization, and quota behavior. It remains a
   separate follow-up.
3. **Rebuild OCCT for speed.** The current wrapper combines `-O3` with a
   trailing `-Oz`. A true `-O3` build may improve cold imports, but it requires
   a full WASM rebuild and exact mesh-output comparison. It remains an isolated
   experiment so it cannot delay the two trace-proven changes.

## Runtime Design

`PcbScene3dRuntime` will initiate `#loadExternalModels()` at the beginning of
the deferred-detail phase, after the initial base scene has rendered. It will
immediately attach both fulfillment and rejection handlers so an early failure
cannot become an unhandled rejection while copper occupies the main thread.
Surface artwork, copper construction, intermediate renders, and the existing
early readiness settlement continue in the same order. The runtime awaits the
captured model result at the current external-model integration point, reports
errors through the existing deferred-detail diagnostic path, and performs the
same final render.

This changes scheduling only. Model scene-graph mutation still resumes on the
main event loop, so it cannot interleave inside synchronous copper geometry
construction. Disposal checks remain at every existing stage, and the model
loader retains its existing `isDisposed` callback.

## Prepared-Polygon Design

Large polygons continue to use `PcbScene3dAabbIndex` immediately. Small
polygons continue with their allocation-free linear path for one-off queries,
but accumulate query work as `segment count * query count`. Once that work
reaches a small fixed construction budget, subsequent queries use the existing
lazy segment index. Promoted small-polygon queries request stable source order,
so candidate membership and ordering match the prior linear path.

The index continues to derive conservative tolerance-expanded envelopes from
the same epsilon formula. Degenerate segments, non-finite arithmetic, and
invalid query bounds remain all-space candidates. No source points or public
segment objects are mutated.

## Validation

- A focused runtime test will hold the model promise open and prove loading has
  started before deferred surface/copper work finishes, while readiness and
  final rendering retain their existing order.
- Prepared-polygon tests will prove promotion occurs only after repeated work
  and compare promoted candidates with the current conservative reference over
  finite, invalid, degenerate, and non-finite inputs.
- A synthetic benchmark will measure repeated queries against a generic
  repo-owned polygon; it will not contain supplied project or asset names.
- The complete viewer test suite and format check must pass.
- After local merge, ECAD Forge will receive the viewer source copy and the
  exact supplied URL will be profiled again. Success is measured against the
  trace's 3.27-second copper pass and 24.0-second final presentation, without
  visual or geometry differences.

