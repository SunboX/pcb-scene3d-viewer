import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

const DEFAULT_MODEL_Z_CLEARANCE_MIL = 0.03 * (1000 / 25.4)

/**
 * Asserts two numbers are close enough for transformed scene coordinates.
 * @param {number} actual Actual value.
 * @param {number} expected Expected value.
 * @returns {void}
 */
function assertNearlyEqual(actual, expected) {
    assert.ok(
        Math.abs(Number(actual) - Number(expected)) < 0.001,
        `expected ${actual} to be close to ${expected}`
    )
}

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

/**
 * Builds a fake bottom connector with sparse raised contacts above a broad
 * housing face.
 * @returns {{ name: string, color: number[], positions: number[], normals: never[], indices: number[], faceColors: never[] }}
 */
function buildRaisedContactConnectorPayload() {
    const positions = [
        -0.01, -0.01, 0.08, 0.01, -0.01, 0.08, 0, 0.01, 0.08, -0.12, -0.1, 0.05,
        0.12, -0.1, 0.05, 0.12, 0.1, 0.05, -0.12, -0.1, 0.05, 0.12, 0.1, 0.05,
        -0.12, 0.1, 0.05, -0.12, -0.1, 0, 0.12, -0.1, 0, 0.12, 0.1, 0, -0.12,
        -0.1, 0, 0.12, 0.1, 0, -0.12, 0.1, 0
    ]

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

/**
 * Builds a fake bottom through-hole header with sparse pin tails below a
 * board-facing shoulder and a larger plastic top face.
 * @returns {{ name: string, color: number[], positions: number[], normals: never[], indices: number[], faceColors: never[] }}
 */
function buildLongPinBodyPayload() {
    const positions = [
        -0.01, -0.01, -0.118, 0.01, -0.01, -0.118, 0, 0.01, -0.118
    ]

    for (let index = 0; index < 4; index += 1) {
        positions.push(
            -0.12,
            -0.1,
            0,
            0.12,
            -0.1,
            0,
            0.12,
            0.1,
            0,
            -0.12,
            -0.1,
            0,
            0.12,
            0.1,
            0,
            -0.12,
            0.1,
            0
        )
    }

    for (let index = 0; index < 14; index += 1) {
        positions.push(
            -0.12,
            -0.1,
            0.09,
            0.12,
            -0.1,
            0.09,
            0.12,
            0.1,
            0.09,
            -0.12,
            -0.1,
            0.09,
            0.12,
            0.1,
            0.09,
            -0.12,
            0.1,
            0.09
        )
    }

    positions.push(-0.12, -0.1, 0.336, 0.12, -0.1, 0.336, 0.12, 0.1, 0.336)

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

test('PcbScene3dExternalModels applies default Altium family component Z clearance', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium-pcbdoc',
            externalPlacements: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 31.5 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'flat-altium-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/flat-altium-body'
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
                            positions: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
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
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, DEFAULT_MODEL_Z_CLEARANCE_MIL)
})

test('PcbScene3dExternalModels applies default KiCad component Z clearance', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'kicad',
            coordinateSystem: 'kicad-3d-y-up',
            externalPlacements: [
                {
                    designator: 'J1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 31.5 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'session',
                        name: 'flat-kicad-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/flat-kicad-body'
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
                            positions: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
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
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, DEFAULT_MODEL_Z_CLEARANCE_MIL)
})

test('PcbScene3dExternalModels keeps bottom sparse leads below the board face', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            board: { thicknessMil: 63 },
            externalPlacements: [
                {
                    designator: 'J3',
                    mountSide: 'bottom',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: -31.5 },
                    modelTransform: {
                        rotationDeg: { x: -180, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'bottom-leaded-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/bottom-leaded-body'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                const payload = buildLeadedBodyPayload()
                const positions = [...payload.positions]
                for (let index = 2; index < positions.length; index += 3) {
                    positions[index] = -positions[index]
                }

                return {
                    meshPayloads: [{ ...payload, positions }]
                }
            }
        }
    })

    assert.deepEqual(diagnostics, [])

    externalModelsGroup.updateMatrixWorld(true)
    const placedBounds = new THREE.Box3().setFromObject(externalModelsGroup)
    const wrapperGroup = externalModelsGroup.children[0]
    const compensationGroup = wrapperGroup.children[0]
    const orientationGroup = compensationGroup.children[0]
    const sideGroup = orientationGroup.children[0]
    const faceGroup = sideGroup.children[0]
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, 15 + DEFAULT_MODEL_Z_CLEARANCE_MIL)
    assert.ok(
        placedBounds.max.z <= -31.5 + 0.001,
        'bottom geometry must remain below the PCB underside'
    )
})

