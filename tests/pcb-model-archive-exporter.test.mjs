import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync } from 'fflate'
import { PcbModelArchiveExporter } from '../src/PcbModelArchiveExporter.mjs'

/**
 * Verifies the model archive exporter builds one ZIP from embedded STEP text
 * and companion session assets while deduplicating repeated pattern/model
 * pairs.
 */
test('PcbModelArchiveExporter builds a deduplicated archive from resolved model placements', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'forge-demo',
        sceneDescription: {
            components: [
                {
                    designator: 'J16',
                    pattern: 'CK-6.35-636-6P'
                },
                {
                    designator: 'J15',
                    pattern: 'CK-6.35-636-6P'
                },
                {
                    designator: 'P1',
                    pattern: 'CONN-HEADER',
                    externalModel: {
                        origin: 'session',
                        name: 'connector.wrl',
                        relativePath: 'models/connector.wrl',
                        format: 'wrl',
                        file: new Blob(['#VRML V2.0 utf8'])
                    }
                },
                {
                    designator: 'P2',
                    pattern: 'CONN-HEADER',
                    externalModel: {
                        origin: 'session',
                        name: 'connector.wrl',
                        relativePath: 'models/connector.wrl',
                        format: 'wrl',
                        file: new Blob(['#VRML V2.0 utf8'])
                    }
                },
                {
                    designator: 'U3',
                    pattern: 'SENSOR-MODULE',
                    externalModel: {
                        origin: 'session',
                        name: 'sensor.glb',
                        relativePath: 'models/sensor.glb',
                        format: 'glb',
                        file: new Blob([new Uint8Array([1, 2, 3, 4])])
                    }
                }
            ],
            externalPlacements: [
                {
                    designator: 'J16',
                    externalModel: {
                        origin: 'embedded',
                        name: 'ck_636_6p.stp',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nEND-ISO-10303-21;',
                        sourceStream: 'Models/1'
                    }
                },
                {
                    designator: 'J15',
                    externalModel: {
                        origin: 'embedded',
                        name: 'ck_636_6p.stp',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nEND-ISO-10303-21;',
                        sourceStream: 'Models/1'
                    }
                }
            ]
        }
    })

    assert.equal(result.archiveName, 'forge-demo-models.zip')
    assert.equal(result.exportedEntries.length, 3)
    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath).sort(),
        [
            'CK-6.35-636-6P/ck_636_6p.stp',
            'CONN-HEADER/connector.wrl',
            'SENSOR-MODULE/sensor.glb'
        ]
    )

    const archive = unzipSync(result.archiveBytes)
    assert.deepEqual(Object.keys(archive).sort(), [
        'CK-6.35-636-6P/ck_636_6p.stp',
        'CONN-HEADER/connector.wrl',
        'SENSOR-MODULE/sensor.glb'
    ])
    assert.match(
        new TextDecoder().decode(archive['CK-6.35-636-6P/ck_636_6p.stp']),
        /ISO-10303-21/
    )
    assert.match(
        new TextDecoder().decode(archive['CONN-HEADER/connector.wrl']),
        /#VRML/
    )
})

/**
 * Verifies repeated footprint patterns with distinct resolved models receive
 * deterministic archive suffixes instead of overwriting one another.
 */
test('PcbModelArchiveExporter suffixes archive names when one pattern resolves to multiple models', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'forge-demo',
        sceneDescription: {
            components: [
                {
                    designator: 'U1',
                    pattern: 'SOIC-8'
                },
                {
                    designator: 'U2',
                    pattern: 'SOIC-8'
                }
            ],
            externalPlacements: [
                {
                    designator: 'U1',
                    externalModel: {
                        origin: 'embedded',
                        name: 'alpha.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nALPHA',
                        sourceStream: 'Models/10'
                    }
                },
                {
                    designator: 'U2',
                    externalModel: {
                        origin: 'embedded',
                        name: 'beta.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nBETA',
                        sourceStream: 'Models/11'
                    }
                }
            ]
        }
    })

    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath),
        ['SOIC-8/alpha.step', 'SOIC-8--2/beta.step']
    )
})

/**
 * Verifies pattern-derived archive names stay as one safe file path even when
 * the original footprint pattern contains path separators.
 */
test('PcbModelArchiveExporter sanitizes path separators in pattern names', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'forge-demo',
        sceneDescription: {
            components: [
                {
                    designator: 'J25',
                    pattern: 'CON/6.35/YKB21-5012SN',
                    externalModel: {
                        origin: 'session',
                        name: '5012jp.step',
                        relativePath: 'models/5012jp.step',
                        format: 'step',
                        file: new Blob(['ISO-10303-21;'])
                    }
                }
            ]
        }
    })

    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath),
        ['CON-6.35-YKB21-5012SN/5012jp.step']
    )
})

