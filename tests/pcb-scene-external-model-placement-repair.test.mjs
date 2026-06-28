import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

/**
 * Builds a fake source-specific scene with a five-lead asymmetric package.
 * @param {'left' | 'right'} padOddSide Side with three pads.
 * @param {'left' | 'right'} terminalOddSide Side with three model terminals.
 * @returns {object}
 */
function createAsymmetricLeadScene(padOddSide, terminalOddSide) {
    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 400,
            heightMil: 240,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'U1',
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 31.5 },
                rotationDeg: 0,
                body: {
                    family: 'sot',
                    sizeMil: { width: 130, depth: 115, height: 40 }
                }
            }
        ],
        detail: {
            pads: createFiveLeadPads(padOddSide)
        },
        externalPlacements: [
            {
                designator: 'U1',
                mountSide: 'top',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: 31.5 },
                bodyPositionMil: { x: 0, y: 0 },
                projection: { source: 'pad-fallback' },
                modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
                externalModel: {
                    origin: 'embedded',
                    name: 'fake-five-lead.step',
                    format: 'step',
                    preparedMeshPayloads:
                        createFiveLeadTerminalPayloads(terminalOddSide)
                }
            }
        ]
    }
}

/**
 * Builds a fake pad-fallback scene whose loaded body center is source-offset.
 * @param {{ placementRotationDeg?: number, componentPosition?: { x: number, y: number, z: number }, placementPosition?: { x: number, y: number, z: number }, payloadCenter?: { x: number, y: number } }} [options] Scene options.
 * @returns {object}
 */
function createOffsetCenterScene(options = {}) {
    const placementRotationDeg = Number(options.placementRotationDeg ?? 180)
    const componentPosition = options.componentPosition || {
        x: 0,
        y: 0,
        z: 31.5
    }
    const placementPosition = options.placementPosition || {
        x: 80,
        y: 80,
        z: 31.5
    }
    const payloadCenter = options.payloadCenter || { x: 0.1, y: 0 }

    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 400,
            heightMil: 240,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'U2',
                mountSide: 'top',
                positionMil: componentPosition,
                rotationDeg: 0,
                body: {
                    family: 'ic',
                    sizeMil: { width: 180, depth: 180, height: 40 }
                }
            }
        ],
        detail: { pads: [] },
        externalPlacements: [
            {
                designator: 'U2',
                mountSide: 'top',
                rotationDeg: placementRotationDeg,
                positionMil: placementPosition,
                bodyPositionMil: {
                    x: placementPosition.x,
                    y: placementPosition.y
                },
                projection: { source: 'pad-fallback' },
                modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
                externalModel: {
                    origin: 'embedded',
                    name: 'fake-offset-body.step',
                    format: 'step',
                    preparedMeshPayloads: [
                        createTerminalPayload(payloadCenter.x, payloadCenter.y)
                    ]
                }
            }
        ]
    }
}

/**
 * Builds a fake display module whose authored source origin is an edge anchor.
 * @param {{ preparedMeshPayloads?: object[] }} [options] Scene options.
 * @returns {object}
 */
function createExactDisplayOutlineScene(options = {}) {
    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 2200,
            heightMil: 1600,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'DS9',
                componentIndex: 9,
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 31.5 },
                boardPositionMil: { x: 0, y: 0 },
                rotationDeg: 0,
                pattern: 'GENERIC_DISPLAY_MODULE',
                source: 'GENERIC_DISPLAY_MODULE',
                description: 'Generic TFT display module',
                parameters: {
                    Comment: 'Generic TFT display module'
                },
                body: {
                    family: 'display',
                    sizeMil: { width: 1800, depth: 1340, height: 100 }
                }
            }
        ],
        detail: {
            pads: [],
            tracks: createDisplayOutlineTracks(9)
        },
        externalPlacements: [
            {
                designator: 'DS9',
                mountSide: 'top',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: 31.5 },
                bodyPositionMil: { x: 0, y: 0 },
                projection: { source: 'pad-fallback' },
                modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
                externalModel: {
                    origin: 'embedded',
                    name: 'generic-display.step',
                    format: 'step',
                    preparedMeshPayloads: options.preparedMeshPayloads || [
                        createTerminalPayload(0, 0.2)
                    ]
                }
            }
        ]
    }
}

