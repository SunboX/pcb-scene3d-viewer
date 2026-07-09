import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dAabbIndex } from '../src/PcbScene3dAabbIndex.mjs'

/**
 * Returns true when two axis-aligned bounds overlap within an epsilon.
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

/**
 * Verifies that an index query contains every brute-force candidate once.
 * @param {PcbScene3dAabbIndex} index
 * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} items
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * @param {{ epsilon?: number, stable?: boolean }} [options]
 * @returns {void}
 */
function assertCandidateComplete(index, items, bounds, options = {}) {
    const epsilon = options.epsilon || 0
    const expected = items.filter((item) =>
        overlaps(item.bounds, bounds, epsilon)
    )
    const actual = index.query(bounds, options)

    assert.equal(
        new Set(actual).size,
        actual.length,
        'query returned a duplicate object identity'
    )
    for (const candidate of expected) {
        assert.ok(
            actual.includes(candidate),
            'query omitted a brute-force candidate identity'
        )
    }
}

/**
 * Creates a deterministic pseudo-random number generator.
 * @param {number} seed
 * @returns {() => number}
 */
function createRandom(seed) {
    let state = seed >>> 0

    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
    }
}

/**
 * Builds deterministic axis-aligned test boxes.
 * @param {number} count
 * @param {number} seed
 * @returns {{ id: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]}
 */
function buildSeededBoxes(count, seed) {
    const random = createRandom(seed)

    return Array.from({ length: count }, (_, id) => {
        const minX = random() * 1000 - 500
        const minY = random() * 1000 - 500
        const width = random() * 40
        const height = random() * 40

        return {
            id,
            bounds: {
                minX,
                maxX: minX + width,
                minY,
                maxY: minY + height
            }
        }
    })
}

test('returns no candidates for an empty index and reuses the target', () => {
    const index = new PcbScene3dAabbIndex([])
    const sentinel = { sentinel: true }
    const target = [sentinel]
    const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }

    assert.strictEqual(index.queryInto(bounds, target), target)
    assert.deepEqual(target, [sentinel])
    assert.deepEqual(index.query(bounds), [])
})

test('finds inclusive touching and epsilon-overlap candidates', () => {
    const items = [
        {
            id: 'horizontal-touch',
            bounds: { minX: 1, maxX: 2, minY: 0.25, maxY: 0.75 }
        },
        {
            id: 'vertical-touch',
            bounds: { minX: 0.25, maxX: 0.75, minY: 1, maxY: 2 }
        },
        {
            id: 'epsilon-overlap',
            bounds: { minX: 1.0005, maxX: 2, minY: 0.25, maxY: 0.75 }
        },
        {
            id: 'outside-epsilon',
            bounds: { minX: 1.002, maxX: 2, minY: 0.25, maxY: 0.75 }
        },
        {
            id: 'far',
            bounds: { minX: 10, maxX: 11, minY: 10, maxY: 11 }
        }
    ]
    const index = new PcbScene3dAabbIndex(items, { leafSize: 1 })
    const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }

    assertCandidateComplete(index, items, bounds)
    assertCandidateComplete(index, items, bounds, { epsilon: 0.001 })
})

test('checks non-finite overflow entries and returns all for non-finite queries', () => {
    const items = [
        {
            id: 'finite-overlap',
            bounds: { minX: 0.25, maxX: 0.75, minY: 0.25, maxY: 0.75 }
        },
        {
            id: 'infinite-span',
            bounds: {
                minX: -Infinity,
                maxX: Infinity,
                minY: 0.25,
                maxY: 0.75
            }
        },
        {
            id: 'nan-span',
            bounds: { minX: NaN, maxX: NaN, minY: 0.25, maxY: 0.75 }
        },
        {
            id: 'infinite-away',
            bounds: {
                minX: -Infinity,
                maxX: Infinity,
                minY: 10,
                maxY: Infinity
            }
        },
        {
            id: 'finite-away',
            bounds: { minX: 10, maxX: 11, minY: 10, maxY: 11 }
        }
    ]
    const index = new PcbScene3dAabbIndex(items)
    const finiteQuery = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
    const nonFiniteQuery = {
        minX: 0,
        maxX: Infinity,
        minY: 0,
        maxY: 1
    }

    assertCandidateComplete(index, items, finiteQuery)
    assert.deepEqual(index.query(nonFiniteQuery, { stable: true }), items)
})

test('orders stable results by resolved source index before appending', () => {
    const first = {
        id: 'first',
        sourceIndex: 20,
        bounds: { minX: 3, maxX: 4, minY: 3, maxY: 4 }
    }
    const second = {
        id: 'second',
        sourceIndex: 10,
        bounds: { minX: -4, maxX: -3, minY: -4, maxY: -3 }
    }
    const third = {
        id: 'third',
        sourceIndex: 30,
        bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 }
    }
    const items = [first, second, third]
    const index = new PcbScene3dAabbIndex(items, {
        resolveBounds: (item) => item.bounds,
        resolveSourceIndex: (item) => item.sourceIndex,
        leafSize: 1
    })
    const bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 }
    const sentinel = { sentinel: true }
    const target = [sentinel]

    assert.deepEqual(index.query(bounds, { stable: true }), [
        second,
        first,
        third
    ])
    assert.strictEqual(
        index.queryInto(bounds, target, { stable: true }),
        target
    )
    assert.deepEqual(target, [sentinel, second, first, third])
})

test('matches brute force for at least two thousand seeded boxes', () => {
    const items = buildSeededBoxes(2048, 0x4a3b2c1d)
    const index = new PcbScene3dAabbIndex(items, {
        resolveBounds: (item) => item.bounds,
        resolveSourceIndex: (_item, itemIndex) => itemIndex,
        leafSize: 12
    })
    const random = createRandom(0x7f6e5d4c)

    for (let queryIndex = 0; queryIndex < 256; queryIndex += 1) {
        const minX = random() * 1100 - 550
        const minY = random() * 1100 - 550
        const bounds = {
            minX,
            maxX: minX + random() * 80,
            minY,
            maxY: minY + random() * 80
        }
        const epsilon = queryIndex % 5 === 0 ? 0.001 : 0

        assertCandidateComplete(index, items, bounds, { epsilon })
    }
})
