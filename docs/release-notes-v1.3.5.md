# pcb-scene3d-viewer 1.3.5

The STEP loader now forwards a failed OCCT worker result with its resource
failure message instead of reporting only that the importer returned no meshes.
Failed loads are evicted from the model cache, so a later request can retry.

This release pairs with `@sunbox/occt-import-js` 0.0.29, which posts failures
as results rather than uncaught worker exceptions.
