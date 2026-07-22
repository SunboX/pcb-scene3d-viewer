# pcb-scene3d-viewer 1.3.1

Version 1.3.1 renders source-classified via solder mask as a surface treatment
without replacing the plated copper barrel material.

## Via rendering

- Gerber vias with either `isTentingTop` or `isTentingBottom` use the covered
  via rendering path; both fields explicitly false retain the exposed path.
- Each tented board surface receives its own solder-mask ring above the copper
  annulus. Mixed top/bottom tenting is preserved.
- The mask ring keeps the authored drill opening clear and leaves the plated
  through-hole wall copper-colored.
- Blind and buried surface reachability remains authoritative, so mask geometry
  is added only where a via actually reaches the corresponding board surface.

## Compatibility and verification

- Existing CircuitJSON default-tenting and explicit-opening behavior is
  unchanged.
- Scene, controller, runtime, export, and package entrypoints are unchanged.
- Tests cover fully tented, mixed, and fully open Gerber classification plus
  copper-barrel and one-sided mask-ring material routing.
