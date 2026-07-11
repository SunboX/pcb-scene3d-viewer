import assert from 'node:assert/strict'
import test from 'node:test'

import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { DocumentResult, ToolkitAsset } from 'circuitjson-toolkit/parser'
import { CircuitJsonCadModelAssetResolver } from '../src/scene3d.mjs'

/**
 * Verifies CAD model asset metadata is converted into viewer model URL fields.
 */
test('CircuitJsonCadModelAssetResolver maps model asset metadata to model URLs', () => {
    const circuitJson = [
        {
            type: 'cad_component',
            cad_component_id: 'cad_fake_1',
            pcb_component_id: 'pcb_fake_1',
            source_component_id: 'source_fake_1',
            position: { x: 0, y: 0, z: 0 },
            model_asset: {
                mimetype: 'model/step',
                project_relative_path: 'models/fake.step',
                url: 'models/fake.step'
            }
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_fake_2',
            pcb_component_id: 'pcb_fake_2',
            source_component_id: 'source_fake_2',
            position: { x: 1, y: 0, z: 0 },
            model_step_url: 'models/existing.step',
            model_asset: {
                mimetype: 'model/step',
                project_relative_path: 'models/ignored.step',
                url: 'models/ignored.step'
            }
        }
    ]

    const resolved =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(circuitJson)

    assert.equal(resolved[0].model_step_url, 'models/fake.step')
    assert.equal(resolved[1].model_step_url, 'models/existing.step')
    assert.equal(circuitJson[0].model_step_url, undefined)
})

test('CircuitJsonCadModelAssetResolver falls back to canonical asset suffixes', () => {
    const circuitJson = [
        {
            type: 'cad_component',
            cad_component_id: 'cad_suffix_1',
            pcb_component_id: 'pcb_suffix_1',
            source_component_id: 'source_suffix_1',
            position: { x: 0, y: 0, z: 0 },
            model_asset: {
                mimetype: 'application/octet-stream',
                project_relative_path: 'models/fake.stp',
                url: 'models/fake.stp'
            }
        }
    ]

    const resolved =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(circuitJson)

    assert.equal(resolved[0].model_step_url, 'models/fake.stp')
})

test('CircuitJsonCadModelAssetResolver retains legacy document wrappers safely', () => {
    let getterCalls = 0
    const wrapper = {
        elements: [
            {
                type: 'cad_component',
                cad_component_id: 'cad_wrapper_1',
                pcb_component_id: 'pcb_wrapper_1',
                source_component_id: 'source_wrapper_1',
                position: { x: 0, y: 0, z: 0 },
                model_asset: {
                    mimetype: 'model/step',
                    project_relative_path: 'models/wrapper.step',
                    url: 'models/wrapper.step'
                }
            }
        ],
        sourceFormat: 'legacy'
    }
    Object.defineProperty(wrapper, 'hostile', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'not-safe'
        }
    })

    const resolved =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(wrapper)

    assert.equal(resolved.elements[0].model_step_url, 'models/wrapper.step')
    assert.equal(resolved.sourceFormat, 'legacy')
    assert.equal(Object.hasOwn(resolved, 'hostile'), false)
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver preserves canonical envelopes and contexts', () => {
    const document = {
        schema: 'ecad-toolkit.document.v1',
        id: 'document-model-asset',
        modelSchema: { name: 'circuit-json', version: '0.0.446' },
        model: [
            {
                type: 'cad_component',
                cad_component_id: 'cad_fake_1',
                pcb_component_id: 'pcb_fake_1',
                source_component_id: 'source_fake_1',
                position: { x: 0, y: 0, z: 0 },
                model_asset: {
                    mimetype: 'model/step',
                    project_relative_path: 'models/fake.step',
                    url: 'models/fake.step'
                }
            }
        ],
        source: {
            format: 'kicad',
            fileName: 'board.kicad_pcb',
            fileType: 'kicad_pcb'
        },
        extensions: {},
        assets: [],
        diagnostics: [],
        statistics: {}
    }
    const context = CircuitJsonDocumentContext.prepare(document)

    const resolvedDocument =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(document)
    const resolvedContext =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(context)

    assert.equal(resolvedDocument.source, document.source)
    assert.equal(resolvedDocument.model[0].model_step_url, 'models/fake.step')
    assert.equal(resolvedContext instanceof CircuitJsonDocumentContext, true)
    assert.notEqual(resolvedContext, context)
    assert.equal(resolvedContext.document.schema, 'ecad-toolkit.document.v1')
    assert.equal(resolvedContext.source, context.source)
    assert.equal(resolvedContext.model[0].model_step_url, 'models/fake.step')
    assert.deepEqual(resolvedContext.statistics.indexBuilds, { elements: 1 })
    assert.equal(document.model[0].model_step_url, undefined)
})

