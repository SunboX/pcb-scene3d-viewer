import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'
import { PcbScene3dSilkscreenCutoutContext } from '../src/PcbScene3dSilkscreenCutoutContext.mjs'
import { PcbScene3dSilkscreenFillSeamBuilder } from '../src/PcbScene3dSilkscreenFillSeamBuilder.mjs'

test('defers and reuses one circular raw-numeric preparation within a context', () => {
    const cutout = sampledCircle(32, 3, -4, 7)
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    let detectorCalls = 0

    PcbScene3dCutoutCircleDetector.resolve = (points, epsilon) => {
        detectorCalls += 1
        return originalResolve.call(
            PcbScene3dCutoutCircleDetector,
            points,
            epsilon
        )
    }
    try {
        const context = new PcbScene3dSilkscreenCutoutContext([cutout])

        assert.equal(context.preparedPolygonCache.size, 0)
        assert.equal(detectorCalls, 0)
        assert.equal(context.preparedPolygonCache.has(cutout), true)
        const prepared = context.preparedPolygonCache.get(cutout)
        assert.strictEqual(context.resolve(cutout), prepared)
        assert.strictEqual(context.preparedPolygonCache.get(cutout), prepared)
        assert.strictEqual(context.resolveCircle(cutout), prepared.circle)
        assert.equal(prepared.pointRepresentation, 'raw-numeric')
        assert.equal(prepared.circleDetectionEnabled, true)
        assert.equal(detectorCalls, 1)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
    }
})

test('reuses a compatible lazy cache entry without rescanning source points', () => {
    let coordinateReads = 0
    const cutout = sampledCircle(16, 0, 0, 5).map((point) => ({
        get x() {
            coordinateReads += 1
            return point.x
        },
        get y() {
            coordinateReads += 1
            return point.y
        }
    }))
    const context = new PcbScene3dSilkscreenCutoutContext()
    const prepared = context.preparedPolygonCache.get(cutout)

    coordinateReads = 0

    assert.equal(context.preparedPolygonCache.has(cutout), true)
    assert.strictEqual(context.preparedPolygonCache.get(cutout), prepared)
    assert.equal(coordinateReads, 0)
})

test('rejects invalid and non-normalized sources without caching them', () => {
    const context = new PcbScene3dSilkscreenCutoutContext()
    const invalidSources = [
        null,
        [],
        [
            { x: 0, y: 0 },
            { x: 1, y: 0 }
        ],
        [
            { x: '0', y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 }
        ],
        [{ x: 0, y: 0 }, { y: 0 }, { x: 0, y: 1 }],
        [
            { x: 0, y: 0 },
            { x: Number.NaN, y: 0 },
            { x: 0, y: 1 }
        ],
        [
            { x: 0, y: 0 },
            { x: Infinity, y: 0 },
            { x: 0, y: 1 }
        ]
    ]

    for (const source of invalidSources) {
        assert.equal(context.resolve(source), null)
        assert.equal(context.resolveCircle(source), null)
        assert.equal(context.preparedPolygonCache.has(source), false)
    }
    assert.equal(context.preparedPolygonCache.size, 0)

    const mutatedSource = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
    ]
    assert.ok(context.resolve(mutatedSource))
    mutatedSource[1].x = Number.NaN

    assert.equal(context.resolve(mutatedSource), null)
    assert.equal(context.preparedPolygonCache.has(mutatedSource), false)
})

test('rejects holey point arrays without throwing or caching them', () => {
    const emptySlots = new Array(3)
    const deletedSlot = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
    ]
    delete deletedSlot[1]
    let context

    assert.doesNotThrow(() => {
        context = new PcbScene3dSilkscreenCutoutContext([
            emptySlots,
            deletedSlot
        ])
    })
    for (const source of [emptySlots, deletedSlot]) {
        assert.equal(context.resolve(source), null)
        assert.equal(context.resolveCircle(source), null)
        assert.equal(context.isHoleInsideContour(source, []), false)
        assert.equal(context.preparedPolygonCache.has(source), false)
    }
    assert.deepEqual(
        context.applyCircularEdgeCutouts([], [emptySlots, deletedSlot]),
        { points: [], appliedCutouts: [] }
    )
    assert.equal(context.preparedPolygonCache.size, 0)
})

test('evicts a cached source after a point slot is deleted', () => {
    const cutout = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 }
    ]
    const context = new PcbScene3dSilkscreenCutoutContext([cutout])

    assert.ok(context.preparedPolygonCache.has(cutout))
    delete cutout[1]

    assert.equal(context.resolve(cutout), null)
    assert.equal(context.resolveCircle(cutout), null)
    assert.equal(context.preparedPolygonCache.has(cutout), false)
})

test('leaves numeric-string polygons for drill-compatible preparation', () => {
    const outer = stringSquare(0, 0, 10)
    const inner = stringSquare(2, 2, 2)
    const context = new PcbScene3dSilkscreenCutoutContext([outer, inner])
    const freshResult = PcbScene3dDrillCutoutFilter.removeNestedCutouts([
        outer,
        inner
    ])

    assert.equal(context.preparedPolygonCache.size, 0)
    assert.deepEqual(freshResult, [outer])
    assert.deepEqual(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts([outer, inner], {
            preparedPolygonCache: context.preparedPolygonCache
        }),
        freshResult
    )
})

