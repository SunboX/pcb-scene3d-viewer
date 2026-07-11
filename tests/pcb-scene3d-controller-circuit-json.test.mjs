import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentResult } from 'circuitjson-toolkit/parser'
import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dController } from '../src/PcbScene3dController.mjs'

/**
 * Minimal scene root for direct CircuitJSON controller tests.
 */
class CircuitJsonSceneRootFake {
    constructor() {
        this.diagnosticsNode = { textContent: '' }
        this.selectionNode = { innerHTML: '' }
    }

    /**
     * @param {string} selector CSS selector.
     * @returns {object | null}
     */
    querySelector(selector) {
        if (selector === '.scene-3d__diagnostics') {
            return this.diagnosticsNode
        }
        if (selector === '.scene-3d__selection') {
            return this.selectionNode
        }
        return null
    }

    /**
     * @returns {object[]}
     */
    querySelectorAll() {
        return []
    }
}

/**
 * Minimal viewport for direct CircuitJSON controller tests.
 */
class CircuitJsonViewportFake {
    /**
     * @param {CircuitJsonSceneRootFake} rootNode Scene root.
     */
    constructor(rootNode) {
        this.rootNode = rootNode
    }

    /**
     * @returns {CircuitJsonSceneRootFake}
     */
    closest() {
        return this.rootNode
    }
}

/**
 * Builds one runtime-ready host scene marker.
 * @param {string} sourceFormat Source marker.
 * @returns {object}
 */
function createHostScene(sourceFormat) {
    return {
        sourceFormat,
        board: {
            widthMil: 10,
            heightMil: 5,
            thicknessMil: 1,
            minX: 0,
            minY: 0,
            centerX: 5,
            centerY: 2.5,
            segments: []
        },
        components: [],
        externalPlacements: [],
        detail: {}
    }
}

/**
 * Builds a minimal canonical board document.
 * @param {object[]} [extraModel] Extra CircuitJSON rows.
 * @returns {object}
 */
function createCanonicalDocument(extraModel = []) {
    return DocumentResult.createValidated({
        model: [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 10,
                height: 5
            },
            ...extraModel
        ]
    })
}

/**
 * Lets controller startup promise continuations settle.
 * @returns {Promise<void>}
 */
async function settleController() {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}

test('PcbScene3dController mounts serialized CircuitJSON without buildScene', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    const modelLoaderOptions = { allowNetworkModelFetch: true }
    const circuitJson = [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 10,
            height: 5
        }
    ]

    const controller = new PcbScene3dController(viewportNode, circuitJson, {
        modelLoaderOptions,
        createRuntime: (_viewportNode, sceneDescription, hooks) => {
            mountedScenes.push(sceneDescription)
            assert.equal(hooks.modelLoaderOptions, modelLoaderOptions)
            return {
                whenReady: () => Promise.resolve(),
                dispose() {}
            }
        }
    })

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(
        PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(circuitJson),
        true
    )
    assert.equal(mountedScenes.length, 1)
    assert.equal(mountedScenes[0].sourceFormat, 'circuitjson')

    controller.dispose()
})

test('PcbScene3dController mounts a canonical document envelope without buildScene', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    const document = DocumentResult.createValidated({
        model: [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 10,
                height: 5
            }
        ],
        source: {
            format: 'gerber',
            fileName: 'contract.gbr',
            fileType: 'gbr'
        }
    })

    const controller = new PcbScene3dController(viewportNode, document, {
        buildScene: () => {
            throw new Error('Canonical documents must bypass native builders.')
        },
        createRuntime: (_viewportNode, sceneDescription) => {
            mountedScenes.push(sceneDescription)
            return {
                whenReady: () => Promise.resolve(),
                dispose() {}
            }
        }
    })

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(mountedScenes.length, 1)
    assert.equal(mountedScenes[0].sourceFormat, 'circuitjson')
    controller.dispose()
})

test('PcbScene3dController honors a host scene description before canonical fallback', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    const hostScene = createHostScene('host-description')
    const controller = new PcbScene3dController(
        viewportNode,
        createCanonicalDocument(),
        {
            sceneDescription: hostScene,
            scenePrepClient: {
                prepareScene() {
                    throw new Error('Explicit scene description must win.')
                }
            },
            createRuntime: (_viewportNode, sceneDescription) => {
                mountedScenes.push(sceneDescription)
                return { whenReady: () => Promise.resolve(), dispose() {} }
            }
        }
    )

    await settleController()

    assert.equal(mountedScenes[0].sourceFormat, 'host-description')
    controller.dispose()
})

