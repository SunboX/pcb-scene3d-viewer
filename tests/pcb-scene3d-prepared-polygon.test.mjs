import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dAabbIndex } from '../src/PcbScene3dAabbIndex.mjs'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dPreparedPolygon } from '../src/PcbScene3dPreparedPolygon.mjs'

const EPSILON = 0.001

/**
 * Returns true when a point lies on a segment using the current exact-query
 * tolerance arithmetic.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {number} epsilon
 * @returns {boolean}
 */
function referencePointOnSegment(point, start, end, epsilon) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const cross = (point.y - start.y) * dx - (point.x - start.x) * dy

    if (Math.abs(cross) > epsilon) {
        return false
    }

    const dot = (point.x - start.x) * dx + (point.y - start.y) * dy

    if (dot < -epsilon) {
        return false
    }

    return dot <= dx * dx + dy * dy + epsilon
}

/**
 * Returns true when a point lies on any polygon segment.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} points
 * @param {number} epsilon
 * @returns {boolean}
 */
function referencePointOnBoundary(point, points, epsilon) {
    for (let index = 0; index < points.length; index += 1) {
        if (
            referencePointOnSegment(
                point,
                points[index],
                points[(index + 1) % points.length],
                epsilon
            )
        ) {
            return true
        }
    }

    return false
}

/**
 * Returns true when a point is strictly inside a polygon using a linear
 * horizontal ray cast.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} points
 * @param {number} epsilon
 * @returns {boolean}
 */
function referenceContainsPointStrict(point, points, epsilon) {
    if (referencePointOnBoundary(point, points, epsilon)) {
        return false
    }

    let inside = false
    for (
        let index = 0, previousIndex = points.length - 1;
        index < points.length;
        previousIndex = index, index += 1
    ) {
        const current = points[index]
        const previous = points[previousIndex]
        const intersects =
            current.y > point.y !== previous.y > point.y &&
            point.x <
                ((previous.x - current.x) * (point.y - current.y)) /
                    (previous.y - current.y) +
                    current.x

        if (intersects) {
            inside = !inside
        }
    }

    return inside
}

/**
 * Resolves source-order polygon metadata independently of the prepared class.
 * @param {{ x: number, y: number }[]} points
 * @returns {{ bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, signedArea: number }}
 */
function referenceMetadata(points) {
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    }
    let totalX = 0
    let totalY = 0
    let doubledArea = 0

    for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        const next = points[(index + 1) % points.length]

        bounds.minX = Math.min(bounds.minX, point.x)
        bounds.maxX = Math.max(bounds.maxX, point.x)
        bounds.minY = Math.min(bounds.minY, point.y)
        bounds.maxY = Math.max(bounds.maxY, point.y)
        totalX += point.x
        totalY += point.y
        doubledArea += point.x * next.y - next.x * point.y
    }

    const count = Math.max(points.length, 1)
    return {
        bounds,
        centroid: { x: totalX / count, y: totalY / count },
        signedArea: doubledArea / 2
    }
}

/**
 * Builds evenly sampled points around a circle.
 * @param {number} count
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 * @returns {{ x: number, y: number }[]}
 */