/**
 * Builds a repeated model-bounds connector scene with source-center bias.
 * @returns {object}
 */
function createRepeatedModelBoundsScene() {
    const padColumns = [400, 450, 500, 550, 600]
    const padRows = [200, 250]
    const bodyPositions = [
        { x: 400, y: 200 },
        { x: 400, y: 250 },
        { x: 450, y: 250 },
        { x: 450, y: 200 },
        { x: 550, y: 250 },
        { x: 550, y: 200 }
    ]

    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 1000,
            heightMil: 500,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'J1',
                componentIndex: 11,
                mountSide: 'top',
                positionMil: { x: 500, y: 225, z: 31.5 },
                boardPositionMil: { x: 500, y: 225 },
                rotationDeg: 180,
                pattern: 'FIXTURE_HEADER_5X2',
                source: 'CON/FIXTURE_HEADER',
                body: {
                    family: 'connector',
                    sizeMil: { width: 240, depth: 90, height: 80 }
                }
            }
        ],
        detail: {
            pads: padColumns.flatMap((x) =>
                padRows.map((y) => createThroughHolePad(11, x, y))
            )
        },
        externalPlacements: bodyPositions.map((position) => ({
            designator: 'J1',
            mountSide: 'top',
            rotationDeg: 180,
            positionMil: { ...position, z: 31.5 },
            bodyPositionMil: position,
            projection: {
                source: 'model-bounds',
                boundsMil: { width: 100, depth: 94, height: 287 }
            },
            modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
            externalModel: {
                origin: 'embedded',
                name: 'fixture-repeated-body.step',
                format: 'step',
                preparedMeshPayloads: [
                    createBodyPayload(0.025, 0, 0.1, 0.094, 0.02)
                ]
            }
        }))
    }
}

/**
 * Builds a single model-bounds connector scene whose source anchor sits on one
 * owned through-hole pad instead of at the footprint center.
 * @returns {object}
 */
function createSinglePadAnchoredModelBoundsScene() {
    const padColumns = [400, 450, 500, 550, 600]
    const padRows = [200, 250]

    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 1000,
            heightMil: 500,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'J2',
                componentIndex: 12,
                mountSide: 'top',
                positionMil: { x: 500, y: 225, z: 31.5 },
                boardPositionMil: { x: 500, y: 225 },
                rotationDeg: 180,
                pattern: 'FIXTURE_HEADER_5X2',
                source: 'CON/FIXTURE_HEADER',
                body: {
                    family: 'connector',
                    sizeMil: { width: 240, depth: 90, height: 80 }
                }
            }
        ],
        detail: {
            pads: padColumns.flatMap((x) =>
                padRows.map((y) => createThroughHolePad(12, x, y))
            )
        },
        externalPlacements: [
            {
                designator: 'J2',
                mountSide: 'top',
                rotationDeg: 180,
                positionMil: { x: 400, y: 200, z: 31.5 },
                bodyPositionMil: { x: 400, y: 200 },
                projection: {
                    source: 'model-bounds',
                    boundsMil: { width: 100, depth: 94, height: 287 }
                },
                modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
                externalModel: {
                    origin: 'embedded',
                    name: 'fixture-single-body.step',
                    format: 'step',
                    preparedMeshPayloads: [
                        createBodyPayload(0.025, 0, 0.1, 0.094, 0.02)
                    ]
                }
            }
        ]
    }
}

/**
 * Builds a half-pitch two-pad connector whose source body is already centered
 * when mounted from the authored lower pad anchor.
 * @returns {object}
 */
