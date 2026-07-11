import assert from 'node:assert/strict'
import test from 'node:test'

import { DocumentResult, ToolkitAsset } from 'circuitjson-toolkit/parser'
import * as THREE from 'three'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dExternalModelGroupLoader } from '../src/PcbScene3dExternalModelGroupLoader.mjs'

/**
 * Builds a canonical document containing one asset-backed WRL component.
 * @returns {object} Canonical CircuitJSON document.
 */
function createWrlDocument() {
    return DocumentResult.createValidated({
        model: [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_wrl_1',
                center: { x: 0, y: 0 },
                width: 20,
                height: 10,
                thickness: 1.6
            },
            {
                type: 'source_component',
                source_component_id: 'source_wrl_1',
                name: 'J1',
                ftype: 'simple_connector'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_wrl_1',
                source_component_id: 'source_wrl_1',
                center: { x: 0, y: 0 },
                layer: 'top',
                rotation: 0,
                width: 2,
                height: 1
            },
            {
                type: 'cad_component',
                cad_component_id: 'cad_wrl_1',
                pcb_component_id: 'pcb_wrl_1',
                source_component_id: 'source_wrl_1',
                position: { x: 0, y: 0, z: 0.8 },
                model_asset: {
                    mimetype: 'model/vrml',
                    project_relative_path: 'models/body.wrl',
                    url: 'models/body.wrl'
                }
            }
        ],
        assets: [
            ToolkitAsset.create({
                kind: 'model3d',
                name: 'body.wrl',
                mediaType: 'model/vrml',
                data: new TextEncoder().encode('#VRML V2.0 utf8\nGroup {}'),
                source: { projectRelativePath: 'models/body.wrl' }
            })
        ]
    })
}

/**
 * Builds one embedded-buffer GLTF triangle document.
 * @returns {object} GLTF JSON document.
 */
function createTriangleGltf() {
    const bytes = createTriangleBinaryBytes()
    return {
        asset: { version: '2.0' },
        buffers: [
            {
                byteLength: bytes.byteLength,
                uri:
                    'data:application/octet-stream;base64,' +
                    Buffer.from(bytes).toString('base64')
            }
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 6 }
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: 3,
                type: 'VEC3'
            },
            {
                bufferView: 1,
                componentType: 5123,
                count: 3,
                type: 'SCALAR'
            }
        ],
        meshes: [
            {
                primitives: [
                    { attributes: { POSITION: 0 }, indices: 1, mode: 4 }
                ]
            }
        ],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0
    }
}

/**
 * Builds packed positions and indices for one triangle.
 * @returns {Uint8Array} Packed binary buffer.
 */
function createTriangleBinaryBytes() {
    const bytes = new Uint8Array(44)
    new Float32Array(bytes.buffer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
    new Uint16Array(bytes.buffer, 36, 3).set([0, 1, 2])
    return bytes
}

/**
 * Builds one valid binary GLB triangle.
 * @returns {Uint8Array} GLB bytes.
 */
function createTriangleGlb() {
    const gltf = createTriangleGltf()
    delete gltf.buffers[0].uri
    const jsonSource = JSON.stringify(gltf)
    const jsonLength = Math.ceil(jsonSource.length / 4) * 4
    const jsonBytes = new TextEncoder().encode(
        jsonSource.padEnd(jsonLength, ' ')
    )
    const binaryBytes = createTriangleBinaryBytes()
    const totalLength =
        12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength
    const bytes = new Uint8Array(totalLength)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, totalLength, true)
    view.setUint32(12, jsonBytes.byteLength, true)
    view.setUint32(16, 0x4e4f534a, true)
    bytes.set(jsonBytes, 20)
    const binaryHeader = 20 + jsonBytes.byteLength
    view.setUint32(binaryHeader, binaryBytes.byteLength, true)
    view.setUint32(binaryHeader + 4, 0x004e4942, true)
    bytes.set(binaryBytes, binaryHeader + 8)
    return bytes
}

test('PcbScene3dExternalModelGroupLoader parses canonical WRL asset bytes live', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build(createWrlDocument())
    const model = scene.externalPlacements[0].externalModel
    const loadedGroup = { type: 'parsed-vrml' }
    const parseCalls = []

    const result = await PcbScene3dExternalModelGroupLoader.load(
        {},
        model,
        null,
        '',
        {
            createVrmlLoader() {
                return {
                    parse(text, path) {
                        parseCalls.push({ text, path })
                        return loadedGroup
                    }
                }
            }
        }
    )

    assert.equal(model.format, 'wrl')
    assert.deepEqual(result, loadedGroup)
    assert.deepEqual(parseCalls, [
        {
            text: '#VRML V2.0 utf8\nGroup {}',
            path: ''
        }
    ])
})

