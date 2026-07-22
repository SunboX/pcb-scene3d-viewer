# API

The package exports all public APIs from `pcb-scene3d-viewer` and
`pcb-scene3d-viewer/scene3d`.

## Rendering Shell

### `PcbScene3dShellRenderer.render(documentModel, translate?)`

Returns HTML markup for the optional interactive 3D scene shell.
`documentModel` accepts a legacy scene/parser model, a dense CircuitJSON array,
an `ecad-toolkit.document.v1` result, or a prepared
`CircuitJsonDocumentContext`. CircuitJSON shapes use the shared context index to
derive board, component, and BOM summary counts.

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
- `modelLoaderOptions`: optional runtime model-loading policy. It accepts the
  same `fetch`, `allowNetworkModelFetch`, `authHeaders`, `authHeadersForUrl`,
  `fetchTimeoutMs`, `modelCache`, `maxModelBytes`, `maxModelResources`, and
  `maxModelTotalBytes` fields as `PcbAssemblyModelMeshLoader`. The policy is
  also forwarded unchanged to model ZIP export.
- `setLoadingVisible`: callback for shell loading state.
- `onComponentSelectionChange`: callback for 3D picks.
- `translate`: optional `(key) => string` translation function.

Preparation precedence is explicit: `sceneDescription`, then
`scenePrepClient`, then direct canonical CircuitJSON adaptation, and finally
the legacy `buildScene` callback. If asynchronous scene preparation fails, a
canonical document still falls back to direct adaptation with the supplied
adapter and asset options.

Methods:

- `getDocumentModel()`: returns the mounted document model.
- `setSelectedComponent(componentKey)`: highlights and inspects a component.
- `dispose()`: releases event listeners, worker clients, and runtime resources.

When a component is selected, the controller renders live scale, rotation, and
offset controls in the inspector. Edits are kept in memory for the mounted
controller only and are forwarded to the runtime through
`setComponentAdjustment()`.

## CircuitJSON Input

### `PcbScene3dBoardMaterialPalette`

The `pcb-scene3d-viewer/scene3d` subpath exports the shared board-material
resolver used by both runtime meshes and assembly export.

- `resolveSurfaceColor(board, options?)` returns the authored or fallback
  solder-mask face color.
- `resolveBoardSurfaceColor(board, options?)` returns the display-darkened
  solder-mask face color.
- `resolveEdgeColor(board)` returns an authored `edgeColor` or the light FR-4
  substrate fallback `0xc9ca78`.
- `isGeneratedSurfaceVisible(options?)` and
  `isGeneratedBodyVisible(options?)` expose the generated-board visibility
  decision.

Runtime and exported board edges call the same resolver, so a missing edge
color cannot produce different substrate materials in the two paths.

### `PcbScene3dCircuitJsonAdapter`

Converts a common CircuitJSON `DocumentResult`, prepared
`CircuitJsonDocumentContext`, or serialized element array into the normalized
scene description consumed by the runtime.

Methods:

- `isCircuitJsonModel(value)`: returns true for accepted document, context, or
  structurally valid array inputs without freezing or mutating an unprepared
  caller value. Shared normalization and schema validation occur in `prepare`.
- `isDirectCircuitJsonModel(value)`: returns true when the canonical input
  should bypass host `buildScene` callbacks.
- `prepare(circuitJson)`: returns a `CircuitJsonDocumentContext`, normalizes
  supported legacy rows through the shared CircuitJSON boundary, reuses a
  canonical document validation proof, and prepares the `elements` index once.
- `build(circuitJson, options?)`: returns a runtime-ready scene description and
  reuses an existing context `elements` index when supplied. Canonical
  `cad_component.model_asset` records are consumed directly and matched against
  canonical document assets or `options.sessionAssets` through a prebuilt
  descriptor-safe alias index. The index is not built for documents without
  model references, is cached in a supplied context for repeated builds, and
  materializes a canonical payload only when its first model reference is used.
  Plated-hole copper and drill geometry comes from the shared
  `CircuitJsonPcbHolePrimitiveModel`, so polygon pad outlines and pill slots use
  the same canonical shape and dimensions as the producing toolkit. Drill
  rotation is board-space and is never added to pad rotation a second time.
  Rectangular and square apertures retain width, height, and rotation rather
  than being approximated as circles or pill slots, including assembly export.
  Every selected panel contour, or every board contour when no panel exists,
  is retained in `board.contours` and rendered/exported independently.
  `options.modelUrlResolver` can attach caller-owned URL resolution metadata to
  `cad_component` external models without fetching them. `projectBaseUrl`
  resolves relative model URLs and package-style `node_modules/...` model paths,
  `drawFauxBoard: true` generates a board around component bounds when no board
  or panel exists, `boardDrillQuality` controls generated circular
  drill/cutout sampling, and `showPcbNotes: true` renders note, fabrication,
  and courtyard artwork as silkscreen detail. `showPcbPaste: true` renders
  direct solder-paste artwork as a separate top/bottom overlay.

