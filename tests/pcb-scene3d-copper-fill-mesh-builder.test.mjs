import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCopperFillCoverageContext } from '../src/PcbScene3dCopperFillCoverageContext.mjs'
import { PcbScene3dCopperFillLoopSetResolver } from '../src/PcbScene3dCopperFillLoopSetResolver.mjs'
import { PcbScene3dCopperFillMeshBuilder } from '../src/PcbScene3dCopperFillMeshBuilder.mjs'
import { PcbScene3dCopperFillPolygonBoolean } from '../src/PcbScene3dCopperFillPolygonBoolean.mjs'

const TOP_Z = Math.fround(0.1)

/**
 * Builds one rectangular fill primitive.
 * @param {number} minX Left edge.
 * @param {number} minY Bottom edge.
 * @param {number} maxX Right edge.
 * @param {number} maxY Top edge.
 * @param {{ x: number, y: number }[][]} [holes] Authored holes.
 * @returns {object}
 */
function createFill(minX, minY, maxX, maxY, holes = []) {
    return {
        layerId: 1,
        points: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ],
        holes
    }
}

/**
 * Converts expected XY vertices to the builder's exact Float32 position form.
 * @param {number[][]} points Ordered XY vertices.
 * @returns {number[]}
 */
function expectedSurfacePositions(points) {
    return points.flatMap((point) => [
        Math.fround(point[0]),
        Math.fround(point[1]),
        TOP_Z
    ])
}

/**
 * Reads one mesh position buffer.
 * @param {any | null} mesh Copper fill mesh.
 * @returns {number[]}
 */
function positionArray(mesh) {
    return mesh ? Array.from(mesh.geometry.getAttribute('position').array) : []
}

/**
 * Builds one surface-only mesh while forcing the triangle fallback.
 * @param {object[]} fills Fill primitives.
 * @param {boolean} [mirrorY] Whether to mirror Y coordinates.
 * @param {PcbScene3dCopperFillCoverageContext} [suppliedCoverageContext] Optional context override.
 * @returns {number[]}
 */
function buildFallbackPositions(
    fills,
    mirrorY = false,
    suppliedCoverageContext
) {
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        mirrorY
    )
    const coverageContext =
        suppliedCoverageContext ||
        PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets

    try {
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = () => null

        return positionArray(
            PcbScene3dCopperFillMeshBuilder.build(
                THREE,
                fills,
                0,
                0.2,
                (x, y) => ({ x, y }),
                mirrorY,
                new THREE.MeshBasicMaterial(),
                [],
                {
                    surfaceOnly: true,
                    clipContainedFillOverlaps: true,
                    loopSets,
                    coverageContext
                }
            )
        )
    } finally {
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }
}

test('PcbScene3dCopperFillMeshBuilder routes ordered fallback prefixes through one prepared context', () => {
    const fills = [
        createFill(0, 0, 2, 2),
        createFill(1, 0, 3, 2),
        createFill(2, 0, 4, 2)
    ]
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        false
    )
    const coverageContext =
        PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)
    const rawPrefixSizes = []
    const preparedCalls = []
    const originalFilter = PcbScene3dCopperFillAreaClipper.filter
    const originalFilterPrepared =
        PcbScene3dCopperFillAreaClipper.filterPrepared
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets

    try {
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = () => null
        PcbScene3dCopperFillAreaClipper.filter = (
            _THREE,
            mesh,
            prefixFills
        ) => {
            rawPrefixSizes.push(prefixFills.length)
            return mesh
        }
        PcbScene3dCopperFillAreaClipper.filterPrepared = (
            _THREE,
            mesh,
            context,
            options
        ) => {
            preparedCalls.push({
                contextMatches: context === coverageContext,
                beforeSourceIndex: options.beforeSourceIndex,
                allowedSourceIndexes: Array.from(
                    options.allowedSourceIndexes
                ).sort((left, right) => left - right)
            })
            return mesh
        }

        PcbScene3dCopperFillMeshBuilder.build(
            THREE,
            fills,
            0,
            0.2,
            (x, y) => ({ x, y }),
            false,
            new THREE.MeshBasicMaterial(),
            [],
            {
                surfaceOnly: true,
                clipContainedFillOverlaps: true,
                loopSets,
                coverageContext
            }
        )
    } finally {
        PcbScene3dCopperFillAreaClipper.filter = originalFilter
        PcbScene3dCopperFillAreaClipper.filterPrepared = originalFilterPrepared
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }

    assert.deepEqual(
        { rawPrefixSizes, preparedCalls },
        {
            rawPrefixSizes: [],
            preparedCalls: [
                {
                    contextMatches: true,
                    beforeSourceIndex: 1,
                    allowedSourceIndexes: [0]
                },
                {
                    contextMatches: true,
                    beforeSourceIndex: 2,
                    allowedSourceIndexes: [0, 1]
                }
            ]
        }
    )
})

