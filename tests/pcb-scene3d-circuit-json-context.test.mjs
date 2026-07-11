import assert from 'node:assert/strict'
import test from 'node:test'

import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { DocumentResult, ToolkitAsset } from 'circuitjson-toolkit/parser'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

/**
 * Builds one minimal canonical PCB model for document/context parity.
 * @returns {object[]} CircuitJSON elements.
 */
function createCircuitJsonSample() {
    return [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 10, y: 5 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_r1',
            name: 'R1',
            ftype: 'simple_resistor',
            resistance: '10k'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_r1',
            source_component_id: 'source_r1',
            center: { x: 6, y: 4 },
            layer: 'top',
            rotation: 0,
            width: 2,
            height: 1
        }
    ]
}

test('PcbScene3dCircuitJsonAdapter predicates do not freeze caller models', () => {
    const model = createCircuitJsonSample()
    const document = DocumentResult.create({
        model: createCircuitJsonSample(),
        source: {
            format: 'circuitjson',
            fileName: 'mutable.json',
            fileType: 'json'
        }
    })

    assert.equal(PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(model), true)
    assert.equal(
        PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(document),
        true
    )
    assert.equal(Object.isFrozen(model), false)
    assert.equal(Object.isFrozen(model[0]), false)
    assert.equal(Object.isFrozen(document.model), false)
    assert.equal(Object.isFrozen(document.model[0]), false)
})

test('PcbScene3dCircuitJsonAdapter predicates do not invoke caller accessors', () => {
    let getterCalls = 0
    const document = { schema: 'ecad-toolkit.document.v1' }
    Object.defineProperty(document, 'model', {
        enumerable: true,
        get() {
            getterCalls += 1
            return createCircuitJsonSample()
        }
    })
    const model = createCircuitJsonSample()
    Object.defineProperty(model, 'metadata', {
        enumerable: true,
        get() {
            getterCalls += 1
            return {}
        }
    })

    assert.equal(
        PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(document),
        false
    )
    assert.equal(PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(model), true)
    assert.equal(getterCalls, 0)
})

test('PcbScene3dCircuitJsonAdapter routes shared-normalizable legacy models', () => {
    const model = createCircuitJsonSample()
    model.push({
        type: 'source_net',
        source_net_id: 'legacy_net_1',
        name: 'LEGACY_NET'
    })

    assert.equal(PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(model), true)
    assert.equal(
        PcbScene3dCircuitJsonAdapter.isDirectCircuitJsonModel(model),
        true
    )

    const scene = PcbScene3dCircuitJsonAdapter.build(model)

    assert.equal(Math.round(scene.board.widthMil), 787)
})

test('PcbScene3dCircuitJsonAdapter prepares proven documents without revalidation', () => {
    const document = DocumentResult.createValidated({
        model: createCircuitJsonSample()
    })

    const context = PcbScene3dCircuitJsonAdapter.prepare(document)
    const first = PcbScene3dCircuitJsonAdapter.build(context)
    const second = PcbScene3dCircuitJsonAdapter.build(context)

    assert.equal(context instanceof CircuitJsonDocumentContext, true)
    assert.equal(context.statistics.validationPasses, 0)
    assert.deepEqual(context.statistics.indexBuilds, { elements: 1 })
    assert.equal(first.board.widthMil, second.board.widthMil)
})

test('PcbScene3dCircuitJsonAdapter accepts document envelopes and reuses prepared indexes', () => {
    const document = DocumentResult.createValidated({
        model: createCircuitJsonSample(),
        source: {
            format: 'circuitjson',
            fileName: 'contract.json',
            fileType: 'json'
        }
    })
    const context = CircuitJsonDocumentContext.prepare(document, {
        indexes: ['elements']
    })

    assert.equal(
        PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(document),
        true
    )
    assert.equal(PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(context), true)
    assert.equal(
        PcbScene3dCircuitJsonAdapter.isDirectCircuitJsonModel(document),
        true
    )

    const fromDocument = PcbScene3dCircuitJsonAdapter.build(document)
    const first = PcbScene3dCircuitJsonAdapter.build(context)
    const second = PcbScene3dCircuitJsonAdapter.build(context)

    assert.equal(fromDocument.board.widthMil, first.board.widthMil)
    assert.equal(first.board.widthMil, second.board.widthMil)
    assert.equal(first.components[0].designator, 'R1')
    assert.deepEqual(context.statistics.indexBuilds, { elements: 1 })
})