For canonical document and prepared-context inputs, the returned scene's
`sourceFormat` is the exact canonical `source.format`. Dense element arrays,
which do not carry source metadata, retain the `circuitjson` fallback. Routed
traces and copper pours default to covered when their coverage property is
omitted; an explicit `covered_with_solder_mask: false` remains an exposed
opening. Standard vias default to tented and honor `is_tented: false` as an
explicit opening.

`PcbScene3dController` and `PcbScene3dRuntime` call this adapter automatically
when they receive direct CircuitJSON input. See
[CircuitJSON usage](circuitjson.md) for supported elements, units, and examples.

### `CircuitJsonCadModelAssetResolver`

`withModelAssetUrls(document)` accepts an element array, common
`DocumentResult`, or prepared context. It returns the same input shape when no
derived URL is needed; otherwise it returns a new array, canonical document
envelope, or prepared context with `model_asset` paths promoted to explicit
CircuitJSON model URL fields. Source metadata, extensions, assets, diagnostics,
and statistics are preserved. This utility remains available for consumers
that need explicit URL fields; the viewer adapter does not require it.

`withSessionAssetResolver(options, documentAssets?)` retains its public session
asset behavior and also accepts canonical document assets. Alias lookup is
indexed once and does not invoke asset accessors. Exact case-sensitive project
paths take precedence. Case-insensitive lookup is a compatibility fallback only
when one unique asset owns the folded path; ambiguous folded paths do not
resolve. Resolved metadata is copied through a descriptor-safe boundary.

`withContextAssetResolver(options, context)` uses the same behavior while
caching the canonical document-asset alias index in the supplied prepared
context. Session assets remain request-specific and take precedence over
document assets. Referenced GLTF `buffers[].uri`, OBJ `mtllib`, and WRL
`ImageTexture` companions are attached as `externalBuffers` or `resources`
when their safe project-relative path matches an indexed asset. Parent
traversal, absolute paths, and URL schemes are never attached implicitly.

## Runtime

### `PcbScene3dVisibilityGraph`

Applies render-group visibility and per-component visibility as two ordered
self-adjusting computations. `apply(state, changedPaths)` starts at readers of
the supplied toggle or revision roots, reuses unaffected effects, and returns
the stage result map with each stage's `recomputed` flag. A null change set is
conservative and repairs both stages. `clear()` reclaims stored traces.

The public root and `/scene3d` entrypoint also re-export the canonical
`SelfAdjustingComputation` identity from `circuitjson-toolkit`.

### `new PcbScene3dRuntime(viewportNode, sceneDescription, hooks?)`

Creates the Three.js scene in a browser viewport.

The persistent runtime routes toggle, selection, hidden-component, and model
topology changes through `PcbScene3dVisibilityGraph`. Changes within mutable
maps and sets use explicit structural revision roots so identity-stable
containers cannot cause stale visibility reuse.

Hooks:

- `setDiagnostics(messages)`: receives user-facing diagnostics.
- `setSelection(selection)`: receives component picks.
- `loadRuntimeModules()`: optional async loader returning `{ THREE,
OrbitControls }`.
- `translate`: optional translation function for interaction hints.
- `modelLoaderOptions`: opt-in model URL fetch policy and cache settings.

The live runtime accepts STEP/STP, WRL/VRML, STL, OBJ, GLTF/GLB, and 3MF
placements. Text-capable formats accept `payloadText`, `text`, and string
`data`; every format accepts binary `data`, `bytes`, `payloadBytes`, or browser
`File`/`Blob` content. URL fetching remains opt-in through an injected `fetch`
function or `allowNetworkModelFetch: true`. Relative GLTF sidecars resolve
beside absolute or project-relative main model paths. WRL texture references
are replaced with local or explicitly fetched data URIs before Three.js parses
the model, preventing implicit texture networking. STL, OBJ, GLTF, and GLB use
the shared faceted mesh pipeline so runtime and assembly export preserve the
same units, material color, opacity, and vertex-color behavior.

