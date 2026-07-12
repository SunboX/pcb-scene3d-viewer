<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# PCB Scene3D Viewer

Reusable browser-side 3D PCB viewer utilities for normalized ECAD scene
descriptions and canonical CircuitJSON documents.

This package renders scene descriptions produced by packages such as
`altium-toolkit/scene3d` and `kicad-toolkit/scene3d`. It does not parse ECAD
source files and does not build format-specific scene data. Hosts that already
have CircuitJSON can pass a common `DocumentResult`, a prepared
`CircuitJsonDocumentContext`, or an element array directly to the controller or
runtime.

The package was extracted from [ECAD Forge](https://ecadforge.app/), where it
is used for browser-based PCB 3D scene rendering. Its runtime, geometry
factories, model loading, component picking, view presets, archive export,
GLTF/GLB assembly writing, and optional DOM shell can be reused by other
browser-based ECAD tools.

## CircuitJSON 1.1 convergence

Version 1.2.2 accepts the common document and prepared-context shapes returned
by CircuitJSON, Gerber, Altium, and KiCad Toolkit 1.1-compatible APIs. The
adapter requests the shared `elements` index once and reuses it across repeated
scene builds. `PcbScene3dCircuitJsonAdapter.prepare()` exposes that proof-aware
path to hosts. Existing bare arrays are normalized by the shared CircuitJSON
boundary, while legacy parser-compatible hybrid arrays retain their native
builder behavior. Canonical `model_asset` paths and matching document or session
assets are resolved directly by the adapter; hosts do not need an app-side
document transform or resolver wrapper. Document asset indexes are created only
for referenced models and cached through a prepared context. Exact
case-sensitive paths win; case-insensitive fallback is used only when unique.
Polygon-plated holes use the shared CircuitJSON hole primitive model, including
rotation-local `pad_outline` extents and pill-slot width, height, and rotation;
outer-pad and drill rotations remain independent and board-space drill angles
are applied exactly once. Gerber routed slots therefore retain horizontal,
diagonal, and vertical canonical geometry in the viewer. Multiple disjoint
`pcb_board` rows (or multiple `pcb_panel` rows) render as independent substrate,
outline, mask, and export contours instead of dropping every row after the
first.
Legal rectangular and square CircuitJSON drill apertures retain their exact
width, height, and board-space rotation through substrate, pad, and assembly
export meshes.

Canonical documents retain their exact `source.format` as the scene
`sourceFormat`; raw element arrays continue to use `circuitjson`. Routed traces
and copper pours with no authored solder-mask coverage value remain covered,
while `covered_with_solder_mask: false` keeps an explicit opening exposed.
Standard vias likewise default to tented and honor `is_tented: false` as an
explicit opening.

The live runtime loads STEP/STP, WRL/VRML, STL, OBJ, GLTF/GLB, and 3MF from
canonical text/bytes or browser files. Referenced GLTF buffers, OBJ material
libraries, and WRL textures are attached from matching document/session assets
using safe project-relative paths. URL loading is explicit through
`modelLoaderOptions.fetch` or `allowNetworkModelFetch: true`, with optional
headers, timeout, cache, and bounded-resource settings. Static `authHeaders`
stay on the main model origin; `authHeadersForUrl` is the explicit per-URL
override. The model ZIP exporter uses the same policy and writes each raw model
under its original source basename with safe GLTF, OBJ, and WRL companions.

STEP loading uses the installed `@sunbox/occt-import-js` package directly. Its
package-owned worker is reused for browser imports, while runtimes without Web
Workers dynamically import the same ESM factory. Hosts only need to serve the
package `dist/` directory at
`/node_modules/@sunbox/occt-import-js/dist/`; no copied runtime, global script,
or host-owned worker is required.

## Install

```bash
npm install pcb-scene3d-viewer
```

For local ECAD Forge development, use the sibling checkout:

```json
{
    "dependencies": {
        "pcb-scene3d-viewer": "file:../pcb-scene3d-viewer"
    }
}
```

## Usage

```js
import {
    PcbScene3dController,
    PcbScene3dShellRenderer
} from 'pcb-scene3d-viewer'
import { PcbScene3dBuilder } from 'altium-toolkit/scene3d'

container.innerHTML = PcbScene3dShellRenderer.render(documentModel)

const controller = new PcbScene3dController(
    container.querySelector('[data-scene-3d-viewport]'),
    documentModel,
    {
        buildScene: (nextDocumentModel, options) =>
            PcbScene3dBuilder.build(nextDocumentModel, options),
        createModelRegistry: () => null
    }
)

controller.setSelectedComponent('U1')
```

Canonical document input does not require a format-specific `buildScene`
callback:

```js
import { PcbScene3dController } from 'pcb-scene3d-viewer'
import { Parser } from 'gerber-toolkit'

const document = await Parser.parseAsync({
    fileName: file.name,
    data: await file.arrayBuffer()
})

const controller = new PcbScene3dController(viewportNode, document)
```

## Documentation

- [API](docs/api.md)
- [CircuitJSON usage](docs/circuitjson.md)
- [1.2.2 release notes](docs/release-notes-v1.2.2.md)
- [1.2.1 release notes](docs/release-notes-v1.2.1.md)
- [1.2.0 release notes](docs/release-notes-v1.2.0.md)
- [Model format](docs/model-format.md)
- [Testing](docs/testing.md)
- [Library scope](spec/library-scope.md)

## License

This project is available under two licensing options.

### 1. Open-source software license

GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`).

You may use, modify, and distribute this project under the AGPL. If you
distribute modified versions, run modified versions as a network service, or
create larger works based on this project, they must comply with the AGPL,
including source-code availability requirements.

### 2. Commercial/proprietary license

For use in closed-source, proprietary, or otherwise AGPL-incompatible products,
a separate paid commercial license is required.

Commercial licensing contact: https://github.com/SunboX

### Documentation and notices

Documentation and non-code text are licensed under Creative Commons
Attribution-ShareAlike 4.0 (`CC-BY-SA-4.0`) unless otherwise marked.

Copyright (C) 2026 André Fiedler.

Copyright, license, attribution, and source-origin notices must be preserved as
required by the AGPL, CC-BY-SA-4.0, and the notice files in this repository.
See [LICENSE](LICENSE), [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md), and
[NOTICE.md](NOTICE.md).
