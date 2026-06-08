# Testing

Run all tests with:

```bash
npm test
```

The test suite covers:

- geometry factories for board solids, pads, vias, drills, solder mask,
  copper, and silkscreen;
- runtime camera, preset, resizing, selection, and visibility behavior;
- external STEP/WRL placement and load ordering;
- model ZIP archive export;
- optional shell renderer and CSS contract;
- worker-client request routing.

Tests use fake scene descriptions and fake model payloads only. Do not add
customer, vendor, or source-derived fixture identifiers.

Use focused tests for behavior changes. Parser and scene-description builder
tests belong in the format-specific toolkits, not in this viewer package.
