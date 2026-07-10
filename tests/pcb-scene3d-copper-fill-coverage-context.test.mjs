import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCopperFillCoverageContext } from '../src/PcbScene3dCopperFillCoverageContext.mjs'
import { PcbScene3dCopperFillMeshBuilder } from '../src/PcbScene3dCopperFillMeshBuilder.mjs'

/**
 * Builds one normalized rectangle loop set.
 * @param {number} minX Minimum X.
 * @param {number} minY Minimum Y.
 * @param {number} maxX Maximum X.
 * @param {number} maxY Maximum Y.
 * @param {number[][][]} [holes] Optional hole loops.
 * @returns {{ outer: number[][], holes: number[][][], bounds: object }}
 */
function rectangleLoopSet(minX, minY, maxX, maxY, holes = []) {
    return {
        outer: [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
        ],
        holes,
        bounds: { minX, minY, maxX, maxY }
    }
}

/**
 * Checks the legacy inclusive epsilon bounds-overlap expression.
 * @param {object} first First bounds.
 * @param {object} second Second bounds.
 * @param {number} [epsilon] Geometry epsilon.
 * @returns {boolean}
 */
function boundsOverlap(first, second, epsilon = 0.001) {
    return !(
        first.maxX < second.minX - epsilon ||
        first.minX > second.maxX + epsilon ||
        first.maxY < second.minY - epsilon ||
        first.minY > second.maxY + epsilon
    )
}

/**
 * Builds a two-coordinate array whose getter reads are counted.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @param {{ count: number }} reads Shared read counter.
 * @returns {number[]}
 */
function countedPair(x, y, reads) {
    const pair = []
    Object.defineProperties(pair, {
        0: {
            configurable: true,
            enumerable: true,
            get() {
                reads.count += 1
                return x
            }
        },
        1: {
            configurable: true,
            enumerable: true,
            get() {
                reads.count += 1
                return y
            }
        }
    })
    return pair
}

test('PcbScene3dCopperFillCoverageContext returns stable filtered areas with prepared holes', () => {
    const hole = [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4]
    ]
    const first = rectangleLoopSet(0, 0, 10, 10, [hole])
    const duplicate = rectangleLoopSet(0, 0, 10, 10)
    const distant = rectangleLoopSet(100, 100, 110, 110)
    const context = PcbScene3dCopperFillCoverageContext.fromLoopSets([
        first,
        duplicate,
        distant
    ])
    const target = [{ sentinel: true }]
    const result = context.queryAreas(
        { minX: 1, minY: 1, maxX: 9, maxY: 9 },
        target,
        { beforeSourceIndex: 2, allowedSourceIndexes: new Set([0, 1]) }
    )

    assert.strictEqual(result, target)
    assert.equal(result.length, 3)
    assert.deepEqual(
        result.slice(1).map((area) => area.sourceIndex),
        [0, 1]
    )
    assert.strictEqual(result[1].outer.source, first.outer)
    assert.strictEqual(result[1].holes[0].source, hole)
    assert.deepEqual(result[1].holes[0].points, [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 4 },
        { x: 2, y: 4 }
    ])
    assert.strictEqual(result[2].outer.source, duplicate.outer)
    assert.notStrictEqual(result[1].outer, result[2].outer)
    assert.deepEqual(
        context
            .queryAreas({ minX: 1, minY: 1, maxX: 9, maxY: 9 }, [], {
                beforeSourceIndex: 1
            })
            .map((area) => area.sourceIndex),
        [0]
    )
})

test('PcbScene3dCopperFillCoverageContext converts each pair once and keeps queries cache-local', () => {
    const reads = { count: 0 }
    const outer = [
        countedPair(0, 0, reads),
        countedPair(4, 0, reads),
        countedPair(4, 4, reads),
        countedPair(0, 4, reads)
    ]
    const hole = [
        countedPair(1, 1, reads),
        countedPair(2, 1, reads),
        countedPair(2, 2, reads),
        countedPair(1, 2, reads)
    ]
    const context = PcbScene3dCopperFillCoverageContext.fromLoopSets([
        { outer, holes: [hole] }
    ])

    assert.equal(reads.count, 16)
    context.queryAreas({ minX: 0, minY: 0, maxX: 4, maxY: 4 }, [])
    context.queryAreas({ minX: 1, minY: 1, maxX: 2, maxY: 2 }, [])
    assert.equal(reads.count, 16)
})