test('PcbScene3dCopperFillMeshBuilder skips coverage preparation when polygon boolean succeeds', () => {
    const fills = [createFill(0, 0, 2, 2), createFill(1, 0, 3, 2)]
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        false
    )
    const originalFromLoopSets =
        PcbScene3dCopperFillCoverageContext.fromLoopSets
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets
    let contextCreations = 0
    let mesh

    try {
        PcbScene3dCopperFillCoverageContext.fromLoopSets = (...args) => {
            contextCreations += 1
            return originalFromLoopSets.apply(
                PcbScene3dCopperFillCoverageContext,
                args
            )
        }
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = (
            loopSet
        ) => [loopSet]

        mesh = PcbScene3dCopperFillMeshBuilder.build(
            THREE,
            fills,
            0,
            0.2,
            (x, y) => ({ x, y }),
            false,
            new THREE.MeshBasicMaterial(),
            [],
            {
                surfaceOnly: true,
                clipContainedFillOverlaps: true,
                loopSets
            }
        )
    } finally {
        PcbScene3dCopperFillCoverageContext.fromLoopSets = originalFromLoopSets
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }

    assert.ok(mesh)
    assert.equal(contextCreations, 0)
})

test('PcbScene3dCopperFillMeshBuilder prepares once at the first of multiple fallbacks', () => {
    const fills = [
        createFill(0, 0, 2, 2),
        createFill(1, 0, 3, 2),
        createFill(2, 0, 4, 2)
    ]
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        false
    )
    const events = []
    const createdContexts = []
    const filteredContexts = []
    const originalFromLoopSets =
        PcbScene3dCopperFillCoverageContext.fromLoopSets
    const originalFilterPrepared =
        PcbScene3dCopperFillAreaClipper.filterPrepared
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets
    let sourceIndex = 0

    try {
        PcbScene3dCopperFillCoverageContext.fromLoopSets = (...args) => {
            events.push('context')
            const context = originalFromLoopSets.apply(
                PcbScene3dCopperFillCoverageContext,
                args
            )
            createdContexts.push(context)
            return context
        }
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = (
            loopSet
        ) => {
            const currentIndex = sourceIndex
            sourceIndex += 1
            events.push(`polygon:${currentIndex}`)
            return currentIndex === 0 ? [loopSet] : null
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

        PcbScene3dCopperFillMeshBuilder.build(
            THREE,
            fills,
            0,
            0.2,
            (x, y) => ({ x, y }),
            false,
            new THREE.MeshBasicMaterial(),
            [],
            {
                surfaceOnly: true,
                clipContainedFillOverlaps: true,
                loopSets
            }
        )
    } finally {
        PcbScene3dCopperFillCoverageContext.fromLoopSets = originalFromLoopSets
        PcbScene3dCopperFillAreaClipper.filterPrepared = originalFilterPrepared
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }

    assert.deepEqual(events, ['polygon:0', 'polygon:1', 'context', 'polygon:2'])
    assert.equal(createdContexts.length, 1)
    assert.equal(filteredContexts.length, 2)
    assert.ok(
        filteredContexts.every((context) => context === createdContexts[0])
    )
})

