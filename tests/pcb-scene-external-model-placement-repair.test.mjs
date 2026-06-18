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
 * @param {{ placementRotationDeg?: number, componentPosition?: { x: number, y: number, z: number }, placementPosition?: { x: number, y: number, z: number } }} [options] Scene options.
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
                    preparedMeshPayloads: [createTerminalPayload(0.1, 0)]
                }
            }
        ]
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
