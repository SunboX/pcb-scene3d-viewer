<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# PCB Scene3D Viewer

Reusable browser-side 3D PCB viewer utilities for normalized ECAD scene
descriptions and direct CircuitJSON element arrays.

This package renders scene descriptions produced by packages such as
`altium-toolkit/scene3d` and `kicad-toolkit/scene3d`. It does not parse ECAD
source files and does not build format-specific scene data. Hosts that already
have CircuitJSON can pass the element array directly to the controller or
runtime.

The package was extracted from [ECAD Forge](https://ecadforge.app/), where it
is used for browser-based PCB 3D scene rendering. Its runtime, geometry
factories, model loading, component picking, view presets, archive export,
GLTF/GLB assembly writing, and optional DOM shell can be reused by other
browser-based ECAD tools.

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

Direct CircuitJSON input does not require a format-specific `buildScene`
callback:

```js
import { PcbScene3dController } from 'pcb-scene3d-viewer'

const circuitJson = [
    {
        type: 'pcb_board',
        width: 50,
        height: 30,
        thickness: 1.6,
        center: { x: 25, y: 15 }
    },
    {
        type: 'pcb_component',
        source_component_id: 'source-r1',
        layer: 1,
        center: { x: 20, y: 15 },
        width: 3,
        height: 1.5
    }
]

const controller = new PcbScene3dController(viewportNode, circuitJson)
```

## Documentation

- [API](docs/api.md)
- [CircuitJSON usage](docs/circuitjson.md)
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
