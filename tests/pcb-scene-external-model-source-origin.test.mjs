import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

test('PcbScene3dExternalModels preserves opposite-signed embedded source offsets', async () => {
    const externalModelsGroup = new THREE.Group()
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: {
            externalPlacements: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 180,
                    positionMil: { x: 236, y: -242, z: 31.5 },
                    modelTransform: {
                        rotationDeg: { x: -90, y: 0, z: 0 },
                        offsetMil: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'corner-origin-body.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;',
                        sourceStream: 'Models/fake-corner-origin'
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
                                0.015, 0.001, -0.468, 0.468, 0.001, -0.468,
                                0.468, 0.038, -0.015, 0.015, 0.038, -0.015
                            ],
                            normals: [],
                            indices: [0, 1, 2, 0, 2, 3],
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
    const placedCenter = placedBounds.getCenter(new THREE.Vector3())
    const modelGroup = findSourceModelGroup(externalModelsGroup)

    assert.ok(Math.abs(placedCenter.x) < 12)
    assert.ok(Math.abs(placedCenter.y) < 12)
    assert.ok(Math.abs(Math.abs(modelGroup.rotation.z) - Math.PI) < 0.000001)
})

/**
 * Finds the group that holds loaded STEP model geometry.
 * @param {THREE.Group} root Root scene object.
 * @returns {THREE.Group}
 */
function findSourceModelGroup(root) {
    let match = null
    root.traverse((child) => {
        if (
            !match &&
            Math.abs(Number(child?.scale?.x || 0) - 1000) < 0.000001
        ) {
            match = child
        }
    })

    assert.ok(match)
    return match
}