function sampledCircle(count, centerX, centerY, radius) {
    return Array.from({ length: count }, (_unused, index) => {
        const angle = (index / count) * Math.PI * 2
        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds sampled circle points whose coordinate reads are observable.
 * @param {number} count Point count.
 * @param {{ count: number }} reads Shared coordinate-read counter.
 * @returns {{ x: number, y: number }[]}
 */
function countedSampledCircle(count, reads) {
    return Array.from({ length: count }, (_unused, index) => {
        const angle = (index / count) * Math.PI * 2
        const x = Math.cos(angle) * 10
        const y = Math.sin(angle) * 10
        const point = {}

        Object.defineProperties(point, {
            x: {
                enumerable: true,
                get() {
                    reads.count += 1
                    return x
                }
            },
            y: {
                enumerable: true,
                get() {
                    reads.count += 1
                    return y
                }
            }
        })
        return point
    })
}

/**
 * Mirrors a polygon across the Y axis without changing source order.
 * @param {{ x: number, y: number }[]} points
 * @returns {{ x: number, y: number }[]}
 */
function mirrorPolygon(points) {
    return points.map((point) => ({ x: -point.x, y: point.y }))
}

/**
 * Compares prepared exact predicates with independent linear references.
 * @param {string} label
 * @param {{ x: number, y: number }[]} points
 * @param {{ x: number, y: number }[]} probes
 * @param {number} [epsilon]
 * @returns {void}
 */
function assertDifferentialPredicates(
    label,
    points,
    probes,
    epsilon = EPSILON
) {
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon,
        detectCircle: false
    })

    for (const point of probes) {
        const boundary = referencePointOnBoundary(point, points, epsilon)
        const strict = referenceContainsPointStrict(point, points, epsilon)

        assert.equal(
            polygon.isPointOnBoundary(point),
            boundary,
            `${label}: boundary mismatch at ${JSON.stringify(point)}`
        )
        assert.equal(
            polygon.containsPointStrict(point),
            strict,
            `${label}: strict mismatch at ${JSON.stringify(point)}`
        )
        assert.equal(
            polygon.containsPointOrBoundary(point),
            boundary || strict,
            `${label}: inclusive mismatch at ${JSON.stringify(point)}`
        )
    }
}

/**
 * Returns true when two bounds overlap within an epsilon.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second
 * @param {number} epsilon
 * @returns {boolean}
 */
function boundsOverlap(first, second, epsilon) {
    return !(
        first.maxX < second.minX - epsilon ||
        first.minX > second.maxX + epsilon ||
        first.maxY < second.minY - epsilon ||
        first.minY > second.maxY + epsilon
    )
}

/**
 * Resolves conservative segment candidates with the existing linear semantics.
 * @param {import('../src/PcbScene3dPreparedPolygon.mjs').PcbScene3dPreparedPolygonSegment[]} segments
 * @param {{ minX: number, maxX: number, minY: number, maxY: number } | null | undefined} queryBounds
 * @param {number} epsilon
 * @returns {import('../src/PcbScene3dPreparedPolygon.mjs').PcbScene3dPreparedPolygonSegment[]}
 */
function referenceSegmentCandidates(segments, queryBounds, epsilon) {
    const finiteQuery =
        queryBounds && Object.values(queryBounds).every(Number.isFinite)
    return segments.filter((segment) => {
        if (!finiteQuery) {
            return true
        }
        const margin = Math.max(
            epsilon,
            (Math.SQRT2 * epsilon) / Math.sqrt(segment.lengthSquared)
        )
        const envelope = {
            minX: segment.bounds.minX - margin,
            maxX: segment.bounds.maxX + margin,
            minY: segment.bounds.minY - margin,
            maxY: segment.bounds.maxY + margin
        }
        return (
            !Object.values(envelope).every(Number.isFinite) ||
            boundsOverlap(envelope, queryBounds, 0)
        )
    })
}
test('preserves source identity and prepares source-order polygon metadata', () => {
    const points = [
        { x: -2, y: -1 },
        { x: 3, y: -1 },
        { x: 3, y: 2 },
        { x: -2, y: 2 }
    ]
    const source = { points }
    const polygon = new PcbScene3dPreparedPolygon(points, {
        source,
        sourceIndex: 17,
        epsilon: EPSILON,
        detectCircle: false
    })
    const metadata = referenceMetadata(points)

    assert.strictEqual(polygon.source, source)
    assert.equal(polygon.sourceIndex, 17)
    assert.strictEqual(polygon.points, points)
    assert.deepEqual(polygon.bounds, metadata.bounds)
    assert.deepEqual(polygon.centroid, metadata.centroid)
    assert.equal(polygon.signedArea, metadata.signedArea)
    assert.equal(polygon.area, Math.abs(metadata.signedArea))
    assert.equal(polygon.segments.length, points.length)
    assert.strictEqual(polygon.segments[0].start, points[0])
    assert.strictEqual(polygon.segments[0].end, points[1])
    assert.deepEqual(
        {
            dx: polygon.segments[0].dx,
            dy: polygon.segments[0].dy,
            lengthSquared: polygon.segments[0].lengthSquared,
            bounds: polygon.segments[0].bounds
        },
        {
            dx: 5,
            dy: 0,
            lengthSquared: 25,
            bounds: { minX: -2, maxX: 3, minY: -1, maxY: -1 }
        }
    )
    assert.strictEqual(polygon.segments.at(-1).end, points[0])
    assert.equal(polygon.circle, null)
    assert.equal(polygon.isCircular, false)
    assert.equal(polygon.centerX, undefined)
    assert.equal(polygon.centerY, undefined)
    assert.equal(polygon.radius, undefined)

    const defaultSource = new PcbScene3dPreparedPolygon(points, {
        detectCircle: false
    })
    const reversed = new PcbScene3dPreparedPolygon([...points].reverse(), {
        detectCircle: false
    })
    assert.strictEqual(defaultSource.source, points)
    assert.equal(reversed.signedArea, -metadata.signedArea)
    assert.equal(reversed.area, metadata.signedArea)
})

test('matches linear exact predicates for convex, concave, mirrored, and collinear polygons', () => {
    const convex = [
        { x: -4, y: -2 },
        { x: 5, y: -1 },
        { x: 4, y: 4 },
        { x: -3, y: 5 }
    ]
    const concave = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 6 },
        { x: 0, y: 6 }
    ]
    const collinear = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 }
    ]
    const fullyCollinear = [
        { x: -3, y: 1 },
        { x: -1, y: 1 },
        { x: 2, y: 1 },
        { x: 5, y: 1 }
    ]

    assertDifferentialPredicates('convex', convex, [
        { x: 0, y: 0 },
        { x: 4.5, y: 3 },
        { x: -4, y: -2 },
        { x: -5, y: 0 }
    ])
    assertDifferentialPredicates('concave', concave, [
        { x: 1, y: 1 },
        { x: 1, y: 5 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 2, y: 3 }
    ])
    assertDifferentialPredicates('mirrored', mirrorPolygon(concave), [
        { x: -1, y: 1 },
        { x: -1, y: 5 },
        { x: -4, y: 1 },
        { x: -4, y: 4 },
        { x: -2, y: 3 }
    ])
    assertDifferentialPredicates('collinear', collinear, [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 1 },
        { x: 5, y: 1 }
    ])
    assertDifferentialPredicates('fully collinear', fullyCollinear, [
        { x: -3, y: 1 },
        { x: 0, y: 1 },
        { x: 5.0001, y: 1 },
        { x: 0, y: 1.01 }
    ])
})

