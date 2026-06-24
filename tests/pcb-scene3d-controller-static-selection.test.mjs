import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dController } from '../src/PcbScene3dController.mjs'

/**
 * Minimal event target used by the static selection controller test.
 */
class FakeEventTarget {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners = new Map()

    /**
     * @param {string} type Event name.
     * @param {(event: any) => void} listener Event listener.
     * @returns {void}
     */
    addEventListener(type, listener) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, new Set())
        }
        this.#listeners.get(type)?.add(listener)
    }

    /**
     * @param {string} type Event name.
     * @param {(event: any) => void} listener Event listener.
     * @returns {void}
     */
    removeEventListener(type, listener) {
        this.#listeners.get(type)?.delete(listener)
    }
}

/**
 * Minimal scene control button.
 */
class FakeButton extends FakeEventTarget {
    /** @type {Record<string, string>} */
    dataset

    /** @type {{ add: () => void, remove: () => void }} */
    classList = { add() {}, remove() {} }

    /** @type {Map<string, string>} */
    #attributes

    /**
     * @param {string} preset Preset name.
     */
    constructor(preset) {
        super()
        this.dataset = { 'scene-3dPreset': preset }
        this.#attributes = new Map([['data-scene-3d-preset', preset]])
    }

    /**
     * @param {string} name Attribute name.
     * @returns {string | null}
     */
    getAttribute(name) {
        return this.#attributes.get(name) || null
    }

    /**
     * @param {string} name Attribute name.
     * @param {string} value Attribute value.
     * @returns {void}
     */
    setAttribute(name, value) {
        this.#attributes.set(name, String(value))
    }
}

/**
 * Minimal scene toggle.
 */
class FakeToggle extends FakeEventTarget {
    /** @type {Record<string, string>} */
    dataset = { 'scene-3dToggle': 'external-models' }

    /** @type {boolean} */
    checked = true

    /**
     * @param {string} name Attribute name.
     * @returns {string | null}
     */
    getAttribute(name) {
        return name === 'data-scene-3d-toggle' ? 'external-models' : null
    }
}

/**
 * Minimal export button.
 */
class FakeExportButton extends FakeEventTarget {
    /**
     * @param {string} name Attribute name.
     * @returns {string | null}
     */
    getAttribute(name) {
        return name === 'data-scene-3d-export' ? 'models-zip' : null
    }
}

/**
 * Minimal text node.
 */
class FakeTextNode {
    /** @type {string} */
    textContent = ''
}

/**
 * Minimal inspector node.
 */
class FakeSelectionNode extends FakeEventTarget {
    /** @type {string} */
    textContent = ''

    /** @type {string} */
    #innerHTML = ''

    /**
     * @param {string} value Markup.
     */
    set innerHTML(value) {
        this.#innerHTML = String(value)
        this.textContent = this.#innerHTML.replace(/<[^>]+>/g, ' ').trim()
    }

    /**
     * @returns {string}
     */
    get innerHTML() {
        return this.#innerHTML
    }
}

/**
 * Minimal scene root node.
 */
class FakeSceneRootNode {
    /** @type {FakeButton[]} */
    #buttons = [
        new FakeButton('top'),
        new FakeButton('bottom'),
        new FakeButton('isometric')
    ]

    /** @type {FakeToggle[]} */
    #toggles = [new FakeToggle()]

    /** @type {FakeExportButton} */
    #exportButton = new FakeExportButton()

    /** @type {FakeTextNode} */
    #diagnosticsNode = new FakeTextNode()

    /** @type {FakeSelectionNode} */
    #selectionNode = new FakeSelectionNode()

    /**
     * @param {string} selector Selector.
     * @returns {any[]}
     */
    querySelectorAll(selector) {
        if (selector === '[data-scene-3d-preset]') return this.#buttons
        if (selector === '[data-scene-3d-toggle]') return this.#toggles
        return []
    }

    /**
     * @param {string} selector Selector.
     * @returns {any | null}
     */
    querySelector(selector) {
        if (selector === '.scene-3d__diagnostics') {
            return this.#diagnosticsNode
        }
        if (selector === '.scene-3d__selection') {
            return this.#selectionNode
        }
        if (selector === '[data-scene-3d-export="models-zip"]') {
            return this.#exportButton
        }
        return null
    }

    /**
     * @returns {FakeSelectionNode}
     */
    getSelectionNode() {
        return this.#selectionNode
    }
}

/**
 * Minimal viewport node.
 */
class FakeViewportNode {
    /** @type {FakeSceneRootNode} */
    #rootNode

    /**
     * @param {FakeSceneRootNode} rootNode Scene root.
     */
    constructor(rootNode) {
        this.#rootNode = rootNode
    }

    /**
     * @param {string} selector Selector.
     * @returns {FakeSceneRootNode | null}
     */
    closest(selector) {
        return selector === '.scene-3d' ? this.#rootNode : null
    }
}

test('PcbScene3dController resolves static body selections by selection key', () => {
    const rootNode = new FakeSceneRootNode()
    const viewportNode = new FakeViewportNode(rootNode)
    let runtimeHooks = null

    const controller = new PcbScene3dController(
        viewportNode,
        { pcb: { boardOutline: {}, components: [] } },
        {
            buildScene: () => ({
                board: {},
                components: [],
                externalPlacements: [],
                staticBodyPlacements: [
                    {
                        designator: 'FAKE_CLIP_ASSEMBLY',
                        selectionKey: 'FAKE_CLIP_ASSEMBLY@-600,0',
                        mountSide: 'top',
                        rotationDeg: 0,
                        positionMil: { x: -600, y: 0, z: 42 },
                        bodyPositionMil: { x: 400, y: 500 },
                        geometry: {
                            kind: 'extruded-polygon',
                            status: 'complete',
                            heightMil: 20,
                            verticesMil: [
                                { x: -110, y: -20 },
                                { x: 110, y: -20 },
                                { x: 110, y: 20 },
                                { x: -110, y: 20 }
                            ]
                        }
                    }
                ],
                detail: {}
            }),
            createRuntime: (_viewport, _scene, hooks) => {
                runtimeHooks = hooks
                return {
                    dispose() {},
                    isComponentHidden() {
                        return false
                    }
                }
            }
        }
    )

    runtimeHooks.setSelection({
        designator: 'FAKE_CLIP_ASSEMBLY@-600,0',
        sourceType: 'static-body'
    })

    assert.match(rootNode.getSelectionNode().textContent, /Static body/)
    assert.match(rootNode.getSelectionNode().textContent, /FAKE_CLIP_ASSEMBLY/)
    assert.doesNotMatch(rootNode.getSelectionNode().textContent, /No metadata/)

    controller.dispose()
})
