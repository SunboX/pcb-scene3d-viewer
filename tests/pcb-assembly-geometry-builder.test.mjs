import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbAssemblyGeometryBuilder,
    PcbAssemblyMeshUtils
} from '../src/scene3d.mjs'

/**
 * Builds a board-centered scene whose PCB primitives are source-coordinate
 * based while component placements are already board-local.
 * @returns {object}
 */
function createCenteredScene() {
    return {
        board: {
            widthMil: 1000,
            heightMil: 500,
            thicknessMil: 62,
            centerX: 500,
            centerY: 250,
            segments: [
                { type: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 },
                { type: 'line', x1: 1000, y1: 0, x2: 1000, y2: 500 },
                { type: 'line', x1: 1000, y1: 500, x2: 0, y2: 500 },
                { type: 'line', x1: 0, y1: 500, x2: 0, y2: 0 }
            ]
        },
        detail: {
            tracks: [
                {
                    layer: 'top',
                    x1: 550,
                    y1: 250,
                    x2: 650,
                    y2: 250,
                    width: 20
                }
            ],
            arcs: [],
            fills: [],
            polygons: [],
            pads: [
                {
                    x: 600,
                    y: 260,
                    shapeTop: 2,
                    shapeBottom: 2,
                    sizeTopX: 40,
                    sizeTopY: 20,
                    sizeBottomX: 40,
                    sizeBottomY: 20
                }
            ],
            vias: [],
            copperTexts: [],
            silkscreen: {
                top: { tracks: [], arcs: [], fills: [], texts: [] },
                bottom: { tracks: [], arcs: [], fills: [], texts: [] }
            }
        },
        externalPlacements: [
            {
                designator: 'U1',
                mountSide: 'top',
                rotationDeg: 0,
                positionMil: { x: 100, y: 10, z: 38 },
                modelTransform: null,
                externalModel: { format: 'step', name: 'u1.step' }
            }
        ]
    }
}

/**
 * Builds a centered rectangular board scene with one generated drill cutout.
 * @returns {object}
 */
function createDrilledBoardScene() {
    return {
        board: {
            widthMil: 200,
            heightMil: 200,
            thicknessMil: 40,
            centerX: 100,
            centerY: 100,
            segments: [
                { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0 },
                { type: 'line', x1: 200, y1: 0, x2: 200, y2: 200 },
                { type: 'line', x1: 200, y1: 200, x2: 0, y2: 200 },
                { type: 'line', x1: 0, y1: 200, x2: 0, y2: 0 }
            ]
        },
        detail: {
            tracks: [],
            arcs: [],
            fills: [],
            polygons: [],
            pads: [],
            vias: [],
            copperTexts: [],
            silkscreen: {
                top: {
                    tracks: [],
                    arcs: [],
                    fills: [],
                    texts: [],
                    drillCutouts: [circlePoints(100, 100, 20, 16)]
                },
                bottom: {
                    tracks: [],
                    arcs: [],
                    fills: [],
                    texts: [],
                    drillCutouts: [circlePoints(100, 100, 20, 16)]
                }
            }
        },
        externalPlacements: []
    }
}

/**
 * Builds a drilled board scene whose render masks include dense duplicate
 * drill contours that should not drive STEP substrate triangulation.
 * @returns {object}
 */
function createPrimitiveDrillWithDenseCutoutScene() {
    const scene = createDrilledBoardScene()
    scene.detail.vias = [{ x: 100, y: 100, holeDiameter: 40 }]
    scene.detail.silkscreen.top.drillCutouts = [circlePoints(100, 100, 20, 96)]
    scene.detail.silkscreen.bottom.drillCutouts = [
        circlePoints(100, 100, 20, 96)
    ]
    return scene
}

/**
 * Builds a scene with a through-hole pad whose copper should preserve the
 * drill opening.
 * @returns {object}
 */
function createDrilledPadScene() {
    const scene = createCenteredScene()
    scene.detail.pads = [
        {
            x: 600,
            y: 260,
            shapeTop: 2,
            shapeBottom: 2,
            sizeTopX: 80,
            sizeTopY: 80,
            sizeBottomX: 80,
            sizeBottomY: 80,
            holeDiameter: 40
        }
    ]
    return scene
}

/**
 * Builds a scene with a drill-only circular pad that has no copper annulus.
 * @returns {object}
 */
function createDrillOnlyPadScene() {
    const scene = createCenteredScene()
    scene.detail.pads = [
        {
            x: 600,
            y: 260,
            shapeTop: 1,
            shapeBottom: 1,
            sizeTopX: 80,
            sizeTopY: 80,
            sizeBottomX: 80,
            sizeBottomY: 80,
            holeDiameter: 80
        }
    ]
    return scene
}

/**
 * Builds a scene with a long slotted drill that still leaves side copper.
 * @returns {object}
 */
function createSlottedPadScene() {
    const scene = createCenteredScene()
    scene.detail.pads = [
        {
            x: 600,
            y: 260,
            shapeTop: 1,
            shapeBottom: 1,
            sizeTopX: 120,
            sizeTopY: 120,
            sizeBottomX: 120,
            sizeBottomY: 120,
            holeDiameter: 40,
            holeSlotLength: 120
        }
    ]
    return scene
}

/**
 * Builds evenly-spaced circle points.
 * @param {number} x Center X.
 * @param {number} y Center Y.
 * @param {number} radius Circle radius.
 * @param {number} count Point count.
 * @returns {{ x: number, y: number }[]}
 */
