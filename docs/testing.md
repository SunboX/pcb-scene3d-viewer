# Testing

Run all tests with:

```bash
npm test
```

The test suite covers:

- geometry factories for board solids, pads, vias, drills, solder mask,
  copper, and silkscreen;
- runtime camera, preset, resizing, selection, and visibility behavior;
- external STEP/STP, WRL/VRML, STL, OBJ, GLTF/GLB, and 3MF live loading;
- model ZIP archive export;
- optional shell renderer and CSS contract;
- worker-client request routing.
- canonical document/context/array parity and prepared-index reuse.
- direct canonical `model_asset`, document-asset, and session-asset resolution.
- descriptor-safe asset alias and resolved-metadata handling.
- lazy, context-cached canonical asset indexing and exact documentation samples.
- path-exact model/cache/archive identities and same-basename collision cases.
- local-only companion attachment, WRL texture network blocking, explicit URL
  fetch/cache retries, and project-relative GLTF sidecars.
- same-origin static authentication, explicit per-URL headers, and per-resource,
  resource-count, and aggregate fetch limits shared with sidecars.
- raw archive parity for canonical text, bytes, data, files, URLs, and 3MF,
  including source basenames and safe GLTF/OBJ/WRL companion subtrees.
- shared-normalizable legacy routing, proof-aware preparation, exact-case asset
  selection, ambiguity-safe folded lookup, and faux-board shell parity.
- canonical polygon-plated pill slots, including rotation-local pad extents,
  independent outer/drill angles, and 45/90-degree board-space regressions;
- legal rectangular and square drill apertures through adapter, substrate,
  pad-local, plating, drill-void, and assembly-export boundaries;
- disjoint multi-board and multi-panel substrate, outline, solder-mask, and
  export geometry, plus the real Gerber project-to-viewer path in ECAD Forge.

Tests use fake scene descriptions and fake model payloads only. Do not add
customer, vendor, or source-derived fixture identifiers.

Use focused tests for behavior changes. Parser and scene-description builder
tests belong in the format-specific toolkits, not in this viewer package.

Run performance guards with:

```bash
npm run benchmark:exact-geometry
npm run benchmark:context-assets
```

The context-asset benchmark verifies that unreferenced assets are never indexed
and repeated builds reuse one context-owned canonical alias index.
