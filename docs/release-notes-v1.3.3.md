# pcb-scene3d-viewer 1.3.3

Version 1.3.3 improves external STEP placement when source-authored anchors and
pre-oriented assemblies are present.

## STEP placement fidelity

- An explicit `preserveSourceAnchor` transform keeps a validated source body
  origin fixed without activating component-center recovery.
- Embedded STEP assemblies omit a duplicate quarter-turn only when their loaded
  mesh envelope proves that the authored depth and height axes are already
  exchanged.
- Board-space component yaw and the original external-model asset remain
  unchanged.

## Compatibility

- Detection uses source origin, projection metadata, mesh dimensions, and
  bounded error thresholds; it does not inspect filenames, project identities,
  component labels, or library names.
- Existing scene colors, board geometry, and public APIs remain unchanged.

## Verification

- Repository-owned tests cover preserved source anchors and embedded-axis
  normalization alongside the existing external-model placement suite.
- The complete package suite, formatting check, and npm package dry run are
  required for release.