test('PcbScene3dCopperFillMeshBuilder retains flattened indexes after an empty emitted prefix', () => {
    const fills = [
        createFill(0, 0, 2, 2),
        createFill(1, 0, 3, 2),
        createFill(2, 0, 4, 2)
    ]
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        false
    )
    const coverageContext =
        PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)
    const preparedCalls = []
    const originalFilter = PcbScene3dCopperFillAreaClipper.filter
    const originalFilterPrepared =
        PcbScene3dCopperFillAreaClipper.filterPrepared
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets
    let sourceIndex = 0

    try {
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = () => {
            const result = sourceIndex === 0 ? [] : null
            sourceIndex += 1
            return result
        }
        PcbScene3dCopperFillAreaClipper.filter = (_THREE, mesh) => mesh
        PcbScene3dCopperFillAreaClipper.filterPrepared = (
            _THREE,
            mesh,
            context,
            options
        ) => {
            preparedCalls.push({
                contextMatches: context === coverageContext,
                beforeSourceIndex: options.beforeSourceIndex,
                allowedSourceIndexes: Array.from(
                    options.allowedSourceIndexes
                ).sort((left, right) => left - right)
            })
            return mesh
        }

        PcbScene3dCopperFillMeshBuilder.build(
            THREE,
            fills,
            0,
            0.2,
            (x, y) => ({ x, y }),
            false,
            new THREE.MeshBasicMaterial(),
            [],
            {
                surfaceOnly: true,
                clipContainedFillOverlaps: true,
                loopSets,
                coverageContext
            }
        )
    } finally {
        PcbScene3dCopperFillAreaClipper.filter = originalFilter
        PcbScene3dCopperFillAreaClipper.filterPrepared = originalFilterPrepared
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }

    assert.deepEqual(preparedCalls, [
        {
            contextMatches: true,
            beforeSourceIndex: 1,
            allowedSourceIndexes: [0]
        },
        {
            contextMatches: true,
            beforeSourceIndex: 2,
            allowedSourceIndexes: [0, 1]
        }
    ])
})

test('PcbScene3dCopperFillMeshBuilder preserves recursive fallback positions and first ownership', () => {
    const positions = buildFallbackPositions([
        createFill(0, 0, 2, 2),
        createFill(1, 0, 3, 2),
        createFill(2, 0, 4, 2)
    ])

    assert.deepEqual(
        positions,
        expectedSurfacePositions([
            [2, 2],
            [0, 2],
            [0, 0],
            [0, 0],
            [2, 0],
            [2, 2],
            [3, 2],
            [2, 2],
            [2, 1],
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [3, 1],
            [3, 2],
            [2, 0],
            [3, 1],
            [2, 1],
            [4, 2],
            [3, 2],
            [3, 1],
            [3, 0],
            [4, 0],
            [4, 1],
            [3, 1],
            [4, 1],
            [4, 2],
            [3, 0],
            [4, 1],
            [3, 1]
        ])
    )
})

test('PcbScene3dCopperFillMeshBuilder preserves authored-hole fallback eligibility', () => {
    const hole = [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 }
    ]
    const earlierFill = createFill(0, 0, 4, 4, [hole])
    const insideHolePositions = buildFallbackPositions([
        earlierFill,
        createFill(1.25, 1.25, 2.75, 2.75)
    ])
    const crossingHolePositions = buildFallbackPositions([
        earlierFill,
        createFill(0.5, 0.5, 1.5, 1.5)
    ])
    const earlierSurface = [
        [0, 0],
        [1, 1],
        [1, 3],
        [3, 1],
        [1, 1],
        [0, 0],
        [0, 4],
        [0, 0],
        [1, 3],
        [3, 1],
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [1, 3],
        [3, 3],
        [3, 1],
        [4, 0],
        [4, 4],
        [1, 3],
        [3, 3],
        [3, 3],
        [4, 0],
        [4, 4]
    ]

    assert.deepEqual(
        insideHolePositions,
        expectedSurfacePositions([
            ...earlierSurface,
            [2.75, 2.75],
            [1.25, 2.75],
            [1.25, 1.25],
            [1.25, 1.25],
            [2.75, 1.25],
            [2.75, 2.75]
        ])
    )
    assert.deepEqual(
        crossingHolePositions,
        expectedSurfacePositions(earlierSurface)
    )
})