STEP imports resolve `occt-import-js.js`, `occt-import-js.wasm`, and
`occt-import-js-worker.js` from the installed `@sunbox/occt-import-js` package.
The package worker is persistent and serialized per loader. When Web Workers
are unavailable, the viewer dynamically imports the ESM factory directly; it
does not inject a classic script or depend on a global factory. Worker transfer
uses a loader-owned byte snapshot, and rejected ESM initialization is evicted
so callers retain their input and can retry transient failures.

Static `authHeaders` are sent only to the main model origin. A host that
intentionally authorizes another origin can return headers from
`authHeadersForUrl(url, { mainUrl, sameOrigin, label })`. Each fetch scope
defaults to 128 MiB per resource, 256 resources, and 512 MiB aggregate; override
these with `maxModelBytes`, `maxModelResources`, and `maxModelTotalBytes`.

### `PcbModelArchiveExporter.buildArchive(options?)`

Exports resolved STEP/STP, WRL/VRML, 3MF, GLB/GLTF, STL, and OBJ sources. Raw
models accept the same canonical text, byte, file, and explicitly enabled URL
sources as the runtime. `modelLoaderOptions` is shared with stitched-component
mesh loading and raw URL export. Exact canonical project paths, source streams,
or IDs define deduplication; same-basename models in different paths remain
distinct. A controller derives the archive base name from `summary.title`,
canonical `source.fileName`, or the legacy `fileName`, in that order.
Each raw source is written to a unique pattern directory under its original
source basename. Safe relative GLTF buffers/images, OBJ resources, and WRL
textures are written beside it so internal references remain valid. Every raw
`exportedEntries` row includes `bundleDirectory` and `companionPaths`.

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
component bodies for unresolved models. Placements with `renderAsBoundingBox:
true` are exported as procedural component bodies instead of loading the
referenced model. Optional solder-paste detail exports as distinct paste meshes
when present in `sceneDescription.detail.paste`.

### `PcbAssemblyGltfWriter.write(options?)`

Writes faceted assembly meshes as GLTF 2.0 JSON or binary GLB.

Options:

- `name`: scene name.
- `meshes`: export meshes with `vertices`, `faces`, optional RGB or RGBA
  `color`, optional `opacity`, and optional board `texture` data URIs.
- `format`: `gltf` or `glb`.
- `binary`: optional boolean equivalent to `format: 'glb'`.
- `includeSceneMetadata`: when `true`, emits a default camera and punctual light
  for third-party GLTF viewers.

Returns a GLTF JSON object for `gltf` and a `Uint8Array` for `glb`. RGBA colors
or opacity values below `1` are emitted as blended GLTF materials. Mesh
`vertexColors` are exported as `COLOR_0`, and mesh `material` metadata is
preserved in material extras.

### `new PcbAssemblyModelMeshLoader(options?)`

Loads STEP, WRL, STL, OBJ, GLTF, and GLB external models into assembly meshes.
By default the loader only reads embedded payloads, session files, and provided
byte buffers. Network loading is opt-in through either an injected `fetch`
function or `allowNetworkModelFetch: true`. Remote `.gltf` buffer sidecars are
resolved relative to the `.gltf` URL and use the same fetch, auth-header,
timeout, and cache policy as the top-level model.

Options:

- `stepLoader`: custom STEP loader.
- `fetch`: host-provided fetch function for resolved model URLs.
- `allowNetworkModelFetch`: use `globalThis.fetch` for `resolvedUrl` or
  `sourceUrl` models when no local payload is present.
- `authHeaders`: headers forwarded only to same-origin model requests.
- `authHeadersForUrl(url, context)`: explicit per-URL headers. Static
  `authHeaders` are withheld when `context.sameOrigin` is false.
- `fetchTimeoutMs`: abort timeout for network model requests.
- `modelCache`: optional cache map keyed by resolved model URL.
- `maxModelBytes`: maximum bytes per fetched resource; defaults to 134217728.
- `maxModelResources`: maximum fetched main/sidecar resources per scope;
  defaults to 256.
- `maxModelTotalBytes`: maximum aggregate fetched bytes per scope; defaults to 536870912.

## Model Archive Export

### `PcbModelArchiveExporter.buildArchive(options?)`

Builds a ZIP archive from resolved `components` and `externalPlacements`.

Options:

- `archiveBaseName`: base name for the downloaded archive.
- `sceneDescription`: scene description containing resolved external models.
- `modelLoaderOptions`: the same bounded explicit fetch policy used by runtime
  model loading.

Returns:

- `archiveName`;
- `archiveBytes`;
- `exportedEntries`, including `archivePath`, `bundleDirectory`, and
  `companionPaths` for each raw source;
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