function createAlreadyCenteredPadAnchoredHeaderScene() {
    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 500,
            heightMil: 300,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'J3',
                componentIndex: 13,
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 31.5 },
                boardPositionMil: { x: 0, y: 0 },
                rotationDeg: 270,
                pattern: 'FIXTURE_HEADER_2X1',
                source: 'CON/FIXTURE_HEADER',
                body: {
                    family: 'connector',
                    sizeMil: { width: 90, depth: 40, height: 60 }
                }
            }
        ],
        detail: {
            pads: [
                createThroughHolePad(13, 0, -25),
                createThroughHolePad(13, 0, 25)
            ]
        },
        externalPlacements: [
            {
                designator: 'J3',
                mountSide: 'top',
                rotationDeg: 90,
                positionMil: { x: 0, y: 25, z: 31.5 },
                bodyPositionMil: { x: 0, y: 25 },
                projection: {
                    source: 'model-bounds',
                    boundsMil: { width: 100, depth: 94, height: 287 }
                },
                modelTransform: { rotationDeg: { x: 0, y: 0, z: 0 } },
                externalModel: {
                    origin: 'embedded',
                    name: 'fixture-centered-header.step',
                    format: 'step',
                    preparedMeshPayloads: [
                        createBodyPayload(0.025, 0, 0.1, 0.094, 0.287)
                    ]
                }
            }
        ]
    }
}

/**
 * Builds a repeated owner package scene whose embedded model anchor is biased
 * from each component's actual pad center.
 * @returns {object}
 */
function createRepeatedOwnerPackageModelBoundsScene() {
    const owners = [
        { designator: 'U1', componentIndex: 21, x: 0, y: 0 },
        { designator: 'U2', componentIndex: 22, x: 180, y: 0 },
        { designator: 'U3', componentIndex: 23, x: 360, y: 0 }
    ]
    const sourceAnchorOffset = { x: 17, y: 11 }

    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 600,
            heightMil: 240,
            thicknessMil: 63
        },
        components: owners.map((owner) => ({
            designator: owner.designator,
            componentIndex: owner.componentIndex,
            mountSide: 'bottom',
            positionMil: { x: owner.x, y: owner.y, z: -31.5 },
            boardPositionMil: { x: owner.x, y: owner.y },
            rotationDeg: 180,
            pattern: 'FAKE_QFN_16',
            source: 'FAKE_LEVEL_TRANSLATOR',
            body: {
                family: 'generic',
                sizeMil: { width: 118, depth: 87, height: 22 }
            }
        })),
        detail: {
            pads: owners.flatMap((owner) =>
                createBottomQfnPads(owner.componentIndex, owner.x, owner.y)
            )
        },
        externalPlacements: owners.map((owner) => ({
            designator: owner.designator,
            mountSide: 'bottom',
            rotationDeg: 180,
            positionMil: {
                x: owner.x + sourceAnchorOffset.x,
                y: owner.y + sourceAnchorOffset.y,
                z: -31.5
            },
            bodyPositionMil: {
                x: owner.x + sourceAnchorOffset.x,
                y: owner.y + sourceAnchorOffset.y
            },
            projection: {
                source: 'model-bounds',
                boundsMil: { width: 104, depth: 73, height: 24 }
            },
            modelTransform: { rotationDeg: { x: -180, y: 0, z: 0 } },
            externalModel: {
                origin: 'embedded',
                name: 'fake-qfn-16.step',
                format: 'step',
                preparedMeshPayloads: [
                    createBodyPayload(0, 0, 0.104, 0.073, 0.024)
                ]
            }
        }))
    }
}

/**
 * Builds a component-owned mechanical display outline.
 * @param {number} componentIndex Component owner index.
 * @returns {object[]}
 */
function createDisplayOutlineTracks(componentIndex) {
    const minX = 0
    const maxX = 1800
    const minY = -670
    const maxY = 670

    return [
        createTrack(componentIndex, minX, minY, maxX, minY),
        createTrack(componentIndex, maxX, minY, maxX, maxY),
        createTrack(componentIndex, maxX, maxY, minX, maxY),
        createTrack(componentIndex, minX, maxY, minX, minY)
    ]
}

