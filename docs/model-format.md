# Model Format

The viewer consumes a normalized PCB 3D scene description. Format-specific
toolkits are responsible for creating this data.

## Top-Level Shape

```js
{
    sourceFormat: 'altium' | 'kicad' | string,
    coordinateSystem: 'kicad-3d-y-up' | undefined,
    board: {
        widthMil,
        heightMil,
        thicknessMil,
        minX,
        minY,
        centerX,
        centerY,
        segments,
        surfaceColor,
        edgeColor
    },
    components: [],
    externalPlacements: [],
    boardAssemblyModel: null,
    detail: {
        pads: [],
        tracks: [],
        arcs: [],
        fills: [],
        vias: [],
        polygons: [],
        copperTexts: [],
        silkscreen: {
            top: {},
            bottom: {}
        },
        paste: {
            top: {},
            bottom: {}
        }
    }
}
```

All dimensions are in mils. The runtime centers board detail around
`board.centerX` and `board.centerY`.

## Components

Components describe fallback package bodies and selection metadata:

```js
{
    designator: 'U1',
    mountSide: 'top',
    rotationDeg: 90,
    positionMil: { x: 0, y: 0, z: 90 },
    boardPositionMil: { x: 500, y: 500, z: 0 },
    pattern: 'SOIC-8',
    source: 'library',
    body: {
        family: 'ic',
        sizeMil: { width: 200, depth: 300, height: 60 }
    },
    externalModel: null
}
```

## External Placements

External placements describe STEP, WRL, GLB, GLTF, STL, or OBJ model instances:

```js
{
    designator: 'U1',
    mountSide: 'top',
    rotationDeg: 90,
    positionMil: { x: 0, y: 0, z: 31.5 },
    bodyPositionMil: { x: 500, y: 500 },
    bodyRotationDeg: 0,
    modelTransform: {
        rotationDeg: { x: 90, y: 0, z: 0 },
        offsetMil: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        originPositionMil: { x: 0, y: 0, z: 0 },
        originAlignment: 'center_of_component_on_board_surface',
        objectFit: 'fill_bounds',
        boardNormalDirection: 'z+',
        targetSizeMil: { x: 200, y: 300, z: 60 }
    },
    bodyOpacity: 0.5,
    externalModel: {
        origin: 'session',
        name: 'soic-8.step',
        relativePath: 'packages/soic-8.step',
        format: 'step',
        sourceUrl: '/models/soic-8.step',
        resolvedUrl: 'https://assets.example.invalid/models/soic-8.step',
        file: File
    }
}
```

OBJ models can carry sidecar material libraries in `resources`, `relatedFiles`,
`assets`, or similar metadata collections. OBJ diffuse, ambient, specular,
shininess, alpha, and vertex colors are preserved in the parsed mesh metadata.
GLTF/GLB material alpha, mesh opacity, and `COLOR_0` vertex colors are
preserved in imported and exported GLTF/GLB materials and primitives.
GLTF/GLB import consumes triangle primitives and ignores unsupported primitive
modes such as points or lines. Remote `.gltf` files can reference external
`buffers[].uri` sidecars; when URL-backed model loading is enabled, the loader
resolves those sidecars relative to the `.gltf` URL and fetches them with the
same cache, timeout, and auth-header policy.

Resolved model URLs are not fetched by default. Hosts that want URL-backed model
loading must provide an explicit fetch policy through `PcbAssemblyModelMeshLoader`
or a higher-level export service. Use `authHeaders`, `fetchTimeoutMs`, and a
caller-owned `modelCache` when remote model requests are enabled.

When `projectBaseUrl` is provided to the CircuitJSON adapter, package-style
model paths such as `node_modules/package-name/path/to/model.step` are resolved
to `/package_files/download` on the project origin with
`package_name_with_version` and `file_path` query parameters. Package download
file paths are normalized under `dist/` unless they already start there. This
only records a resolved URL; fetching still requires an explicit loader/export
fetch policy.

CAD placements can request procedural bounding-box output with
`show_as_bounding_box: true`. The adapter marks those placements with
`renderAsBoundingBox: true`, copies `size`/`model_size` into fallback body
dimensions when present, and the assembly geometry builder skips external model
loading for that placement.

When package footprint text is available, fallback bodies can derive simple
package-specific geometry for passive chips, dual-row and quad-row ICs,
SOT-style packages, pin headers, pushbuttons, testpoints, and TO-style
through-hole packages. Testpoints and radial capacitors use round fallback
bodies in both runtime rendering and assembly export.

Embedded STEP models can use:

```js
{
    origin: 'embedded',
    name: 'embedded.step',
    format: 'step',
    payloadText: 'ISO-10303-21;'
}
```

## Detail Primitives

The runtime expects pre-normalized primitive lists for:

- pads and vias with drill and copper dimensions;
- tracks and arcs with layer metadata;
- fills and polygons with point loops or B-Rep ring metadata;
- silkscreen tracks, arcs, fills, and texts;
- optional solder-paste fills in `detail.paste`;
- copper text primitives.

The viewer does not infer source-file semantics. When a scene needs
format-specific layer mapping, solder-mask interpretation, text layout, or
model matching, the source toolkit should encode those decisions in the scene
description.

Through-hole pads can describe offset or slotted drills with `holeOffsetX`,
`holeOffsetY`, `holeSlotLength`, and `holeRotation`. Board substrate export uses
`detail.drillQuality` values of `low`, `medium`, or `high` to choose circular
drill sampling density.

Rounded SMT pads set `hasRoundedRect`, the side-specific
`roundedRectShapeTop`/`roundedRectShapeBottom`, and
`cornerRadiusTop`/`cornerRadiusBottom` as a percent of the shortest copper side.
Route-derived vias use the same `detail.vias` shape as standalone vias, and
surface route segments use `layerId: 1` for top copper or `layerId: 32` for
bottom copper.