test('PcbScene3dExternalModels seats bottom connector housings above sparse raised contacts', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            board: { thicknessMil: 63 },
            components: [{ designator: 'J6', componentIndex: 6 }],
            detail: {
                pads: [
                    { componentIndex: 6, holeDiameter: 0 },
                    { componentIndex: 6, holeDiameter: 0 }
                ]
            },
            externalPlacements: [
                {
                    designator: 'J6',
                    mountSide: 'bottom',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: -31.5 },
                    modelTransform: {
                        rotationDeg: { x: -180, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'raised-contact-connector.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/raised-contact-connector'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [buildRaisedContactConnectorPayload()]
                }
            }
        }
    })

    assert.deepEqual(diagnostics, [])

    externalModelsGroup.updateMatrixWorld(true)
    const placedBounds = new THREE.Box3().setFromObject(externalModelsGroup)
    const wrapperGroup = externalModelsGroup.children[0]
    const compensationGroup = wrapperGroup.children[0]
    const orientationGroup = compensationGroup.children[0]
    const sideGroup = orientationGroup.children[0]
    const faceGroup = sideGroup.children[0]
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, 80 + DEFAULT_MODEL_Z_CLEARANCE_MIL)
    assert.ok(
        placedBounds.max.z <= -31.5 + 0.001,
        'bottom connector geometry must remain below the PCB underside'
    )
})

test('PcbScene3dExternalModels seats bottom through-hole bodies above long sparse pins', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            board: { thicknessMil: 63 },
            components: [{ designator: 'J8', componentIndex: 8 }],
            detail: {
                pads: [
                    { componentIndex: 8, holeDiameter: 30 },
                    { componentIndex: 8, holeDiameter: 30 }
                ]
            },
            externalPlacements: [
                {
                    designator: 'J8',
                    mountSide: 'bottom',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: -31.5 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'long-pin-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/long-pin-body'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [buildLongPinBodyPayload()]
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

    assertNearlyEqual(modelGroup.position.z, DEFAULT_MODEL_Z_CLEARANCE_MIL)
})

test('PcbScene3dExternalModels preserves source-origin model Z placement', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'kicad',
            coordinateSystem: 'kicad-3d-y-up',
            externalPlacements: [
                {
                    designator: 'U4',
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
                        name: 'source-origin-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/source-origin-body'
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
                            positions: [
                                0, 0, -0.04, 0.1, 0, -0.04, 0, 0.1, 0.06
                            ],
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
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, DEFAULT_MODEL_Z_CLEARANCE_MIL)
})

test('PcbScene3dExternalModels seats source-specific contact pads on the face', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            externalPlacements: [
                {
                    designator: 'J2',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 40 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        contactPadsMil: [{ x: 0, y: 0, width: 60, depth: 60 }],
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'contact-pad-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/contact-pad-body'
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
                            positions: [
                                -0.02, -0.02, 0.02, 0.02, -0.02, 0.02, 0.02,
                                0.02, 0.02, -0.02, -0.02, 0.02, 0.02, 0.02,
                                0.02, -0.02, 0.02, 0.02, 0.15, 0.15, -0.05,
                                0.18, 0.15, -0.05, 0.15, 0.18, -0.05
                            ],
                            normals: [],
                            indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
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
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(
        modelGroup.position.z,
        -20 + DEFAULT_MODEL_Z_CLEARANCE_MIL
    )
})

test('PcbScene3dExternalModels prefers source-specific zero body planes', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            externalPlacements: [
                {
                    designator: 'U5',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 40 },
                    modelTransform: {
                        rotationDeg: { x: 0, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'zero-plane-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/zero-plane-body'
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
                            positions: [
                                -0.05, -0.05, 0, 0.05, -0.05, 0, 0.05, 0.05, 0,
                                -0.05, -0.05, 0, 0.05, 0.05, 0, -0.05, 0.05, 0,
                                0.15, 0.15, -0.04, 0.18, 0.15, -0.04, 0.15,
                                0.18, -0.04
                            ],
                            normals: [],
                            indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
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
    const modelGroup = resolvePlacedModelGroup(faceGroup)

    assertNearlyEqual(modelGroup.position.z, DEFAULT_MODEL_Z_CLEARANCE_MIL)
})
