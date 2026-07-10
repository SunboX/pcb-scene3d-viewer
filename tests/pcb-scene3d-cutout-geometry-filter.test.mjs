import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'

/**
 * Builds one triangle geometry centered inside the test cutout.
 * @returns {THREE.BufferGeometry}
 */
function buildCoveredTriangleGeometry() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [-300, -300, 0, 300, -300, 0, 0, 300, 0],
            3
        )
    )
    return geometry
}

/**
 * Builds a many-point square contour around the test triangle.
 * @param {number} size Contour width and height.
 * @param {number} pointsPerSide Number of points along each side.
 * @returns {{ x: number, y: number }[]}
 */
function buildSquareContour(size, pointsPerSide) {
    const points = []
    const halfSize = size / 2

    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: -halfSize + (size * index) / pointsPerSide,
            y: -halfSize
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: halfSize,
            y: -halfSize + (size * index) / pointsPerSide
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: halfSize - (size * index) / pointsPerSide,
            y: halfSize
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: -halfSize,
            y: halfSize - (size * index) / pointsPerSide
        })
    }

    return points
}

test('PcbScene3dCutoutGeometryFilter skips subdivision for fully covered complex triangles', () => {
    const geometry = buildCoveredTriangleGeometry()
    const cutout = buildSquareContour(1000, 160)
    const preparedPolygonCache = new Map()
    const startedAt = performance.now()

    const filteredGeometry = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [null, cutout, [{ x: 0, y: 0 }]],
        {
            maxDepth: 9,
            maxEdgeLength: 2,
            discardTerminalOverlaps: true,
            preparedPolygonCache
        }
    )
    const elapsedMs = performance.now() - startedAt

    assert.equal(filteredGeometry.getAttribute('position').count, 0)
    assert.equal(preparedPolygonCache.size, 1)
    assert.ok(preparedPolygonCache.has(cutout))
    const preparedCutout = preparedPolygonCache.get(cutout)
    PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, [cutout], {
        preparedPolygonCache
    })
    assert.strictEqual(preparedPolygonCache.get(cutout), preparedCutout)
    assert.ok(
        elapsedMs < 100,
        `Expected fully covered triangle filtering under 100 ms, got ${elapsedMs.toFixed(
            1
        )} ms`
    )
})
