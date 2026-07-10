import assert from 'node:assert/strict'
import test from 'node:test'
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