test('matches cross, dot, and length tolerance behavior near polygon boundaries', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 }
    ]

    assertDifferentialPredicates('epsilon boundary', points, [
        { x: 2, y: 0 },
        { x: 2, y: 0.0002 },
        { x: 2, y: -0.0002 },
        { x: 2, y: -0.0003 },
        { x: -0.0002, y: 0 },
        { x: -0.0003, y: 0 },
        { x: 4.0002, y: 4 },
        { x: 4.0003, y: 4 }
    ])

    const shortCollinear = [
        { x: 0, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.2, y: 0 }
    ]
    assertDifferentialPredicates('short tolerance segment', shortCollinear, [
        { x: 0.05, y: 0.004 },
        { x: -0.004, y: 0 },
        { x: 0.1, y: 0.02 }
    ])
})

test('keeps overflowing finite segment arithmetic candidate-complete', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 1e308, y: 1e308 },
        { x: 0, y: 1 }
    ]

    assertDifferentialPredicates('overflowing segment', points, [
        { x: 1.1e308, y: 1.1e308 }
    ])
})

test('matches linear predicates for a ten-thousand-point polygon', () => {
    const points = sampledCircle(10_000, 12, -8, 100)
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const probes = [
        { x: 12, y: -8 },
        { x: 111, y: -8 },
        { x: 112, y: -8 },
        { x: 112.01, y: -8 },
        { x: -30, y: 80 }
    ]

    assert.equal(polygon.segments.length, 10_000)
    for (const point of probes) {
        assert.equal(
            polygon.isPointOnBoundary(point),
            referencePointOnBoundary(point, points, EPSILON)
        )
        assert.equal(
            polygon.containsPointStrict(point),
            referenceContainsPointStrict(point, points, EPSILON)
        )
    }
})

