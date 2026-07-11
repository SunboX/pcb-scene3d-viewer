import assert from 'node:assert/strict'

import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { DocumentResult, ToolkitAsset } from 'circuitjson-toolkit/parser'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

const ASSET_COUNT = 500
const REPEATED_BUILDS = 25
const MAX_REPEATED_MILLISECONDS = 1000

/**
 * Builds deterministic canonical model assets.
 * @returns {object[]} Canonical model asset rows.
 */
function createAssets() {
    return Array.from({ length: ASSET_COUNT }, (_, index) =>
        ToolkitAsset.create({
            kind: 'model3d',
            name: `asset-${index}.step`,
            mediaType: 'model/step',
            data: new Uint8Array([index % 251]),
            source: {
                projectRelativePath: `models/asset-${index}.step`
            }
        })
    )
}

/**
 * Builds one benchmark document with an optional final-asset reference.
 * @param {boolean} includeModelReference Whether to include a CAD model row.
 * @returns {object} Canonical document.
 */
function createDocument(includeModelReference) {
    const model = [
        {
            type: 'pcb_board',
            pcb_board_id: 'benchmark_board',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        }
    ]
    if (includeModelReference) {
        model.push(
            {
                type: 'source_component',
                source_component_id: 'benchmark_source',
                name: 'U1',
                ftype: 'simple_chip'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'benchmark_component',
                source_component_id: 'benchmark_source',
                center: { x: 0, y: 0 },
                layer: 'top',
                rotation: 0,
                width: 2,
                height: 1
            },
            {
                type: 'cad_component',
                cad_component_id: 'benchmark_cad',
                pcb_component_id: 'benchmark_component',
                source_component_id: 'benchmark_source',
                position: { x: 0, y: 0, z: 0.8 },
                model_step_url: `models/asset-${ASSET_COUNT - 1}.step`
            }
        )
    }
    return DocumentResult.createValidated({ model, assets: createAssets() })
}

const context = CircuitJsonDocumentContext.prepare(createDocument(true))
const coldStartedAt = performance.now()
const firstScene = PcbScene3dCircuitJsonAdapter.build(context)
const coldMilliseconds = performance.now() - coldStartedAt
const repeatedStartedAt = performance.now()
for (let index = 0; index < REPEATED_BUILDS; index += 1) {
    PcbScene3dCircuitJsonAdapter.build(context)
}
const repeatedMilliseconds = performance.now() - repeatedStartedAt
const unreferencedContext = CircuitJsonDocumentContext.prepare(
    createDocument(false)
)
PcbScene3dCircuitJsonAdapter.build(unreferencedContext)

assert.deepEqual(context.statistics.indexBuilds, { elements: 1 })
assert.deepEqual(context.statistics.derivedBuilds, {
    'pcb-scene3d-viewer:model-assets-v1': 1
})
assert.deepEqual(unreferencedContext.statistics.derivedBuilds, {})
assert.equal(
    firstScene.externalPlacements[0].externalModel.name,
    `asset-${ASSET_COUNT - 1}.step`
)
assert.equal(
    repeatedMilliseconds <= MAX_REPEATED_MILLISECONDS,
    true,
    `Repeated context adaptation took ${repeatedMilliseconds.toFixed(2)} ms.`
)

console.log(
    JSON.stringify(
        {
            assets: ASSET_COUNT,
            repeatedBuilds: REPEATED_BUILDS,
            coldMilliseconds: Number(coldMilliseconds.toFixed(3)),
            repeatedMilliseconds: Number(repeatedMilliseconds.toFixed(3)),
            derivedBuilds: context.statistics.derivedBuilds,
            unreferencedDerivedBuilds:
                unreferencedContext.statistics.derivedBuilds
        },
        null,
        2
    )
)
