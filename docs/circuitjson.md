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
render.

Layer values resolve as follows:

- `1`, `top`, `front`, and `f.cu` map to the top side.
- `32`, `bottom`, `back`, and `b.cu` map to the bottom side.
- Unknown layer values default to the top side.

## Supported Elements

The adapter focuses on renderer-ready PCB geometry and ignores unsupported
CircuitJSON elements instead of failing the whole scene.

| Element type          | Rendered as                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `pcb_panel`           | Preferred board/panel size, thickness, center, and optional outline |
| `pcb_board`           | Board size, thickness, center, and optional outline                 |
| `pcb_cutout`          | Through-board cutout loop                                           |
| `source_component`    | Component designator and package metadata                           |
| `pcb_component`       | Fallback component body and selection target                        |
| `cad_component`       | External model URL metadata and placement data                      |
| `pcb_smtpad`          | Top or bottom SMT pad copper                                        |
| `pcb_plated_hole`     | Through-hole pad copper and drill                                   |
| `pcb_hole`            | Non-plated drill opening                                            |
| `pcb_via`             | Via copper and drill                                                |
| `pcb_trace`           | Routed copper track segments                                        |
| `pcb_silkscreen_line` | Top or bottom silkscreen stroke                                     |
| `pcb_silkscreen_text` | Top or bottom silkscreen text placeholder                           |

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
`pcb_cutout` elements:

```js
{
    type: 'pcb_cutout',
    shape: 'rect',
    center: { x: 25, y: 15 },
    width: 4,
    height: 2
}
```

Component model metadata can be supplied on `cad_component` elements with
`model_step_url`, `model_wrl_url`, `model_glb_url`, `model_gltf_url`,
`model_stl_url`, or `model_obj_url`. The adapter emits external placement
metadata for the host runtime or export pipeline to resolve.

Traces can be supplied as a `route` array. Each adjacent point pair becomes one
track segment:

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

## Diagnostics

Malformed CircuitJSON input is rejected by `circuitjson-toolkit` before render
model conversion. Use `PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(value)`
for a cheap guard when accepting untrusted JSON from users, and catch conversion
errors around `build(value)` when you need to show a custom diagnostic.

The viewer does not fetch external assets for CircuitJSON input by itself.
Model URL matching, same-origin checks, proxying, and file loading remain the
responsibility of source-specific toolkits or host applications that create or
post-process normalized scene descriptions.
