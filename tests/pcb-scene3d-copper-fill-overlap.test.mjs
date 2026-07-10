import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCopperFillCoverageContext } from '../src/PcbScene3dCopperFillCoverageContext.mjs'
import { PcbScene3dCopperFillLoopSetResolver } from '../src/PcbScene3dCopperFillLoopSetResolver.mjs'
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

/**
 * Reads one mesh position buffer or returns an empty array for full removal.
 * @param {any | null} mesh Mesh result.
 * @returns {number[]}
 */
function positionArray(mesh) {
    return mesh ? Array.from(mesh.geometry.getAttribute('position').array) : []
}

/**
 * Clips a mesh through a prebuilt fill-coverage context.
 * @param {any} mesh Source mesh.
 * @param {object[]} fills Copper fills.
 * @param {boolean} [mirrorY] Whether to mirror Y.
 * @param {object} [options] Clipper options.
 * @returns {any | null}
 */
function filterPrepared(mesh, fills, mirrorY = false, options = {}) {
    const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x, y }),
        mirrorY
    )
    const context = PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)

    return PcbScene3dCopperFillAreaClipper.filterPrepared(
        THREE,
        mesh,
        context,
        options
    )
}

test('PcbScene3dCopperFillAreaClipper preserves literal legacy clipping buffers and identity', () => {
    const nonePositions = [0, 0, 1, 1, 0, 2, 0, 1, 3]
    const noneMesh = createTriangleMesh(nonePositions)
    const noneGeometry = noneMesh.geometry
    const noneResult = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        noneMesh,
        [createFill(10, 10, 12, 12)],
        (x, y) => ({ x, y }),
        false
    )

    assert.strictEqual(noneResult, noneMesh)
    assert.strictEqual(noneResult.geometry, noneGeometry)
    assert.deepEqual(positionArray(noneResult), nonePositions)

    const coveredMesh = createTriangleMesh([
        0.1, 0.1, 1, 0.8, 0.1, 2, 0.1, 0.8, 3
    ])
    assert.equal(
        PcbScene3dCopperFillAreaClipper.filter(
            THREE,
            coveredMesh,
            [createFill(0, 0, 1, 1)],
            (x, y) => ({ x, y }),
            false
        ),
        null
    )

    const partialMesh = createTriangleMesh(nonePositions)
    const partialGeometry = partialMesh.geometry
    const partialResult = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        partialMesh,
        [createFill(0.4, -0.1, 2, 2)],
        (x, y) => ({ x, y }),
        false
    )

    assert.strictEqual(partialResult, partialMesh)
    assert.notStrictEqual(partialResult.geometry, partialGeometry)
    assert.deepEqual(positionArray(partialResult), nonePositions)

    const recursiveMesh = createTriangleMesh([0, 0, 1, 2.5, 0, 2, 0, 2.5, 3])
    const recursiveResult = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        recursiveMesh,
        [createFill(1.25, -1, 3.5, 3.5)],
        (x, y) => ({ x, y }),
        false
    )

    assert.deepEqual(
        positionArray(recursiveResult),
        [
            0, 0, 1, 1.25, 0, 1.5, 0, 1.25, 2, 0, 1.25, 2, 1.25, 1.25, 2.5, 0,
            2.5, 3, 1.25, 0, 1.5, 1.25, 1.25, 2.5, 0, 1.25, 2
        ]
    )

    const enclosingMesh = createTriangleMesh([0, 0, 1, 1.4, 0, 2, 0, 1.4, 3])
    const enclosingGeometry = enclosingMesh.geometry
    const enclosingResult = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        enclosingMesh,
        [createFill(0.2, 0.2, 0.4, 0.4)],
        (x, y) => ({ x, y }),
        false
    )

    assert.strictEqual(enclosingResult, enclosingMesh)
    assert.notStrictEqual(enclosingResult.geometry, enclosingGeometry)
    assert.deepEqual(
        positionArray(enclosingResult),
        [0, 0, 1, 1.399999976158142, 0, 2, 0, 1.399999976158142, 3]
    )
})

test('PcbScene3dCopperFillAreaClipper preserves literal hole boundary and mirrored buffers', () => {
    const holeFill = {
        ...createFill(0, 0, 2, 2),
        holes: [
            [
                { x: 0.5, y: 0.5 },
                { x: 1.5, y: 0.5 },
                { x: 1.5, y: 1.5 },
                { x: 0.5, y: 1.5 }
            ]
        ]
    }
    const holeMesh = createTriangleMesh([0.8, 0.8, 1, 1.2, 0.8, 2, 0.8, 1.2, 3])
    const holeGeometry = holeMesh.geometry
    const holeResult = PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        holeMesh,
        [holeFill],
        (x, y) => ({ x, y }),
        false
    )

    assert.strictEqual(holeResult.geometry, holeGeometry)
    assert.deepEqual(
        positionArray(holeResult),
        [
            0.800000011920929, 0.800000011920929, 1, 1.2000000476837158,
            0.800000011920929, 2, 0.800000011920929, 1.2000000476837158, 3
        ]
    )

    for (const x of [1, 1.0005]) {
        const boundaryMesh = createTriangleMesh([
            x,
            0.2,
            1,
            x,
            0.4,
            2,
            x,
            0.8,
            3
        ])
        const boundaryResult = PcbScene3dCopperFillAreaClipper.filter(
            THREE,
            boundaryMesh,
            [createFill(0, 0, 1, 1)],
            (sourceX, sourceY) => ({ x: sourceX, y: sourceY }),
            false
        )

        assert.deepEqual(positionArray(boundaryResult), [
            Math.fround(x),
            Math.fround(0.2),
            1,
            Math.fround(x),
            Math.fround(0.4),
            2,
            Math.fround(x),
            Math.fround(0.8),
            3
        ])
    }

    const mirroredMesh = createTriangleMesh([
        0.1, -0.1, 1, 0.8, -0.1, 2, 0.1, -0.8, 3
    ])
    assert.equal(
        PcbScene3dCopperFillAreaClipper.filter(
            THREE,
            mirroredMesh,
            [createFill(0, 0, 1, 1)],
            (x, y) => ({ x, y }),
            true
        ),
        null
    )
})

