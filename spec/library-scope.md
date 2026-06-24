# Library Scope

`pcb-scene3d-viewer` owns reusable browser-side 3D rendering for normalized PCB
scene descriptions.

## In Scope

- Three.js runtime orchestration for PCB scenes.
- Board, copper, via, drill, silkscreen, solder-mask, and fallback package mesh
  factories.
- STEP, WRL, GLB, GLTF, STL, and OBJ model loading and placement.
- Camera presets, view compensation, selection styling, picking, and visibility
  toggles.
- Optional DOM shell/controller helpers for hosts that want ready-made scene
  chrome.
- ZIP export of resolved component model assets.
- CSS for the optional scene shell.

## Out of Scope

- Parsing Altium, KiCad, Gerber, or other ECAD source files.
- Building format-specific 3D scene descriptions from source documents.
- Host application state, routing, file pickers, drag/drop handling, analytics,
  localization storage, or app navigation.
- Server-side upload or network fetch behavior.

## Host Contract

Hosts provide either:

- a prepared scene description through `sceneDescription`;
- a `scenePrepClient` with `prepareScene(documentModel, sessionAssets)`; or
- `buildScene(documentModel, { modelRegistry })` plus an optional
  `createModelRegistry(documentModel, sessionAssets)`.

The viewer treats all scene descriptions and model payloads as untrusted input.