test('resolves sampled-circle metadata once per construction', () => {
    const points = sampledCircle(64, 7, -3, 5)
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    let resolveCalls = 0

    /**
     * Counts real detector calls while preserving detector behavior.
     * @param {{ x: number, y: number }[]} candidatePoints
     * @param {number} epsilon
     * @returns {{ isCircular: true, centerX: number, centerY: number, radius: number } | null}
     */
    function countingResolve(candidatePoints, epsilon) {
        resolveCalls += 1
        return originalResolve.call(
            PcbScene3dCutoutCircleDetector,
            candidatePoints,
            epsilon
        )
    }

    PcbScene3dCutoutCircleDetector.resolve = countingResolve
    try {
        const polygon = new PcbScene3dPreparedPolygon(points, {
            epsilon: EPSILON,
            detectCircle: true
        })
        const disabled = new PcbScene3dPreparedPolygon(points, {
            epsilon: EPSILON,
            detectCircle: false
        })
        const circle = polygon.circle

        assert.equal(resolveCalls, 1)
        assert.strictEqual(polygon.circle, circle)
        assert.equal(polygon.isCircular, true)
        assert.ok(Math.abs(polygon.centerX - 7) < 1e-12)
        assert.ok(Math.abs(polygon.centerY + 3) < 1e-12)
        assert.ok(Math.abs(polygon.radius - 5) < 1e-12)
        assert.equal(disabled.circle, null)
        for (const point of [
            { x: 7, y: -3 },
            { x: 12, y: -3 },
            { x: 12.01, y: -3 },
            { x: 4, y: 1 }
        ]) {
            const boundary = referencePointOnBoundary(point, points, EPSILON)
            const strict = referenceContainsPointStrict(point, points, EPSILON)

            assert.equal(polygon.isPointOnBoundary(point), boundary)
            assert.equal(polygon.containsPointStrict(point), strict)
            assert.equal(
                polygon.containsPointOrBoundary(point),
                boundary || strict
            )
        }
        assert.equal(resolveCalls, 1)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
    }
})

test('reports whether circle detection was performed for non-circular polygons', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 3, y: 2 },
        { x: 0, y: 3 }
    ]
    const enabled = new PcbScene3dPreparedPolygon(points, {
        detectCircle: true
    })
    const disabled = new PcbScene3dPreparedPolygon(points, {
        detectCircle: false
    })
    const defaulted = new PcbScene3dPreparedPolygon(points)

    assert.equal(enabled.circle, null)
    assert.equal(disabled.circle, null)
    assert.equal(enabled.circleDetectionEnabled, true)
    assert.equal(disabled.circleDetectionEnabled, false)
    assert.equal(defaulted.circleDetectionEnabled, false)
})

test('uses optional metadata points without replacing exact predicate points', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
        { x: 0, y: 1 }
    ]
    const metadataPoints = [
        { x: -1, y: -1 },
        { x: 3, y: -1 },
        { x: 3, y: 3 },
        { x: -1, y: 3 }
    ]
    const polygon = new PcbScene3dPreparedPolygon(points, {
        metadataPoints,
        detectCircle: false
    })

    assert.strictEqual(polygon.points, points)
    assert.deepEqual(polygon.bounds, {
        minX: -1,
        maxX: 3,
        minY: -1,
        maxY: 3
    })
    assert.deepEqual(polygon.centroid, { x: 1, y: 1 })
    assert.equal(polygon.signedArea, 16)
    assert.equal(polygon.area, 16)
    assert.strictEqual(polygon.segments[0].start, points[0])
    assert.strictEqual(polygon.segments[0].end, points[1])
    assert.equal(
        polygon.containsPointStrict({ x: 2.5, y: 2.5 }),
        referenceContainsPointStrict({ x: 2.5, y: 2.5 }, points, EPSILON)
    )
    assert.equal(
        polygon.isPointOnBoundary({ x: 3, y: 1 }),
        referencePointOnBoundary({ x: 3, y: 1 }, points, EPSILON)
    )
    assert.deepEqual(
        polygon.queryVertices(
            { minX: 2.9, maxX: 3.1, minY: 2.9, maxY: 3.1 },
            []
        ),
        []
    )
})

