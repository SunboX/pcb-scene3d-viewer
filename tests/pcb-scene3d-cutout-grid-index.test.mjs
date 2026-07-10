import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCutoutGridIndex } from '../src/PcbScene3dCutoutGridIndex.mjs'

/**
 * Builds one index item with explicit bounds.
 * @param {string} id
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @returns {{ id: string, bounds: { minX: number, maxX: number, minY: number, maxY: number } }}
 */
function item(id, bounds) {
    return { id, bounds }
}

test('preserves cell membership independently of coordinate epsilon', () => {
    const boundaryItem = item('boundary', {
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1
    })
    const sameCellItem = item('same-cell', {
        minX: 1,
        maxX: 2,
        minY: 0,
        maxY: 1
    })

    assert.deepEqual(
        new PcbScene3dCutoutGridIndex([boundaryItem]).query({
            minX: -0.0005,
            maxX: -0.0002,
            minY: 0,
            maxY: 0.0003
        }),
        []
    )
    assert.deepEqual(
        new PcbScene3dCutoutGridIndex([sameCellItem]).query({
            minX: 0.9995,
            maxX: 0.9998,
            minY: 0,
            maxY: 0.0003
        }),
        [sameCellItem]
    )
})

test('preserves cell traversal order and appends overflow in source order', () => {
    const overflow = item('overflow', {
        minX: -100,
        maxX: 100,
        minY: -100,
        maxY: 100
    })
    const sourceFirst = item('source-first', {
        minX: 8.1,
        maxX: 9.1,
        minY: 0.1,
        maxY: 1.1
    })
    const sourceSecond = item('source-second', {
        minX: 0.1,
        maxX: 1.1,
        minY: 8.1,
        maxY: 9.1
    })
    const index = new PcbScene3dCutoutGridIndex([
        overflow,
        sourceFirst,
        sourceSecond
    ])

    assert.deepEqual(index.query({ minX: 0, maxX: 9.1, minY: 0, maxY: 9.1 }), [
        sourceSecond,
        sourceFirst,
        overflow
    ])
})
