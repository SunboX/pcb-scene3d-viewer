# pcb-scene3d-viewer 1.3.2

Version 1.3.2 adds persistent self-adjusting visibility propagation and fixes
several general copper, via, and solder-mask interactions. The changes derive
from scene topology and authored surface state rather than source filenames or
project-specific rules.

## Incremental visibility

- `PcbScene3dVisibilityGraph` applies render-group visibility and component
  visibility as two ordered computations backed by the canonical
  `SelfAdjustingComputation` runtime from `circuitjson-toolkit` 1.4.1.
- Known toggle paths repair only render-group effects. Selection,
  hidden-component, and identity-stable map/set mutations advance an explicit
  component revision and repair only component effects.
- Unknown topology changes conservatively repair both stages, and runtime
  disposal explicitly reclaims retained traces and reverse-reader edges.
- The package root and `/scene3d` entrypoint export both the canonical runtime
  identity and the visibility graph.

## Copper and mask correctness

- Tented via faces no longer carry exposed copper geometry through the rendered
  solder-mask surface. Fully open vias keep their full span, one-sided tenting
  retains only the exposed half, and fully tented vias retain mask treatment
  without a visible face-spanning copper annulus.
- Filtered tented vias still participate in plated-hole identity checks, so a
  matching through-hole pad cannot create a duplicate copper barrel.
- Copper-fill clipping with partial subdivision disabled returns as soon as an
  uncovered sample proves that a triangle must be kept, while fully sampled
  triangles still use exact boundary crossing checks.

## Verification

- Tests cover stage-level recomputation, conservative invalidation,
  from-scratch visibility consistency, one- and two-sided tenting, duplicate
  barrel prevention, and non-subdividing fill overlap behavior.
- Release gates include the complete package suite, exact-geometry and context
  asset benchmarks, formatting, and npm package dry run.
