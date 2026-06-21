import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dController } from '../src/PcbScene3dController.mjs'

/**
 * Minimal event target used by controller visibility tests.
 */
class FakeEventTarget {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners

    constructor() {
        this.#listeners = new Map()
    }

    /** @param {string} type @param {(event: any) => void} listener */
    addEventListener(type, listener) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, new Set())
        }
        this.#listeners.get(type)?.add(listener)
    }

    /** @param {string} type @param {(event: any) => void} listener */
    removeEventListener(type, listener) {
        this.#listeners.get(type)?.delete(listener)
    }

    /** @param {string} type @param {Record<string, any>} event */
    dispatch(type, event = {}) {
        const payload = { type, currentTarget: this, target: this, ...event }
        ;[...(this.#listeners.get(type) || [])].forEach((listener) =>
            listener(payload)
        )
    }
}

/**
 * Minimal selected-component visibility button parsed from inspector markup.
 */
class FakeVisibilityButton {
    /** @type {string} */
    #designator

    /** @param {string} designator Selected component designator. */
    constructor(designator) {
        this.#designator = designator
    }

    /** @param {string} name @returns {string | null} */
    getAttribute(name) {
        return name === 'data-scene-3d-component-visibility'
            ? this.#designator
            : null
    }

    /** @param {string} selector @returns {FakeVisibilityButton | null} */
    closest(selector) {
        return selector === '[data-scene-3d-component-visibility]' ? this : null
    }
}

/**
 * Minimal inspector node with visibility-button parsing.
 */
class FakeSelectionNode extends FakeEventTarget {
    /** @type {string} */
    _innerHTML

    /** @type {string} */
    textContent

    constructor() {
        super()
        this._innerHTML = ''
        this.textContent = ''
    }

    /** @param {string} value */
    set innerHTML(value) {
        this._innerHTML = String(value)
        this.textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').trim()
    }

    /** @returns {string} */
    get innerHTML() {
        return this._innerHTML
    }

    /** @param {string} selector @returns {FakeVisibilityButton | null} */
    querySelector(selector) {
        if (selector !== '[data-scene-3d-component-visibility]') {
            return null
        }

        const match = this._innerHTML.match(
            /data-scene-3d-component-visibility="([^"]+)"/
        )
        return match ? new FakeVisibilityButton(match[1]) : null
    }

    /**
     * Dispatches an event from a parsed child target.
     * @param {string} type Event type.
     * @param {FakeVisibilityButton} target Event target.
     * @returns {void}
     */
    dispatchFrom(type, target) {
        let defaultPrevented = false
        this.dispatch(type, {
            target,
            preventDefault() {
                defaultPrevented = true
            }
        })
        assert.equal(defaultPrevented, true)
    }
}

/**
 * Minimal scene root for controller visibility tests.
 */
class FakeSceneRootNode {
    /** @type {FakeSelectionNode} */
    #selectionNode

    constructor() {
        this.#selectionNode = new FakeSelectionNode()
    }

    /** @param {string} selector @returns {any[]} */
    querySelectorAll(selector) {
        return selector === '[data-scene-3d-preset]' ||
            selector === '[data-scene-3d-toggle]'
            ? []
            : []
    }

    /** @param {string} selector @returns {any | null} */
    querySelector(selector) {
        return selector === '.scene-3d__selection' ? this.#selectionNode : null
    }

    /** @returns {FakeSelectionNode} */
    getSelectionNode() {
        return this.#selectionNode
    }
}

/**
 * Minimal viewport root lookup.
 */
class FakeViewportNode {
    /** @type {FakeSceneRootNode} */
    #rootNode

    /** @param {FakeSceneRootNode} rootNode Root scene node. */
    constructor(rootNode) {
        this.#rootNode = rootNode
    }

    /** @param {string} selector @returns {FakeSceneRootNode | null} */
    closest(selector) {
        return selector === '.scene-3d' ? this.#rootNode : null
    }
}

test('PcbScene3dController hides and restores the selected component', () => {
    const rootNode = new FakeSceneRootNode()
    const viewportNode = new FakeViewportNode(rootNode)
    const hiddenDesignators = new Set()
    const hiddenCalls = []

    const controller = new PcbScene3dController(
        viewportNode,
        { pcb: { boardOutline: {}, components: [] } },
        {
            buildScene: () => ({
                board: {},
                components: [
                    {
                        designator: 'C8',
                        mountSide: 'top',
                        rotationDeg: 90,
                        positionMil: { x: 100, y: 200, z: 0 },
                        boardPositionMil: { x: 100, y: 200, z: 0 },
                        pattern: 'SMT_C_0402'
                    }
                ],
                externalPlacements: [],
                detail: {}
            }),
            createRuntime: () => ({
                setSelectedDesignator() {},
                isComponentHidden(designator) {
                    return hiddenDesignators.has(designator)
                },
                setComponentHidden(designator, hidden) {
                    hiddenCalls.push({ designator, hidden })
                    if (hidden) {
                        hiddenDesignators.add(designator)
                    } else {
                        hiddenDesignators.delete(designator)
                    }
                },
                dispose() {}
            })
        }
    )

    controller.setSelectedComponent('C8')

    const selectionNode = rootNode.getSelectionNode()
    assert.match(selectionNode.innerHTML, /Hide selected component/)
    selectionNode.dispatchFrom(
        'click',
        selectionNode.querySelector('[data-scene-3d-component-visibility]')
    )

    assert.deepEqual(hiddenCalls, [{ designator: 'C8', hidden: true }])
    assert.match(selectionNode.textContent, /C8/)
    assert.match(selectionNode.textContent, /Fallback body/)
    assert.match(selectionNode.innerHTML, /Show selected component/)

    selectionNode.dispatchFrom(
        'click',
        selectionNode.querySelector('[data-scene-3d-component-visibility]')
    )

    assert.deepEqual(hiddenCalls, [
        { designator: 'C8', hidden: true },
        { designator: 'C8', hidden: false }
    ])
    assert.match(selectionNode.innerHTML, /Hide selected component/)

    controller.dispose()
})