/**
 * Builds one fake component-owned track.
 * @param {number} componentIndex Component owner index.
 * @param {number} x1 Start X.
 * @param {number} y1 Start Y.
 * @param {number} x2 End X.
 * @param {number} y2 End Y.
 * @returns {object}
 */
function createTrack(componentIndex, x1, y1, x2, y2) {
    return {
        componentIndex,
        layerName: 'Mechanical 13',
        layerCode: 69,
        layerId: 69,
        x1,
        y1,
        x2,
        y2
    }
}

/**
 * Builds five fake surface pads.
 * @param {'left' | 'right'} oddSide Side with three pads.
 * @returns {object[]}
 */
function createFiveLeadPads(oddSide) {
    const oddX = oddSide === 'left' ? -50 : 50
    const evenX = oddSide === 'left' ? 50 : -50

    return [
        ...[-38, 0, 38].map((y) => createPad(oddX, y)),
        ...[-38, 38].map((y) => createPad(evenX, y))
    ]
}

/**
 * Builds one fake top-side pad.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {object}
 */
function createPad(x, y) {
    return {
        x,
        y,
        sizeTopX: 24,
        sizeTopY: 40,
        sizeMidX: 24,
        sizeMidY: 40,
        hasTopPasteMaskOpening: true,
        hasBottomPasteMaskOpening: false
    }
}

/**
 * Builds one fake through-hole pad.
 * @param {number} componentIndex Owning component index.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {object}
 */
function createThroughHolePad(componentIndex, x, y) {
    return {
        componentIndex,
        x,
        y,
        sizeTopX: 40,
        sizeTopY: 40,
        sizeMidX: 40,
        sizeMidY: 40,
        holeDiameter: 24,
        hasTopPasteMaskOpening: false,
        hasBottomPasteMaskOpening: false
    }
}

/**
 * Builds fake bottom-side QFN perimeter pads around a component center.
 * @param {number} componentIndex Owning component index.
 * @param {number} centerX Component center X.
 * @param {number} centerY Component center Y.
 * @returns {object[]}
 */
function createBottomQfnPads(componentIndex, centerX, centerY) {
    const offsets = [-24, -8, 8, 24]

    return [
        ...offsets.flatMap((y) => [
            createBottomSurfacePad(componentIndex, centerX - 46, centerY + y),
            createBottomSurfacePad(componentIndex, centerX + 46, centerY + y)
        ]),
        ...offsets.flatMap((x) => [
            createBottomSurfacePad(componentIndex, centerX + x, centerY - 30),
            createBottomSurfacePad(componentIndex, centerX + x, centerY + 30)
        ])
    ]
}

/**
 * Builds one fake bottom-side surface pad.
 * @param {number} componentIndex Owning component index.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {object}
 */
function createBottomSurfacePad(componentIndex, x, y) {
    return {
        componentIndex,
        x,
        y,
        sizeTopX: 8,
        sizeTopY: 24,
        sizeBottomX: 8,
        sizeBottomY: 24,
        hasTopPasteMaskOpening: false,
        hasBottomPasteMaskOpening: true
    }
}

/**
 * Builds five disconnected silver terminal meshes.
 * @param {'left' | 'right'} oddSide Side with three terminals.
 * @returns {object[]}
 */
function createFiveLeadTerminalPayloads(oddSide) {
    const oddX = oddSide === 'left' ? -0.05 : 0.05
    const evenX = oddSide === 'left' ? 0.05 : -0.05

    return [
        ...[-0.038, 0, 0.038].map((y) => createTerminalPayload(oddX, y)),
        ...[-0.038, 0.038].map((y) => createTerminalPayload(evenX, y))
    ]
}

/**
 * Builds one small cuboid terminal payload in source units.
 * @param {number} x X center.
 * @param {number} y Y center.
 * @returns {object}
 */
function createTerminalPayload(x, y) {
    const halfWidth = 0.006
    const halfDepth = 0.012
    const minZ = 0
    const maxZ = 0.006
    const positions = new Float32Array([
        x - halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y + halfDepth,
        maxZ,
        x - halfWidth,
        y + halfDepth,
        maxZ
    ])

    return {
        positions,
        normals: new Float32Array(),
        indices: new Uint32Array([
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6,
            2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0
        ]),
        color: [0.75, 0.75, 0.75],
        faceColors: []
    }
}

