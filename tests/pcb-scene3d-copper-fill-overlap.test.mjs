import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'

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
 * Counts surface triangles covering one XY point.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} point Point to sample.
 * @returns {number}
 */
function countTrianglesCoveringPoint(geometry, point) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (
            triangleArea(triangle) > 0.001 &&
            pointInTriangle(point, triangle)
        ) {
            count += 1
        }
    }

    return count
}

/**
 * Computes one 2D triangle area.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {number}
 */
function triangleArea(triangle) {
    const [first, second, third] = triangle
    return (
        Math.abs(
            (second.x - first.x) * (third.y - first.y) -
                (third.x - first.x) * (second.y - first.y)
        ) / 2
    )
}

/**
 * Checks whether one point is inside a 2D triangle.
 * @param {{ x: number, y: number }} point Point to test.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function pointInTriangle(point, triangle) {
    const signs = triangle.map((start, index) => {
        const end = triangle[(index + 1) % triangle.length]
        return (
            (point.x - end.x) * (start.y - end.y) -
            (start.x - end.x) * (point.y - end.y)
        )
    })

    return (
        signs.every((sign) => sign >= -0.001) ||
        signs.every((sign) => sign <= 0.001)
    )
}

/**
 * Builds one rectangular fill primitive.
 * @param {number} minX Left edge.
 * @param {number} minY Bottom edge.
 * @param {number} maxX Right edge.
 * @param {number} maxY Top edge.
 * @returns {object}
 */
function createFill(minX, minY, maxX, maxY) {
    return {
        layerId: 1,
        points: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY }
        ]
    }
}

/**
 * Builds one simple triangle mesh.
 * @param {number[]} positions Triangle positions.
 * @returns {any}
 */
function createTriangleMesh(positions) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    )
    return new THREE.Mesh(geometry)
}

/**
 * Builds a dense filled polygon.
 * @param {number} count Vertex count.
 * @returns {object}
 */
function createDenseFill(count) {
    return {
        layerId: 1,
        points: Array.from({ length: count }, (_unused, index) => {
            const angle = (index / count) * Math.PI * 2

            return {
                x: 100 + Math.cos(angle) * 90,
                y: 100 + Math.sin(angle) * 90
            }
        })
    }
}

test('PcbScene3dCopperFactory clips partially overlapping Gerber covered fill surfaces', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [createFill(0, 0, 100, 100), createFill(60, 20, 140, 80)]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { unionCoveredLayerPrimitives: true }
    )

    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assert.ok(fillMesh)
    assert.equal(
        countTrianglesCoveringPoint(fillMesh.geometry, { x: 73.1, y: 51.7 }),
        1
    )
    assert.equal(
        countTrianglesCoveringPoint(fillMesh.geometry, { x: 121.4, y: 47.3 }),
        1
    )
})

test('PcbScene3dCopperFactory clips Gerber fill overlap edge slivers', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [createFill(0, 0, 100, 100), createFill(50, -10, 150, 90)]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { unionCoveredLayerPrimitives: true }
    )

    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assert.ok(fillMesh)
    assert.equal(
        countTrianglesCoveringPoint(fillMesh.geometry, { x: 75, y: 0.05 }),
        1
    )
})

test('PcbScene3dCopperFactory appends dense Gerber covered fills without overflowing the stack', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            polygons: [createDenseFill(20000)]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { unionCoveredLayerPrimitives: true }
    )

    assert.ok(findObjectByName(group, 'mask-covered-copper-fills'))
})

test('PcbScene3dCopperFillAreaClipper preserves partial stroke triangles when subdivision is disabled', () => {
    const mesh = createTriangleMesh([0, 0, 0, 10, 0, 0, 0, 10, 0])
    const filteredMesh = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        mesh,
        [createFill(4, -1, 12, 12)],
        (x, y) => ({ x, y }),
        false,
        { subdividePartialTriangles: false }
    )

    const position = filteredMesh.geometry.getAttribute('position')

    assert.equal(position.count, 3)
    assert.deepEqual(Array.from(position.array), [0, 0, 0, 10, 0, 0, 0, 10, 0])
})
