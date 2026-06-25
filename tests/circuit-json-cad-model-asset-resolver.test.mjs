import assert from 'node:assert/strict'
import test from 'node:test'

import { CircuitJsonCadModelAssetResolver } from '../src/scene3d.mjs'

/**
 * Verifies CAD model asset metadata is converted into viewer model URL fields.
 */
test('CircuitJsonCadModelAssetResolver maps model asset metadata to model URLs', () => {
    const circuitJson = [
        {
            type: 'cad_component',
            cad_component_id: 'cad_fake_1',
            model_asset: {
                project_relative_path: 'models/fake.step',
                format: 'step'
            }
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_fake_2',
            model_step_url: 'models/existing.step',
            model_asset: {
                project_relative_path: 'models/ignored.step',
                format: 'step'
            }
        }
    ]

    const resolved =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(circuitJson)

    assert.equal(resolved[0].model_step_url, 'models/fake.step')
    assert.equal(resolved[1].model_step_url, 'models/existing.step')
    assert.equal(circuitJson[0].model_step_url, undefined)
})

/**
 * Verifies session asset lookup takes priority over caller fallback logic.
 */
test('CircuitJsonCadModelAssetResolver resolves session asset model URLs', () => {
    const sessionAsset = {
        relativePath: 'models/fake.step',
        bytes: new Uint8Array([1, 2, 3])
    }
    const fallbackCalls = []
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [sessionAsset],
        modelUrlResolver: (url, context) => {
            fallbackCalls.push({ url, context })
            return { fallback: url }
        }
    })

    const matched = options.modelUrlResolver('models/fake.step?cache=1', {
        cadComponent: {
            model_asset: { project_relative_path: 'models/fake.step' }
        }
    })
    const fallback = options.modelUrlResolver('models/missing.step', {
        cadComponent: {
            model_asset: { project_relative_path: 'models/missing.step' }
        }
    })

    assert.equal(matched, sessionAsset)
    assert.deepEqual(fallback, { fallback: 'models/missing.step' })
    assert.equal(fallbackCalls.length, 1)
})