test('leaves sparse polygons for geometry-compatible preparation', () => {
    const cutout = [{ x: 1 }, {}, { y: 1 }, {}]
    const context = new PcbScene3dSilkscreenCutoutContext([cutout])
    const options = { maxDepth: 0, discardTerminalOverlaps: false }
    const freshGeometry = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        triangleGeometry(),
        [cutout],
        options
    )

    assert.equal(context.resolve(cutout), null)
    assert.equal(context.preparedPolygonCache.size, 0)
    const sharedGeometry = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        triangleGeometry(),
        [cutout],
        {
            ...options,
            preparedPolygonCache: context.preparedPolygonCache
        }
    )

    assert.deepEqual(
        positionArray(sharedGeometry),
        positionArray(freshGeometry)
    )
    assert.deepEqual(positionArray(freshGeometry), [])
})

test('handles invalid public containment and edge-cutout inputs safely', () => {
    const context = new PcbScene3dSilkscreenCutoutContext()
    const contour = [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 }
    ]
    const invalid = stringSquare(-2, -2, 4)

    assert.equal(context.isHoleInsideContour(invalid, contour), false)
    assert.deepEqual(
        context.applyCircularEdgeCutouts(contour, [invalid, null, []]),
        { points: contour, appliedCutouts: [] }
    )
    assert.equal(context.preparedPolygonCache.size, 0)
})

test('a fresh context observes coordinates mutated after an earlier preparation', () => {
    const cutout = sampledCircle(16, 0, 0, 5)
    const firstContext = new PcbScene3dSilkscreenCutoutContext([cutout])
    const firstCircle = firstContext.resolveCircle(cutout)

    for (const point of cutout) {
        point.x += 20
        point.y -= 8
    }

    const secondContext = new PcbScene3dSilkscreenCutoutContext([cutout])
    const secondCircle = secondContext.resolveCircle(cutout)

    assert.notStrictEqual(
        secondContext.resolve(cutout),
        firstContext.resolve(cutout)
    )
    assert.ok(Math.abs(firstCircle.centerX) < 1e-12)
    assert.ok(Math.abs(firstCircle.centerY) < 1e-12)
    assert.ok(Math.abs(secondCircle.centerX - 20) < 1e-12)
    assert.ok(Math.abs(secondCircle.centerY + 8) < 1e-12)
})

test('keeps one preparation through drill and geometry consumers', () => {
    const cutout = sampledCircle(32, 0, 0, 5)
    const context = new PcbScene3dSilkscreenCutoutContext([cutout])
    const prepared = context.resolve(cutout)

    PcbScene3dDrillCutoutFilter.removeNestedCutouts([cutout], {
        preparedPolygonCache: context.preparedPolygonCache
    })
    assert.strictEqual(context.preparedPolygonCache.get(cutout), prepared)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-8, -8, 0, 8, -8, 0, 0, 8, 0], 3)
    )
    PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, [cutout], {
        maxDepth: 0,
        preparedPolygonCache: context.preparedPolygonCache
    })

    assert.strictEqual(context.preparedPolygonCache.get(cutout), prepared)
})

test('applies circular edge cutouts and reuses resolved containment metadata', () => {
    const contour = [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 }
    ]
    const edgeCutout = sampledCircle(32, 10, 0, 3)
    const context = new PcbScene3dSilkscreenCutoutContext([edgeCutout])
    const result = context.applyCircularEdgeCutouts(contour, [edgeCutout])

    assert.deepEqual(result.appliedCutouts, [edgeCutout])
    assert.notDeepEqual(result.points, contour)
    assert.equal(context.isHoleInsideContour(edgeCutout, contour), false)
})

test('reuses the context preparation while filtering fill seam geometry', () => {
    const cutout = sampledCircle(32, 0, 0, 5)
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    let detectorCalls = 0

    PcbScene3dCutoutCircleDetector.resolve = (points, epsilon) => {
        detectorCalls += 1
        return originalResolve.call(
            PcbScene3dCutoutCircleDetector,
            points,
            epsilon
        )
    }
    try {
        const context = new PcbScene3dSilkscreenCutoutContext([cutout])
        const material = new THREE.MeshBasicMaterial()

        PcbScene3dSilkscreenFillSeamBuilder.buildMeshes(
            THREE,
            [
                {
                    points: [
                        { x: -10, y: -10 },
                        { x: 10, y: -10 },
                        { x: 10, y: 10 },
                        { x: -10, y: 10 }
                    ]
                }
            ],
            0,
            (x, y) => ({ x, y }),
            false,
            material,
            [cutout],
            { preparedPolygonCache: context.preparedPolygonCache }
        )

        assert.equal(detectorCalls, 1)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
    }
})

/**
 * Builds one sampled circular polygon.
 * @param {number} pointCount Point count.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Radius.
 * @returns {{ x: number, y: number }[]}
 */
function sampledCircle(pointCount, centerX, centerY, radius) {
    return Array.from({ length: pointCount }, (_value, index) => {
        const angle = (index / pointCount) * Math.PI * 2

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds one square with numeric-string coordinates.
 * @param {number} x Minimum X.
 * @param {number} y Minimum Y.
 * @param {number} size Side length.
 * @returns {{ x: string, y: string }[]}
 */
function stringSquare(x, y, size) {
    return [
        { x: String(x), y: String(y) },
        { x: String(x + size), y: String(y) },
        { x: String(x + size), y: String(y + size) },
        { x: String(x), y: String(y + size) }
    ]
}

/**
 * Builds the exact sparse-cutout review triangle.
 * @returns {THREE.BufferGeometry}
 */
function triangleGeometry() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [0.1, 0.1, 1, 0.4, 0.1, 2, 0.1, 0.4, 3],
            3
        )
    )
    return geometry
}

/**
 * Returns flattened positions from one geometry.
 * @param {THREE.BufferGeometry} geometry Geometry to inspect.
 * @returns {number[]}
 */
function positionArray(geometry) {
    return Array.from(geometry.getAttribute('position').array)
}
