<!--
SPDX-FileCopyrightText: 2026 André Fiedler
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# PCB Scene3D Viewer 1.2.2

Version 1.2.2 preserves canonical source identity and aligns solder-mask
coverage with the converged CircuitJSON contract.

## API and behavior changes

- Canonical document and prepared-context inputs now retain their exact
  `source.format` as the rendered scene's `sourceFormat`. Dense CircuitJSON
  arrays continue to use the `circuitjson` fallback because they carry no
  canonical source metadata.
- Routed traces and copper pours now default omitted
  `covered_with_solder_mask` values to covered. Explicit false values remain
  exposed through the solder mask.
- Standard vias now honor canonical `is_tented` metadata. Omitted values
  default to tented, while `is_tented: false` remains exposed.
- Covered canonical copper follows the existing solder-mask material palette,
  including tracks, pours, and via annuli.

Consumers that used the generic `circuitjson` marker for canonical documents
must now handle the retained source identity such as `gerber`, `altium`, or
`kicad`.

## Dependencies and validation

- Requires `circuitjson-toolkit ^1.1.2` and Node.js 20 or newer.
- The full test suite and both owned performance benchmarks cover the canonical
  source, coverage, material, exact-geometry, and prepared-context paths.
