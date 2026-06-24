import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbAssemblyFillGeometryResolver } from '../src/PcbAssemblyFillGeometryResolver.mjs'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'

/**
 * Builds a rotated pill-like loop.
 * @param {number} x1 Centerline start X.
 * @param {number} y1 Centerline start Y.
 * @param {number} x2 Centerline end X.
 * @param {number} y2 Centerline end Y.
 * @param {number} radius Cap radius.
 * @returns {{ x: number, y: number }[]}
 */
function pillLoop(x1, y1, x2, y2, radius) {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const unitX = dx / length
    const unitY = dy / length
    const normalX = -unitY
    const normalY = unitX
    const points = []

    for (let index = 0; index <= 12; index += 1) {
        const angle = -Math.PI / 2 + (Math.PI * index) / 12
        points.push({
            x:
                x2 +
                (unitX * Math.cos(angle) + normalX * Math.sin(angle)) * radius,
            y:
                y2 +
                (unitY * Math.cos(angle) + normalY * Math.sin(angle)) * radius
        })
    }
    for (let index = 0; index <= 12; index += 1) {
        const angle = Math.PI / 2 + (Math.PI * index) / 12
        points.push({
            x:
                x1 +
                (unitX * Math.cos(angle) + normalX * Math.sin(angle)) * radius,
            y:
                y1 +
                (unitY * Math.cos(angle) + normalY * Math.sin(angle)) * radius
        })
    }

    return points
}

/**
 * Finds a nested Three object by name.
 * @param {any} object Root object.
 * @param {string} name Object name.
 * @returns {any | null}
 */
function findObjectByName(object, name) {
    if (object?.name === name) {
        return object
    }

    for (const child of object?.children || []) {
        const match = findObjectByName(child, name)
        if (match) {
            return match
        }
    }

    return null
}

/**
 * Checks whether any triangle centroid lies inside the supplied bounds.
 * @param {ArrayLike<number>} positions Position attribute array.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds to test.
 * @returns {boolean}
 */
function hasTriangleCentroidInsideBounds(positions, bounds) {
    for (let index = 0; index < positions.length; index += 9) {
        const centroidX =
            (positions[index] + positions[index + 3] + positions[index + 6]) / 3
        const centroidY =
            (positions[index + 1] +
                positions[index + 4] +
                positions[index + 7]) /
            3

        if (
            centroidX >= bounds.minX &&
            centroidX <= bounds.maxX &&
            centroidY >= bounds.minY &&
            centroidY <= bounds.maxY
        ) {
            return true
        }
    }

    return false
}

test('PcbScene3dCopperFactory renders solver-style B-Rep pour islands', () => {
    const pour = {
        layer: 'F.Cu',
        brep_shapes: [
            {
                outer_ring: {
                    vertices: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 },
                        { x: 100, y: 80 },
                        { x: 0, y: 80 }
                    ]
                },
                inner_rings: [{ vertices: pillLoop(30, 25, 70, 55, 8) }]
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 125, y: 10 },
                        { x: 165, y: 10 },
                        { x: 165, y: 50 },
                        { x: 125, y: 50 }
                    ]
                }
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 180, y: 0 },
                        { x: 180.01, y: 0 },
                        { x: 180.01, y: 0.01 },
                        { x: 180, y: 0.01 }
                    ]
                }
            }
        ]
    }
    const report = PcbAssemblyFillGeometryResolver.inspect(pour)

    assert.equal(report.loopSets.length, 2)
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.reason),
        ['near-zero-area']
    )

    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        { tracks: [], arcs: [], pads: [], vias: [], polygons: [pour] },
        5,
        -5,
        (x, y) => ({ x, y })
    )
    const fillMesh = findObjectByName(group, 'copper-fills')
    assert.ok(fillMesh)
    const positions = fillMesh.geometry.attributes.position.array

    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 5,
            maxX: 20,
            minY: 5,
            maxY: 20
        }),
        true
    )
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 45,
            maxX: 55,
            minY: 35,
            maxY: 45
        }),
        false
    )
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 130,
            maxX: 160,
            minY: 15,
            maxY: 45
        }),
        true
    )
})
