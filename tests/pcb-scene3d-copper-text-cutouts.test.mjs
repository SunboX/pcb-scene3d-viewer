import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCopperTextFactory } from '../src/PcbScene3dCopperTextFactory.mjs'
import { PcbScene3dPreparedPolygon } from '../src/PcbScene3dPreparedPolygon.mjs'
import { PcbScene3dStrokeCutoutBuilder } from '../src/PcbScene3dStrokeCutoutBuilder.mjs'

/**
 * Resolves axis-aligned polygon bounds.
 * @param {{ x: number, y: number }[]} points Polygon points.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function bounds(points) {
    return points.reduce(
        (result, point) => ({
            minX: Math.min(result.minX, point.x),
            maxX: Math.max(result.maxX, point.x),
            minY: Math.min(result.minY, point.y),
            maxY: Math.max(result.maxY, point.y)
        }),
        {
            minX: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY
        }
    )
}

test('stroke cutout builder matches the rendered round-capped capsule', () => {
    const cutout = PcbScene3dStrokeCutoutBuilder.build(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        4
    )
    const polygon = new PcbScene3dPreparedPolygon(cutout)

    assert.equal(cutout.length, 34)
    assert.deepEqual(bounds(cutout), {
        minX: -2,
        maxX: 12,
        minY: -2,
        maxY: 2
    })
    assert.ok(Math.abs(polygon.area - 52.485781) < 0.000001)
})

test('copper text cutouts retain each glyph stroke instead of a text box', () => {
    const cutouts = PcbScene3dCopperTextFactory.strokeCutouts({
        x: 0,
        y: 0,
        value: 'L',
        sizeX: 20,
        sizeY: 20,
        thickness: 4,
        hAlign: 'left',
        vAlign: 'top'
    })

    assert.equal(cutouts.length, 2)
    assert.ok(cutouts.every((cutout) => cutout.length === 34))
    assert.ok(
        cutouts.every(
            (cutout) => new PcbScene3dPreparedPolygon(cutout).area > 0
        )
    )
})
