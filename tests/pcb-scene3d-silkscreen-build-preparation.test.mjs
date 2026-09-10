import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dCutoutGridIndex } from '../src/PcbScene3dCutoutGridIndex.mjs'
import { PcbScene3dSilkscreenChunkedFactory } from '../src/PcbScene3dSilkscreenChunkedFactory.mjs'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

/**
 * Builds a sampled circular cutout for fake artwork.
 * @param {number} x Center X.
 * @param {number} y Center Y.
 * @returns {{ x: number, y: number }[]}
 */
function circle(x, y) {
    return Array.from({ length: 16 }, (_value, index) => ({
        x: x + Math.cos((index / 16) * Math.PI * 2),
        y: y + Math.sin((index / 16) * Math.PI * 2)
    }))
}

/**
 * Builds repeated fake strokes crossing independent drill and copper cutouts.
 * @returns {object}
 */
function artwork() {
    const side = {
        tracks: Array.from({ length: 101 }, () => ({
            x1: 0,
            y1: 0,
            x2: 20,
            y2: 0,
            width: 1
        })),
        drillCutouts: [circle(5, 0)],
        copperCutouts: [circle(15, 0)]
    }
    return { top: side, bottom: structuredClone(side) }
}

/**
 * Centers fake artwork with an asymmetric transform to exercise mirroring.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {{ x: number, y: number }}
 */
function normalize(x, y) {
    return { x: x - 2, y: y + 3 }
}

/**
 * Captures all geometry attributes, transforms, and material colors.
 * @param {THREE.Group} group Rendered group.
 * @returns {object[]}
 */
function snapshot(group) {
    const meshes = []
    group.updateMatrixWorld(true)
    group.traverse((node) => {
        if (!node.geometry) return
        meshes.push({
            attributes: Object.fromEntries(
                Object.entries(node.geometry.attributes).map(([key, value]) => [
                    key,
                    { itemSize: value.itemSize, array: Array.from(value.array) }
                ])
            ),
            index: node.geometry.index
                ? Array.from(node.geometry.index.array)
                : null,
            matrix: node.matrixWorld.elements,
            color: node.material.color.getHex(),
            materialType: node.material.type
        })
    })
    return meshes
}

/**
 * Builds each batch through independent uncached factory calls.
 * @param {object} silkscreen Fake two-sided artwork.
 * @returns {THREE.Group}
 */
function freshBatchGroup(silkscreen) {
    const group = new THREE.Group()
    for (const side of ['top', 'bottom']) {
        for (const [key, size] of [
            ['tracks', 50],
            ['arcs', 40],
            ['fills', 8],
            ['texts', 30]
        ]) {
            const source = silkscreen[side]
            const records = source[key] || []
            for (let index = 0; index < records.length; index += size) {
                group.add(
                    PcbScene3dSilkscreenFactory.buildGroup(
                        THREE,
                        {
                            [side]: {
                                ...source,
                                tracks: [],
                                arcs: [],
                                fills: [],
                                texts: [],
                                [key]: records.slice(index, index + size)
                            }
                        },
                        4,
                        -7,
                        normalize
                    )
                )
            }
        }
    }
    return group
}

test('chunked silkscreen prepares cutout coordinates and query indexes once per side', async () => {
    const silkscreen = artwork()
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    const originalQuery = PcbScene3dCutoutGridIndex.prototype.query
    const indexes = new Set()
    let circlePreparations = 0
    let normalizedCutoutPoints = 0
    let yieldCount = 0
    PcbScene3dCutoutCircleDetector.resolve = function (...args) {
        circlePreparations += 1
        return originalResolve.apply(this, args)
    }
    PcbScene3dCutoutGridIndex.prototype.query = function (...args) {
        indexes.add(this)
        return originalQuery.apply(this, args)
    }
    try {
        const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            THREE,
            silkscreen,
            4,
            -7,
            (x, y) => {
                if (x !== 0 && x !== 20) normalizedCutoutPoints += 1
                return normalize(x, y)
            },
            {
                yieldToMain: () => {
                    yieldCount += 1
                }
            }
        )
        assert.equal(snapshot(group).length, 6)
        assert.equal(yieldCount, 6)
        assert.equal(normalizedCutoutPoints, 64)
        assert.equal(circlePreparations, 4)
        assert.equal(indexes.size, 2)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
        PcbScene3dCutoutGridIndex.prototype.query = originalQuery
    }
})

