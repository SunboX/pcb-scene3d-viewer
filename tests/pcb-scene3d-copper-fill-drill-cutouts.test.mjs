import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'

/**
 * Finds a nested Three object by name.
 * @param {any} object Root object.
 * @param {string} name Object name.
 * @returns {any | null}
 */
function findObjectByName(object, name) {
    if (object?.name === name) return object
    for (const child of object?.children || []) {
        const match = findObjectByName(child, name)
        if (match) return match
    }
    return null
}

/**
 * Checks whether any triangle intersects or covers a circle.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} center Circle center.
 * @param {number} radius Circle radius.
 * @returns {boolean}
 */
function hasTriangleOverlappingCircle(geometry, center, radius) {
    const position = geometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (triangleOverlapsCircle(triangle, center, radius)) {
            return true
        }
    }

    return false
}

/**
 * Returns true when one triangle overlaps a circular area.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @param {{ x: number, y: number }} center Circle center.
 * @param {number} radius Circle radius.
 * @returns {boolean}
 */
function triangleOverlapsCircle(triangle, center, radius) {
    const radiusSquared = (Number(radius || 0) - 0.001) ** 2

    return (
        triangle.some(
            (point) =>
                (point.x - center.x) ** 2 + (point.y - center.y) ** 2 <=
                radiusSquared
        ) ||
        isPointInsideTriangle(center, triangle) ||
        triangle.some(
            (point, index) =>
                squaredDistanceToSegment(
                    center,
                    point,
                    triangle[(index + 1) % triangle.length]
                ) <= radiusSquared
        )
    )
}

/**
 * Returns true when a point lies inside one triangle.
 * @param {{ x: number, y: number }} point Point to inspect.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function isPointInsideTriangle(point, triangle) {
    let hasNegative = false
    let hasPositive = false

    for (let index = 0; index < triangle.length; index += 1) {
        const current = triangle[index]
        const next = triangle[(index + 1) % triangle.length]
        const sign =
            (next.x - current.x) * (point.y - current.y) -
            (next.y - current.y) * (point.x - current.x)

        hasNegative ||= sign < -0.001
        hasPositive ||= sign > 0.001
    }

    return !(hasNegative && hasPositive)
}

/**
 * Resolves squared distance from a point to a finite segment.
 * @param {{ x: number, y: number }} point Point to inspect.
 * @param {{ x: number, y: number }} start Segment start.
 * @param {{ x: number, y: number }} end Segment end.
 * @returns {number}
 */
function squaredDistanceToSegment(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared
        ? Math.max(
              0,
              Math.min(
                  1,
                  ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                      lengthSquared
              )
          )
        : 0
    const projected = {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio
    }

    return (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2
}

/**
 * Builds a circular board-coordinate cutout polygon.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Circle radius.
 * @param {number} [segments] Segment count.
 * @returns {{ x: number, y: number }[]}
 */
function circleCutout(centerX, centerY, radius, segments = 48) {
    return Array.from({ length: segments }, (_unused, index) => {
        const angle = (Math.PI * 2 * index) / segments

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

test('PcbScene3dCopperFactory cuts via drill apertures from copper fills', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        [0, 0],
                        [100, 0],
                        [100, 100],
                        [0, 100]
                    ]
                }
            ],
            pads: [],
            vias: [{ x: 50, y: 50, diameter: 28, holeDiameter: 20 }]
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )
    const fillMesh = findObjectByName(group, 'copper-fills')

    assert.ok(fillMesh)
    assert.equal(
        hasTriangleOverlappingCircle(fillMesh.geometry, { x: 50, y: 50 }, 10),
        false
    )
})

test('PcbScene3dCopperFactory cuts via drill apertures from covered copper fills', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        [0, 0],
                        [100, 0],
                        [100, 100],
                        [0, 100]
                    ]
                }
            ],
            polygons: []
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        {
            drillCutouts: [circleCutout(50, 50, 10)]
        }
    )
    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assert.ok(fillMesh)
    assert.equal(
        hasTriangleOverlappingCircle(fillMesh.geometry, { x: 50, y: 50 }, 10),
        false
    )
})