test('PcbScene3dController honors scene preparation before canonical fallback', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    let prepCalls = 0
    const controller = new PcbScene3dController(
        viewportNode,
        createCanonicalDocument(),
        {
            scenePrepClient: {
                async prepareScene() {
                    prepCalls += 1
                    return createHostScene('host-prepared')
                }
            },
            buildScene() {
                throw new Error('Worker scene preparation must win.')
            },
            createRuntime: (_viewportNode, sceneDescription) => {
                mountedScenes.push(sceneDescription)
                return { whenReady: () => Promise.resolve(), dispose() {} }
            }
        }
    )

    await settleController()

    assert.equal(prepCalls, 1)
    assert.equal(mountedScenes[0].sourceFormat, 'host-prepared')
    controller.dispose()
})

test('PcbScene3dController forwards assets and adapter options on canonical prep fallback', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    const sessionAsset = {
        relativePath: 'models/session.wrl',
        bytes: new TextEncoder().encode('#VRML V2.0 utf8')
    }
    const document = createCanonicalDocument([
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1',
            ftype: 'simple_chip'
        },
        {
            type: 'source_component',
            source_component_id: 'source_u2',
            name: 'U2',
            ftype: 'simple_chip'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 1, y: 1 },
            layer: 'top',
            rotation: 0,
            width: 1,
            height: 1
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u2',
            source_component_id: 'source_u2',
            center: { x: 2, y: 1 },
            layer: 'top',
            rotation: 0,
            width: 1,
            height: 1
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u1',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            position: { x: 1, y: 1, z: 0.8 },
            model_asset: {
                mimetype: 'model/vrml',
                project_relative_path: 'models/session.wrl',
                url: 'models/session.wrl'
            }
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u2',
            pcb_component_id: 'pcb_u2',
            source_component_id: 'source_u2',
            position: { x: 2, y: 1, z: 0.8 },
            model_step_url: 'models/options.step'
        }
    ])
    const controller = new PcbScene3dController(viewportNode, document, {
        sessionAssets: [sessionAsset],
        scenePrepClient: {
            async prepareScene(_document, assets) {
                assert.equal(assets[0], sessionAsset)
                throw new Error('worker unavailable')
            }
        },
        modelUrlResolver(url) {
            return { optionWasForwarded: url === 'models/options.step' }
        },
        createRuntime: (_viewportNode, sceneDescription) => {
            mountedScenes.push(sceneDescription)
            return { whenReady: () => Promise.resolve(), dispose() {} }
        }
    })

    await settleController()

    assert.equal(mountedScenes.length, 1)
    assert.deepEqual(
        mountedScenes[0].externalPlacements[0].externalModel.bytes,
        sessionAsset.bytes
    )
    assert.equal(
        mountedScenes[0].externalPlacements[1].externalModel.optionWasForwarded,
        true
    )
    controller.dispose()
})

test('PcbScene3dController keeps parser-compatible arrays on the scene builder path', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
    const documentModel = [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            width: 10,
            height: 5
        }
    ]
    documentModel.kind = 'pcb'
    documentModel.fileName = 'board.PcbDoc'
    documentModel.pcb = {
        embeddedModels: [{ name: 'package.step' }]
    }

    const controller = new PcbScene3dController(viewportNode, documentModel, {
        buildScene: (nextDocumentModel) => {
            assert.equal(nextDocumentModel, documentModel)
            return {
                sourceFormat: 'altium',
                board: {
                    widthMil: 10,
                    heightMil: 5,
                    thicknessMil: 1,
                    minX: 0,
                    minY: 0,
                    centerX: 5,
                    centerY: 2.5,
                    segments: []
                },
                components: [],
                externalPlacements: [
                    {
                        designator: 'U1',
                        externalModel: { name: 'package.step' }
                    }
                ],
                detail: {}
            }
        },
        createRuntime: (_viewportNode, sceneDescription) => {
            mountedScenes.push(sceneDescription)
            return {
                whenReady: () => Promise.resolve(),
                dispose() {}
            }
        }
    })

    await Promise.resolve()
    await Promise.resolve()

    assert.equal(mountedScenes.length, 1)
    assert.equal(mountedScenes[0].sourceFormat, 'altium')
    assert.equal(mountedScenes[0].externalPlacements.length, 1)

    controller.dispose()
})
