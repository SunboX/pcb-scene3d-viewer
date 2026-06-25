# CircuitJSON Usage

`pcb-scene3d-viewer` can render serialized CircuitJSON element arrays directly.
Use this path when the host application already has CircuitJSON and does not
need an Altium, KiCad, or other format-specific scene builder.

## Direct Controller Input

Pass the CircuitJSON array as the `documentModel`. The controller detects direct
CircuitJSON input, converts it to the internal render model, and mounts the
runtime without a `buildScene` callback.

```js
import {
    PcbScene3dController,
    PcbScene3dShellRenderer
} from 'pcb-scene3d-viewer'

const circuitJson = [
    {
        type: 'pcb_board',
        width: 50,
        height: 30,
        thickness: 1.6,
        center: { x: 25, y: 15 }
    },
    {
        type: 'source_component',
        id: 'source-r1',
        name: 'R1',
        ftype: 'R_0603'
    },
    {
        type: 'pcb_component',
        source_component_id: 'source-r1',
        layer: 1,
        center: { x: 20, y: 15 },
        rotation: 90,
        width: 1.6,
        height: 0.8,
        component_height: 0.55
    },
    {
        type: 'pcb_smtpad',
        layer: 1,
        x: 19.2,
        y: 15,
        width: 0.7,
        height: 0.9
    },
    {
        type: 'pcb_smtpad',
        layer: 1,
        x: 20.8,
        y: 15,
        width: 0.7,
        height: 0.9
    },
    {
        type: 'pcb_trace',
        layer: 1,
        route: [
            { x: 18, y: 15 },
            { x: 19.2, y: 15 }
        ],
        width: 0.25
    }
]

container.innerHTML = PcbScene3dShellRenderer.render(circuitJson)

const controller = new PcbScene3dController(
    container.querySelector('[data-scene-3d-viewport]'),
    circuitJson
)
```

The shell renderer does not inspect the CircuitJSON data. It only renders the
optional DOM controls. The controller performs the CircuitJSON detection and
conversion.

## Direct Runtime Input

For custom UI shells, pass the same CircuitJSON array directly to
`PcbScene3dRuntime`.

```js
import { PcbScene3dRuntime } from 'pcb-scene3d-viewer'

const runtime = new PcbScene3dRuntime(viewportNode, circuitJson, {
    setDiagnostics: (messages) => renderDiagnostics(messages),
    setSelection: (selection) => renderSelection(selection)
})

await runtime.whenReady()
runtime.setPreset('isometric')
```

## Adapter API

The direct path uses `PcbScene3dCircuitJsonAdapter`. Hosts can call it directly
when they need to inspect or cache the normalized render model.

```js
import { PcbScene3dCircuitJsonAdapter } from 'pcb-scene3d-viewer'

if (PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(circuitJson)) {
    const sceneDescription = PcbScene3dCircuitJsonAdapter.build(circuitJson)
}
```

Hosts that need URL policy control can pass a synchronous `modelUrlResolver`.
The adapter records the returned metadata on each external model but does not
fetch the referenced file:

```js
const sceneDescription = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
    modelUrlResolver(url, context) {
        return {
            resolvedUrl: sameOriginProxyUrl(url),
            sameOrigin: context.format === 'step'
        }
    }
})
```

Hosts can also pass `projectBaseUrl` to resolve relative model URLs without a
custom resolver. Package-style `node_modules/...` paths resolve to the
project-origin `/package_files/download` endpoint with package and file-path
query parameters. Package download file paths are normalized under `dist/` when
the source path does not already include it. Model fetching remains a separate
host/export decision.
`boardDrillQuality` accepts `low`, `medium`, or `high` and controls generated
circle sampling for direct CircuitJSON drill/cutout geometry. When a
CircuitJSON file has components but no board or panel, `drawFauxBoard: true`
generates a board from component bounds with a 2 mm margin per side.
Set `showPcbNotes: true` to render `pcb_note_text`,
`pcb_fabrication_note_text`, note/fabrication path artwork, and courtyard
artwork as silkscreen detail. Notes are hidden by default so manufacturing
annotations do not unexpectedly appear in board previews.
Set `showPcbPaste: true` to render `pcb_solder_paste` as a grey top/bottom
surface overlay. Paste is hidden by default so stencil-only manufacturing data
does not clutter normal board previews.

`isDirectCircuitJsonModel(value)` returns `false` for compatibility arrays that
also carry legacy parser fields such as `pcb`, `schematic`, or `bom`. Those
arrays continue through the host-provided `buildScene` callback so existing
parser integrations keep their source-specific conversion behavior.