test('PcbScene3dExternalModelGroupLoader accepts WRL source shape parity', async () => {
    const payload = '#VRML V2.0 utf8\nGroup {}'
    const bytes = new TextEncoder().encode(payload)
    const sources = [
        { payloadText: payload },
        { payloadBytes: bytes },
        { bytes },
        { data: bytes },
        { file: new Blob([bytes], { type: 'model/vrml' }) }
    ]

    for (const source of sources) {
        const parsed = await PcbScene3dExternalModelGroupLoader.load(
            {},
            { format: 'wrl', name: 'body.wrl', ...source },
            null,
            '',
            {
                createVrmlLoader: () => ({
                    parse: (text) => text
                })
            }
        )
        assert.equal(parsed, payload)
    }
})

test('PcbScene3dExternalModelGroupLoader blocks implicit WRL texture networking', async () => {
    const parseCalls = []
    await PcbScene3dExternalModelGroupLoader.load(
        {},
        {
            format: 'wrl',
            name: 'body.wrl',
            payloadText: `
#VRML V2.0 utf8
Shape {
  appearance Appearance {
    texture ImageTexture { url ["https://assets.invalid/private.png"] }
  }
}`
        },
        null,
        '',
        {
            createVrmlLoader: () => ({
                parse(text, path) {
                    parseCalls.push({ text, path })
                    return { type: 'wrl-group' }
                }
            })
        }
    )

    assert.equal(parseCalls.length, 1)
    assert.equal(parseCalls[0].text.includes('https://assets.invalid'), false)
    assert.equal(parseCalls[0].text.includes('data:,'), true)
    assert.equal(parseCalls[0].path, '')
})

test('PcbScene3dExternalModelGroupLoader safely ignores hostile WRL resource collections', async () => {
    const resources = new Proxy(
        {},
        {
            ownKeys() {
                throw new Error('resource enumeration is forbidden')
            }
        }
    )
    let parsedText = ''
    await PcbScene3dExternalModelGroupLoader.load(
        {},
        {
            format: 'wrl',
            payloadText:
                'ImageTexture { url ["https://assets.invalid/private.png"] }',
            resources
        },
        null,
        '',
        {
            createVrmlLoader: () => ({
                parse(text) {
                    parsedText = text
                    return { type: 'wrl-group' }
                }
            })
        }
    )

    assert.equal(parsedText.includes('https://assets.invalid'), false)
    assert.equal(parsedText.includes('data:,'), true)
})

test('PcbScene3dExternalModelGroupLoader embeds local WRL texture resources', async () => {
    let parsedText = ''
    await PcbScene3dExternalModelGroupLoader.load(
        {},
        {
            format: 'wrl',
            name: 'body.wrl',
            relativePath: 'models/body.wrl',
            payloadText: `
#VRML V2.0 utf8
Shape {
  appearance Appearance {
    texture ImageTexture { url ["textures/body.png"] }
  }
}`,
            resources: [
                {
                    uri: 'textures/body.png',
                    source: {
                        projectRelativePath: 'models/textures/body.png'
                    },
                    data: new Uint8Array([1, 2, 3])
                }
            ]
        },
        null,
        '',
        {
            createVrmlLoader: () => ({
                parse(text) {
                    parsedText = text
                    return { type: 'wrl-group' }
                }
            })
        }
    )

    assert.equal(parsedText.includes('data:image/png;base64,AQID'), true)
})

test('PcbScene3dExternalModelGroupLoader fetches WRL textures only through explicit policy', async () => {
    const fetchCalls = []
    let parsedText = ''
    await PcbScene3dExternalModelGroupLoader.load(
        {},
        {
            format: 'wrl',
            name: 'body.wrl',
            resolvedUrl: 'https://assets.invalid/models/body.wrl',
            payloadText: `
#VRML V2.0 utf8
Shape {
  appearance Appearance {
    texture ImageTexture { url ["textures/body.png"] }
  }
}`
        },
        null,
        '',
        {
            async fetch(url) {
                fetchCalls.push(url)
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
                }
            },
            createVrmlLoader: () => ({
                parse(text) {
                    parsedText = text
                    return { type: 'wrl-group' }
                }
            })
        }
    )

    assert.deepEqual(fetchCalls, [
        'https://assets.invalid/models/textures/body.png'
    ])
    assert.equal(parsedText.includes('data:image/png;base64,BAUG'), true)
})