test('PcbModelArchiveExporter preserves every canonical payload shape and model extension', async () => {
    const payloads = [
        {
            pattern: 'TEXT',
            format: 'wrl',
            model: { text: '#VRML V2.0 utf8' },
            expected: '#VRML V2.0 utf8'
        },
        {
            pattern: 'DATA',
            format: 'stl',
            model: { data: 'solid body\nendsolid body' },
            expected: 'solid body\nendsolid body'
        },
        {
            pattern: 'BYTES',
            format: 'obj',
            model: { bytes: new TextEncoder().encode('v 0 0 0') },
            expected: 'v 0 0 0'
        },
        {
            pattern: 'PAYLOAD',
            format: 'gltf',
            model: {
                payloadBytes: new TextEncoder().encode(
                    '{"asset":{"version":"2.0"}}'
                )
            },
            expected: '{"asset":{"version":"2.0"}}'
        },
        {
            pattern: 'FILE',
            format: 'glb',
            model: { file: new Blob([new Uint8Array([1, 2, 3])]) },
            expectedBytes: new Uint8Array([1, 2, 3])
        },
        {
            pattern: 'THREE-MF',
            format: '3mf',
            model: { data: new Uint8Array([0x50, 0x4b, 3, 4]) },
            expectedBytes: new Uint8Array([0x50, 0x4b, 3, 4])
        }
    ]
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'payloads',
        includeStitchedComponents: false,
        sceneDescription: {
            components: payloads.map((entry, index) => ({
                designator: 'X' + (index + 1),
                pattern: entry.pattern,
                externalModel: {
                    format: entry.format,
                    name: entry.pattern.toLowerCase() + '.' + entry.format,
                    source: {
                        projectRelativePath:
                            'models/' +
                            entry.pattern.toLowerCase() +
                            '.' +
                            entry.format
                    },
                    ...entry.model
                }
            }))
        }
    })
    const archive = unzipSync(result.archiveBytes)

    assert.deepEqual(Object.keys(archive).sort(), [
        'BYTES/bytes.obj',
        'DATA/data.stl',
        'FILE/file.glb',
        'PAYLOAD/payload.gltf',
        'TEXT/text.wrl',
        'THREE-MF/three-mf.3mf'
    ])
    payloads.forEach((entry) => {
        const bytes =
            archive[
                entry.pattern +
                    '/' +
                    entry.pattern.toLowerCase() +
                    '.' +
                    entry.format
            ]
        if (entry.expectedBytes) {
            assert.deepEqual(bytes, entry.expectedBytes)
        } else {
            assert.equal(new TextDecoder().decode(bytes), entry.expected)
        }
    })
})

test('PcbModelArchiveExporter preserves source basenames and safe model companions', async () => {
    const gltfText = JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'buffers/body.bin', byteLength: 3 }]
    })
    const objText = 'mtllib materials/body.mtl\nv 0 0 0'
    const wrlText = 'ImageTexture { url "textures/body.png" }'
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'bundles',
        includeStitchedComponents: false,
        sceneDescription: {
            components: [
                {
                    designator: 'U1',
                    pattern: 'GLTF BODY',
                    externalModel: {
                        format: 'gltf',
                        name: 'display-name.gltf',
                        source: {
                            projectRelativePath: 'models/gltf/source-body.gltf'
                        },
                        data: gltfText,
                        externalBuffers: [
                            {
                                uri: 'buffers/body.bin',
                                data: new Uint8Array([1, 2, 3])
                            },
                            {
                                uri: '../unsafe.bin',
                                data: new Uint8Array([9])
                            }
                        ]
                    }
                },
                {
                    designator: 'U2',
                    pattern: 'OBJ BODY',
                    externalModel: {
                        format: 'obj',
                        name: 'source-body.obj',
                        relativePath: 'models/obj/source-body.obj',
                        data: objText,
                        resources: [
                            {
                                uri: 'materials/body.mtl',
                                data: 'newmtl body\nKd 0.1 0.2 0.3'
                            }
                        ]
                    }
                },
                {
                    designator: 'U3',
                    pattern: 'WRL BODY',
                    externalModel: {
                        format: 'wrl',
                        name: 'source-body.wrl',
                        source: {
                            projectRelativePath: 'models/wrl/source-body.wrl'
                        },
                        data: wrlText,
                        resources: [
                            {
                                uri: 'textures/body.png',
                                data: new Uint8Array([7, 8, 9])
                            },
                            {
                                uri: 'https://outside.invalid/private.png',
                                data: new Uint8Array([4])
                            }
                        ]
                    }
                }
            ]
        }
    })
    const archive = unzipSync(result.archiveBytes)

    assert.deepEqual(Object.keys(archive).sort(), [
        'GLTF BODY/buffers/body.bin',
        'GLTF BODY/source-body.gltf',
        'OBJ BODY/materials/body.mtl',
        'OBJ BODY/source-body.obj',
        'WRL BODY/source-body.wrl',
        'WRL BODY/textures/body.png'
    ])
    assert.deepEqual(result.exportedEntries[0].companionPaths, [
        'GLTF BODY/buffers/body.bin'
    ])
    assert.equal(
        new TextDecoder().decode(archive['GLTF BODY/source-body.gltf']),
        gltfText
    )
    assert.deepEqual(
        archive['WRL BODY/textures/body.png'],
        new Uint8Array([7, 8, 9])
    )
})

