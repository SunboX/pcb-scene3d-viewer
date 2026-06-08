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

## CircuitJSON Input

### `PcbScene3dCircuitJsonAdapter`

Converts serialized CircuitJSON element arrays into the normalized scene
description consumed by the runtime.

Methods:

- `isCircuitJsonModel(value)`: returns true for serialized CircuitJSON arrays.
- `isDirectCircuitJsonModel(value)`: returns true when the array should bypass
  host `buildScene` callbacks.
- `build(circuitJson)`: returns a runtime-ready scene description.

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