test('PcbScene3dExternalModelGroupLoader withholds static auth from cross-origin WRL textures', async () => {
    const calls = []
    await PcbScene3dExternalModelGroupLoader.load(
        {},
        {
            format: 'wrl',
            resolvedUrl: 'https://trusted.invalid/models/body.wrl',
            payloadText: 'ImageTexture { url "https://other.invalid/body.png" }'
        },
        null,
        '',
        {
            authHeaders: { Authorization: 'Bearer private-token' },
            async fetch(url, options) {
                calls.push({ url, headers: options.headers })
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([1]).buffer
                }
            },
            createVrmlLoader: () => ({ parse: () => ({}) })
        }
    )

    assert.equal(calls[0].url, 'https://other.invalid/body.png')
    assert.equal(calls[0].headers.Authorization, undefined)
})

test('PcbScene3dExternalModelGroupLoader shares resource limits across WRL textures', async () => {
    await assert.rejects(
        PcbScene3dExternalModelGroupLoader.load(
            {},
            {
                format: 'wrl',
                resolvedUrl: 'https://assets.invalid/models/body.wrl',
                payloadText: `
#VRML V2.0 utf8
Shape { appearance Appearance { texture ImageTexture { url "a.png" } } }
Shape { appearance Appearance { texture ImageTexture { url "b.png" } } }`
            },
            null,
            '',
            {
                maxModelResources: 1,
                async fetch() {
                    return {
                        ok: true,
                        arrayBuffer: async () => new Uint8Array([1]).buffer
                    }
                },
                createVrmlLoader: () => ({ parse: () => ({}) })
            }
        ),
        /maximum model resource count of 1/u
    )
})