test('PcbModelArchiveExporter uses explicit model loading policy for resolved URLs', async () => {
    const fetchCalls = []
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'remote',
        includeStitchedComponents: false,
        modelLoaderOptions: {
            authHeaders: { Authorization: 'Bearer fake-token' },
            async fetch(url, options) {
                fetchCalls.push({ url, options })
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer
                }
            }
        },
        sceneDescription: {
            components: [
                {
                    designator: 'U1',
                    pattern: 'REMOTE',
                    externalModel: {
                        format: '3mf',
                        name: 'body.3mf',
                        resolvedUrl: 'https://assets.invalid/body.3mf'
                    }
                }
            ]
        }
    })

    assert.equal(result.exportedEntries[0].archivePath, 'REMOTE/body.3mf')
    assert.deepEqual(
        unzipSync(result.archiveBytes)['REMOTE/body.3mf'],
        new Uint8Array([9, 8, 7])
    )
    assert.equal(fetchCalls[0].url, 'https://assets.invalid/body.3mf')
    assert.equal(
        fetchCalls[0].options.headers.Authorization,
        'Bearer fake-token'
    )
})

test('PcbModelArchiveExporter distinguishes same-basename paths and reuses identical sources', async () => {
    const createModel = (projectRelativePath, text) => ({
        format: 'obj',
        name: 'body.obj',
        source: { projectRelativePath },
        data: text
    })
    const first = createModel('models/a/body.obj', 'v 1 0 0')
    const second = createModel('models/b/body.obj', 'v 2 0 0')
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'identities',
        includeStitchedComponents: false,
        sceneDescription: {
            components: [
                { designator: 'U1', pattern: 'BODY', externalModel: first },
                { designator: 'U2', pattern: 'BODY', externalModel: second },
                { designator: 'U3', pattern: 'BODY', externalModel: first }
            ]
        }
    })
    const archive = unzipSync(result.archiveBytes)

    assert.deepEqual(Object.keys(archive), [
        'BODY/body.obj',
        'BODY--2/body.obj'
    ])
    assert.equal(new TextDecoder().decode(archive['BODY/body.obj']), 'v 1 0 0')
    assert.equal(
        new TextDecoder().decode(archive['BODY--2/body.obj']),
        'v 2 0 0'
    )
})

/**
 * Verifies authored stacked components receive a generated per-component STEP
 * in addition to the raw model files used by the browser scene.
 */
test('PcbModelArchiveExporter adds stitched STEP entries for component stacks', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'stacked-demo',
        modelMeshLoader(placement) {
            return [
                {
                    name: 'child-' + placement.externalModel.name,
                    vertices: [
                        [0, 0, 0],
                        [10, 0, 0],
                        [0, 10, 0],
                        [0, 0, 10]
                    ],
                    faces: [
                        [0, 2, 1],
                        [0, 1, 3],
                        [1, 2, 3],
                        [2, 0, 3]
                    ],
                    color: [0.1, 0.2, 0.3]
                }
            ]
        },
        sceneDescription: {
            staticBodyPlacements: [
                {
                    designator: 'XO1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 100, y: 200, z: 40 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    bodyColor: { rgb: { red: 128, green: 128, blue: 128 } },
                    geometry: {
                        kind: 'extruded-polygon',
                        heightMil: 40,
                        verticesMil: [
                            { x: -50, y: -30 },
                            { x: 50, y: -30 },
                            { x: 50, y: 30 },
                            { x: -50, y: 30 }
                        ]
                    }
                }
            ],
            externalPlacements: [
                {
                    designator: 'XO1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 100, y: 200, z: 20 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    modelTransform: {
                        offsetMil: { x: -20, y: 10, z: 40 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'crystal.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nCRYSTAL',
                        sourceStream: 'Models/crystal'
                    }
                },
                {
                    designator: 'XO1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 100, y: 200, z: 20 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    modelTransform: {
                        offsetMil: { x: 35, y: -15, z: 40 }
                    },
                    externalModel: {
                        origin: 'embedded',
                        name: 'capacitor.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nCAPACITOR',
                        sourceStream: 'Models/capacitor'
                    }
                }
            ]
        }
    })

    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath).sort(),
        [
            'XO1--2/capacitor.step',
            'XO1/crystal.step',
            'stitched-components/XO1.step'
        ]
    )

    const archive = unzipSync(result.archiveBytes)
    const stitchedText = new TextDecoder().decode(
        archive['stitched-components/XO1.step']
    )
    assert.match(stitchedText, /ISO-10303-21/)
    assert.match(stitchedText, /static-XO1/)
    assert.match(stitchedText, /child-crystal\.step/)
    assert.match(stitchedText, /child-capacitor\.step/)
})