test('reports the prepared point representation for cache compatibility', () => {
    const rawPoints = [{ x: 1 }, {}, { y: 1 }, {}]
    const numericPoints = [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 0 }
    ]
    const raw = new PcbScene3dPreparedPolygon(rawPoints, {
        metadataPoints: numericPoints,
        pointRepresentation: 'raw'
    })
    const numeric = new PcbScene3dPreparedPolygon(numericPoints, {
        pointRepresentation: 'numeric'
    })
    const rawNumeric = new PcbScene3dPreparedPolygon(numericPoints, {
        pointRepresentation: 'raw-numeric'
    })
    const unspecified = new PcbScene3dPreparedPolygon(numericPoints)

    assert.equal(raw.pointRepresentation, 'raw')
    assert.equal(numeric.pointRepresentation, 'numeric')
    assert.equal(rawNumeric.pointRepresentation, 'raw-numeric')
    assert.equal(unspecified.pointRepresentation, null)
})

test('keeps raw non-finite vertices and segments candidate-complete', () => {
    const points = [{ x: 1 }, {}, { y: 1 }, {}]
    const metadataPoints = [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 0 }
    ]
    const polygon = new PcbScene3dPreparedPolygon(points, {
        metadataPoints,
        detectCircle: false
    })
    const distantBounds = { minX: 100, maxX: 101, minY: 100, maxY: 101 }
    const vertexCandidates = polygon.queryVertices(distantBounds, [])
    const segmentCandidates = polygon.querySegments(distantBounds, [])

    assert.deepEqual(polygon.bounds, {
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1
    })
    for (const point of points) {
        assert.ok(vertexCandidates.includes(point))
    }
    for (const segment of polygon.segments) {
        assert.ok(segmentCandidates.includes(segment))
        assert.strictEqual(
            segment.start,
            points[polygon.segments.indexOf(segment)]
        )
    }
})

test('runs optional circle detection against exact points', () => {
    const metadataPoints = sampledCircle(8, 0, 0, 5)
    const points = metadataPoints.map((point) => ({ ...point }))
    points[0] = { x: points[0].x }
    const polygon = new PcbScene3dPreparedPolygon(points, {
        metadataPoints,
        detectCircle: true
    })

    assert.equal(polygon.circleDetectionEnabled, true)
    assert.equal(polygon.circle, null)
    assert.equal(polygon.isCircular, false)
})

test('returns complete segment and vertex broad-phase candidates into targets', () => {
    const points = [
        { x: -5, y: -3 },
        { x: 0, y: -4 },
        { x: 6, y: -1 },
        { x: 7, y: 4 },
        { x: 1, y: 7 },
        { x: -4, y: 5 }
    ]
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const queryBounds = { minX: -0.5, maxX: 1, minY: -4.0015, maxY: 1 }
    const expectedSegments = polygon.segments.filter((segment) =>
        boundsOverlap(segment.bounds, queryBounds, EPSILON)
    )
    const expectedVertices = points.filter((point) =>
        boundsOverlap(
            {
                minX: point.x,
                maxX: point.x,
                minY: point.y,
                maxY: point.y
            },
            queryBounds,
            EPSILON
        )
    )
    const segmentSentinel = { sentinel: 'segments' }
    const vertexSentinel = { sentinel: 'vertices' }
    const segmentTarget = [segmentSentinel]
    const vertexTarget = [vertexSentinel]

    assert.strictEqual(
        polygon.querySegments(queryBounds, segmentTarget),
        segmentTarget
    )
    assert.strictEqual(
        polygon.queryVertices(queryBounds, vertexTarget),
        vertexTarget
    )
    assert.strictEqual(segmentTarget[0], segmentSentinel)
    assert.strictEqual(vertexTarget[0], vertexSentinel)
    for (const segment of expectedSegments) {
        assert.ok(segmentTarget.includes(segment))
    }
    for (const point of expectedVertices) {
        assert.ok(vertexTarget.includes(point))
    }
})

