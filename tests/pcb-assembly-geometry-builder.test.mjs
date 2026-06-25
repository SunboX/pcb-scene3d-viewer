import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbAssemblyGeometryBuilder,
    PcbAssemblyMeshUtils,
    PcbScene3dCircuitJsonAdapter
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
 * Builds a centered board scene with one component that has no resolved
 * external model.
 * @returns {object}
 */
function createFallbackComponentScene() {
    const scene = createCenteredScene()
    scene.externalPlacements = []
    scene.components = [
        {
            designator: 'R1',
            mountSide: 'top',
            rotationDeg: 0,
            positionMil: { x: 50, y: -20, z: 41 },
            body: {
                sizeMil: {
                    width: 80,
                    depth: 40,
                    height: 20
                }
            }
        },
        {
            designator: 'J1',
            mountSide: 'top',
            rotationDeg: 0,
            positionMil: { x: -60, y: 30, z: 41 },
            renderFallbackBody: false,
            body: {
                sizeMil: {
                    width: 100,
                    depth: 50,
                    height: 20
                }
            }
        }
    ]
    return scene
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
 * Builds a centered rectangular board scene with an explicit board cutout.
 * @returns {object}
 */
function createExplicitCutoutScene() {
    const scene = createDrilledBoardScene()
    scene.detail.silkscreen.top.drillCutouts = []
    scene.detail.silkscreen.bottom.drillCutouts = []
    scene.board.cutouts = [
        {
            points: rectanglePoints(80, 80, 120, 120)
        }
    ]
    return scene
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
 * Builds a scene with a slotted drill whose center is offset from the copper
 * annulus center.
 * @returns {object}
 */
function createOffsetSlottedPadScene() {
    const scene = createCenteredScene()
    scene.detail.pads = [
        {
            x: 600,
            y: 260,
            shapeTop: 1,
            shapeBottom: 1,
            sizeTopX: 140,
            sizeTopY: 140,
            sizeBottomX: 140,
            sizeBottomY: 140,
            holeDiameter: 40,
            holeSlotLength: 100,
            holeRotation: 45,
            holeOffsetX: 25,
            holeOffsetY: -15
        }
    ]
    return scene
}

/**
 * Builds a scene with one top-side copper fill that declares an inner hole.
 * @returns {object}
 */
function createCopperFillHoleScene() {
    const scene = createCenteredScene()
    scene.detail.tracks = []
    scene.detail.pads = []
    scene.detail.fills = [
        {
            layer: 'top',
            points: rectanglePoints(520, 220, 680, 340),
            holes: [rectanglePoints(580, 260, 620, 300)]
        }
    ]
    return scene
}

/**
 * Builds a scene with one rectangular bottom-side copper fill.
 * @returns {object}
 */
function createRectangularCopperFillScene() {
    const scene = createCenteredScene()
    scene.detail.tracks = []
    scene.detail.pads = []
    scene.detail.fills = [
        {
            layer: 'bottom',
            x1: 520,
            y1: 220,
            x2: 680,
            y2: 340
        }
    ]
    return scene
}

/**
 * Builds a scene with one zone-style copper polygon carrying multiple contours.
 * @returns {object}
 */
function createCopperContourScene() {
    const scene = createCenteredScene()
    scene.detail.tracks = []
    scene.detail.pads = []
    scene.detail.polygons = [
        {
            layer: 'top',
            contours: [
                segmentsFromPoints(rectanglePoints(520, 220, 680, 340)),
                segmentsFromPoints(rectanglePoints(580, 260, 620, 300))
            ]
        }
    ]
    return scene
}

/**
 * Builds a scene with one bottom-side copper polygon using ring geometry.
 * @returns {object}
 */
function createCopperRingScene() {
    const scene = createCenteredScene()
    scene.detail.tracks = []
    scene.detail.pads = []
    scene.detail.polygons = [
        {
            layer: 'bottom',
            brep_shape: {
                outer_ring: { vertices: rectanglePoints(520, 220, 680, 340) },
                inner_rings: [{ vertices: rectanglePoints(580, 260, 620, 300) }]
            }
        }
    ]
    return scene
}

/**
 * Builds a scene with one copper polygon split into saved B-Rep islands.
 * @returns {object}
 */
function createCopperRingArrayScene() {
    const scene = createCenteredScene()
    scene.detail.tracks = []
    scene.detail.pads = []
    scene.detail.polygons = [
        {
            layer: 'top',
            brep_shapes: [
                {
                    outer_ring: {
                        vertices: rectanglePoints(520, 220, 560, 260)
                    }
                },
                {
                    outer_ring: {
                        vertices: rectanglePoints(620, 220, 680, 280)
                    },
                    inner_rings: [
                        {
                            vertices: rectanglePoints(640, 240, 660, 260)
                        }
                    ]
                }
            ]
        }
    ]
    return scene
}

/**
 * Builds rectangle corner points.
 * @param {number} minX Minimum X.
 * @param {number} minY Minimum Y.
 * @param {number} maxX Maximum X.
 * @param {number} maxY Maximum Y.
 * @returns {{ x: number, y: number }[]}
 */
function rectanglePoints(minX, minY, maxX, maxY) {
    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ]
}

/**
 * Converts a closed point loop into line segments.
 * @param {{ x: number, y: number }[]} points Source points.
 * @returns {object[]}
 */
function segmentsFromPoints(points) {
    return points.map((point, index) => {
        const next = points[(index + 1) % points.length]
        return {
            type: 'line',
            x1: point.x,
            y1: point.y,
            x2: next.x,
            y2: next.y
        }
    })
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
 * Measures the board-normal mesh bounds.
 * @param {{ vertices?: number[][] }} mesh Mesh data.
 * @returns {{ minZ: number, maxZ: number }}
 */
function meshZBounds(mesh) {
    const bounds = {
        minZ: Infinity,
        maxZ: -Infinity
    }

    for (const vertex of mesh.vertices || []) {
        bounds.minZ = Math.min(bounds.minZ, Number(vertex[2] || 0))
        bounds.maxZ = Math.max(bounds.maxZ, Number(vertex[2] || 0))
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

test('PcbAssemblyGeometryBuilder emits fallback component bodies for missing models', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createFallbackComponentScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const fallback = findMesh(geometry.meshes, 'component-R1-body')

    assert.ok(fallback)
    assert.deepEqual(meshBounds(fallback), {
        minX: 10,
        maxX: 90,
        minY: -40,
        maxY: 0
    })
    assert.equal(findMesh(geometry.meshes, 'component-J1-body'), undefined)
    assert.equal(
        geometry.diagnostics.some(
            (diagnostic) => diagnostic.code === 'component_model_missing'
        ),
        true
    )
})

test('PcbAssemblyGeometryBuilder emits footprint-derived component leads', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 1, y: 2 },
            layer: 'top',
            rotation: 0
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u1',
            pcb_component_id: 'pcb_u1',
            footprinter_string: 'soic8'
        }
    ])
    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        includeModels: false
    })
    const component = scene.components[0]
    const leadMeshes = geometry.meshes.filter((mesh) =>
        String(mesh.name || '').startsWith('component-U1-lead-')
    )

    assert.equal(component.body.family, 'soic')
    assert.equal(component.body.footprintModel.leadCount, 8)
    assert.equal(leadMeshes.length, 8)
    assert.ok(findMesh(geometry.meshes, 'component-U1-body'))
})

