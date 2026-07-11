<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# PCB Scene3D Viewer 1.2.0

Version 1.2.0 aligns the viewer boundary with the converged ECAD toolkit APIs.

## API changes

- `PcbScene3dCircuitJsonAdapter.isCircuitJsonModel()` and `build()` now accept
  `ecad-toolkit.document.v1` results and prepared
  `CircuitJsonDocumentContext` instances in addition to CircuitJSON arrays.
- `PcbScene3dCircuitJsonAdapter.prepare()` exposes the proof-aware shared
  normalization/index boundary. Predicates stay non-mutating and no longer
  reject a shared-normalizable legacy row before preparation.
- `PcbScene3dController` and `PcbScene3dRuntime` automatically route canonical
  document envelopes through the direct CircuitJSON path without requiring a
  source-format scene builder.
- Controller preparation now consistently prefers an explicit
  `sceneDescription`, then `scenePrepClient`, then canonical CircuitJSON, and
  finally the legacy source builder. Adapter options and session assets survive
  asynchronous preparation fallback.
- `PcbScene3dShellRenderer` accepts the same legacy, raw CircuitJSON, canonical
  document, and prepared-context inputs as the controller, including
  component-only `drawFauxBoard` scenes.
- Legacy hybrid arrays that carry `pcb`, `schematic`, or `bom` compatibility
  fields still use the host-provided source-format builder.
- Live external model loading now matches every adapter-advertised format:
  STEP/STP, WRL/VRML, STL, OBJ, GLTF/GLB, and 3MF. Canonical bytes, session
  files, and explicitly enabled model URLs use one consistent runtime policy.
- Text-capable loaders accept canonical `text`, `payloadText`, and string
  `data`; raw ZIP export accepts `text`, `payloadText`, `data`, `bytes`,
  `payloadBytes`, files, and explicitly enabled URLs. Archive extensions now
  preserve every advertised format, including 3MF.
- `modelLoaderOptions` is forwarded from `PcbScene3dController` to runtime and
  archive export. Controller archive names now recognize canonical
  `source.fileName` on documents and prepared contexts.
- Resolved GLTF BIN, OBJ MTL, and WRL texture companions are attached from safe
  project-relative session/document assets. WRL textures never trigger an
  implicit Three.js network load; local or explicitly fetched bytes are embedded
  as data URIs first.
- Injected WRL loaders now receive sanitized source with an empty resource base
  path. Hosts that previously relied on Three.js resolving relative textures
  implicitly must supply local resources or an explicit `modelLoaderOptions`
  fetch policy.
- Static `authHeaders` no longer cross the main model origin. The new
  `authHeadersForUrl` callback is the explicit cross-origin authorization path.
- URL fetch scopes enforce safe defaults of 128 MiB per resource, 256 resources,
  and 512 MiB aggregate across main sources and sidecars. The limits are
  configurable with `maxModelBytes`, `maxModelResources`, and
  `maxModelTotalBytes`.
- Raw ZIP entries now use unique pattern directories and original source
  basenames. Safe relative GLTF buffers/images, OBJ resources, and WRL textures
  are included beside the main source; return rows expose `bundleDirectory` and
  `companionPaths`.
- Polygon-plated holes now consume the shared CircuitJSON hole primitive model.
  `pad_outline` determines rotation-local copper extents, polygon pads stay
  non-circular, and pill drill width/height survive as slot geometry. A 2.6 by
  0.6 mm Gerber routed slot no longer collapses to a 1 by 1 mm circular pad.
- Slot drill angles are board-space and applied exactly once; diagonal and
  vertical routed slots no longer double-rotate with their outer pads. Separate
  rectangular-pad and drill rotations remain independent.
- Plated-wall classification uses that same board-space drill rotation instead
  of adding the outer pad rotation again. Legal rectangular and square holes
  retain exact aperture width, height, and rotation through substrate and pad
  geometry and assembly export.
- Every disjoint CircuitJSON board or panel contour now produces its own board
  body, outline, solder-mask faces, and assembly-export substrate mesh. Panel
  rows take physical precedence over their child board rows without data loss.

## Performance and validation

- Scene adaptation uses `CircuitJsonDocumentContext` as the validation boundary
  and requests only the shared `elements` index.
- Repeated builds from one prepared context reuse that index instead of
  validating and indexing the model again.
- Controller routing prepares a canonical document once and passes the context
  forward, eliminating duplicate full-model predicate validation.
- Descriptor-safe CircuitJSON normalization keeps legacy hidden metadata from
  bypassing or breaking the immutable shared model boundary.
- CircuitJSON detection predicates validate without freezing or otherwise
  mutating caller-owned arrays and unprepared document envelopes.
- `CircuitJsonCadModelAssetResolver.withModelAssetUrls()` now preserves common
  document envelopes and prepared-context return shapes while deriving explicit
  model URL fields from retained `model_asset` metadata.
- The adapter consumes canonical `model_asset` records directly and resolves
  canonical document assets plus session assets through one descriptor-safe
  alias index. Documents without model references skip asset indexing,
  prepared contexts cache the canonical index across builds, and payload copies
  stay lazy until a matching model is used. Resolver wrappers, hostile session
  arrays, option proxies, and metadata accessors cannot execute caller accessors.
  ECAD Forge no longer needs an app-side document transform or resolver wrapper.
- Canonical accessor-backed `ToolkitAsset` session payloads are materialized
  lazily through the shared asset contract before descriptor-safe viewer
  copying. Exact STEP and other model bytes now flow from converged project
  loaders without weakening hostile-accessor rejection.
- Restored route-via, legacy layer, silkscreen/courtyard, oval, copper-pour, and
  default-via fixtures now rely on structural normalization in
  `circuitjson-toolkit` instead of viewer-side compatibility workarounds.
- A context-asset benchmark guards the one-index-build repeated-render path.
- Model group, STEP parse, request-cache, and archive identities prefer exact
  canonical paths, source streams, and asset IDs. Same-basename files in
  different directories remain distinct, identical sources are reused, and
  rejected shared requests are evicted for retry.
- Asset aliases preserve exact case-sensitive paths. Case-insensitive fallback
  resolves only one unique owner and refuses ambiguous case-fold collisions.
- Canonical shell BOM counts now use `CircuitJsonBomBuilder`, matching toolkit
  grouping behavior instead of counting raw source-component rows.
- Relative GLTF sidecars resolve beside relative as well as absolute main model
  paths. Existing local buffers are reused before any explicitly enabled fetch.
- The empty archive diagnostic is format-neutral because export is no longer
  limited to STEP and WRL.

## Dependencies

- Requires `circuitjson-toolkit ^1.1.0` and Node.js 20 or newer.
- Pins `earcut` 3.0.2 so npm deduplication cannot change deterministic triangle
  ordering while the CircuitJSON dependency graph is upgraded.
- The package version advances from 1.1.50 to 1.2.0 because accepted input
  shapes and direct-routing behavior changed incompatibly.