test('CircuitJsonCadModelAssetResolver reads wrapped documents without invoking accessors', () => {
    let getterCalls = 0
    const document = {
        schema: 'ecad-toolkit.document.v1',
        model: [
            {
                type: 'cad_component',
                cad_component_id: 'cad_wrapped_document_1',
                pcb_component_id: 'pcb_wrapped_document_1',
                source_component_id: 'source_wrapped_document_1',
                position: { x: 0, y: 0, z: 0 },
                model_asset: {
                    mimetype: 'model/step',
                    project_relative_path: 'models/wrapped.step',
                    url: 'models/wrapped.step'
                }
            }
        ],
        assets: []
    }
    Object.defineProperty(document, 'hostile', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'unsafe'
        }
    })
    const wrapper = { document }
    Object.defineProperty(wrapper, 'hostile', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'unsafe'
        }
    })

    const resolved =
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(wrapper)

    assert.equal(resolved.model[0].model_step_url, 'models/wrapped.step')
    assert.equal(Object.hasOwn(resolved, 'hostile'), false)
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver ignores accessor-backed hostile metadata', () => {
    let getterCalls = 0
    const element = {
        type: 'cad_component',
        cad_component_id: 'cad_hostile_1',
        pcb_component_id: 'pcb_hostile_1',
        source_component_id: 'source_hostile_1',
        position: { x: 0, y: 0, z: 0 }
    }
    Object.defineProperty(element, 'model_asset', {
        enumerable: true,
        get() {
            getterCalls += 1
            return {
                project_relative_path: 'models/hostile.step',
                format: 'step'
            }
        }
    })
    const document = [element]

    assert.equal(
        CircuitJsonCadModelAssetResolver.withModelAssetUrls(document),
        document
    )
    assert.equal(getterCalls, 0)
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

test('CircuitJsonCadModelAssetResolver materializes canonical session payloads', () => {
    const bytes = new Uint8Array([0x53, 0x54, 0x45, 0x50])
    const asset = ToolkitAsset.create({
        kind: 'model3d',
        name: 'models/body.step',
        mediaType: 'model/step',
        data: bytes
    })
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [asset]
    })
    const resolved = options.modelUrlResolver('models/body.step', {
        format: 'step'
    })
    const descriptor = Object.getOwnPropertyDescriptor(resolved, 'data')

    assert.equal(Object.hasOwn(descriptor, 'value'), true)
    assert.deepEqual(resolved.data, bytes)
})

test('CircuitJsonCadModelAssetResolver attaches canonical GLTF buffer companions', () => {
    const binary = new Uint8Array([1, 2, 3, 4])
    const context = CircuitJsonDocumentContext.prepare(
        DocumentResult.createValidated({
            model: [],
            assets: [
                ToolkitAsset.create({
                    kind: 'model3d',
                    name: 'body.gltf',
                    mediaType: 'model/gltf+json',
                    data: JSON.stringify({
                        asset: { version: '2.0' },
                        buffers: [
                            {
                                uri: './buffers/body.bin',
                                byteLength: binary.byteLength
                            }
                        ]
                    }),
                    source: {
                        projectRelativePath: 'models/body.gltf'
                    }
                }),
                ToolkitAsset.create({
                    kind: 'model3d-resource',
                    name: 'body.bin',
                    mediaType: 'application/octet-stream',
                    data: binary,
                    source: {
                        projectRelativePath: 'models/buffers/body.bin'
                    }
                })
            ]
        })
    )
    const options = CircuitJsonCadModelAssetResolver.withContextAssetResolver(
        {},
        context
    )

    const resolved = options.modelUrlResolver('models/body.gltf', {
        format: 'gltf'
    })

    assert.equal(resolved.externalBuffers.length, 1)
    assert.equal(resolved.externalBuffers[0].uri, './buffers/body.bin')
    assert.deepEqual(resolved.externalBuffers[0].data, binary)
})

