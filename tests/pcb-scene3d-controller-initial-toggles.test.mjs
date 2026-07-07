import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dController } from '../src/PcbScene3dController.mjs'

/**
 * Minimal rendered shell toggle.
 */
class FakeToggle {
    /**
     * @param {string} name Toggle name.
     * @param {boolean} checked Initial checked state.
     */
    constructor(name, checked) {
        this.checked = checked
        this.dataset = { 'scene-3dToggle': name }
    }

    /**
     * @param {string} attribute Attribute name.
     * @returns {string | null}
     */
    getAttribute(attribute) {
        return attribute === 'data-scene-3d-toggle'
            ? this.dataset['scene-3dToggle']
            : null
    }

    /**
     * @returns {void}
     */
    addEventListener() {}
}

/**
 * Minimal root scene node.
 */
class FakeSceneRootNode {
    /**
     * @param {FakeToggle[]} toggles Shell toggles.
     */
    constructor(toggles) {
        this.toggles = toggles
    }

    /**
     * @param {string} selector Query selector.
     * @returns {any[]}
     */
    querySelectorAll(selector) {
        return selector === '[data-scene-3d-toggle]' ? this.toggles : []
    }

    /**
     * @returns {null}
     */
    querySelector() {
        return null
    }
}

/**
 * Minimal viewport mount node.
 */
class FakeViewportNode {
    /**
     * @param {FakeSceneRootNode} rootNode Scene root node.
     */
    constructor(rootNode) {
        this.rootNode = rootNode
    }

    /**
     * @param {string} selector Parent selector.
     * @returns {FakeSceneRootNode | null}
     */
    closest(selector) {
        return selector === '.scene-3d' ? this.rootNode : null
    }
}

/**
 * Verifies the controller applies the rendered shell's initial checkbox state
 * before the user changes any controls.
 */
test('PcbScene3dController forwards initial unchecked toggles to the runtime', () => {
    const rootNode = new FakeSceneRootNode([
        new FakeToggle('external-models', false),
        new FakeToggle('copper', false)
    ])
    const runtimeCalls = []

    new PcbScene3dController(
        new FakeViewportNode(rootNode),
        { pcb: { boardOutline: {}, components: [] } },
        {
            buildScene: () => ({ board: {}, components: [], detail: {} }),
            createRuntime: () => ({
                setToggle(toggleName, enabled) {
                    runtimeCalls.push([toggleName, enabled])
                }
            })
        }
    )

    assert.deepEqual(runtimeCalls, [
        ['external-models', false],
        ['copper', false]
    ])
})
