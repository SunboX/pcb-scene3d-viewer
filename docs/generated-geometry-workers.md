# Generated geometry workers

The browser runtime builds the board body, solder mask, drill interiors,
outline and deferred copper in a dedicated module worker. These stages call
the same geometry factories as the synchronous API. The worker transfers
vertex attributes and index buffers with material groups, bounds and scene
hierarchy; the runtime restores the buffers without repeating triangulation.
Material properties, linear color values, transforms, visibility and shared
resource references are retained.

The runtime renders and installs its controls before waiting for the board.
Its existing readiness promise includes the completed board and copper stages.
Disposing the runtime terminates the worker, cancels pending requests and
releases generated geometry and materials, including a result that arrives
after disposal.

By default the worker is loaded relative to the viewer source module and uses
`/node_modules/three/build/three.module.js`, matching the runtime's default
Three.js loader. Hosts must serve the worker's module graph with resolvable
dependency imports; document import maps are not inherited by module workers.
Bundlers can instead provide a worker factory through
`hooks.geometryWorkerOptions.workerFactory` and set
`hooks.geometryWorkerOptions.threeModuleUrl` to the same Three.js module used
by their runtime. Passing `workerFactory: null` disables the worker. These
options do not introduce a remote service or upload scene contents.

If workers are unavailable, blocked, fail to load, cannot clone a request or
return an unreadable result, the runtime falls back to the original geometry
factories after yielding a frame. This preserves complete geometry; the
synchronous fallback can still block the UI during triangulation. An
unresponsive request falls back after 120 seconds, configurable through
`hooks.geometryWorkerOptions.requestTimeoutMs`.