/**
 * Builds one rectangular body payload in source units.
 * @param {number} x X center.
 * @param {number} y Y center.
 * @param {number} width Body width.
 * @param {number} depth Body depth.
 * @param {number} height Body height.
 * @returns {object}
 */
function createBodyPayload(x, y, width, depth, height) {
    const halfWidth = width / 2
    const halfDepth = depth / 2
    const minZ = 0
    const maxZ = height
    const positions = new Float32Array([
        x - halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y + halfDepth,
        maxZ,
        x - halfWidth,
        y + halfDepth,
        maxZ
    ])

    return {
        positions,
        normals: new Float32Array(),
        indices: new Uint32Array([
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6,
            2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0
        ]),
        color: [1, 1, 1],
        faceColors: []
    }
}

/**
 * Renders one scene and returns placement details.
 * @param {object} scene Scene description.
 * @param {{ modelViewScale?: { x: number, y: number, z: number }, parentScale?: { x: number, y: number, z: number } }} [options] Render options.
 * @returns {Promise<{ group: any, parent: any }>}
 */
async function loadPlacementGroupResult(scene, options = {}) {
    const parent = new THREE.Group()
    const root = new THREE.Group()
    let loadedGroup = null
    const parentScale = options.parentScale || { x: 1, y: 1, z: 1 }
    parent.scale.set(parentScale.x, parentScale.y, parentScale.z)
    parent.add(root)

    await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: scene,
        externalModelsGroup: root,
        modelViewScale: options.modelViewScale || { x: 1, y: 1, z: 1 },
        onPlacementGroup: (placement, group) => {
            loadedGroup = group
        }
    })
    parent.updateMatrixWorld(true)

    return { group: loadedGroup, parent }
}

/**
 * Renders one scene and returns the loaded placement group.
 * @param {object} scene Scene description.
 * @returns {Promise<any>}
 */
async function loadPlacementGroup(scene) {
    return (await loadPlacementGroupResult(scene)).group
}

test('PcbScene3dExternalModels aligns asymmetric five-lead package yaw', async () => {
    const group = await loadPlacementGroup(
        createAsymmetricLeadScene('right', 'left')
    )

    assert.equal(group.userData.scene3dAsymmetricLeadYawRepair, true)
    assert.ok(Math.abs(group.rotation.z - Math.PI) < 0.001)
})

test('PcbScene3dExternalModels keeps matching five-lead package yaw', async () => {
    const group = await loadPlacementGroup(
        createAsymmetricLeadScene('left', 'left')
    )

    assert.equal(group.userData.scene3dAsymmetricLeadYawRepair, undefined)
    assert.ok(Math.abs(group.rotation.z) < 0.001)
})

test('PcbScene3dExternalModels centers source-offset pad fallback models', async () => {
    const group = await loadPlacementGroup(createOffsetCenterScene())
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, true)
    assert.ok(Math.abs(center.x) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels keeps exact pad fallback source anchors', async () => {
    const group = await loadPlacementGroup(
        createOffsetCenterScene({
            componentPosition: { x: 0, y: 0, z: 31.5 },
            placementPosition: { x: 0, y: 0, z: 31.5 },
            payloadCenter: { x: 0.1, y: 0 }
        })
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, undefined)
    assert.ok(Math.abs(group.position.x) < 0.001)
    assert.ok(Math.abs(group.position.y) < 0.001)
    assert.ok(Math.abs(center.x) > 1)
})