test('CircuitJsonCadModelAssetResolver attaches OBJ and WRL local resources', () => {
    const texture = new Uint8Array([7, 8, 9])
    const sessionAssets = [
        {
            relativePath: 'models/body.obj',
            data: 'mtllib materials/body.mtl\nv 0 0 0'
        },
        {
            relativePath: 'models/materials/body.mtl',
            data: 'newmtl body\nKd 0.1 0.2 0.3'
        },
        {
            relativePath: 'models/body.wrl',
            data: 'ImageTexture { url ["textures/body.png"] }'
        },
        {
            relativePath: 'models/textures/body.png',
            data: texture
        }
    ]
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets
    })

    const obj = options.modelUrlResolver('models/body.obj', { format: 'obj' })
    const wrl = options.modelUrlResolver('models/body.wrl', { format: 'wrl' })

    assert.equal(obj.resources.length, 1)
    assert.equal(obj.resources[0].uri, 'materials/body.mtl')
    assert.equal(obj.resources[0].data.startsWith('newmtl'), true)
    assert.equal(wrl.resources.length, 1)
    assert.equal(wrl.resources[0].uri, 'textures/body.png')
    assert.deepEqual(wrl.resources[0].data, texture)
})

test('CircuitJsonCadModelAssetResolver keeps companion lookup path-exact and session-first', () => {
    const context = CircuitJsonDocumentContext.prepare(
        DocumentResult.createValidated({
            model: [],
            assets: [
                ToolkitAsset.create({
                    kind: 'model3d',
                    name: 'body.gltf',
                    mediaType: 'model/gltf+json',
                    data: JSON.stringify({
                        asset: { version: '2.0' },
                        buffers: [{ uri: 'body.bin', byteLength: 1 }]
                    }),
                    source: { projectRelativePath: 'a/body.gltf' }
                }),
                ToolkitAsset.create({
                    kind: 'model3d',
                    name: 'body.gltf',
                    mediaType: 'model/gltf+json',
                    data: JSON.stringify({
                        asset: { version: '2.0' },
                        buffers: [{ uri: 'body.bin', byteLength: 1 }]
                    }),
                    source: { projectRelativePath: 'b/body.gltf' }
                }),
                ToolkitAsset.create({
                    kind: 'model3d-resource',
                    name: 'body.bin',
                    data: new Uint8Array([1]),
                    source: { projectRelativePath: 'b/body.bin' }
                })
            ]
        })
    )
    const options = CircuitJsonCadModelAssetResolver.withContextAssetResolver(
        {
            sessionAssets: [
                {
                    relativePath: 'b/body.bin',
                    data: new Uint8Array([2])
                }
            ]
        },
        context
    )

    const resolved = options.modelUrlResolver('b/body.gltf', {
        format: 'gltf'
    })

    assert.equal(resolved.source.projectRelativePath, 'b/body.gltf')
    assert.deepEqual(resolved.externalBuffers[0].data, new Uint8Array([2]))
})

test('CircuitJsonCadModelAssetResolver prefers exact case-sensitive asset paths', () => {
    const upper = {
        relativePath: 'Models/Part.step',
        data: new Uint8Array([1])
    }
    const lower = {
        relativePath: 'models/part.step',
        data: new Uint8Array([2])
    }
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [upper, lower]
    })

    assert.equal(
        options.modelUrlResolver('models/part.step', { format: 'step' }),
        lower
    )
    assert.equal(
        options.modelUrlResolver('Models/Part.step', { format: 'step' }),
        upper
    )
})

