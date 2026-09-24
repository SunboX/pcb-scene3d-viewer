# pcb-scene3d-viewer 1.3.6

This release requires `@sunbox/occt-import-js` 0.0.29 so installs of the viewer
use the worker that returns resource failures to the STEP loader. It avoids a
nested copy of the earlier worker when the host app also uses 0.0.29.

The STEP loader behavior introduced in 1.3.5 is unchanged.
