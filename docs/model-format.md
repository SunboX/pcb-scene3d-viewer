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
        file: File
    }
}
```

OBJ models can carry sidecar material libraries in `resources`, `relatedFiles`,
`assets`, or similar metadata collections. GLTF/GLB material alpha and mesh
opacity are preserved in exported GLTF/GLB materials.

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
- fills and polygons with point loops;
- silkscreen tracks, arcs, fills, and texts;
- copper text primitives.

The viewer does not infer source-file semantics. When a scene needs
format-specific layer mapping, solder-mask interpretation, text layout, or
model matching, the source toolkit should encode those decisions in the scene
description.
