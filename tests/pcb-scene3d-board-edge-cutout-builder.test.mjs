import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { PcbScene3dBoardEdgeCutoutBuilder } from '../src/PcbScene3dBoardEdgeCutoutBuilder.mjs'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'

test('PcbScene3dBoardEdgeCutoutBuilder treats a supplied null circle as resolved', () => {
    const contour = buildSampledRectangleContour(100, 100, 4)
    const hole = buildCircularHole(0, 0, 5)
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    let detectorCalls = 0

    PcbScene3dCutoutCircleDetector.resolve = () => {
        detectorCalls += 1
        return originalResolve.call(PcbScene3dCutoutCircleDetector, hole)
    }
    try {
        assert.equal(
            PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                hole,
                contour,
                null
            ),
            true
        )
        assert.equal(detectorCalls, 0)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
    }
})

test('PcbScene3dBoardEdgeCutoutBuilder recognizes sampled circular holes without repeated contour scans', () => {
    const contour = buildSampledRectangleContour(1200, 900, 80)
    const holes = Array.from({ length: 900 }, (_value, index) =>
        buildCircularHole(
            -520 + (index % 30) * 36,
            -380 + Math.floor(index / 30) * 26,
            8
        )
    )
    const start = performance.now()
    const insideCount = holes.filter((hole) =>
        PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(hole, contour)
    ).length
    const elapsed = performance.now() - start

    assert.equal(insideCount, holes.length)
    assert.ok(
        elapsed < 65,
        `sampled circular hole checks took ${elapsed.toFixed(1)}ms`
    )
})

/**
 * Builds a rectangular contour with multiple sampled points per edge.
 * @param {number} width Rectangle width.
 * @param {number} height Rectangle height.
 * @param {number} samplesPerEdge Number of samples per rectangle edge.
 * @returns {{ x: number, y: number }[]}
 */
function buildSampledRectangleContour(width, height, samplesPerEdge) {
    const halfWidth = width / 2
    const halfHeight = height / 2
    const points = []

    appendEdgeSamples(points, -halfWidth, -halfHeight, halfWidth, -halfHeight)
    appendEdgeSamples(points, halfWidth, -halfHeight, halfWidth, halfHeight)
    appendEdgeSamples(points, halfWidth, halfHeight, -halfWidth, halfHeight)
    appendEdgeSamples(points, -halfWidth, halfHeight, -halfWidth, -halfHeight)

    return points

    /**
     * Appends sampled points for one edge.
     * @param {{ x: number, y: number }[]} target Target point list.
     * @param {number} startX Start X.
     * @param {number} startY Start Y.
     * @param {number} endX End X.
     * @param {number} endY End Y.
     * @returns {void}
     */
    function appendEdgeSamples(target, startX, startY, endX, endY) {
        for (let index = 0; index < samplesPerEdge; index += 1) {
            const ratio = index / samplesPerEdge
            target.push({
                x: startX + (endX - startX) * ratio,
                y: startY + (endY - startY) * ratio
            })
        }
    }
}

/**
 * Builds sampled circular hole points.
 * @param {number} centerX Circle center X.
 * @param {number} centerY Circle center Y.
 * @param {number} radius Circle radius.
 * @returns {{ x: number, y: number }[]}
 */
function buildCircularHole(centerX, centerY, radius) {
    return Array.from({ length: 72 }, (_value, index) => {
        const angle = (Math.PI * 2 * index) / 72

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}
