import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dPreparedPolygon } from '../src/PcbScene3dPreparedPolygon.mjs'
import { PcbScene3dPreparedPolygonSet } from '../src/PcbScene3dPreparedPolygonSet.mjs'

const EPSILON = 0.001

/**
 * Builds one axis-aligned prepared square.
 * @param {number} minX
 * @param {number} minY
 * @param {number} size
 * @param {{ source?: *, sourceIndex?: number }} [options]
 * @returns {PcbScene3dPreparedPolygon}
 */
function preparedSquare(minX, minY, size, options = {}) {
    const points = [
        { x: minX, y: minY },
        { x: minX + size, y: minY },
        { x: minX + size, y: minY + size },
        { x: minX, y: minY + size }
    ]

    return new PcbScene3dPreparedPolygon(points, {
        source: options.source ?? points,
        sourceIndex: options.sourceIndex,
        epsilon: EPSILON,
        detectCircle: false
    })
}

/**
 * Returns true when two bounds overlap within an epsilon.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second
 * @param {number} [epsilon]
 * @returns {boolean}
 */
function overlaps(first, second, epsilon = 0) {
    return !(
        first.maxX < second.minX - epsilon ||
        first.minX > second.maxX + epsilon ||
        first.maxY < second.minY - epsilon ||
        first.minY > second.maxY + epsilon
    )
}

test('returns empty queries and null source resolutions for an empty set', () => {
    const set = new PcbScene3dPreparedPolygonSet([])
    const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }

    assert.deepEqual(set.query(bounds), [])
    assert.deepEqual(set.query(bounds, { epsilon: EPSILON, stable: true }), [])
    assert.equal(set.resolveSource({}), null)
})

test('preserves prepared identities and resolves the earliest duplicate source', () => {
    const duplicateSource = { id: 'duplicate' }
    const uniqueSource = { id: 'unique' }
    const first = preparedSquare(0, 0, 5, {
        source: duplicateSource,
        sourceIndex: 300
    })
    const second = preparedSquare(1, 1, 5, {
        source: duplicateSource,
        sourceIndex: -100
    })
    const third = preparedSquare(2, 2, 5, {
        source: uniqueSource,
        sourceIndex: 10
    })
    const set = new PcbScene3dPreparedPolygonSet([first, second, third])
    const reorderedSet = new PcbScene3dPreparedPolygonSet([
        third,
        second,
        first
    ])
    const bounds = { minX: -1, maxX: 10, minY: -1, maxY: 10 }

    assert.strictEqual(set.resolveSource(duplicateSource), first)
    assert.strictEqual(set.resolveSource(uniqueSource), third)
    assert.equal(set.resolveSource({ id: 'duplicate' }), null)
    assert.deepEqual(set.query(bounds, { stable: true }), [
        first,
        second,
        third
    ])
    assert.strictEqual(reorderedSet.resolveSource(duplicateSource), second)
    assert.deepEqual(reorderedSet.query(bounds, { stable: true }), [
        third,
        second,
        first
    ])
})

test('returns every overlapping polygon in set order for stable queries', () => {
    const polygons = [
        preparedSquare(-20, -20, 3, { sourceIndex: 60 }),
        preparedSquare(-4, -4, 5, { sourceIndex: 50 }),
        preparedSquare(2, 2, 3, { sourceIndex: 40 }),
        preparedSquare(5, -1, 2, { sourceIndex: 30 }),
        preparedSquare(7.0005, 0, 2, { sourceIndex: 20 }),
        preparedSquare(7.002, 0, 2, { sourceIndex: 10 }),
        preparedSquare(30, 30, 4, { sourceIndex: 0 })
    ]
    const set = new PcbScene3dPreparedPolygonSet(polygons)
    const bounds = { minX: -3, maxX: 7, minY: -3, maxY: 7 }
    const expectedExact = polygons.filter((polygon) =>
        overlaps(polygon.bounds, bounds)
    )
    const expectedEpsilon = polygons.filter((polygon) =>
        overlaps(polygon.bounds, bounds, EPSILON)
    )

    assert.deepEqual(set.query(bounds, { stable: true }), expectedExact)
    assert.deepEqual(
        set.query(bounds, { epsilon: EPSILON, stable: true }),
        expectedEpsilon
    )

    const candidates = set.query(bounds, { epsilon: EPSILON })
    for (const polygon of expectedEpsilon) {
        assert.ok(
            candidates.includes(polygon),
            'query omitted an overlapping prepared polygon'
        )
    }
})