test('CircuitJsonCadModelAssetResolver uses case-insensitive fallback only when unique', () => {
    const unique = {
        relativePath: 'Models/Unique.step',
        data: new Uint8Array([3])
    }
    const first = { relativePath: 'Models/Part.step' }
    const second = { relativePath: 'models/part.step' }
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [unique, first, second],
        modelUrlResolver: (url) => `fallback:${url}`
    })

    assert.equal(
        options.modelUrlResolver('models/unique.step', { format: 'step' }),
        unique
    )
    assert.equal(
        options.modelUrlResolver('MODELS/PART.STEP', { format: 'step' }),
        'fallback:MODELS/PART.STEP'
    )
})

test('CircuitJsonCadModelAssetResolver rejects unsafe and accessor-backed companions', () => {
    let getterCalls = 0
    const hostileCompanion = {}
    Object.defineProperty(hostileCompanion, 'relativePath', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'models/secret.bin'
        }
    })
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [
            {
                relativePath: 'models/body.gltf',
                data: JSON.stringify({
                    asset: { version: '2.0' },
                    buffers: [
                        { uri: '../secret.bin' },
                        { uri: 'https://assets.invalid/secret.bin' }
                    ]
                })
            },
            { relativePath: 'secret.bin', data: new Uint8Array([1]) },
            hostileCompanion
        ]
    })

    const resolved = options.modelUrlResolver('models/body.gltf', {
        format: 'gltf'
    })

    assert.equal(resolved.externalBuffers, undefined)
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver indexes asset aliases without invoking accessors', () => {
    let getterCalls = 0
    const hostileAsset = {}
    Object.defineProperty(hostileAsset, 'relativePath', {
        enumerable: true,
        get() {
            getterCalls += 1
            return 'models/hostile.step'
        }
    })
    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets: [hostileAsset],
        modelUrlResolver: (url) => `fallback:${url}`
    })

    assert.equal(
        options.modelUrlResolver('models/hostile.step', {}),
        'fallback:models/hostile.step'
    )
    assert.equal(
        options.modelUrlResolver('models/hostile.step', {}),
        'fallback:models/hostile.step'
    )
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver ignores accessor-backed session arrays', () => {
    let getterCalls = 0
    const sessionAssets = []
    Object.defineProperty(sessionAssets, '0', {
        enumerable: true,
        get() {
            getterCalls += 1
            return { relativePath: 'models/hostile.step' }
        }
    })
    sessionAssets.length = 1

    const options = CircuitJsonCadModelAssetResolver.withSessionAssetResolver({
        sessionAssets,
        modelUrlResolver: (url) => `fallback:${url}`
    })

    assert.equal(
        options.modelUrlResolver('models/hostile.step', {}),
        'fallback:models/hostile.step'
    )
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver reads options without invoking accessors', () => {
    let getterCalls = 0
    const options = {
        projectBaseUrl: '/assets/'
    }
    Object.defineProperty(options, 'sessionAssets', {
        enumerable: true,
        get() {
            getterCalls += 1
            return [{ relativePath: 'models/hostile.step' }]
        }
    })
    Object.defineProperty(options, 'modelUrlResolver', {
        enumerable: true,
        get() {
            getterCalls += 1
            return () => 'unsafe'
        }
    })

    const resolved =
        CircuitJsonCadModelAssetResolver.withSessionAssetResolver(options)

    assert.equal(resolved.projectBaseUrl, '/assets/')
    assert.equal(resolved.modelUrlResolver('models/missing.step', {}), null)
    assert.equal(getterCalls, 0)
})

test('CircuitJsonCadModelAssetResolver safely defaults descriptor-hostile option proxies', () => {
    let getterCalls = 0
    const options = new Proxy(
        {},
        {
            get() {
                getterCalls += 1
                throw new Error('property access is forbidden')
            },
            ownKeys() {
                throw new Error('descriptor enumeration is forbidden')
            }
        }
    )

    const resolved =
        CircuitJsonCadModelAssetResolver.withSessionAssetResolver(options)

    assert.equal(resolved.modelUrlResolver('models/missing.step', {}), null)
    assert.equal(getterCalls, 0)
})