## Units And Coordinates

CircuitJSON input uses millimeters. The adapter converts all board, component,
pad, via, trace, and silkscreen dimensions into mils before handing the scene to
the Three.js runtime.

The board center defaults to `{ x: 0, y: 0 }` when omitted. If no `pcb_panel`
or `pcb_board` element is present, the adapter creates a 25.4 mm by 25.4 mm
board with a 1.6 mm thickness so incomplete test or preview models still
render. With `drawFauxBoard: true`, that fallback board is instead sized around
the PCB component bounds with a minimum 10 mm by 10 mm footprint.

`cad_component` records with `show_as_bounding_box: true` are exported as
procedural component bodies. If `size` or `model_size` is present, those
dimensions drive the generated body; otherwise the paired `pcb_component`
footprint dimensions are used.

When a `cad_component` has no explicit model URL, package footprint metadata
from `footprinter_string`, `footprint_string`, `footprint`, or `package` can
generate a richer fallback body. Common dual-row, quad-row, SOT-style,
through-hole pin-header, passive-chip, pushbutton, testpoint, and TO-style
package strings add simple lead, pin, or terminal geometry while keeping the
plain box fallback for unrecognized package text.

Layer values resolve as follows:

- `1`, `top`, `front`, `f.cu`, and top-side artwork layer names map to the
  top side.
- `32`, `bottom`, `back`, `b.cu`, and bottom-side artwork layer names map to
  the bottom side.
- Unknown layer values default to the top side.

## Supported Elements

The adapter focuses on renderer-ready PCB geometry and ignores unsupported
CircuitJSON elements instead of failing the whole scene.

| Element type                | Rendered as                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| `pcb_panel`                 | Preferred board/panel size, thickness, center, and optional outline |
| `pcb_board`                 | Board size, thickness, center, and optional outline                 |
| `pcb_cutout`                | Through-board cutout loop                                           |
| `source_component`          | Component designator and package metadata                           |
| `pcb_component`             | Fallback component body and selection target                        |
| `cad_component`             | External model URL metadata and placement data                      |
| `pcb_smtpad`                | Top or bottom SMT pad copper, including pill pads                   |
| `pcb_plated_hole`           | Through-hole pad copper and drill                                   |
| `pcb_hole`                  | Non-plated drill opening                                            |
| `pcb_via`                   | Via copper and drill                                                |
| `pcb_trace`                 | Routed copper track segments and route-derived surface vias         |
| `pcb_copper_pour`           | Top or bottom copper zone polygon                                   |
| `pcb_solder_paste`          | Optional top or bottom paste fill when `showPcbPaste` is enabled    |
| `pcb_silkscreen_line`       | Top or bottom silkscreen stroke                                     |
| `pcb_silkscreen_path`       | Top or bottom routed silkscreen strokes                             |
| `pcb_silkscreen_circle`     | Top or bottom full-circle silkscreen stroke                         |
| `pcb_silkscreen_rect`       | Top or bottom rectangular silkscreen outline                        |
| `pcb_silkscreen_oval`       | Top or bottom oval silkscreen outline                               |
| `pcb_silkscreen_pill`       | Top or bottom pill silkscreen outline                               |
| `pcb_silkscreen_text`       | Top or bottom silkscreen text placeholder                           |
| `pcb_note_text`             | Optional top or bottom note text when `showPcbNotes` is enabled     |
| `pcb_note_line`             | Optional top or bottom note stroke when `showPcbNotes` is enabled   |
| `pcb_note_path`             | Optional top or bottom note path when `showPcbNotes` is enabled     |
| `pcb_note_rect`             | Optional top or bottom note outline when `showPcbNotes` is enabled  |
| `pcb_fabrication_note_text` | Optional fabrication text when `showPcbNotes` is enabled            |
| `pcb_fabrication_note_path` | Optional fabrication path when `showPcbNotes` is enabled            |
| `pcb_courtyard_rect`        | Optional courtyard rectangle when `showPcbNotes` is enabled         |
| `pcb_courtyard_circle`      | Optional courtyard circle when `showPcbNotes` is enabled            |
| `pcb_courtyard_outline`     | Optional courtyard outline when `showPcbNotes` is enabled           |

`cad_component` entries can provide external model URLs and model-local
placement hints. The adapter maps `model_unit_to_mm_scale_factor`,
`model_origin_position`, `model_offset`, `model_origin_alignment`,
`model_object_fit`, `model_board_normal_direction`, and `size` into normalized
model transforms, and maps `show_as_translucent_model` into export/display
opacity metadata.