/**
 * Verifies callers can request only generated stitched entries for selected
 * designators without exporting the raw source model files.
 */
test('PcbModelArchiveExporter filters stitched entries by selected designator', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'stacked-demo',
        includeRawModels: false,
        stitchedDesignators: ['XO2'],
        modelMeshLoader(placement) {
            return {
                name: 'child-' + placement.externalModel.name,
                vertices: [
                    [0, 0, 0],
                    [10, 0, 0],
                    [0, 10, 0],
                    [0, 0, 10]
                ],
                faces: [
                    [0, 2, 1],
                    [0, 1, 3],
                    [1, 2, 3],
                    [2, 0, 3]
                ]
            }
        },
        sceneDescription: {
            staticBodyPlacements: ['XO1', 'XO2'].map((designator, index) => ({
                designator,
                mountSide: 'top',
                positionMil: { x: index * 100, y: 0, z: 20 },
                coLocatedVariantGroupKey: 'stack:' + designator,
                geometry: {
                    kind: 'extruded-polygon',
                    heightMil: 40,
                    verticesMil: [
                        { x: -10, y: -10 },
                        { x: 10, y: -10 },
                        { x: 10, y: 10 },
                        { x: -10, y: 10 }
                    ]
                }
            })),
            externalPlacements: ['XO1', 'XO2'].map((designator, index) => ({
                designator,
                coLocatedVariantGroupKey: 'stack:' + designator,
                positionMil: { x: index * 100, y: 0, z: 60 },
                externalModel: {
                    origin: 'embedded',
                    name: designator.toLowerCase() + '.step',
                    format: 'step',
                    payloadText: 'ISO-10303-21;\n' + designator,
                    sourceStream: 'Models/' + designator
                }
            }))
        }
    })

    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath),
        ['stitched-components/XO2.step']
    )

    const archive = unzipSync(result.archiveBytes)
    assert.deepEqual(Object.keys(archive), ['stitched-components/XO2.step'])
    assert.match(
        new TextDecoder().decode(archive['stitched-components/XO2.step']),
        /child-xo2\.step/
    )
})

/**
 * Verifies a failed generated stitched model does not prevent the archive from
 * returning the original source model files.
 */
test('PcbModelArchiveExporter skips failed stitched entries without dropping raw models', async () => {
    const result = await PcbModelArchiveExporter.buildArchive({
        archiveBaseName: 'stacked-demo',
        modelMeshLoader() {
            throw new Error('mesh conversion unavailable')
        },
        sceneDescription: {
            staticBodyPlacements: [
                {
                    designator: 'XO1',
                    mountSide: 'top',
                    positionMil: { x: 0, y: 0, z: 20 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    geometry: {
                        kind: 'extruded-polygon',
                        heightMil: 40,
                        verticesMil: [
                            { x: -10, y: -10 },
                            { x: 10, y: -10 },
                            { x: 10, y: 10 },
                            { x: -10, y: 10 }
                        ]
                    }
                }
            ],
            externalPlacements: [
                {
                    designator: 'XO1',
                    coLocatedVariantGroupKey: 'stack:xo',
                    externalModel: {
                        origin: 'embedded',
                        name: 'crystal.step',
                        format: 'step',
                        payloadText: 'ISO-10303-21;\nCRYSTAL',
                        sourceStream: 'Models/crystal'
                    }
                }
            ]
        }
    })

    assert.deepEqual(
        result.exportedEntries.map((entry) => entry.archivePath),
        ['XO1/crystal.step']
    )
    assert.equal(result.skippedEntries.length, 1)
    assert.equal(result.skippedEntries[0].designator, 'XO1')
    assert.match(result.skippedEntries[0].reason, /mesh conversion unavailable/)

    const archive = unzipSync(result.archiveBytes)
    assert.deepEqual(Object.keys(archive), ['XO1/crystal.step'])
})
