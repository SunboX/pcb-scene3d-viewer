# pcb-scene3d-viewer 1.3.0

This minor release consumes CircuitJSON Toolkit 1.2 directly and restores exact
PCB surface fidelity without source-format or host-app adapters.

## Rendering and API changes

- Oval, rounded-rectangle, pill, polygon, and independently rotated drilled
  pads keep their authored copper and drill geometry.
- Silkscreen strokes, fills, text dimensions, anchors, mirroring, source-layer
  mapping, and surface cutouts render from canonical CircuitJSON fields.
- Copper text participates in the same solder-mask and cutout pipeline as other
  copper detail.
- Blind and buried vias render only on the board surfaces reached by their
  explicit layer span.
- `PcbScene3dBoardMaterialPalette.resolveEdgeColor(board)` is now public on the
  `scene3d` subpath. Runtime and exported board edges share its authored-color
  lookup and light FR-4 fallback (`0xc9ca78`).

## Models and diagnostics

- Canonical and session CAD assets preserve exact case-sensitive project-path
  aliases. Case-insensitive fallback is accepted only when unique, preventing
  same-name and same-stem collisions across folders.
- Missing-model diagnostics are deferred until resolution has actually failed;
  retryable or externally supplied assets are not reported as unavailable
  prematurely.
- STEP, WRL, GLTF, and text/binary model payload handling avoids redundant
  copies and retains the existing opt-in network policy.

## Compatibility and performance

- The runtime baseline is `circuitjson-toolkit@^1.2.0`; the existing
  `@sunbox/occt-import-js@^0.0.28` WASM package remains compatible and does not
  require a coordinated rebuild.
- Existing scene descriptions, document envelopes, controller/runtime
  parameters, and return shapes remain accepted. The palette method and
  CircuitJSON fields above are additive.