test('PcbScene3dCopperFillMeshBuilder preserves epsilon-touching fallback positions', () => {
    const positions = buildFallbackPositions([
        createFill(0, 0, 1, 1),
        createFill(1.0005, 0, 2, 1)
    ])

    assert.deepEqual(
        positions,
        expectedSurfacePositions([
            [1, 1],
            [0, 1],
            [0, 0],
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 1],
            [1.0005, 1],
            [1.0005, 0],
            [1.0005, 0],
            [2, 0],
            [2, 1]
        ])
    )
})

test('PcbScene3dCopperFillMeshBuilder preserves mirrored fallback positions', () => {
    const positions = buildFallbackPositions(
        [createFill(0, 0, 2, 2), createFill(1, 0, 3, 2)],
        true
    )

    assert.deepEqual(
        positions,
        expectedSurfacePositions([
            [2, -0],
            [0, -0],
            [0, -2],
            [0, -2],
            [2, -2],
            [2, -0],
            [3, -0],
            [2, -0],
            [2, -1],
            [2, -2],
            [3, -2],
            [3, -1],
            [2, -1],
            [3, -1],
            [3, -0],
            [2, -2],
            [3, -1],
            [2, -1]
        ])
    )
})

test('PcbScene3dCopperFillMeshBuilder rejects a stale fallback coverage context exactly', () => {
    const fills = [createFill(0, 0, 4, 4), createFill(2, 0, 6, 4)]
    const staleLoopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        [createFill(100, 100, 104, 104), createFill(102, 100, 106, 104)],
        (x, y) => ({ x, y }),
        false
    )
    const staleContext =
        PcbScene3dCopperFillCoverageContext.fromLoopSets(staleLoopSets)
    const expectedPositions = buildFallbackPositions(fills)
    const staleContextPositions = buildFallbackPositions(
        fills,
        false,
        staleContext
    )

    assert.equal(expectedPositions.length, 162)
    assert.deepEqual(staleContextPositions, expectedPositions)
})

test('PcbScene3dCopperFillMeshBuilder treats an empty polygon result as success', () => {
    const fills = [createFill(0, 0, 2, 2)]
    const originalFilter = PcbScene3dCopperFillAreaClipper.filter
    const originalFilterPrepared =
        PcbScene3dCopperFillAreaClipper.filterPrepared
    const originalResolveRemainingLoopSets =
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets
    let clipCalls = 0
    let mesh

    try {
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets = () => []
        PcbScene3dCopperFillAreaClipper.filter = () => {
            clipCalls += 1
            return null
        }
        PcbScene3dCopperFillAreaClipper.filterPrepared = () => {
            clipCalls += 1
            return null
        }

        mesh = PcbScene3dCopperFillMeshBuilder.build(
            THREE,
            fills,
            0,
            0.2,
            (x, y) => ({ x, y }),
            false,
            new THREE.MeshBasicMaterial(),
            [],
            {
                surfaceOnly: true,
                clipContainedFillOverlaps: true
            }
        )
    } finally {
        PcbScene3dCopperFillAreaClipper.filter = originalFilter
        PcbScene3dCopperFillAreaClipper.filterPrepared = originalFilterPrepared
        PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets =
            originalResolveRemainingLoopSets
    }

    assert.equal(mesh, null)
    assert.equal(clipCalls, 0)
})
