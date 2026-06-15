import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

/**
 * Builds one rectangular polygon fill.
 * @param {number} x1 Left edge.
 * @param {number} y1 Top edge.
 * @param {number} x2 Right edge.
 * @param {number} y2 Bottom edge.
 * @returns {{ points: { x: number, y: number }[] }}
 */
function polygonFill(x1, y1, x2, y2) {
    return {
        points: [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 }
        ]
    }
}

/**
 * Resolves silkscreen fill seam meshes from the top-side render group.
 * @param {any} group Render group.
 * @returns {any[]}
 */
function resolveTopSeamMeshes(group) {
    return (group.children[0]?.children || []).filter(
        (child) => child?.userData?.scene3dSilkscreenFillSeam === true
    )
}

/**
 * Returns true when any triangle centroid lies inside the requested bounds.
 * @param {any[]} meshes Meshes with BufferGeometry position attributes.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * Bounds.
 * @returns {boolean}
 */
function hasTriangleCentroidInsideBounds(meshes, bounds) {
    for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute('position')
        for (let index = 0; index < position.count; index += 3) {
            const centroid = {
                x:
                    (position.getX(index) +
                        position.getX(index + 1) +
                        position.getX(index + 2)) /
                    3,
                y:
                    (position.getY(index) +
                        position.getY(index + 1) +
                        position.getY(index + 2)) /
                    3
            }

            if (
                centroid.x >= bounds.minX &&
                centroid.x <= bounds.maxX &&
                centroid.y >= bounds.minY &&
                centroid.y <= bounds.maxY
            ) {
                return true
            }
        }
    }

    return false
}

test('PcbScene3dSilkscreenFactory covers tiny seams between polygon fills', () => {
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [
                    polygonFill(0, 0, 50, 100),
                    polygonFill(50.35, 0, 100, 100)
                ],
                tracks: [],
                arcs: [],
                copperCutouts: []
            },
            bottom: { fills: [], tracks: [], arcs: [] }
        },
        12,
        -12,
        (x, y) => ({ x, y })
    )

    const seamMeshes = resolveTopSeamMeshes(group)

    assert.ok(seamMeshes.length > 0)
    assert.equal(
        hasTriangleCentroidInsideBounds(seamMeshes, {
            minX: 49.8,
            maxX: 50.55,
            minY: 20,
            maxY: 80
        }),
        true
    )
})

test('PcbScene3dSilkscreenFactory clips fill seam covers around copper keepouts', () => {
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [polygonFill(0, 0, 100, 100)],
                tracks: [],
                arcs: [],
                copperCutouts: [
                    [
                        { x: 40, y: -5 },
                        { x: 60, y: -5 },
                        { x: 60, y: 5 },
                        { x: 40, y: 5 }
                    ]
                ]
            },
            bottom: { fills: [], tracks: [], arcs: [] }
        },
        12,
        -12,
        (x, y) => ({ x, y })
    )

    const seamMeshes = resolveTopSeamMeshes(group)

    assert.ok(seamMeshes.length > 0)
    assert.equal(
        hasTriangleCentroidInsideBounds(seamMeshes, {
            minX: 40,
            maxX: 60,
            minY: -5,
            maxY: 5
        }),
        false
    )
})
