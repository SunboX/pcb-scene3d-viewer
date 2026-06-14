import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

test('PcbScene3dExternalModels renders matching board assembly as the external scene model', async () => {
    const externalModelsGroup = new THREE.Group()
    const loadedModels = []
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            board: {
                widthMil: 1000,
                heightMil: 500,
                thicknessMil: 62,
                surfaceColor: 0x17396b
            },
            boardAssemblyModel: {
                origin: 'board-assembly',
                name: 'FixtureBoard.step',
                relativePath: '3D Bodies/FixtureBoard.step',
                format: 'step'
            },
            externalPlacements: [
                {
                    designator: 'R1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 10, y: 20, z: 30 },
                    modelTransform: {},
                    externalModel: {
                        origin: 'embedded',
                        name: 'chip.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/0'
                    }
                }
            ]
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel(model) {
                loadedModels.push(model)
                return {
                    meshPayloads: [
                        {
                            name: 'assembly substrate',
                            color: [0.0, 0.45, 0.0],
                            positions: [
                                10, 5, 0, 11, 5, 0, 10, 5.5, 0, 10, 5, -0.062,
                                10, 5, 0, 10, 5.5, 0
                            ],
                            normals: [],
                            indices: [0, 1, 2, 3, 4, 5],
                            faceColors: []
                        },
                        {
                            name: 'large assembly cover',
                            color: [0.21, 0.21, 0.21],
                            positions: [
                                10.1, 5.1, 0.05, 10.9, 5.1, 0.05, 10.1, 5.45,
                                0.05
                            ],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        },
                        {
                            name: 'long assembly cover wall',
                            color: [0.21, 0.21, 0.21],
                            positions: [
                                10.1, 5.1, 0.05, 10.9, 5.1, 0.05, 10.1, 5.12,
                                0.05
                            ],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        },
                        {
                            name: 'small neutral component',
                            color: [0.5, 0.5, 0.5],
                            positions: [
                                10.2, 5.2, 0.05, 10.3, 5.2, 0.05, 10.2, 5.25,
                                0.05
                            ],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        },
                        {
                            name: 'external grey connector',
                            color: [0.5, 0.5, 0.5],
                            positions: [
                                9.8, 5.1, 0.05, 9.9, 5.1, 0.05, 9.8, 5.2, 0.05
                            ],
                            normals: [],
                            indices: [0, 1, 2],
                            faceColors: []
                        },
                        {
                            name: 'gold connector',
                            color: [0.95, 0.63, 0.22],
                            positions: [
                                11, 5.2, 0.05, 11.2, 5.2, 0.05, 11, 5.3, 0.05
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
    assert.equal(externalModelsGroup.children.length, 1)
    assert.equal(loadedModels.length, 1)
    assert.equal(loadedModels[0].origin, 'board-assembly')

    const wrapperGroup = externalModelsGroup.children[0]
    const modelGroup = wrapperGroup.children[0]

    assert.equal(wrapperGroup.position.x, -500)
    assert.equal(wrapperGroup.position.y, -250)
    assert.equal(wrapperGroup.position.z, 0)
    assert.equal(wrapperGroup.userData.scene3dPlacementType, 'board-assembly')
    assert.ok(Math.abs(modelGroup.position.z - 31) < 0.001)
    assert.equal(
        modelGroup.userData.scene3dBoardAssemblySurfaceColor,
        new THREE.Color(0.0, 0.45, 0.0).getHex()
    )
    assert.equal(modelGroup.children[0].geometry.index.array.length, 6)
    assert.equal(modelGroup.children[0].visible, false)
    assert.equal(Array.isArray(modelGroup.children[0].material), true)
    assert.equal(modelGroup.children[0].material[0].color.getHex(), 0x2a5f27)
    assert.equal(modelGroup.children[0].material[1].color.getHex(), 0xc9ca78)
    assert.equal(modelGroup.children[0].material[0].roughness, 0.56)
    assert.equal(modelGroup.children[0].material[0].metalness, 0)
    assert.equal(modelGroup.children[0].material[0].depthWrite, true)
    assert.deepEqual(modelGroup.children[0].geometry.groups, [
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 }
    ])
    assert.equal(modelGroup.children[1].visible, false)
    assert.equal(modelGroup.children[2].visible, false)
    assert.equal(modelGroup.children[3].visible, true)
    assert.equal(modelGroup.children[4].visible, true)
    assert.equal(modelGroup.children[5].visible, true)
    assert.equal(modelGroup.children[4].material.transparent, false)
    assert.equal(modelGroup.children[5].material.transparent, false)
    assert.equal(modelGroup.children[4].material.opacity, 1)
    assert.equal(modelGroup.children[5].material.opacity, 1)
})

test('PcbScene3dExternalModels mirrors Altium board assembly source Y into detail coordinates', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            sourceFormat: 'altium',
            board: {
                widthMil: 1000,
                heightMil: 500,
                thicknessMil: 62,
                surfaceColor: 0x17396b
            },
            boardAssemblyModel: {
                origin: 'board-assembly',
                name: 'FixtureBoard.step',
                relativePath: '3D Bodies/FixtureBoard.step',
                format: 'step'
            }
        },
        externalModelsGroup,
        stepLoader: {
            async loadModel() {
                return {
                    meshPayloads: [
                        {
                            name: 'assembly substrate',
                            color: [0.0, 0.45, 0.0],
                            positions: [
                                0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0, -0.062, 1, 0,
                                -0.062, 0, 0.5, -0.062
                            ],
                            normals: [],
                            indices: [0, 1, 2, 3, 4, 5],
                            faceColors: []
                        },
                        {
                            name: 'small neutral component',
                            color: [0.5, 0.5, 0.5],
                            positions: [
                                0.2, 0.1, 0.05, 0.4, 0.1, 0.05, 0.2, 0.2, 0.05
                            ],
                            normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
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
    const modelGroup = wrapperGroup.children[0]
    const componentMesh = modelGroup.children[1]
    const componentPositions =
        componentMesh.geometry.getAttribute('position').array

    assert.equal(wrapperGroup.position.x, -500)
    assert.equal(wrapperGroup.position.y, 250)
    assert.deepEqual(Array.from(componentMesh.geometry.index.array), [0, 2, 1])
    assert.deepEqual(
        Array.from(componentPositions)
            .filter((_, index) => index % 3 === 1)
            .map((value) => Math.round(value * 1000) / 1000),
        [-0.1, -0.1, -0.2]
    )
    assert.equal(modelGroup.userData.scene3dBoardAssemblyMirroredY, true)
})

test('PcbScene3dExternalModels reuses STEP typed arrays for render geometry', async () => {
    const externalModelsGroup = new THREE.Group()
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    const indices = new Uint32Array([0, 1, 2])
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 0 },
                    modelTransform: {},
                    externalModel: {
                        origin: 'session',
                        name: 'typed.step',
                        relativePath: 'parts/typed.step',
                        format: 'step'
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
                            name: 'typed body',
                            color: [0.5, 0.5, 0.5],
                            positions,
                            normals,
                            indices,
                            faceColors: [
                                {
                                    first: 0,
                                    last: 0,
                                    color: [0.9, 0.8, 0.7]
                                }
                            ]
                        }
                    ]
                }
            }
        }
    })

    let importedMesh = null
    externalModelsGroup.traverse((object) => {
        if (object?.geometry) {
            importedMesh = object
        }
    })

    assert.deepEqual(diagnostics, [])
    assert.ok(importedMesh)
    assert.equal(
        importedMesh.geometry.getAttribute('position').array,
        positions
    )
    assert.equal(importedMesh.geometry.getAttribute('normal').array, normals)
    assert.equal(importedMesh.geometry.index.array, indices)
    assert.deepEqual(importedMesh.geometry.groups, [
        { start: 0, count: 3, materialIndex: 1 }
    ])
    assert.equal(Array.isArray(importedMesh.material), true)
    assert.equal(importedMesh.material.length, 2)
})

test('PcbScene3dExternalModels renders flat STEP face markings double-sided', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 0 },
                    modelTransform: {},
                    externalModel: {
                        origin: 'embedded',
                        name: 'marked-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/0'
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
                            name: 'flat top marking',
                            color: null,
                            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                            normals: [0, 0, -1, 0, 0, -1, 0, 0, -1],
                            indices: [0, 1, 2],
                            faceColors: [
                                {
                                    first: 0,
                                    last: 0,
                                    color: [1, 1, 1]
                                }
                            ]
                        }
                    ]
                }
            }
        }
    })

    let importedMesh = null
    externalModelsGroup.traverse((object) => {
        if (object?.geometry) {
            importedMesh = object
        }
    })

    assert.deepEqual(diagnostics, [])
    assert.equal(importedMesh?.material?.[1]?.side, THREE.DoubleSide)
})
