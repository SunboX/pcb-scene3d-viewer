import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'

/**
 * Builds one rounded-rectangle contour.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} width Width.
 * @param {number} height Height.
 * @param {number} radius Corner radius.
 * @returns {{ x: number, y: number }[]}
 */
function roundedRectangle(centerX, centerY, width, height, radius) {
    const halfWidth = width / 2
    const halfHeight = height / 2

    return [
        ...cornerPoints(
            centerX + halfWidth - radius,
            centerY - halfHeight + radius,
            radius,
            -90,
            0
        ),
        ...cornerPoints(
            centerX + halfWidth - radius,
            centerY + halfHeight - radius,
            radius,
            0,
            90
        ),
        ...cornerPoints(
            centerX - halfWidth + radius,
            centerY + halfHeight - radius,
            radius,
            90,
            180
        ),
        ...cornerPoints(
            centerX - halfWidth + radius,
            centerY - halfHeight + radius,
            radius,
            180,
            270
        )
    ]
}

/**
 * Builds sampled circular corner points.
 * @param {number} centerX Corner center X.
 * @param {number} centerY Corner center Y.
 * @param {number} radius Corner radius.
 * @param {number} startAngle Start angle in degrees.
 * @param {number} endAngle End angle in degrees.
 * @returns {{ x: number, y: number }[]}
 */
function cornerPoints(centerX, centerY, radius, startAngle, endAngle) {
    return Array.from({ length: 17 }, (_, index) => {
        const fraction = index / 16
        const angle =
            ((startAngle + (endAngle - startAngle) * fraction) * Math.PI) / 180

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds a square contour.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Half side length.
 * @returns {{ x: number, y: number }[]}
 */
function square(centerX, centerY, radius) {
    return [
        { x: centerX - radius, y: centerY - radius },
        { x: centerX + radius, y: centerY - radius },
        { x: centerX + radius, y: centerY + radius },
        { x: centerX - radius, y: centerY + radius }
    ]
}

/**
 * Builds a circle whose coordinate reads are counted.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Circle radius.
 * @param {{ count: number }} readCounter Coordinate read counter.
 * @returns {{ x: number, y: number }[]}
 */
function countedCircle(centerX, centerY, radius, readCounter) {
    return Array.from({ length: 16 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 16
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius

        return {
            get x() {
                readCounter.count += 1
                return x
            },
            get y() {
                readCounter.count += 1
                return y
            }
        }
    })
}

test('PcbScene3dDrillCutoutFilter keeps separated rounded pad cutouts', () => {
    const cutouts = [
        roundedRectangle(0, 0, 60, 120, 30),
        roundedRectangle(0, 256, 60, 120, 30)
    ]

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        2
    )
})

test('PcbScene3dDrillCutoutFilter removes truly nested cutouts', () => {
    const cutouts = [square(0, 0, 4), square(0, 0, 8)]

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        1
    )
})

test('PcbScene3dDrillCutoutFilter reuses polygon metadata for dense separated cutouts', () => {
    const readCounter = { count: 0 }
    const cutouts = Array.from({ length: 80 }, (_, index) =>
        countedCircle(
            (index % 20) * 100,
            Math.floor(index / 20) * 100,
            20,
            readCounter
        )
    )

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        80
    )
    assert.ok(
        readCounter.count < 20000,
        'Expected bounded coordinate reads, got ' + readCounter.count
    )
})