test('builds large segment and vertex indexes lazily once', () => {
    const pointReads = { count: 0 }
    const points = countedSampledCircle(128, pointReads)
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const firstSegment = polygon.segments[0]
    const firstSegmentBounds = firstSegment.bounds
    let segmentBoundsReads = 0
    Object.defineProperty(firstSegment, 'bounds', {
        configurable: true,
        enumerable: true,
        get() {
            segmentBoundsReads += 1
            return firstSegmentBounds
        }
    })
    const queryBounds = { minX: -11, maxX: 11, minY: -11, maxY: 11 }
    pointReads.count = 0

    assert.equal(pointReads.count, 0)
    assert.equal(segmentBoundsReads, 0)

    assert.equal(polygon.queryVertices(queryBounds, []).length, points.length)
    const pointReadsAfterFirstQuery = pointReads.count
    assert.ok(pointReadsAfterFirstQuery > 0)
    assert.equal(polygon.queryVertices(queryBounds, []).length, points.length)
    assert.equal(pointReads.count, pointReadsAfterFirstQuery)

    assert.equal(
        polygon.querySegments(queryBounds, []).length,
        polygon.segments.length
    )
    const boundsReadsAfterFirstQuery = segmentBoundsReads
    assert.ok(boundsReadsAfterFirstQuery > 0)
    assert.equal(
        polygon.querySegments(queryBounds, []).length,
        polygon.segments.length
    )
    assert.equal(segmentBoundsReads, boundsReadsAfterFirstQuery)
})

test('scans initial small polygon candidates linearly', () => {
    const pointReads = { count: 0 }
    const points = countedSampledCircle(32, pointReads)
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const firstSegment = polygon.segments[0]
    const firstSegmentBounds = firstSegment.bounds
    let segmentBoundsReads = 0
    Object.defineProperty(firstSegment, 'bounds', {
        configurable: true,
        enumerable: true,
        get() {
            segmentBoundsReads += 1
            return firstSegmentBounds
        }
    })
    const queryBounds = { minX: -11, maxX: 11, minY: -11, maxY: 11 }
    pointReads.count = 0

    assert.equal(polygon.queryVertices(queryBounds, []).length, points.length)
    const pointReadsAfterFirstQuery = pointReads.count
    assert.ok(pointReadsAfterFirstQuery > 0)
    assert.equal(polygon.queryVertices(queryBounds, []).length, points.length)
    assert.ok(pointReads.count > pointReadsAfterFirstQuery)

    assert.equal(
        polygon.querySegments(queryBounds, []).length,
        polygon.segments.length
    )
    const boundsReadsAfterFirstQuery = segmentBoundsReads
    assert.ok(boundsReadsAfterFirstQuery > 0)
    assert.equal(
        polygon.querySegments(queryBounds, []).length,
        polygon.segments.length
    )
    assert.ok(segmentBoundsReads > boundsReadsAfterFirstQuery)
})

test('promotes repeated small segment queries', () => {
    const originalQueryInto = PcbScene3dAabbIndex.prototype.queryInto
    let indexedQueries = 0
    PcbScene3dAabbIndex.prototype.queryInto = function (...args) {
        indexedQueries += 1
        return originalQueryInto.apply(this, args)
    }
    try {
        const polygon = new PcbScene3dPreparedPolygon(
            sampledCircle(32, 0, 0, 10),
            { epsilon: EPSILON, detectCircle: false }
        )
        const queryBounds = { minX: 9, maxX: 10.1, minY: -1, maxY: 1 }
        polygon.querySegments(queryBounds, [])
        assert.equal(indexedQueries, 0)
        for (let queryIndex = 0; queryIndex < 256; queryIndex += 1) {
            polygon.querySegments(queryBounds, [])
        }
        assert.ok(indexedQueries > 0)
        const points = sampledCircle(32, 0, 0, 10)
        points[5] = { ...points[4] }
        points[12] = { x: Number.NaN, y: points[12].y }
        points[20] = { x: Number.POSITIVE_INFINITY, y: points[20].y }
        const exactPolygon = new PcbScene3dPreparedPolygon(points, {
            epsilon: EPSILON,
            detectCircle: false
        })
        const finiteQueries = []
        for (let y = -12; y <= 12; y += 6) {
            for (let x = -12; x <= 12; x += 6) {
                finiteQueries.push({
                    minX: x - 0.5,
                    maxX: x + 0.5,
                    minY: y - 0.5,
                    maxY: y + 0.5
                })
            }
        }
        const queries = [
            ...finiteQueries,
            undefined,
            { minX: Number.NaN, maxX: 0, minY: 0, maxY: 0 },
            {
                minX: Number.NEGATIVE_INFINITY,
                maxX: Number.POSITIVE_INFINITY,
                minY: Number.NEGATIVE_INFINITY,
                maxY: Number.POSITIVE_INFINITY
            }
        ]
        const indexedQueriesBeforePromotion = indexedQueries
        for (let queryIndex = 0; queryIndex < 256; queryIndex += 1) {
            exactPolygon.querySegments(finiteQueries[0], [])
        }
        assert.ok(indexedQueries > indexedQueriesBeforePromotion)
        for (const query of queries) {
            const expected = referenceSegmentCandidates(
                exactPolygon.segments,
                query,
                EPSILON
            )
            const actual = exactPolygon.querySegments(query, [])
            assert.deepEqual(actual, expected)
        }
    } finally {
        PcbScene3dAabbIndex.prototype.queryInto = originalQueryInto
    }
})