test('PcbScene3dCopperFillAreaClipper prepared queries exactly match raw legacy outputs', () => {
    const holeFill = {
        ...createFill(0, 0, 2, 2),
        holes: [
            [
                { x: 0.5, y: 0.5 },
                { x: 1.5, y: 0.5 },
                { x: 1.5, y: 1.5 },
                { x: 0.5, y: 1.5 }
            ]
        ]
    }
    const fixtures = [
        {
            name: 'none',
            positions: [0, 0, 1, 1, 0, 2, 0, 1, 3],
            fills: [createFill(10, 10, 12, 12)]
        },
        {
            name: 'full',
            positions: [0.1, 0.1, 1, 0.8, 0.1, 2, 0.1, 0.8, 3],
            fills: [createFill(0, 0, 1, 1)]
        },
        {
            name: 'partial terminal',
            positions: [0, 0, 1, 1, 0, 2, 0, 1, 3],
            fills: [createFill(0.4, -0.1, 2, 2)]
        },
        {
            name: 'recursive',
            positions: [0, 0, 1, 2.5, 0, 2, 0, 2.5, 3],
            fills: [createFill(1.25, -1, 3.5, 3.5)]
        },
        {
            name: 'enclosing loop',
            positions: [0, 0, 1, 1.4, 0, 2, 0, 1.4, 3],
            fills: [createFill(0.2, 0.2, 0.4, 0.4)]
        },
        {
            name: 'authored hole',
            positions: [0.8, 0.8, 1, 1.2, 0.8, 2, 0.8, 1.2, 3],
            fills: [holeFill]
        },
        {
            name: 'right epsilon boundary',
            positions: [1.0005, 0.2, 1, 1.0005, 0.4, 2, 1.0005, 0.8, 3],
            fills: [createFill(0, 0, 1, 1)]
        },
        {
            name: 'left and bottom boundary',
            positions: [0, 0, 1, 0.4, 0, 2, 0, 0.4, 3],
            fills: [createFill(0, 0, 1, 1)]
        },
        {
            name: 'mirrored',
            positions: [0.1, -0.1, 1, 0.8, -0.1, 2, 0.1, -0.8, 3],
            fills: [createFill(0, 0, 1, 1)],
            mirrorY: true
        },
        {
            name: 'partial without subdivision',
            positions: [0, 0, 7, 10, 0, 8, 0, 10, 9],
            fills: [createFill(4, -1, 12, 12)],
            options: { subdividePartialTriangles: false }
        }
    ]

    for (const fixture of fixtures) {
        const rawMesh = createTriangleMesh(fixture.positions)
        const rawGeometry = rawMesh.geometry
        const preparedMesh = createTriangleMesh(fixture.positions)
        const preparedGeometry = preparedMesh.geometry
        const rawResult = PcbScene3dCopperFillAreaClipper.filter(
            THREE,
            rawMesh,
            fixture.fills,
            (x, y) => ({ x, y }),
            fixture.mirrorY === true,
            fixture.options || {}
        )
        const preparedResult = filterPrepared(
            preparedMesh,
            fixture.fills,
            fixture.mirrorY === true,
            fixture.options || {}
        )

        assert.equal(
            preparedResult === null,
            rawResult === null,
            `${fixture.name} null result`
        )
        assert.equal(
            preparedResult?.geometry === preparedGeometry,
            rawResult?.geometry === rawGeometry,
            `${fixture.name} geometry identity`
        )
        assert.deepEqual(
            positionArray(preparedResult),
            positionArray(rawResult),
            fixture.name
        )
    }
})

test('PcbScene3dCopperFillAreaClipper preserves indexed identity until coverage changes', () => {
    const positions = [
        0.1, 0.1, 1, 0.8, 0.1, 2, 0.1, 0.8, 3, 10, 10, 4, 11, 10, 5, 10, 11, 6
    ]
    const createIndexedMesh = () => {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        geometry.setIndex([0, 1, 2, 3, 4, 5])
        return new THREE.Mesh(geometry)
    }
    const unchangedMesh = createIndexedMesh()
    const unchangedGeometry = unchangedMesh.geometry
    const unchangedResult = filterPrepared(unchangedMesh, [
        createFill(20, 20, 21, 21)
    ])

    assert.strictEqual(unchangedResult, unchangedMesh)
    assert.strictEqual(unchangedResult.geometry, unchangedGeometry)
    assert.ok(unchangedResult.geometry.index)

    const changedMesh = createIndexedMesh()
    const changedGeometry = changedMesh.geometry
    const changedResult = filterPrepared(changedMesh, [createFill(0, 0, 1, 1)])

    assert.strictEqual(changedResult, changedMesh)
    assert.notStrictEqual(changedResult.geometry, changedGeometry)
    assert.equal(changedResult.geometry.index, null)
    assert.deepEqual(
        positionArray(changedResult),
        [10, 10, 4, 11, 10, 5, 10, 11, 6]
    )
})

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
