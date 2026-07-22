# Library Scope

`pcb-scene3d-viewer` owns reusable browser-side 3D rendering for normalized PCB
scene descriptions.

## In Scope

- Three.js runtime orchestration for PCB scenes.
- Board, copper, via, drill, silkscreen, solder-mask, and fallback package mesh
  factories.
- STEP/STP, WRL/VRML, 3MF, GLB/GLTF, STL, and OBJ model loading and placement
  from canonical bytes, session files, or explicitly enabled URLs.
- Camera presets, view compensation, selection styling, picking, and visibility
  toggles.
- Ordered self-adjusting render-group and per-component visibility propagation
  backed by the canonical `circuitjson-toolkit` runtime.
- Optional DOM shell/controller helpers for hosts that want ready-made scene
  chrome.
- ZIP export of resolved component model assets.
- Self-contained raw model bundle export with safe relative GLTF, OBJ, and WRL
  companions.
- CSS for the optional scene shell.
- Direct common CircuitJSON document, prepared context, and element-array
  adaptation with shared index reuse.
- Direct canonical CAD `model_asset` and document/session asset resolution.
- Explicit origin-aware and bounded network model loading.

## Out of Scope

- Parsing Altium, KiCad, Gerber, or other ECAD source files.
- Building format-specific 3D scene descriptions from source documents.
- Host application state, routing, file pickers, drag/drop handling, analytics,
  localization storage, or app navigation.
- Server-side upload behavior or host-owned URL authorization/proxy policy.

## Host Contract

Hosts provide either:

- a common CircuitJSON `DocumentResult`, prepared context, or element array;
- a prepared scene description through `sceneDescription`;
- a `scenePrepClient` with `prepareScene(documentModel, sessionAssets)`; or
- `buildScene(documentModel, { modelRegistry })` plus an optional
  `createModelRegistry(documentModel, sessionAssets)`.

The viewer treats all scene descriptions and model payloads as untrusted input.
