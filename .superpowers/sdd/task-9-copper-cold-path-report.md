# Task 9 copper cold-path implementation report

## Outcome

Removed eager copper coverage preparation from paths that cannot consume it.
The covered-copper factory now creates a side context only when layer union is
enabled and a non-null track or arc needs clipping. The fill builder validates
or creates coverage only after the first polygon-boolean `null` fallback, then
reuses that context for every later fallback.

## RED evidence

- Polygon-boolean success created one unused builder context instead of zero.
- The multiple-fallback event sequence started with context preparation instead
  of waiting until the first `null` result.
- Union-disabled and fills-only factory builds each created two unused side
  contexts instead of zero.
- A top-side track and arc build created two side contexts instead of one and
  routed null bottom meshes through the prepared filter.
- The isolated 10,000-vertex cold-path test failed at 38.497 ms against its
  35.000 ms bound, while the direct builder median was 3.725 ms.

## Exactness and routing evidence

- Focused copper matrix: 55/55 passed.
- Full combined viewer suite: 539 passed, 0 failed, with the wall-clock cold
  test intentionally gated and skipped by default.
- Explicit gated cold-path test passed.
- A 92-case `5f7525e` versus working-tree differential matched exact position
  arrays, nulls, names, material identity, index state, Z, mirrored negative
  zero, holes, empty emitted prefixes, and supplied matching contexts.
- Deterministic context counts are now:
  - union disabled: zero;
  - fills-only polygon success: zero;
  - top track plus arc union: one context and two non-null filters;
  - builder polygon success: zero;
  - first plus later fallbacks: one context, created after the first `null` and
    reused by both prepared filters.
- Different-array stale contexts still fail `matchesLoopSets` and rebuild;
  matching request-local identity and source order are preserved.

## Performance evidence

Generated 10,000-vertex factory timings on the same process and machine:

- union disabled before: 50.968 ms warm median;
- union disabled after: 7.492 ms warm median;
- fills-only union before: 81.964 ms warm median;
- fills-only union after: 31.322 ms warm median.

Three complex benchmark runs retained the exact counts
`1242/1/200/240/15840/1224`. Copper timings were 49.977 ms, 49.457 ms, and
50.551 ms, all below the 53.669 ms gate.

## Quality and scope gates

- `npm run check:format`: passed.
- Scoped `git diff --check`: passed.
- Touched files are 975, 697, 93, 639, and 903 lines, all below 1,000.
- Prepared-polygon, benchmark, silkscreen, app, dependency, version, release,
  and publication work was left outside this commit.

## Review boundary

This report records implementation evidence only. The cold-path fix remains
pending independent review.