function circlePoints(x, y, radius, count) {
    return Array.from({ length: count }, (_entry, index) => {
        const angle = (Math.PI * 2 * index) / count
        return {
            x: x + Math.cos(angle) * radius,
            y: y + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds a deterministic component mesh loader.
 * @returns {() => Promise<object>}
 */
function createModelMeshLoader() {
    return async () =>
        PcbAssemblyMeshUtils.box('component-body', {
            width: 10,
            depth: 10,
            height: 10
        })
}

/**
 * Finds one mesh by name.
 * @param {object[]} meshes Mesh list.
 * @param {string} name Mesh name.
 * @returns {object}
 */
function findMesh(meshes, name) {
    return meshes.find((mesh) => mesh.name === name)
}

/**
 * Measures an axis-aligned mesh bounds box.
 * @param {{ vertices?: number[][] }} mesh Mesh data.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function meshBounds(mesh) {
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    }

    for (const vertex of mesh.vertices || []) {
        bounds.minX = Math.min(bounds.minX, Number(vertex[0] || 0))
        bounds.maxX = Math.max(bounds.maxX, Number(vertex[0] || 0))
        bounds.minY = Math.min(bounds.minY, Number(vertex[1] || 0))
        bounds.maxY = Math.max(bounds.maxY, Number(vertex[1] || 0))
    }

    return bounds
}

/**
 * Finds planar board face centroids within a given radius.
 * @param {{ vertices?: number[][], faces?: number[][] }} mesh Mesh data.
 * @param {number} radius Radius from the local origin.
 * @param {number[]} [center]
 * @returns {number[][]}
 */
function planarCentroidsInsideRadius(mesh, radius, center = [0, 0]) {
    const vertices = mesh.vertices || []
    const zValues = vertices.map((vertex) => Number(vertex[2] || 0))
    const minZ = Math.min(...zValues)
    const maxZ = Math.max(...zValues)

    return (mesh.faces || [])
        .filter((face) => {
            const faceZ = face.map((index) => Number(vertices[index]?.[2] || 0))
            return (
                faceZ.every((z) => Math.abs(z - minZ) < 0.001) ||
                faceZ.every((z) => Math.abs(z - maxZ) < 0.001)
            )
        })
        .map((face) => {
            const points = face.map((index) => vertices[index])
            return [
                points.reduce((sum, point) => sum + Number(point[0] || 0), 0) /
                    points.length,
                points.reduce((sum, point) => sum + Number(point[1] || 0), 0) /
                    points.length
            ]
        })
        .filter(
            (point) =>
                Math.hypot(point[0] - center[0], point[1] - center[1]) < radius
        )
}

test('PcbAssemblyGeometryBuilder exports PCB details in the component placement origin', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCenteredScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const boardBounds = meshBounds(findMesh(geometry.meshes, 'board'))
    const trackBounds = meshBounds(
        findMesh(geometry.meshes, 'copper-top-track-1')
    )
    const padBounds = meshBounds(findMesh(geometry.meshes, 'pad-top-1'))
    const componentBounds = meshBounds(
        findMesh(geometry.meshes, 'component-U1')
    )

    assert.deepEqual(boardBounds, {
        minX: -500,
        maxX: 500,
        minY: -250,
        maxY: 250
    })
    assert.equal(trackBounds.minX, 40)
    assert.equal(trackBounds.maxX, 160)
    assert.equal(padBounds.minX, 80)
    assert.equal(padBounds.maxX, 120)
    assert.equal(componentBounds.minX, 95)
    assert.equal(componentBounds.maxX, 105)
})

test('PcbAssemblyGeometryBuilder exports PCB tracks with rounded end caps', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCenteredScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const track = findMesh(geometry.meshes, 'copper-top-track-1')
    const bounds = meshBounds(track)

    assert.equal(bounds.minX, 40)
    assert.equal(bounds.maxX, 160)
    assert.ok(track.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder cuts drill holes through the board substrate', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createDrilledBoardScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const board = findMesh(geometry.meshes, 'board')

    assert.deepEqual(planarCentroidsInsideRadius(board, 19), [])
    assert.ok(board.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder prefers primitive drill loops over dense render cutouts', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createPrimitiveDrillWithDenseCutoutScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const board = findMesh(geometry.meshes, 'board')

    assert.deepEqual(planarCentroidsInsideRadius(board, 19), [])
    assert.equal(board.vertices.length, 56)
})

test('PcbAssemblyGeometryBuilder leaves drilled pad openings uncovered', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createDrilledPadScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const topPad = findMesh(geometry.meshes, 'pad-top-1')
    const bottomPad = findMesh(geometry.meshes, 'pad-bottom-1')

    assert.deepEqual(planarCentroidsInsideRadius(topPad, 10, [100, 10]), [])
    assert.deepEqual(planarCentroidsInsideRadius(bottomPad, 10, [100, 10]), [])
    assert.ok(topPad.vertices.length > 8)
    assert.ok(bottomPad.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder omits drill-only circular pad copper', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createDrillOnlyPadScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )

    assert.equal(findMesh(geometry.meshes, 'pad-top-1'), undefined)
    assert.equal(findMesh(geometry.meshes, 'pad-bottom-1'), undefined)
})

test('PcbAssemblyGeometryBuilder keeps copper beside slotted circular pad drills', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createSlottedPadScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const topPad = findMesh(geometry.meshes, 'pad-top-1')
    const bottomPad = findMesh(geometry.meshes, 'pad-bottom-1')

    assert.ok(topPad)
    assert.ok(bottomPad)
    assert.deepEqual(planarCentroidsInsideRadius(topPad, 10, [100, 10]), [])
    assert.deepEqual(planarCentroidsInsideRadius(bottomPad, 10, [100, 10]), [])
})
