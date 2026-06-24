# API

The package exports all public APIs from `pcb-scene3d-viewer` and
`pcb-scene3d-viewer/scene3d`.

## Rendering Shell

### `PcbScene3dShellRenderer.render(documentModel, translate?)`

Returns HTML markup for the optional interactive 3D scene shell.

The markup includes:

- `[data-scene-3d-viewport]` canvas mount;
- `[data-scene-3d-loading]` loading overlay;
- `[data-scene-3d-preset]` camera preset buttons;
- `[data-scene-3d-toggle]` visibility toggles;
- `[data-scene-3d-export="models-zip"]` model export action.
- `[data-scene-3d-adjustment]` transform inputs rendered after a component is
  selected.

`translate` is an optional `(key) => string` function. Built-in English
fallbacks are used when no translator is provided.

## Controller

### `new PcbScene3dController(viewportNode, documentModel, options?)`

Wires the optional DOM shell to a `PcbScene3dRuntime`.

Important options:

- `sceneDescription`: already-prepared scene description.
- `scenePrepClient`: object with `prepareScene(documentModel, sessionAssets)`.
- `buildScene`: function that returns a scene description.
- `createModelRegistry`: optional function passed into `buildScene`.
- `createRuntime`: optional runtime factory for tests or custom hosts.
- `sessionAssets`: companion model assets passed to scene preparation.
- `setLoadingVisible`: callback for shell loading state.
- `onComponentSelectionChange`: callback for 3D picks.
- `translate`: optional `(key) => string` translation function.

Methods:

- `getDocumentModel()`: returns the mounted document model.
- `setSelectedComponent(componentKey)`: highlights and inspects a component.
- `dispose()`: releases event listeners, worker clients, and runtime resources.

When a component is selected, the controller renders live scale, rotation, and
offset controls in the inspector. Edits are kept in memory for the mounted
controller only and are forwarded to the runtime through
`setComponentAdjustment()`.

## CircuitJSON Input

### `PcbScene3dCircuitJsonAdapter`

Converts serialized CircuitJSON element arrays into the normalized scene
description consumed by the runtime.

Methods:

- `isCircuitJsonModel(value)`: returns true for serialized CircuitJSON arrays.
- `isDirectCircuitJsonModel(value)`: returns true when the array should bypass
  host `buildScene` callbacks.
- `build(circuitJson, options?)`: returns a runtime-ready scene description.
  `options.modelUrlResolver` can attach caller-owned URL resolution metadata to
  `cad_component` external models without fetching them.

`PcbScene3dController` and `PcbScene3dRuntime` call this adapter automatically
when they receive direct CircuitJSON input. See
[CircuitJSON usage](circuitjson.md) for supported elements, units, and examples.

## Runtime

### `new PcbScene3dRuntime(viewportNode, sceneDescription, hooks?)`

Creates the Three.js scene in a browser viewport.

Hooks:

- `setDiagnostics(messages)`: receives user-facing diagnostics.
- `setSelection(selection)`: receives component picks.
- `loadRuntimeModules()`: optional async loader returning `{ THREE,
OrbitControls }`.
- `translate`: optional translation function for interaction hints.

Methods:

- `setPreset(preset)`: applies `top`, `bottom`, or `isometric`.
- `setToggle(toggleName, enabled)`: updates `external-models`,
  `fallback-bodies`, or `copper`.
- `setSelectedDesignator(designator)`: updates highlighted component.
- `setComponentAdjustment(designator, adjustment)`: applies a live,
  model-local transform adjustment. `adjustment` uses `{ scale, rotationDeg,
offsetMil }` with X/Y/Z objects in scene units.
- `whenReady()`: resolves after initial runtime setup.
- `dispose()`: releases renderer, controls, listeners, and DOM nodes.

## Worker Client

### `new PcbScene3dWorkerClient(workerFactory)`

Wraps a host-created scene-preparation worker.

Methods:

- `prepareScene(documentModel, sessionAssets?)`: posts a
  `scene3d:prepare` request and resolves the returned scene description.
- `dispose()`: terminates the worker and rejects pending requests.

The worker protocol is intentionally small:

```js
worker.postMessage({
    type: 'scene3d:prepare',
    requestId,
    documentModel,
    sessionAssets
})
```

Workers respond with `scene3d:success` and `sceneDescription`, or
`scene3d:error` and `message`.

## Assembly Geometry Export

### `PcbAssemblyGeometryBuilder.build(sceneDescription, options?)`

Builds export meshes from a prepared scene description. `options.modelMeshLoader`
can provide external model meshes, `options.includeModels: false` skips external
model loading, and `options.renderFallbackBodies: false` disables procedural
component bodies for unresolved models.

### `PcbAssemblyGltfWriter.write(options?)`

Writes faceted assembly meshes as GLTF 2.0 JSON or binary GLB.

Options:

- `name`: scene name.
- `meshes`: export meshes with `vertices`, `faces`, optional RGB or RGBA
  `color`, optional `opacity`, and optional board `texture` data URIs.
- `format`: `gltf` or `glb`.
- `binary`: optional boolean equivalent to `format: 'glb'`.

Returns a GLTF JSON object for `gltf` and a `Uint8Array` for `glb`. RGBA colors
or opacity values below `1` are emitted as blended GLTF materials.

## Model Archive Export

### `PcbModelArchiveExporter.buildArchive(options?)`

Builds a ZIP archive from resolved `components` and `externalPlacements`.

Options:

- `archiveBaseName`: base name for the downloaded archive.
- `sceneDescription`: scene description containing resolved external models.

Returns:

- `archiveName`;
- `archiveBytes`;
- `exportedEntries`;
- `skippedEntries`.

## Geometry Factories

The package also exports focused factories used by the runtime:

- `PcbScene3dBoardShapeFactory`
- `PcbScene3dBoardSolderMaskFactory`
- `PcbScene3dCopperFactory`
- `PcbScene3dCopperTextFactory`
- `PcbScene3dDrillVoidFactory`
- `PcbScene3dExternalModels`
- `PcbScene3dPadFactory`
- `PcbScene3dSilkscreenFactory`
- `PcbScene3dViaFactory`

These factories accept Three.js constructors and normalized scene-detail
objects. They are exported for tests and advanced hosts, but most applications
should use `PcbScene3dRuntime` or `PcbScene3dController`.