test('PcbScene3dCopperFillCoverageContext exposes an immutable prepared area count', () => {
    const emptyContext = PcbScene3dCopperFillCoverageContext.fromLoopSets([])
    const filledContext = PcbScene3dCopperFillCoverageContext.fromLoopSets([
        rectangleLoopSet(0, 0, 1, 1),
        rectangleLoopSet(2, 2, 3, 3)
    ])

    assert.equal(emptyContext.areaCount, 0)
    assert.equal(filledContext.areaCount, 2)
    assert.throws(() => {
        emptyContext.areaCount = 1
    }, TypeError)
    assert.equal(emptyContext.areaCount, 0)
})

test('PcbScene3dCopperFillCoverageContext includes epsilon extreme and non-finite fallback candidates', () => {
    const touching = rectangleLoopSet(0, 0, 1, 1)
    const huge = rectangleLoopSet(9e307, 9e307, 1e308, 1e308)
    const nonFinite = {
        outer: [
            [Number.NaN, Number.NaN],
            [2, 0],
            [2, 2],
            [0, 2]
        ],
        holes: []
    }
    const context = PcbScene3dCopperFillCoverageContext.fromLoopSets([
        touching,
        huge,
        nonFinite
    ])

    assert.deepEqual(
        context
            .queryAreas({ minX: 1.001, minY: 0.2, maxX: 1.001, maxY: 0.8 }, [])
            .map((area) => area.sourceIndex),
        [0, 2]
    )
    assert.deepEqual(
        context
            .queryAreas(
                {
                    minX: 9.5e307,
                    minY: 9.5e307,
                    maxX: 9.6e307,
                    maxY: 9.6e307
                },
                []
            )
            .map((area) => area.sourceIndex),
        [1, 2]
    )
    assert.deepEqual(
        context
            .queryAreas({ minX: Number.NaN, minY: 0, maxX: 0, maxY: 0 }, [])
            .map((area) => area.sourceIndex),
        [0, 1, 2]
    )
})

test('PcbScene3dCopperFillCoverageContext never omits brute-force bounds candidates', () => {
    const loopSets = Array.from({ length: 96 }, (_unused, index) => {
        const column = index % 12
        const row = Math.floor(index / 12)
        const minX = column * 7 + ((index * 17) % 5) / 10
        const minY = row * 9 + ((index * 13) % 7) / 10
        return rectangleLoopSet(minX, minY, minX + 4, minY + 6)
    })
    const context = PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)

    for (let index = 0; index < 80; index += 1) {
        const query = {
            minX: ((index * 19) % 90) - 2,
            minY: ((index * 23) % 75) - 3,
            maxX: ((index * 19) % 90) + 5,
            maxY: ((index * 23) % 75) + 4
        }
        const expected = loopSets
            .map((loopSet, sourceIndex) => ({ loopSet, sourceIndex }))
            .filter(({ loopSet }) => boundsOverlap(loopSet.bounds, query))
            .map(({ sourceIndex }) => sourceIndex)
        const actual = context
            .queryAreas(query, [])
            .map((area) => area.sourceIndex)

        for (const sourceIndex of expected) {
            assert.ok(
                actual.includes(sourceIndex),
                `query ${index} omitted source ${sourceIndex}`
            )
        }
        assert.deepEqual(
            actual,
            [...actual].sort((left, right) => left - right)
        )
    }
})

test('PcbScene3dCopperFillMeshBuilder consumes supplied loop sets without renormalizing fills', () => {
    const loopSets = [rectangleLoopSet(20, 30, 24, 34)]
    const coverageContext =
        PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)
    let normalizationCalls = 0

    const mesh = PcbScene3dCopperFillMeshBuilder.build(
        THREE,
        [
            {
                points: [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1]
                ]
            }
        ],
        5,
        0.2,
        (x, y) => {
            normalizationCalls += 1
            return { x, y }
        },
        false,
        new THREE.MeshBasicMaterial(),
        [],
        { loopSets, coverageContext }
    )
    const position = mesh.geometry.getAttribute('position')
    const values = Array.from(position.array)

    assert.equal(normalizationCalls, 0)
    assert.equal(
        Math.min(...values.filter((_value, index) => index % 3 === 0)),
        20
    )
    assert.equal(
        Math.max(...values.filter((_value, index) => index % 3 === 0)),
        24
    )
    assert.equal(
        Math.min(...values.filter((_value, index) => index % 3 === 1)),
        30
    )
    assert.equal(
        Math.max(...values.filter((_value, index) => index % 3 === 1)),
        34
    )
})

