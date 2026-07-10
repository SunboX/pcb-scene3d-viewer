import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'
import { PcbScene3dSilkscreenCutoutContext } from '../src/PcbScene3dSilkscreenCutoutContext.mjs'
import { PcbScene3dSilkscreenFillSeamBuilder } from '../src/PcbScene3dSilkscreenFillSeamBuilder.mjs'

test('reuses one circular raw-numeric preparation within a context', () => {
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
        const prepared = context.resolve(cutout)

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