test('PcbAssemblyGeometryBuilder emits footprint-derived header pins', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_j1',
            name: 'J1',
            ftype: 'simple_pin_header'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_j1',
            source_component_id: 'source_j1',
            center: { x: 1, y: 2 },
            layer: 'top',
            rotation: 0
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_j1',
            pcb_component_id: 'pcb_j1',
            footprinter_string: 'pinrow4_nopinlabels'
        }
    ])
    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        includeModels: false
    })
    const component = scene.components[0]
    const pinMeshes = geometry.meshes.filter((mesh) =>
        String(mesh.name || '').startsWith('component-J1-pin-')
    )

    assert.equal(component.body.family, 'header')
    assert.equal(component.body.footprintModel.style, 'pin-header')
    assert.equal(component.body.footprintModel.pinCount, 4)
    assert.equal(component.body.footprintModel.rowCount, 1)
    assert.equal(pinMeshes.length, 4)
    assert.ok(findMesh(geometry.meshes, 'component-J1-body'))
})

test('PcbAssemblyGeometryBuilder keeps bottom fallback SMD bodies below the board', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 1, y: 2 },
            layer: 'bottom',
            rotation: 0
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u1',
            pcb_component_id: 'pcb_u1',
            footprinter_string: 'soic8'
        }
    ])
    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        includeModels: false
    })
    const body = findMesh(geometry.meshes, 'component-U1-body')
    const lead = findMesh(geometry.meshes, 'component-U1-lead-1')

    assert.equal(scene.components[0].mountSide, 'bottom')
    assert.ok(body)
    assert.ok(lead)
    assert.equal(meshZBounds(body).maxZ < 0, true)
    assert.equal(meshZBounds(lead).maxZ < 0, true)
})

