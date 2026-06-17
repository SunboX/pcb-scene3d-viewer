import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dShapeHoleMerger } from '../src/PcbScene3dShapeHoleMerger.mjs'

/**
 * Builds a circular cutout with a tiny floating-point overrun at its right edge.
 * @param {number} centerX Circle center X.
 * @param {number} centerY Circle center Y.
 * @param {number} radius Circle radius.
 * @returns {{ x: number, y: number }[]}
 */
function createNearlyAlignedCircle(centerX, centerY, radius) {
    return Array.from({ length: 256 }, (_unused, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 256
        const x = centerX + Math.cos(angle) * radius

        return {
            x: Math.abs(x - (centerX + radius)) < 1e-9 ? x + 1e-12 : x,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds an axis-aligned rectangular cutout.
 * @param {number} minX Left edge.
 * @param {number} minY Top edge.
 * @param {number} maxX Right edge.
 * @param {number} maxY Bottom edge.
 * @returns {{ x: number, y: number }[]}
 */
function createRectangle(minX, minY, maxX, maxY) {
    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ]
}

/**
 * Returns true when a point lies inside one polygon.
 * @param {{ x: number, y: number }} point Point to test.
 * @param {{ x: number, y: number }[]} polygon Polygon points.
 * @returns {boolean}
 */
function pointInsidePolygon(point, polygon) {
    let inside = false

    for (
        let index = 0, previousIndex = polygon.length - 1;
        index < polygon.length;
        previousIndex = index, index += 1
    ) {
        const current = polygon[index]
        const previous = polygon[previousIndex]
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

test('PcbScene3dShapeHoleMerger keeps rectangular lobes at nearly aligned circular extrema', () => {
    const merged = PcbScene3dShapeHoleMerger.mergeOverlapping([
        createNearlyAlignedCircle(0, -39.37, 43),
        createRectangle(-43, -59.055, 43, 59.055)
    ])

    assert.equal(merged.length, 1)
    assert.equal(
        pointInsidePolygon({ x: 35, y: 45 }, merged[0]),
        true,
        'Expected the merged keepout to retain the upper-right rectangular lobe'
    )
})
