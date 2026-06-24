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
        ['CK-6.35-636-6P.step', 'CONN-HEADER.wrl', 'SENSOR-MODULE.glb']
    )

    const archive = unzipSync(result.archiveBytes)
    assert.deepEqual(Object.keys(archive).sort(), [
        'CK-6.35-636-6P.step',
        'CONN-HEADER.wrl',
        'SENSOR-MODULE.glb'
    ])
    assert.match(
        new TextDecoder().decode(archive['CK-6.35-636-6P.step']),
        /ISO-10303-21/
    )
    assert.match(new TextDecoder().decode(archive['CONN-HEADER.wrl']), /#VRML/)
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
        ['SOIC-8.step', 'SOIC-8--2.step']
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
        ['CON-6.35-YKB21-5012SN.step']
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
        ['XO1--2.step', 'XO1.step', 'stitched-components/XO1.step']
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
        ['XO1.step']
    )
    assert.equal(result.skippedEntries.length, 1)
    assert.equal(result.skippedEntries[0].designator, 'XO1')
    assert.match(result.skippedEntries[0].reason, /mesh conversion unavailable/)

    const archive = unzipSync(result.archiveBytes)
    assert.deepEqual(Object.keys(archive), ['XO1.step'])
})