test('tracks, arcs, text and fill seams share the side query index', async () => {
    const silkscreen = artwork()
    for (const side of Object.values(silkscreen)) {
        side.arcs = [
            { x: 5, y: 0, radius: 1.3, startAngle: 0, endAngle: 270, width: 1 }
        ]
        side.texts = [
            { text: 'L', x: 4, y: 1, sizeX: 4, sizeY: 4, thickness: 1 }
        ]
        side.fills = [{ x1: 3, y1: -2, x2: 7, y2: 2 }]
    }
    const originalQuery = PcbScene3dCutoutGridIndex.prototype.query
    const indexes = new Set()
    PcbScene3dCutoutGridIndex.prototype.query = function (...args) {
        indexes.add(this)
        return originalQuery.apply(this, args)
    }
    try {
        const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            THREE,
            silkscreen,
            4,
            -7,
            normalize
        )
        assert.ok(snapshot(group).length > 6)
        // The fill holes are fully represented by shape paths. All clipped
        // strokes, including seams and text, use the same two side indexes.
        assert.equal(indexes.size, 2)
    } finally {
        PcbScene3dCutoutGridIndex.prototype.query = originalQuery
    }
})

test('shared silkscreen preparation preserves mixed geometry attributes on both sides', async () => {
    const silkscreen = artwork()
    for (const side of Object.values(silkscreen)) {
        side.arcs = [
            { x: 5, y: 0, radius: 1.3, startAngle: 0, endAngle: 270, width: 1 }
        ]
        side.fills = [{ x1: 2, y1: -2, x2: 8, y2: 2 }]
        side.texts = [{ text: 'A', x: 5, y: 0, height: 3, width: 1 }]
        side.strokeColor = 0xf0e0d0
        side.fillColor = 0xb0c0d0
    }
    const expected = snapshot(freshBatchGroup(silkscreen))
    const actual = snapshot(
        await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            THREE,
            silkscreen,
            4,
            -7,
            normalize
        )
    )
    assert.ok(actual.length > 6)
    assert.deepEqual(actual, expected)
    assert.ok(actual.some((mesh) => mesh.matrix[10] === -1))
})

test('a later silkscreen build observes source cutouts mutated after an earlier build', async () => {
    const silkscreen = artwork()
    const before = snapshot(
        await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            THREE,
            silkscreen,
            4,
            -7,
            normalize
        )
    )
    for (const point of silkscreen.top.drillCutouts[0]) point.y += 100
    const after = snapshot(
        await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            THREE,
            silkscreen,
            4,
            -7,
            normalize
        )
    )
    assert.notDeepEqual(after, before)
    assert.deepEqual(after, snapshot(freshBatchGroup(silkscreen)))
})

test('side preparation keeps a detached cutout snapshot across asynchronous yields', async () => {
    const silkscreen = artwork()
    const expected = snapshot(freshBatchGroup(silkscreen))
    let changed = false
    const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
        THREE,
        silkscreen,
        4,
        -7,
        normalize,
        {
            yieldToMain: async () => {
                if (changed) return
                changed = true
                for (const point of silkscreen.top.drillCutouts[0])
                    point.y += 100
            }
        }
    )
    assert.deepEqual(snapshot(group), expected)
})

test('cancelling chunked silkscreen stops before preparing the unvisited side', async () => {
    const silkscreen = artwork()
    silkscreen.bottom.drillCutouts = [circle(100, 0)]
    let active = true
    let bottomPointReads = 0
    let yields = 0
    const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
        THREE,
        silkscreen,
        4,
        -7,
        (x, y) => {
            if (x > 90) bottomPointReads += 1
            return normalize(x, y)
        },
        {
            shouldContinue: () => active,
            yieldToMain: () => {
                yields += 1
                active = false
            }
        }
    )
    assert.equal(snapshot(group).length, 1)
    assert.equal(yields, 1)
    assert.equal(bottomPointReads, 0)
})