test('PcbScene3dCircuitJsonAdapter consumes canonical model assets directly', () => {
    const model = createCircuitJsonSample()
    model.push({
        type: 'cad_component',
        cad_component_id: 'cad_direct',
        pcb_component_id: 'pcb_r1',
        source_component_id: 'source_r1',
        position: { x: 6, y: 4, z: 0.8 },
        model_asset: {
            mimetype: 'model/step',
            project_relative_path: 'models/direct.step',
            url: 'models/direct.step'
        }
    })
    const resolverCalls = []

    const scene = PcbScene3dCircuitJsonAdapter.build(model, {
        modelUrlResolver(url, context) {
            resolverCalls.push({ url, context })
            return { resolvedUrl: `asset://${url}` }
        }
    })
    const externalModel = scene.externalPlacements[0].externalModel

    assert.equal(externalModel.format, 'step')
    assert.equal(externalModel.resolvedUrl, 'asset://models/direct.step')
    assert.equal(scene.components[0].externalModel.format, 'step')
    assert.equal(resolverCalls[0].context.field, 'model_asset')
})

test('PcbScene3dCircuitJsonAdapter resolves canonical document model assets', () => {
    const model = createCircuitJsonSample()
    model.push({
        type: 'cad_component',
        cad_component_id: 'cad_r1',
        pcb_component_id: 'pcb_r1',
        source_component_id: 'source_r1',
        position: { x: 6, y: 4, z: 0.8 },
        model_asset: {
            mimetype: 'model/step',
            project_relative_path: 'models/r1.step',
            url: 'models/r1.step'
        }
    })
    const document = DocumentResult.createValidated({
        model,
        assets: [
            ToolkitAsset.create({
                kind: 'model3d',
                name: 'r1.step',
                mediaType: 'model/step',
                data: new Uint8Array([1, 2, 3]),
                source: { projectRelativePath: 'models/r1.step' }
            })
        ]
    })

    const scene = PcbScene3dCircuitJsonAdapter.build(document)
    const externalModel = scene.externalPlacements[0].externalModel

    assert.equal(externalModel.sourceUrl, 'models/r1.step')
    assert.deepEqual(externalModel.data, new Uint8Array([1, 2, 3]))
    assert.equal(externalModel.name, 'r1.step')
})

test('PcbScene3dCircuitJsonAdapter caches canonical asset aliases in a shared context', () => {
    const model = createCircuitJsonSample()
    model.push({
        type: 'cad_component',
        cad_component_id: 'cad_cached',
        pcb_component_id: 'pcb_r1',
        source_component_id: 'source_r1',
        position: { x: 6, y: 4, z: 0.8 },
        model_step_url: 'models/cached.step'
    })
    const context = CircuitJsonDocumentContext.prepare(
        DocumentResult.createValidated({
            model,
            assets: [
                ToolkitAsset.create({
                    kind: 'model3d',
                    name: 'cached.step',
                    mediaType: 'model/step',
                    data: new Uint8Array([7, 8, 9]),
                    source: {
                        projectRelativePath: 'models/cached.step'
                    }
                })
            ]
        })
    )

    const first = PcbScene3dCircuitJsonAdapter.build(context)
    const second = PcbScene3dCircuitJsonAdapter.build(context)

    assert.deepEqual(
        first.externalPlacements[0].externalModel.data,
        new Uint8Array([7, 8, 9])
    )
    assert.deepEqual(
        second.externalPlacements[0].externalModel.data,
        new Uint8Array([7, 8, 9])
    )
    assert.deepEqual(context.statistics.derivedBuilds, {
        'pcb-scene3d-viewer:model-assets-v1': 1
    })
})

test('PcbScene3dCircuitJsonAdapter skips asset indexing without model references', () => {
    const context = CircuitJsonDocumentContext.prepare(
        DocumentResult.createValidated({
            model: createCircuitJsonSample(),
            assets: [
                ToolkitAsset.create({
                    kind: 'model3d',
                    name: 'unused.step',
                    mediaType: 'model/step',
                    data: new Uint8Array([1]),
                    source: { projectRelativePath: 'models/unused.step' }
                })
            ]
        })
    )

    PcbScene3dCircuitJsonAdapter.build(context)
    PcbScene3dCircuitJsonAdapter.build(context)

    assert.deepEqual(context.statistics.derivedBuilds, {})
})

test('PcbScene3dCircuitJsonAdapter does not invoke resolved asset accessors', () => {
    const model = createCircuitJsonSample()
    model.push({
        type: 'cad_component',
        cad_component_id: 'cad_safe',
        pcb_component_id: 'pcb_r1',
        source_component_id: 'source_r1',
        position: { x: 6, y: 4, z: 0.8 },
        model_step_url: 'models/safe.step'
    })
    let getterCalls = 0
    const asset = {
        relativePath: 'models/safe.step',
        bytes: new Uint8Array([4, 5, 6])
    }
    Object.defineProperty(asset, 'hostile', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'not-safe'
        }
    })

    const scene = PcbScene3dCircuitJsonAdapter.build(model, {
        sessionAssets: [asset]
    })
    const externalModel = scene.externalPlacements[0].externalModel

    assert.deepEqual(externalModel.bytes, new Uint8Array([4, 5, 6]))
    assert.equal(Object.hasOwn(externalModel, 'hostile'), false)
    assert.equal(getterCalls, 0)
})
