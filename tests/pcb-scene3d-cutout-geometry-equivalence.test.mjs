import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'

/**
 * Builds one geometry from packed XYZ positions and optional triangle indexes.
 * @param {number[]} positions Packed XYZ positions.
 * @param {number[] | null} [indexes] Optional triangle indexes.
 * @returns {THREE.BufferGeometry}
 */
function buildGeometry(positions, indexes = null) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    )
    if (indexes) {
        geometry.setIndex(indexes)
    }
    return geometry
}

/**
 * Returns one geometry's flattened position buffer.
 * @param {THREE.BufferGeometry} geometry Geometry to inspect.
 * @returns {number[]}
 */
function positionArray(geometry) {
    return Array.from(geometry.getAttribute('position').array)
}

/**
 * Builds one regularly sampled circle.
 * @param {number} pointCount Boundary point count.
 * @param {number} radius Circle radius.
 * @returns {{ x: number, y: number }[]}
 */
function buildCircle(pointCount, radius) {
    return Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
        }
    })
}

/**
 * Builds a dense square contour in source traversal order.
 * @param {number} size Contour width and height.
 * @param {number} pointsPerSide Number of points on each side.
 * @returns {{ x: number, y: number }[]}
 */
function buildSquareContour(size, pointsPerSide) {
    const points = []
    const halfSize = size / 2

    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: -halfSize + (size * index) / pointsPerSide,
            y: -halfSize
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: halfSize,
            y: -halfSize + (size * index) / pointsPerSide
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: halfSize - (size * index) / pointsPerSide,
            y: halfSize
        })
    }
    for (let index = 0; index < pointsPerSide; index += 1) {
        points.push({
            x: -halfSize,
            y: halfSize - (size * index) / pointsPerSide
        })
    }

    return points
}

test('preserves identity for invalid input, empty geometry, and total bounds misses', () => {
    const positions = [0, 0, 1, 2, 0, 2, 0, 2, 3]
    const geometry = buildGeometry(positions)
    const square = [
        { x: -1, y: -1 },
        { x: 3, y: -1 },
        { x: 3, y: 3 },
        { x: -1, y: 3 }
    ]
    const emptyGeometry = buildGeometry([])
    const invalidCutouts = [null, [], [{ x: 0, y: 0 }], [{}, {}]]
    const distantCutout = square.map((point) => ({
        x: point.x + 100,
        y: point.y + 100
    }))

    assert.strictEqual(
        PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, null),
        geometry
    )
    assert.strictEqual(
        PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, []),
        geometry
    )
    assert.strictEqual(
        PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, invalidCutouts),
        geometry
    )
    assert.strictEqual(
        PcbScene3dCutoutGeometryFilter.filter(THREE, emptyGeometry, [square]),
        emptyGeometry
    )
    assert.strictEqual(
        PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, [distantCutout]),
        geometry
    )
})

test('matches legacy coordinate coercion for structurally valid cutouts', () => {
    const geometry = buildGeometry([0.2, 0.2, 1, 0.4, 0.2, 2, 0.2, 0.4, 3])
    const cutout = [{}, { x: '2', y: 0 }, { x: 0, y: '2' }]

    const result = PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, [
        cutout
    ])

    assert.deepEqual(positionArray(result), [])
})

test('returns the original indexed geometry when overlapping bounds contain no cutout contact', () => {
    const geometry = buildGeometry(
        [0, 0, 0, 1, 0, 1, 0, 1, 2, 4, 0, 3, 5, 0, 4, 5, 1, 5],
        [0, 1, 2, 3, 4, 5]
    )
    const gapCutout = [
        { x: 2, y: 0.25 },
        { x: 3, y: 0.25 },
        { x: 3, y: 0.75 },
        { x: 2, y: 0.75 }
    ]

    const result = PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, [
        gapCutout
    ])

    assert.strictEqual(result, geometry)
    assert.ok(result.index)
})

test('matches the captured circular terminal-overlap buffer exactly', () => {
    const positions = [
        1.5, 0, 1, 3, 0, 2, 3, 1, 3, -3, 0, 4, 3, 0, 5, 3, 0.5, 6, 4, 4, 7, 5,
        4, 8, 4, 5, 9
    ]
    const geometry = buildGeometry(positions)

    const result = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [buildCircle(16, 2)],
        { maxDepth: 0, discardTerminalOverlaps: false }
    )

    assert.notStrictEqual(result, geometry)
    assert.deepEqual(
        positionArray(result),
        [1.5, 0, 1, 3, 0, 2, 3, 1, 3, 4, 4, 7, 5, 4, 8, 4, 5, 9]
    )
})

test('matches captured concave and collinear polygon buffers exactly', () => {
    const concaveCutout = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 4 },
        { x: 0, y: 4 }
    ]
    const concavePositions = [
        2, 2, 1, 3, 2, 2, 2, 3, 3, 2, 0.25, 4, 3, 0.25, 5, 2, 0.75, 6, 0.5, 0.5,
        7, 2, 2, 8, 0.5, 2, 9
    ]
    const collinearCutout = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 2, y: 4 },
        { x: 0, y: 4 }
    ]
    const collinearPositions = [
        1, 1, 1, 3, 1, 2, 1, 3, 3, 5, 5, 4, 6, 5, 5, 5, 6, 6
    ]

    const concaveResult = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(concavePositions),
        [concaveCutout],
        { maxDepth: 0, discardTerminalOverlaps: false }
    )
    const collinearResult = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(collinearPositions),
        [collinearCutout],
        { maxDepth: 0, discardTerminalOverlaps: true }
    )

    assert.deepEqual(positionArray(concaveResult), concavePositions.slice(0, 9))
    assert.deepEqual(
        positionArray(collinearResult),
        collinearPositions.slice(9)
    )
})

test('matches the captured fully covered polygon buffer exactly', () => {
    const geometry = buildGeometry([-1, -1, 1, 1, -1, 3, 0, 1, 5])
    const cutout = [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 }
    ]

    const result = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [cutout],
        { maxDepth: 8, maxEdgeLength: 0.1 }
    )

    assert.notStrictEqual(result, geometry)
    assert.deepEqual(positionArray(result), [])
})

test('matches recursive child order and interpolated Z values exactly', () => {
    const geometry = buildGeometry([-2, 0, 0, 2, 0, 4, -2, 4, 8])
    const cutout = [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 }
    ]

    const result = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [cutout],
        { maxDepth: 1, maxEdgeLength: 0.1, discardTerminalOverlaps: true }
    )

    assert.notStrictEqual(result, geometry)
    assert.deepEqual(
        positionArray(result),
        [
            -2, 0, 0, 0, 0, 2, -2, 2, 4, -2, 2, 4, 0, 2, 6, -2, 4, 8, 0, 0, 2,
            0, 2, 6, -2, 2, 4
        ]
    )
})

test('matches the captured sparse overlap buffer for a 10000-point cutout', () => {
    const cutout = buildSquareContour(2, 2500)
    const positions = [
        -6, -6, 1, -5, -6, 2, -6, -5, 3, -0.5, -0.5, 4, 0.5, -0.5, 5, 0, 0.5, 6,
        5, 5, 7, 6, 5, 8, 5, 6, 9
    ]
    const geometry = buildGeometry(positions)

    const result = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [cutout],
        { maxDepth: 0, discardTerminalOverlaps: true }
    )

    assert.deepEqual(positionArray(result), [
        ...positions.slice(0, 9),
        ...positions.slice(18)
    ])
})
