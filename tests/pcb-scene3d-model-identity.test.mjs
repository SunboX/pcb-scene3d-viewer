import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { PcbScene3dExternalModelGroupLoader } from '../src/PcbScene3dExternalModelGroupLoader.mjs'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

/**
 * Builds one placement for a project-relative model path.
 * @param {string} designator Component designator.
 * @param {string} projectRelativePath Exact model path.
 * @returns {object}
 */
function createPlacement(designator, projectRelativePath) {
    return {
        designator,
        mountSide: 'top',
        rotationDeg: 0,
        positionMil: { x: 0, y: 0, z: 0 },
        externalModel: {
            format: 'step',
            name: 'body.step',
            source: { projectRelativePath }
        }
    }
}

test('PcbScene3dExternalModels caches exact sources without basename collisions', async () => {
    const originalLoad = PcbScene3dExternalModelGroupLoader.load
    const loadedPaths = []
    PcbScene3dExternalModelGroupLoader.load = async (_three, model) => {
        loadedPaths.push(model.source.projectRelativePath)
        return new THREE.Group()
    }

    try {
        const externalModelsGroup = new THREE.Group()
        const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
            three: THREE,
            externalModelsGroup,
            sceneDescription: {
                externalPlacements: [
                    createPlacement('U1', 'models/a/body.step'),
                    createPlacement('U2', 'models/a/body.step'),
                    createPlacement('U3', 'models/b/body.step')
                ]
            }
        })

        assert.deepEqual(diagnostics, [])
        assert.deepEqual(loadedPaths, [
            'models/a/body.step',
            'models/b/body.step'
        ])
        assert.equal(externalModelsGroup.children.length, 3)
    } finally {
        PcbScene3dExternalModelGroupLoader.load = originalLoad
    }
})