test('PcbScene3dExternalModelGroupLoader loads every advertised faceted format', async () => {
    const encoder = new TextEncoder()
    const triangleText = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3`
    const stlText = `
solid triangle
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid triangle`
    const models = [
        {
            format: 'stl',
            name: 'triangle.stl',
            data: encoder.encode(stlText)
        },
        {
            format: 'obj',
            name: 'triangle.obj',
            file: new Blob([triangleText])
        },
        {
            format: 'gltf',
            name: 'triangle.gltf',
            data: encoder.encode(JSON.stringify(createTriangleGltf()))
        },
        {
            format: 'glb',
            name: 'triangle.glb',
            data: createTriangleGlb()
        }
    ]

    for (const model of models) {
        const group = await PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            null
        )
        assert.equal(group.children.length > 0, true, model.format)
        assert.equal(
            group.children[0].geometry.getAttribute('position').count,
            3,
            model.format
        )
    }
})

test('PcbScene3dExternalModelGroupLoader loads 3MF bytes through Three.js', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const scaleCalls = []
    const group = {
        scale: {
            setScalar(value) {
                scaleCalls.push(value)
            }
        }
    }
    let parsedBytes = null

    const result = await PcbScene3dExternalModelGroupLoader.load(
        THREE,
        { format: '3mf', name: 'body.3mf', data: bytes },
        null,
        '',
        {
            createModelLoader(format) {
                assert.equal(format, '3mf')
                return {
                    parse(buffer) {
                        parsedBytes = new Uint8Array(buffer)
                        return group
                    }
                }
            }
        }
    )

    assert.equal(result, group)
    assert.deepEqual(parsedBytes, bytes)
    assert.deepEqual(scaleCalls, [1000 / 25.4])
})

test('PcbScene3dExternalModelGroupLoader loads opted-in model URLs', async () => {
    const fetchCalls = []
    const group = await PcbScene3dExternalModelGroupLoader.load(
        THREE,
        {
            format: 'obj',
            name: 'remote.obj',
            resolvedUrl: 'https://assets.invalid/models/remote.obj'
        },
        null,
        '',
        {
            authHeaders: { Authorization: 'Bearer fake-token' },
            async fetch(url, options) {
                fetchCalls.push({ url, options })
                return {
                    ok: true,
                    text: async () => `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3`
                }
            }
        }
    )

    assert.equal(group.children.length, 1)
    assert.equal(fetchCalls.length, 1)
    assert.equal(fetchCalls[0].url, 'https://assets.invalid/models/remote.obj')
    assert.equal(
        fetchCalls[0].options.headers.Authorization,
        'Bearer fake-token'
    )
})

test('PcbScene3dExternalModelGroupLoader gives STEP bytes, files, and URLs equal runtime paths', async () => {
    const loadedModels = []
    const fetchedBytes = new Uint8Array([7, 8, 9])
    const stepLoader = {
        async loadModel(model) {
            loadedModels.push(model)
            return {
                meshPayloads: [
                    {
                        name: 'step-triangle',
                        color: [0.2, 0.3, 0.4],
                        positions: [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0],
                        normals: [],
                        indices: [0, 1, 2],
                        faceColors: []
                    }
                ]
            }
        }
    }
    const file = new Blob([new Uint8Array([4, 5, 6])])
    const models = [
        { format: 'step', name: 'bytes.step', data: new Uint8Array([1, 2, 3]) },
        { format: 'step', name: 'file.step', file },
        {
            format: 'step',
            name: 'url.step',
            resolvedUrl: 'https://assets.invalid/url.step'
        }
    ]

    for (const model of models) {
        const group = await PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            stepLoader,
            '',
            {
                fetch: async () => ({
                    ok: true,
                    arrayBuffer: async () => fetchedBytes.buffer
                })
            }
        )
        assert.equal(group.children.length, 1)
    }

    assert.deepEqual(loadedModels[0].data, new Uint8Array([1, 2, 3]))
    assert.equal(loadedModels[1].file, file)
    assert.deepEqual(loadedModels[2].payloadBytes, fetchedBytes)
})

/**
 * Creates injected loader dependencies for one externally fetched format.
 * @param {string} format External model format.
 * @returns {{ stepLoader: object | null, runtime: object }} Loader dependencies.
 */
function createFetchedFormatDependencies(format) {
    if (format === 'step') {
        return {
            stepLoader: {
                async loadModel() {
                    return { meshPayloads: [] }
                }
            },
            runtime: {}
        }
    }
    if (format === 'wrl') {
        return {
            stepLoader: null,
            runtime: {
                createModelLoader() {
                    return { parse: () => ({ type: 'wrl-group' }) }
                }
            }
        }
    }
    return {
        stepLoader: null,
        runtime: {
            createModelLoader() {
                return {
                    parse: () => ({ scale: { setScalar() {} } })
                }
            }
        }
    }
}

test('PcbScene3dExternalModelGroupLoader shares supplied URL caches across STEP, WRL, and 3MF', async () => {
    for (const format of ['step', 'wrl', '3mf']) {
        const modelCache = new Map()
        const fetchCalls = []
        const dependencies = createFetchedFormatDependencies(format)
        const runtime = {
            ...dependencies.runtime,
            modelCache,
            async fetch(url) {
                fetchCalls.push(url)
                return {
                    ok: true,
                    arrayBuffer: async () =>
                        new TextEncoder().encode('#VRML V2.0 utf8\nGroup {}')
                            .buffer
                }
            }
        }
        const model = {
            format,
            name: 'remote.' + format,
            source: { projectRelativePath: 'models/remote.' + format },
            resolvedUrl: 'https://assets.invalid/models/remote.' + format
        }

        await PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            dependencies.stepLoader,
            '',
            runtime
        )
        await PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            dependencies.stepLoader,
            '',
            runtime
        )

        assert.equal(fetchCalls.length, 1, format)
    }
})

test('PcbScene3dExternalModelGroupLoader evicts rejected STEP, WRL, and 3MF cache entries', async () => {
    for (const format of ['step', 'wrl', '3mf']) {
        const modelCache = new Map()
        const dependencies = createFetchedFormatDependencies(format)
        let fetchCalls = 0
        const runtime = {
            ...dependencies.runtime,
            modelCache,
            async fetch() {
                fetchCalls += 1
                if (fetchCalls === 1) throw new Error('temporary failure')
                return {
                    ok: true,
                    arrayBuffer: async () =>
                        new TextEncoder().encode('#VRML V2.0 utf8\nGroup {}')
                            .buffer
                }
            }
        }
        const model = {
            format,
            name: 'retry.' + format,
            source: { projectRelativePath: 'models/retry.' + format },
            resolvedUrl: 'https://assets.invalid/models/retry.' + format
        }

        await assert.rejects(
            PcbScene3dExternalModelGroupLoader.load(
                THREE,
                model,
                dependencies.stepLoader,
                '',
                runtime
            ),
            /temporary failure/u,
            format
        )
        await PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            dependencies.stepLoader,
            '',
            runtime
        )

        assert.equal(fetchCalls, 2, format)
    }
})