test('terminates when the small vertex source is also the query target', () => {
    const polygon = new PcbScene3dPreparedPolygon(sampledCircle(4, 0, 0, 1), {
        epsilon: EPSILON,
        detectCircle: false
    })
    const target = polygon.points
    const original = target.slice()
    let appended = 0
    Object.defineProperty(target, 'push', {
        configurable: true,
        value(...items) {
            appended += items.length
            assert.ok(appended <= original.length, 'vertex scan did not stop')
            return Array.prototype.push.apply(this, items)
        }
    })

    assert.strictEqual(polygon.queryVertices(undefined, target), target)
    assert.equal(appended, original.length)
    assert.deepEqual(target.slice(original.length), original)
})

test('terminates when the small segment source is also the query target', () => {
    const polygon = new PcbScene3dPreparedPolygon(sampledCircle(4, 0, 0, 1), {
        epsilon: EPSILON,
        detectCircle: false
    })
    const target = polygon.segments
    const original = target.slice()
    let appended = 0
    Object.defineProperty(target, 'push', {
        configurable: true,
        value(...items) {
            appended += items.length
            assert.ok(appended <= original.length, 'segment scan did not stop')
            return Array.prototype.push.apply(this, items)
        }
    })

    assert.strictEqual(polygon.querySegments(undefined, target), target)
    assert.equal(appended, original.length)
    assert.deepEqual(target.slice(original.length), original)
})

test('matches AABB fallback semantics for unusual small-query bounds', () => {
    const points = [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 }
    ]
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const queries = [
        { minX: Number.NaN, maxX: 0, minY: 0, maxY: 0 },
        {
            minX: Number.NEGATIVE_INFINITY,
            maxX: Number.POSITIVE_INFINITY,
            minY: Number.NEGATIVE_INFINITY,
            maxY: Number.POSITIVE_INFINITY
        },
        { minX: 1, maxX: -1, minY: 1, maxY: -1 },
        { minX: 2 + EPSILON, maxX: 3, minY: -2, maxY: -2 }
    ]

    for (const query of queries) {
        const finiteQuery = Object.values(query).every(Number.isFinite)
        const expectedVertices = finiteQuery
            ? points.filter((point) =>
                  boundsOverlap(
                      {
                          minX: point.x,
                          maxX: point.x,
                          minY: point.y,
                          maxY: point.y
                      },
                      query,
                      EPSILON
                  )
              )
            : points
        const expectedSegments = referenceSegmentCandidates(
            polygon.segments,
            query,
            EPSILON
        )

        assert.deepEqual(polygon.queryVertices(query, []), expectedVertices)
        assert.deepEqual(polygon.querySegments(query, []), expectedSegments)
    }
})

test('keeps missing small-query bounds conservative like the AABB fallback', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 }
    ]
    const polygon = new PcbScene3dPreparedPolygon(points, {
        epsilon: EPSILON,
        detectCircle: false
    })
    const segmentSentinel = { sentinel: 'segment' }
    const vertexSentinel = { sentinel: 'vertex' }
    const segmentTarget = [segmentSentinel]
    const vertexTarget = [vertexSentinel]

    assert.strictEqual(
        polygon.querySegments(undefined, segmentTarget),
        segmentTarget
    )
    assert.strictEqual(polygon.queryVertices(null, vertexTarget), vertexTarget)
    assert.strictEqual(segmentTarget[0], segmentSentinel)
    assert.strictEqual(vertexTarget[0], vertexSentinel)
    assert.deepEqual(segmentTarget.slice(1), polygon.segments)
    assert.deepEqual(vertexTarget.slice(1), points)
})