Board outlines can be supplied as `pcb_board.outline`, using an array of points:

```js
{
    type: 'pcb_board',
    outline: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 }
    ]
}
```

Through-board cutouts can be supplied as polygon, rectangle, or circle
`pcb_cutout` elements. A `pcb_cutout` with `pcb_board_id` only applies when that
board is selected, while cutouts without a board target are global. Rectangular
cutouts support `ccw_rotation`:

```js
{
    type: 'pcb_cutout',
    shape: 'rect',
    center: { x: 25, y: 15 },
    width: 4,
    height: 2,
    ccw_rotation: 45
}
```

Drills can use circular, pill, or rotated pill geometry. `hole_offset_x` and
`hole_offset_y` move the drill center independently of the pad/copper center:

```js
{
    type: 'pcb_plated_hole',
    x: 10,
    y: 8,
    hole_shape: 'rotated_pill',
    hole_width: 0.5,
    hole_height: 1.5,
    hole_offset_x: 0.1,
    hole_offset_y: -0.1,
    outer_diameter: 2
}
```

SMT pads can use circular, rectangular, rotated rectangular, or pill geometry.
Pill pads are normalized as rounded rectangles so their copper keeps the
expected capsule outline:

```js
{
    type: 'pcb_smtpad',
    layer: 'top',
    shape: 'rotated_pill',
    x: 12,
    y: 8,
    width: 2,
    height: 1,
    ccw_rotation: 30
}
```

SMT pads, plated holes, and vias honor `is_covered_with_solder_mask` and
`covered_with_solder_mask` when present. `true` keeps the copper under solder
mask, while `false` exposes the copper on the applicable board side. For vias,
covered values map to tenting metadata on both sides.

Copper pours can use rectangular, polygon, or B-Rep geometry. Rectangular pours
support `rotation` or `ccw_rotation`; polygon and B-Rep point coordinates are
converted from millimeters to mils. `covered_with_solder_mask: true` renders the
zone under solder mask, while false or omitted values expose the copper:

```js
{
    type: 'pcb_copper_pour',
    layer: 'top',
    shape: 'rect',
    center: { x: 25, y: 15 },
    width: 8,
    height: 5,
    rotation: 45,
    covered_with_solder_mask: false
}
```

Silkscreen text uses `anchor_position` when available, falling back to `x` and
`y`. Common `anchor_alignment` values such as `center`, `bottom_left`, or
`top_right` are normalized into horizontal and vertical alignment metadata for
stroke text rendering.

Component model metadata can be supplied on `cad_component` elements with
`model_3mf_url`, `model_step_url`, `model_wrl_url`, `model_glb_url`,
`model_gltf_url`, `model_stl_url`, or `model_obj_url`. The adapter emits
external placement metadata for the host runtime or export pipeline to resolve.

Traces can be supplied as a `route` array. Each adjacent wire point pair becomes
one track segment:

```js
{
    type: 'pcb_trace',
    layer: 'top',
    route: [
        { x: 5, y: 5 },
        { x: 10, y: 5 },
        { x: 10, y: 8 }
    ],
    width: 0.2
}
```

Route entries with `route_type: 'via'` produce via primitives when their
`from_layer`, `to_layer`, or `layer` touches the top or bottom surface. Adjacent
surface wire segments remain visible through those vias. Inner-only vias and
inner-only wire segments are ignored by the surface-copper view. If a route via
omits `hole_diameter`, `via_hole_diameter`, or `drill_diameter`, the drill
diameter defaults to half of `via_diameter`.

```js
{
    type: 'pcb_trace',
    route: [
        { route_type: 'wire', x: 5, y: 5, width: 0.2, layer: 'top' },
        {
            route_type: 'via',
            x: 8,
            y: 5,
            from_layer: 'top',
            to_layer: 'bottom',
            via_diameter: 0.4
        },
        { route_type: 'wire', x: 8, y: 10, width: 0.2, layer: '32' }
    ]
}
```

## Diagnostics

Malformed CircuitJSON input is rejected by `circuitjson-toolkit` before render
model conversion. Use `PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(value)`
for a cheap guard when accepting untrusted JSON from users, and catch conversion
errors around `build(value)` when you need to show a custom diagnostic.

The viewer does not fetch external assets for CircuitJSON input by itself.
Model URL matching, same-origin checks, proxying, and file loading remain the
responsibility of source-specific toolkits or host applications that create or
post-process normalized scene descriptions.
