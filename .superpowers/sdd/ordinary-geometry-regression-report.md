# Ordinary geometry regression report

## Outcome

Prepared polygons now defer segment and vertex AABB construction until a large
query actually needs each index. Polygons with at most 64 points use
candidate-complete linear scans instead, avoiding index setup for ordinary
32-point drill circles while retaining indexed behavior for dense geometry.

The benchmark retains every complex field and now also reports separate
ordinary drill and ordinary circular-cutout timings and counts.

## Root cause

`PcbScene3dPreparedPolygon` previously built both indexes in every constructor.
Separated ordinary drill polygons never issue per-polygon segment or vertex
queries after their top-level bounds checks. Circular cutout filtering uses its
analytic overlap path and only conditionally asks for segment candidates. Both
workloads therefore paid for mostly or wholly unused indexes.

## TDD evidence

- A 128-point getter-instrumented polygon failed RED because its first segment
  and vertex queries caused zero new metadata reads: both indexes had already
  been built eagerly.
- A 32-point getter-instrumented polygon failed RED because repeated queries
  also caused zero new reads instead of linear candidate scans.
- A missing-bounds regression failed RED with a `TypeError`; the previous AABB
  path treated a non-finite or absent query as all-space.
- Independent review found that aliasing the exposed points or segments array
  as the query target made `for...of` consume its own appended candidates. Both
  guarded four-point tests failed RED on a fifth append.
- After the fix, large indexes build on the first relevant query and are reused,
  small queries scan on every call, and missing/non-finite queries conservatively
  return every candidate into the caller-owned target.
- Fixed-length indexed scans make both alias-target regressions terminate after
  exactly the original candidate count.

## Exactness evidence

- Prepared/AABB/drill/cutout exact matrix: 45/45 passed after the final
  conservative-bounds regression.
- The broader prepared, drill, cutout, copper, silkscreen-cache, and exact-buffer
  matrix passed 67/67 before the final isolated bounds test.
- Existing non-finite/all-space, epsilon-boundary, zero-length, sparse raw,
  cache-order, 10,000-point, recursive-order, and target-reuse cases remain
  green.
- A focused small-query parity matrix covers `NaN`, infinite, reversed,
  epsilon-boundary, and zero-length AABB behavior.
- Ordinary benchmark counts remain exactly 200 drill survivors and 15,840
  cutout positions. Complex counts remain 1,242 copper positions, one drill
  survivor, 240 cutout positions, and 1,224 small positions.

## Performance evidence

Controller-provided immutable evidence:

- Ordinary drill baseline: about 0.842 ms; eager-index head: about 3.342 ms.
- Ordinary circular cutout baseline: about 5.43 ms; eager-index head: about
  9.02 ms.

Five post-fix warm runs produced these medians-of-runs:

- Ordinary drill: 0.619 ms, faster than baseline and about 81% below the
  reported eager-index head.
- Ordinary circular cutout: 4.647 ms, faster than baseline and about 48% below
  the reported eager-index head.
- Complex copper: 50.436 ms, about 10.6x versus the corrected 535.7 ms baseline.
- Complex drill: 4.337 ms, about 11.3x versus the corrected 49.1 ms baseline.
- Complex cutout: 6.192 ms, about 9.2x versus the corrected 56.8 ms baseline.
- Small geometry: 0.941 ms, about 0.06 ms above the corrected ordinary baseline
  and within the 1 ms gate.

Three fresh runs after integrating the independent copper cold-path commit
produced these medians-of-runs:

- Ordinary drill: 0.624 ms.
- Ordinary circular cutout: 4.623 ms.
- Complex copper: 50.560 ms.
- Complex drill: 3.827 ms.
- Complex cutout: 6.502 ms.
- Small geometry: 1.158 ms.

Every run retained the exact expected position/survivor counts.

Three post-review-remediation runs produced these medians-of-runs:

- Ordinary drill: 0.587 ms.
- Ordinary circular cutout: 4.786 ms.
- Complex copper: 52.023 ms.
- Complex drill: 3.313 ms.
- Complex cutout: 6.306 ms.
- Small geometry: 1.000 ms.

Every remediation run also retained all exact expected counts.

## Quality and scope

- Owned files: benchmark script, prepared polygon implementation, and prepared
  polygon tests only.
- Owned file lengths: 323, 691, and 804 lines.
- The combined repository passes `npm run check:format`; owned diffs pass
  `git diff --check`.
- The final combined `npm test` run, including the concurrent silkscreen review
  changes, passed 544 tests with 0 failures and one intentional timing-gated
  skip.
- No CopperFactory, CopperFillMeshBuilder, SilkscreenFactory, app, dependency,
  release, or publication changes were made by this task.
- The independent copper cold-path change is already committed separately as
  `d7791d4`; this task's commit excludes those files.

Fresh independent review remains required before this regression fix is
accepted.