test('PcbAssemblyGeometryBuilder emits bounding-box bodies instead of explicit model loads', async () => {
    const scene = createCenteredScene()
    scene.components = [
        {
            designator: 'U1',
            mountSide: 'top',
            rotationDeg: 0,
            positionMil: { x: 100, y: 10, z: 70 },
            renderFallbackBody: true,
            externalModel: { format: 'step', name: 'u1.step' },
            body: {
                sizeMil: {
                    width: 120,
                    depth: 80,
                    height: 40
                }
            }
        }
    ]
    scene.externalPlacements = [
        {
            designator: 'U1',
            mountSide: 'top',
            rotationDeg: 0,
            positionMil: { x: 100, y: 10, z: 70 },
            renderAsBoundingBox: true,
            externalModel: { format: 'step', name: 'u1.step' }
        }
    ]
    let loadCount = 0

    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        modelMeshLoader: async () => {
            loadCount += 1
            return PcbAssemblyMeshUtils.box('explicit-model', {
                width: 10,
                depth: 10,
                height: 10
            })
        }
    })
    const fallback = findMesh(geometry.meshes, 'component-U1-body')

    assert.equal(loadCount, 0)
    assert.ok(fallback)
    assert.equal(findMesh(geometry.meshes, 'component-U1'), undefined)
    assert.deepEqual(meshBounds(fallback), {
        minX: 40,
        maxX: 160,
        minY: -30,
        maxY: 50
    })
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

test('PcbAssemblyGeometryBuilder cuts explicit board cutouts through the substrate', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createExplicitCutoutScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const board = findMesh(geometry.meshes, 'board')

    assert.deepEqual(planarCentroidsInsideRadius(board, 18), [])
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

test('PcbAssemblyGeometryBuilder applies pad drill offsets to board and copper openings', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createOffsetSlottedPadScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const board = findMesh(geometry.meshes, 'board')
    const topPad = findMesh(geometry.meshes, 'pad-top-1')
    const bottomPad = findMesh(geometry.meshes, 'pad-bottom-1')

    assert.deepEqual(planarCentroidsInsideRadius(board, 10, [125, -5]), [])
    assert.deepEqual(planarCentroidsInsideRadius(topPad, 10, [125, -5]), [])
    assert.deepEqual(planarCentroidsInsideRadius(bottomPad, 10, [125, -5]), [])
})

test('PcbAssemblyGeometryBuilder preserves authored holes in copper fill meshes', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCopperFillHoleScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const fill = findMesh(geometry.meshes, 'copper-top-fill-1')

    assert.ok(fill)
    assert.deepEqual(planarCentroidsInsideRadius(fill, 18, [100, 30]), [])
    assert.ok(fill.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder exports rectangular copper fills', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createRectangularCopperFillScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const fill = findMesh(geometry.meshes, 'copper-bottom-fill-1')

    assert.ok(fill)
    const bounds = meshBounds(fill)
    assert.deepEqual(bounds, {
        minX: 20,
        maxX: 180,
        minY: -30,
        maxY: 90
    })
})

test('PcbAssemblyGeometryBuilder preserves multi-contour copper polygon holes', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCopperContourScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const fill = findMesh(geometry.meshes, 'copper-top-fill-1')

    assert.ok(fill)
    assert.deepEqual(planarCentroidsInsideRadius(fill, 18, [100, 30]), [])
    assert.ok(fill.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder exports ring-based copper polygon holes', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCopperRingScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const fill = findMesh(geometry.meshes, 'copper-bottom-fill-1')

    assert.ok(fill)
    assert.deepEqual(planarCentroidsInsideRadius(fill, 18, [100, 30]), [])
    assert.ok(fill.vertices.length > 8)
})

test('PcbAssemblyGeometryBuilder exports B-Rep shape array islands', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createCopperRingArrayScene(),
        { modelMeshLoader: createModelMeshLoader() }
    )
    const firstIsland = findMesh(geometry.meshes, 'copper-top-fill-1-island-1')
    const secondIsland = findMesh(geometry.meshes, 'copper-top-fill-1-island-2')

    assert.ok(firstIsland)
    assert.ok(secondIsland)
    assert.deepEqual(meshBounds(firstIsland), {
        minX: 20,
        maxX: 60,
        minY: -30,
        maxY: 10
    })
    assert.deepEqual(planarCentroidsInsideRadius(secondIsland, 9, [150, 0]), [])
})