test('PcbScene3dExternalModels centers exact display bodies on owned outlines', async () => {
    const group = await loadPlacementGroup(createExactDisplayOutlineScene())
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, true)
    assert.ok(Math.abs(center.x - 900) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels rotates display bodies to owned outline aspect', async () => {
    const group = await loadPlacementGroup(
        createExactDisplayOutlineScene({
            preparedMeshPayloads: [createBodyPayload(0, 0, 34, 46, 2)]
        })
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    bounds.getCenter(center)
    bounds.getSize(size)

    assert.equal(group.userData.scene3dPadFallbackOutlineYawRepair, true)
    assert.ok(Math.abs(center.x - 900) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
    assert.ok(size.x > size.y)
})

test('PcbScene3dExternalModels centers small pad fallback offsets', async () => {
    const group = await loadPlacementGroup(
        createOffsetCenterScene({
            placementPosition: { x: 12, y: 1, z: 31.5 },
            payloadCenter: { x: 0, y: 0 }
        })
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, true)
    assert.ok(Math.abs(center.x) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels centers pad fallback models in parent frame', async () => {
    const { group, parent } = await loadPlacementGroupResult(
        createOffsetCenterScene({
            componentPosition: { x: 20, y: 30, z: 31.5 },
            placementPosition: { x: 80, y: 80, z: 31.5 }
        }),
        {
            modelViewScale: { x: 1, y: -1, z: 1 },
            parentScale: { x: 1, y: -1, z: 1 }
        }
    )
    parent.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, true)
    assert.ok(Math.abs(center.x - 20) < 0.001)
    assert.ok(Math.abs(center.y + 30) < 0.001)
})

test('PcbScene3dExternalModels centers unrotated pad fallback offsets', async () => {
    const group = await loadPlacementGroup(
        createOffsetCenterScene({ placementRotationDeg: 0 })
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dPadFallbackCenterRepair, true)
    assert.ok(Math.abs(center.x) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels centers repeated model-bounds body groups', async () => {
    const scene = createRepeatedModelBoundsScene()
    const root = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: scene,
        externalModelsGroup: root
    })
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.deepEqual(diagnostics, [])
    assert.equal(root.children.length, 6)
    assert.ok(
        root.children.every(
            (child) => child.userData.scene3dRepeatedModelBoundsCenterRepair
        )
    )
    assert.ok(Math.abs(center.x - 500) < 0.001)
    assert.ok(Math.abs(center.y - 225) < 0.001)
})

test('PcbScene3dExternalModels centers single pad-anchored model-bounds bodies', async () => {
    const group = await loadPlacementGroup(
        createSinglePadAnchoredModelBoundsScene()
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(group.userData.scene3dRepeatedModelBoundsCenterRepair, true)
    assert.ok(Math.abs(center.x - 500) < 0.001)
    assert.ok(Math.abs(center.y - 225) < 0.001)
})

test('PcbScene3dExternalModels keeps already-centered pad-anchored model-bounds bodies', async () => {
    const group = await loadPlacementGroup(
        createAlreadyCenteredPadAnchoredHeaderScene()
    )
    const bounds = new THREE.Box3().setFromObject(group)
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(
        group.userData.scene3dRepeatedModelBoundsCenterRepair,
        undefined
    )
    assert.ok(Math.abs(center.x) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels centers repeated owner model-bounds package bodies', async () => {
    const scene = createRepeatedOwnerPackageModelBoundsScene()
    const root = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: scene,
        externalModelsGroup: root
    })
    root.updateMatrixWorld(true)
    const centers = root.children
        .map((child) => {
            const bounds = new THREE.Box3().setFromObject(child)
            return bounds.getCenter(new THREE.Vector3())
        })
        .sort((left, right) => left.x - right.x)

    assert.deepEqual(diagnostics, [])
    assert.equal(root.children.length, 3)
    assert.ok(
        root.children.every(
            (child) =>
                child.userData.scene3dRepeatedOwnerModelBoundsCenterRepair
        )
    )
    assert.ok(Math.abs(centers[0].x) < 0.001)
    assert.ok(Math.abs(centers[0].y) < 0.001)
    assert.ok(Math.abs(centers[1].x - 180) < 0.001)
    assert.ok(Math.abs(centers[1].y) < 0.001)
    assert.ok(Math.abs(centers[2].x - 360) < 0.001)
    assert.ok(Math.abs(centers[2].y) < 0.001)
})
