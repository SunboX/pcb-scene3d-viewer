import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

/**
 * Builds one minimal scene containing an external-model placement.
 * @param {object} externalModel External-model metadata.
 * @returns {object}
 */
function createScene(externalModel) {
    return {
        externalPlacements: [
            {
                designator: 'U1',
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 0 },
                externalModel
            }
        ]
    }
}

test('PcbScene3dExternalModels silently defers contentless models when fetching is disabled', async () => {
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: {},
        sceneDescription: createScene({
            name: 'Fake_Body.wrl',
            format: 'wrl',
            sourceUrl:
                '${KICAD9_3DMODEL_DIR}/Package_Fake.3dshapes/Fake_Body.wrl'
        }),
        externalModelsGroup: { add() {} },
        stepLoader: {}
    })

    assert.deepEqual(diagnostics, [])
})

test('PcbScene3dExternalModels retains local model parse diagnostics', async () => {
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: {},
        sceneDescription: createScene({
            name: 'Fake_Body.step',
            format: 'step',
            payloadBytes: new Uint8Array([1, 2, 3])
        }),
        externalModelsGroup: { add() {} },
        stepLoader: {
            async loadModel() {
                throw new Error('Invalid STEP payload.')
            }
        }
    })

    assert.deepEqual(diagnostics, [
        'Could not load external model for U1: Invalid STEP payload.'
    ])
})

test('PcbScene3dExternalModels retains enabled model download diagnostics', async () => {
    const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
        three: {},
        sceneDescription: createScene({
            name: 'Fake_Body.step',
            format: 'step',
            sourceUrl: 'https://assets.invalid/models/Fake_Body.step'
        }),
        externalModelsGroup: { add() {} },
        modelLoaderOptions: {
            async fetch() {
                throw new Error('Model download failed.')
            }
        },
        stepLoader: {}
    })

    assert.deepEqual(diagnostics, [
        'Could not load external model for U1: Model download failed.'
    ])
})
