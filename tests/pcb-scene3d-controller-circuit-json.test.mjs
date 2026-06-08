import assert from 'node:assert/strict'
import test from 'node:test'
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

test('PcbScene3dController mounts serialized CircuitJSON without buildScene', async () => {
    const rootNode = new CircuitJsonSceneRootFake()
    const viewportNode = new CircuitJsonViewportFake(rootNode)
    const mountedScenes = []
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

    assert.equal(
        PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(circuitJson),
        true
    )
    assert.equal(mountedScenes.length, 1)
    assert.equal(mountedScenes[0].sourceFormat, 'circuitjson')

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
