import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

/**
 * Resolves the model group from a placement face group.
 * @param {THREE.Group} faceGroup Placement face group.
 * @returns {THREE.Group}
 */
function resolvePlacedModelGroup(faceGroup) {
    const candidate = faceGroup.children[0]
    return candidate?.userData?.scene3dAdjustmentTarget
        ? candidate.children[0]
        : candidate
}

/**
 * Builds a fake model with sparse leads below a dominant body support plane.
 * @returns {{ name: string, color: number[], positions: number[], normals: never[], indices: number[], faceColors: never[] }}
 */
function buildLeadedBodyPayload() {
    const positions = [
        -0.02, -0.02, -0.015, 0.02, -0.02, -0.015, 0.02, 0.02, -0.015, -0.02,
        -0.02, -0.015, 0.02, 0.02, -0.015, -0.02, 0.02, -0.015
    ]

    for (let index = 0; index < 16; index += 1) {
        positions.push(
            -0.1,
            -0.1,
            0,
            0.1,
            -0.1,
            0,
            0.1,
            0.1,
            0,
            -0.1,
            -0.1,
            0,
            0.1,
            0.1,
            0,
            -0.1,
            0.1,
            0
        )
    }

    positions.push(-0.1, -0.1, 0.236, 0.1, -0.1, 0.236, 0.1, 0.1, 0.236)

    return {
        name: 'body',
        color: [0.2, 0.2, 0.2],
        positions,
        normals: [],
        indices: Array.from(
            { length: positions.length / 3 },
            (_, index) => index
        ),
        faceColors: []
    }
}

test('PcbScene3dExternalModels wraps model meshes in an adjustment target', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'U2',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 30 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'session',
                        name: 'target.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/target'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [
                        {
                            name: 'body',
                            color: [0.2, 0.2, 0.2],
                            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        }
                    ]
                }
            }
        }
    })

    assert.deepEqual(diagnostics, [])

    const wrapperGroup = externalModelsGroup.children[0]
    const compensationGroup = wrapperGroup.children[0]
    const orientationGroup = compensationGroup.children[0]
    const sideGroup = orientationGroup.children[0]
    const faceGroup = sideGroup.children[0]
    const adjustmentTarget = faceGroup.children[0]

    assert.equal(adjustmentTarget.userData.scene3dAdjustmentTarget, true)
    assert.equal(adjustmentTarget.children.length, 1)
})

test('PcbScene3dExternalModels seats source-z-biased models on the placement face', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'U3',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 30 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 5 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'session',
                        name: 'raised-origin.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/raised-origin'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [
                        {
                            name: 'body',
                            color: [0.2, 0.2, 0.2],
                            positions: [0, 0, 0.04, 0.1, 0, 0.04, 0, 0.1, 0.06],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        }
                    ]
                }
            }
        }
    })

    assert.deepEqual(diagnostics, [])

    externalModelsGroup.updateMatrixWorld(true)
    const placedBounds = new THREE.Box3().setFromObject(externalModelsGroup)

    assert.equal(Math.round(placedBounds.min.z * 10) / 10, 35)
})

test('PcbScene3dExternalModels seats dominant body planes above sparse lower leads', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'J1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 30 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'session',
                        name: 'leaded-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/leaded-body'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [buildLeadedBodyPayload()]
                }
            }
        }
    })

    assert.deepEqual(diagnostics, [])

    const wrapperGroup = externalModelsGroup.children[0]
    const compensationGroup = wrapperGroup.children[0]
    const orientationGroup = compensationGroup.children[0]
    const sideGroup = orientationGroup.children[0]
    const faceGroup = sideGroup.children[0]
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assert.equal(modelGroup.position.z, 0)
})