test('PcbScene3dCopperFactory shares one isolated coverage context per covered side', () => {
    const originalFromLoopSets =
        PcbScene3dCopperFillCoverageContext.fromLoopSets
    const originalFilterPrepared =
        PcbScene3dCopperFillAreaClipper.filterPrepared
    const originalBuild = PcbScene3dCopperFillMeshBuilder.build
    const createdContexts = []
    const filteredContexts = []
    const fillOptions = []

    PcbScene3dCopperFillCoverageContext.fromLoopSets = (loopSets) => {
        const context = originalFromLoopSets.call(
            PcbScene3dCopperFillCoverageContext,
            loopSets
        )
        createdContexts.push(context)
        return context
    }
    PcbScene3dCopperFillAreaClipper.filterPrepared = (
        three,
        mesh,
        context,
        options
    ) => {
        filteredContexts.push(context)
        return originalFilterPrepared.call(
            PcbScene3dCopperFillAreaClipper,
            three,
            mesh,
            context,
            options
        )
    }
    PcbScene3dCopperFillMeshBuilder.build = (...args) => {
        fillOptions.push(args[8])
        return originalBuild.apply(PcbScene3dCopperFillMeshBuilder, args)
    }

    const detail = {
        tracks: [
            { x1: -5, y1: 1, x2: 5, y2: 1, width: 1, layerId: 1 },
            { x1: -5, y1: 1, x2: 5, y2: 1, width: 1, layerId: 32 }
        ],
        arcs: [
            {
                x: 0,
                y: 0,
                radius: 3,
                width: 1,
                startAngle: 0,
                endAngle: 90,
                layerId: 1
            },
            {
                x: 0,
                y: 0,
                radius: 3,
                width: 1,
                startAngle: 0,
                endAngle: 90,
                layerId: 32
            }
        ],
        fills: [
            {
                layerId: 1,
                points: [
                    [-10, -10],
                    [10, -10],
                    [10, 10],
                    [-10, 10]
                ]
            },
            {
                layerId: 32,
                points: [
                    [-10, -10],
                    [10, -10],
                    [10, 10],
                    [-10, 10]
                ]
            }
        ]
    }

    try {
        PcbScene3dCopperFactory.buildMaskCoveredGroup(
            THREE,
            detail,
            5,
            -5,
            (x, y) => ({ x, y }),
            { unionCoveredLayerPrimitives: true }
        )
        PcbScene3dCopperFactory.buildMaskCoveredGroup(
            THREE,
            detail,
            5,
            -5,
            (x, y) => ({ x, y }),
            { unionCoveredLayerPrimitives: true }
        )
    } finally {
        PcbScene3dCopperFillCoverageContext.fromLoopSets = originalFromLoopSets
        PcbScene3dCopperFillAreaClipper.filterPrepared = originalFilterPrepared
        PcbScene3dCopperFillMeshBuilder.build = originalBuild
    }

    assert.equal(createdContexts.length, 4)
    assert.equal(filteredContexts.length, 8)
    assert.equal(fillOptions.length, 4)
    for (let sideIndex = 0; sideIndex < 4; sideIndex += 1) {
        const context = createdContexts[sideIndex]
        assert.strictEqual(filteredContexts[sideIndex * 2], context)
        assert.strictEqual(filteredContexts[sideIndex * 2 + 1], context)
        assert.strictEqual(fillOptions[sideIndex].coverageContext, context)
        assert.ok(Array.isArray(fillOptions[sideIndex].loopSets))
    }
    assert.notStrictEqual(createdContexts[0], createdContexts[1])
    assert.notStrictEqual(createdContexts[0], createdContexts[2])
    assert.notStrictEqual(createdContexts[1], createdContexts[3])
})
