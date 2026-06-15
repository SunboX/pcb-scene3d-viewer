import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dShapeHoleGeometryCleaner } from '../src/PcbScene3dShapeHoleGeometryCleaner.mjs'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

test('PcbScene3dSilkscreenFactory keeps compact drill centers open in complex shape fills', () => {
    const cutouts = [
        circleCutout(11.835, 394.539, 43),
        rectangleCutout(11.835, 433.909, 86, 118.11),
        circleCutout(113.213, 456.547, 11.811),
        circleCutout(81.717, 338.437, 11.811),
        circleCutout(-140.724, 336.503, 11.811)
    ]
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [{ points: complexContourPoints() }],
                tracks: [],
                arcs: [],
                drillCutouts: cutouts
            },
            bottom: { fills: [], tracks: [], arcs: [], drillCutouts: [] }
        },
        18,
        -18,
        (x, y) => ({ x, y })
    )
    const fillMesh = group.children[0].children[0]

    assert.deepEqual(
        cutouts
            .map(resolvePolygonCenter)
            .map((point) =>
                geometryContainsPointTriangle(fillMesh.geometry, point)
            ),
        [false, false, false, false, false]
    )
})

test('PcbScene3dShapeHoleGeometryCleaner preserves fill beside compact hole cleanup', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
            [-60, -40, 0, 160, -10, 0, -50, 90, 0],
            3
        )
    )
    const hole = circleCutout(0, 0, 5)
    const cleanedGeometry =
        PcbScene3dShapeHoleGeometryCleaner.removeCoveredHoleCenters(
            THREE,
            geometry,
            [hole]
        )

    assert.equal(
        geometryContainsPointTriangle(cleanedGeometry, { x: 0, y: 0 }),
        false
    )
    assert.equal(
        geometryContainsPointTriangle(cleanedGeometry, {
            x: -3.741613255361454,
            y: 2.50006604858821
        }),
        false
    )
    assert.equal(
        geometryContainsPointTriangle(cleanedGeometry, {
            x: -5.722312178365132,
            y: 0.5635985568949747
        }),
        true
    )
    assert.equal(
        geometryContainsPointTriangle(cleanedGeometry, { x: 5.75, y: 0 }),
        true
    )
    assert.equal(
        geometryContainsPointTriangle(cleanedGeometry, { x: 80, y: 0 }),
        true
    )
})

test('PcbScene3dSilkscreenFactory keeps fallback circular cutouts round', () => {
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [{ points: rectangleCutout(0, 0, 40, 40) }],
                tracks: [],
                arcs: [],
                drillCutouts: [circleCutout(16, 0, 5)]
            },
            bottom: { fills: [], tracks: [], arcs: [], drillCutouts: [] }
        },
        18,
        -18,
        (x, y) => ({ x, y })
    )
    const fillMesh = group.children[0].children[0]

    assert.equal(fillMesh.geometry.type, 'ShapeGeometry')
    assert.equal(
        geometryContainsPointTriangle(fillMesh.geometry, {
            x: 12.258386744638546,
            y: 2.50006604858821
        }),
        false
    )
})

test('PcbScene3dSilkscreenFactory merges overlapping circular shape cutouts', () => {
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [{ points: rectangleCutout(0, 0, 120, 120) }],
                tracks: [],
                arcs: [],
                drillCutouts: [
                    circleCutout(0, -10, 20),
                    rectangleCutout(0, 20, 40, 60)
                ]
            },
            bottom: { fills: [], tracks: [], arcs: [], drillCutouts: [] }
        },
        18,
        -18,
        (x, y) => ({ x, y })
    )
    const fillMesh = group.children[0].children[0]

    assert.equal(fillMesh.geometry.type, 'ShapeGeometry')
    assert.equal(
        geometryContainsPointTriangle(fillMesh.geometry, { x: 0, y: -10 }),
        false
    )
    assert.equal(
        geometryContainsPointTriangle(fillMesh.geometry, { x: 0, y: 35 }),
        false
    )
})

/**
 * Builds a generic complex contour that exercises Three's shape-hole
 * triangulation edge case without depending on external project files.
 * @returns {{ x: number, y: number }[]}
 */
function complexContourPoints() {
    return [
        { x: 1389.601, y: 603.102 },
        { x: 1486.871, y: 168.573 },
        { x: 927.544, y: -259.04 },
        { x: 726.515, y: 19.83 },
        { x: 1141.594, y: -1301.906 },
        { x: 856.825, y: -1545.946 },
        { x: 105.543, y: -1015.001 },
        { x: 347.69, y: -827.826 },
        { x: 786.838, y: -1145.962 },
        { x: 360.589, y: 226.047 },
        { x: 896.414, y: 19.91 },
        { x: 1181.878, y: 306.878 },
        { x: 692.519, y: 335.343 },
        { x: 703.627, y: 92.055 },
        { x: 687.615, y: 314.833 },
        { x: -162.36, y: 317.254 },
        { x: -63.32, y: 603.407 }
    ]
}

/**
 * Builds one circular cutout polygon.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Radius.
 * @returns {{ x: number, y: number }[]}
 */
function circleCutout(centerX, centerY, radius) {
    return Array.from({ length: 32 }, (_value, index) => {
        const angle = (index / 32) * Math.PI * 2

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds one rectangular cutout polygon.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} width Width.
 * @param {number} height Height.
 * @returns {{ x: number, y: number }[]}
 */
function rectangleCutout(centerX, centerY, width, height) {
    return [
        { x: centerX - width / 2, y: centerY - height / 2 },
        { x: centerX + width / 2, y: centerY - height / 2 },
        { x: centerX + width / 2, y: centerY + height / 2 },
        { x: centerX - width / 2, y: centerY + height / 2 }
    ]
}

/**
 * Resolves the average center of one polygon.
 * @param {{ x: number, y: number }[]} polygon Polygon points.
 * @returns {{ x: number, y: number }}
 */
function resolvePolygonCenter(polygon) {
    const total = polygon.reduce(
        (sum, point) => ({
            x: sum.x + point.x,
            y: sum.y + point.y
        }),
        { x: 0, y: 0 }
    )

    return {
        x: total.x / polygon.length,
        y: total.y / polygon.length
    }
}

/**
 * Returns true when one geometry has a triangle covering a local XY point.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} point Local XY point.
 * @returns {boolean}
 */
function geometryContainsPointTriangle(geometry, point) {
    const sourceGeometry = geometry.index ? geometry.toNonIndexed() : geometry
    const position = sourceGeometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (pointInsideTriangle(point, triangle)) {
            return true
        }
    }

    return false
}

/**
 * Returns true when a point is inside one triangle.
 * @param {{ x: number, y: number }} point Point to test.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function pointInsideTriangle(point, triangle) {
    const signs = triangle.map((current, index) => {
        const next = triangle[(index + 1) % triangle.length]
        return (
            (point.x - next.x) * (current.y - next.y) -
            (current.x - next.x) * (point.y - next.y)
        )
    })
    const hasNegative = signs.some((sign) => sign < -0.001)
    const hasPositive = signs.some((sign) => sign > 0.001)

    return !(hasNegative && hasPositive)
}
