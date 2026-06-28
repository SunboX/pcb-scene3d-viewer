import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dController } from '../src/PcbScene3dController.mjs'

/**
 * Minimal event target used by the scene controller adjustment tests.
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

    /**
     * @param {string} type Event type.
     * @param {Record<string, any>} event Event payload.
     * @returns {void}
     */
    dispatch(type, event = {}) {
        const payload = { type, currentTarget: this, target: this, ...event }
        ;[...(this.#listeners.get(type) || [])].forEach((listener) =>
            listener(payload)
        )
    }
}

/**
 * Minimal adjustment input parsed from rendered inspector markup.
 */
class FakeAdjustmentInput extends FakeEventTarget {
    /** @type {string} */
    value
    /** @type {number} */
    selectionStart
    /** @type {number} */
    selectionEnd
    /** @type {string} */
    #path
    /** @type {string} */
    #step

    /** @param {string} path @param {string} value @param {string} step */
    constructor(path, value, step) {
        super()
        this.#path = path
        this.#step = step
        this.value = value
        this.selectionStart = String(value).length
        this.selectionEnd = String(value).length
    }

    /** @param {string} name @returns {string | null} */
    getAttribute(name) {
        if (name === 'data-scene-3d-adjustment') return this.#path
        if (name === 'step') return this.#step
        return null
    }

    /** @param {string} selector @returns {FakeAdjustmentInput | null} */
    closest(selector) {
        return selector === '[data-scene-3d-adjustment]' ? this : null
    }

    /** @returns {void} */
    focus() {}

    /** @param {number} start @param {number} end @returns {void} */
    setSelectionRange(start, end) {
        this.selectionStart = start
        this.selectionEnd = end
    }

    /**
     * @returns {{ left: number, right: number, top: number, bottom: number, width: number, height: number }}
     */
    getBoundingClientRect() {
        return {
            left: 0,
            right: 160,
            top: 0,
            bottom: 40,
            width: 160,
            height: 40
        }
    }
}

/**
 * Minimal adjustment step button parsed from rendered inspector markup.
 */
class FakeAdjustmentStepButton extends FakeEventTarget {
    /** @type {FakeAdjustmentInput} */
    #input
    /** @type {string} */
    #direction

    /** @param {FakeAdjustmentInput} input @param {string} direction */
    constructor(input, direction) {
        super()
        this.#input = input
        this.#direction = direction
    }

    /** @param {string} name @returns {string | null} */
    getAttribute(name) {
        if (name === 'data-scene-3d-adjustment-step') return this.#direction
        if (name === 'data-scene-3d-adjustment-step-for') {
            return this.#input.getAttribute('data-scene-3d-adjustment')
        }
        return null
    }

    /** @param {string} selector @returns {any | null} */
    closest(selector) {
        if (selector === '[data-scene-3d-adjustment-step]') return this
        if (selector === '.scene-3d__adjustment-row') {
            return {
                querySelector: (inputSelector) =>
                    inputSelector === '[data-scene-3d-adjustment]'
                        ? this.#input
                        : null
            }
        }
        return null
    }
}

/**
 * Minimal reset button parsed from rendered inspector markup.
 */
class FakeAdjustmentResetButton extends FakeEventTarget {
    /** @param {string} name @returns {string | null} */
    getAttribute(name) {
        return name === 'data-scene-3d-adjustment-reset' ? '' : null
    }

    /** @param {string} selector @returns {FakeAdjustmentResetButton | null} */
    closest(selector) {
        return selector === '[data-scene-3d-adjustment-reset]' ? this : null
    }
}

/**
 * Minimal inspector node with adjustment-control parsing.
 */
class FakeSelectionNode extends FakeEventTarget {
    /** @type {string} */
    textContent
    /** @type {string} */
    _innerHTML
    /** @type {number} */
    #renderCount
    /** @type {Map<string, FakeAdjustmentInput>} */
    #adjustmentInputs
    /** @type {Map<string, FakeAdjustmentStepButton>} */
    #stepButtons
    /** @type {FakeAdjustmentResetButton | null} */
    #resetButton

    constructor() {
        super()
        this.textContent = ''
        this._innerHTML = ''
        this.#renderCount = 0
        this.#adjustmentInputs = new Map()
        this.#stepButtons = new Map()
        this.#resetButton = null
    }

    /** @param {string} value */
    set innerHTML(value) {
        this.#renderCount += 1
        this._innerHTML = String(value)
        this.textContent = this._innerHTML.replace(/<[^>]+>/g, ' ').trim()
        this.#parseAdjustmentControls()
    }

    /** @returns {string} */
    get innerHTML() {
        return this._innerHTML
    }

    /**
     * @param {string} selector CSS selector.
     * @returns {FakeAdjustmentInput | FakeAdjustmentResetButton | null}
     */
    querySelector(selector) {
        const adjustmentMatch = String(selector).match(
            /^\[data-scene-3d-adjustment="([^"]+)"\]$/
        )
        if (adjustmentMatch) {
            return this.#adjustmentInputs.get(adjustmentMatch[1]) || null
        }

        const stepMatch = String(selector).match(
            /^\[data-scene-3d-adjustment-step="([^"]+)"\]\[data-scene-3d-adjustment-step-for="([^"]+)"\]$/
        )
        if (stepMatch) {
            return this.#stepButtons.get(stepMatch[2] + '.' + stepMatch[1])
        }

        return selector === '[data-scene-3d-adjustment-reset]'
            ? this.#resetButton
            : null
    }

    /**
     * Dispatches one delegated event through the inspector node.
     * @param {string} type Event type.
     * @param {FakeEventTarget} target Event target.
     * @param {Record<string, any>} [event] Event fields.
     * @returns {void}
     */
    dispatchFrom(type, target, event = {}) {
        this.dispatch(type, { target, ...event })
    }

    /** @returns {number} */
    getRenderCount() {
        return this.#renderCount
    }

    /** @returns {void} */
    #parseAdjustmentControls() {
        this.#adjustmentInputs = new Map()
        this.#stepButtons = new Map()
        const inputPattern =
            /<input\b(?=[^>]*data-scene-3d-adjustment="([^"]+)")(?=[^>]*step="([^"]+)")(?=[^>]*value="([^"]*)")[^>]*>/g
        for (const match of this._innerHTML.matchAll(inputPattern)) {
            const input = new FakeAdjustmentInput(match[1], match[3], match[2])
            this.#adjustmentInputs.set(match[1], input)
        }

        const stepButtonPattern =
            /<button\b(?=[^>]*data-scene-3d-adjustment-step="([^"]+)")(?=[^>]*data-scene-3d-adjustment-step-for="([^"]+)")[^>]*>/g
        for (const match of this._innerHTML.matchAll(stepButtonPattern)) {
            const input = this.#adjustmentInputs.get(match[2])
            if (input) {
                this.#stepButtons.set(
                    match[2] + '.' + match[1],
                    new FakeAdjustmentStepButton(input, match[1])
                )
            }
        }

        this.#resetButton = this._innerHTML.includes(
            'data-scene-3d-adjustment-reset'
        )
            ? new FakeAdjustmentResetButton()
            : null
    }
}

/**
 * Minimal root scene node.
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
            selector === '[data-scene-3d-toggle]' ||
            selector === '[data-scene-3d-export]'
            ? []
            : []
    }

    /** @param {string} selector @returns {FakeSelectionNode | null} */
    querySelector(selector) {
        return selector === '.scene-3d__selection' ? this.#selectionNode : null
    }

    /** @returns {FakeSelectionNode} */
    getSelectionNode() {
        return this.#selectionNode
    }
}

/**
 * Minimal viewport wrapper.
 */
class FakeViewportNode {
    /** @type {FakeSceneRootNode} */
    #rootNode

    /** @param {FakeSceneRootNode} rootNode */
    constructor(rootNode) {
        this.#rootNode = rootNode
    }

    /** @param {string} selector @returns {FakeSceneRootNode | null} */
    closest(selector) {
        return selector === '.scene-3d' ? this.#rootNode : null
    }
}

/**
 * Creates a controller mounted to a fake scene with an external adjustment host.
 * @param {{ sourceFormat?: string, coordinateSystem?: string, modelOffsetZMil?: number }} [options] Fake scene options.
 * @returns {{ controller: PcbScene3dController, rootNode: FakeSceneRootNode, adjustmentHostNode: FakeSelectionNode, adjustmentCalls: any[], runtimeSelections: string[], runtimeHooks: any }}
 */
function createExternalHostController(options = {}) {
    const rootNode = new FakeSceneRootNode()
    const viewportNode = new FakeViewportNode(rootNode)
    const adjustmentHostNode = new FakeSelectionNode()
    const adjustmentCalls = []
    const runtimeSelections = []
    let runtimeHooks = null

    const controller = new PcbScene3dController(
        viewportNode,
        {
            pcb: {
                boardOutline: {},
                components: [{ designator: 'U9', layer: 'TOP' }]
            }
        },
        {
            buildScene: () => ({
                ...(options.sourceFormat
                    ? { sourceFormat: options.sourceFormat }
                    : {}),
                ...(options.coordinateSystem
                    ? { coordinateSystem: options.coordinateSystem }
                    : {}),
                board: {},
                components: [
                    {
                        designator: 'U9',
                        mountSide: 'top',
                        rotationDeg: 0,
                        positionMil: { x: 0, y: 0, z: 32 },
                        boardPositionMil: { x: 500, y: 600, z: 0 },
                        pattern: 'PKG_FAKE_01',
                        source: 'FakeLib',
                        body: {
                            family: 'chip',
                            sizeMil: { width: 100, depth: 80, height: 20 }
                        }
                    }
                ],
                externalPlacements: [
                    {
                        designator: 'U9',
                        mountSide: 'top',
                        rotationDeg: 0,
                        positionMil: { x: 0, y: 0, z: 32 },
                        bodyPositionMil: { x: 500, y: 600 },
                        bodyRotationDeg: 0,
                        modelTransform: {
                            rotationDeg: { x: 90, y: 0, z: 180 },
                            offsetMil: {
                                x: 0,
                                y: 0,
                                z: Number(
                                    options.modelOffsetZMil ?? 39.3700787402
                                )
                            },
                            scale: { x: 1, y: 1, z: 1 }
                        },
                        externalModel: {
                            origin: 'session',
                            name: 'fake-body.step',
                            format: 'step'
                        }
                    }
                ],
                detail: {}
            }),
            createRuntime: (_viewport, _scene, hooks) => {
                runtimeHooks = hooks
                return {
                    setSelectedDesignator(designator) {
                        runtimeSelections.push(designator)
                    },
                    setComponentAdjustment(designator, adjustment) {
                        adjustmentCalls.push({ designator, adjustment })
                    },
                    dispose() {}
                }
            },
            renderAdjustmentControlsInSelection: false
        }
    )
    controller.setAdjustmentHost(adjustmentHostNode)

    runtimeHooks.setSelection({
        designator: 'U9',
        sourceType: 'external-model'
    })

    return {
        controller,
        rootNode,
        adjustmentHostNode,
        adjustmentCalls,
        runtimeSelections,
        runtimeHooks
    }
}

test('PcbScene3dController shows default Altium component Z clearance in transform controls', () => {
    const { controller, adjustmentHostNode } = createExternalHostController({
        sourceFormat: 'altium',
        modelOffsetZMil: 0
    })

    assert.equal(
        adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment="offset.z"]'
        )?.value,
        '0.030000'
    )

    controller.dispose()
})

test('PcbScene3dController edits selected component 3D transform parameters through an external host', () => {
    const { controller, rootNode, adjustmentHostNode, adjustmentCalls } =
        createExternalHostController()

    const selectionNode = rootNode.getSelectionNode()
    assert.doesNotMatch(selectionNode.textContent, /Scale/)
    assert.match(adjustmentHostNode.textContent, /Scale/)
    assert.match(adjustmentHostNode.textContent, /Offset/)
    assert.equal(
        adjustmentHostNode.querySelector('[data-scene-3d-adjustment="scale.x"]')
            ?.value,
        '1.0000'
    )
    assert.equal(
        adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment="rotation.x"]'
        )?.value,
        '90.00'
    )
    assert.equal(
        adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment="offset.z"]'
        )?.value,
        '1.000000'
    )

    const scaleXInput = adjustmentHostNode.querySelector(
        '[data-scene-3d-adjustment="scale.x"]'
    )
    scaleXInput.value = '1.2500'
    adjustmentHostNode.dispatchFrom('input', scaleXInput)

    assert.equal(adjustmentCalls.at(-1).designator, 'U9')
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1.25)
    assert.equal(adjustmentCalls.at(-1).adjustment.rotationDeg.x, 90)
    assert.equal(
        Math.round(adjustmentCalls.at(-1).adjustment.offsetMil.z * 1000) / 1000,
        39.37
    )

    const resetButton = adjustmentHostNode.querySelector(
        '[data-scene-3d-adjustment-reset]'
    )
    adjustmentHostNode.dispatchFrom('click', resetButton)

    assert.equal(adjustmentCalls.at(-1).designator, 'U9')
    assert.deepEqual(adjustmentCalls.at(-1).adjustment.scale, {
        x: 1,
        y: 1,
        z: 1
    })
    assert.deepEqual(adjustmentCalls.at(-1).adjustment.rotationDeg, {
        x: 90,
        y: 0,
        z: 180
    })

    controller.dispose()
})

test('PcbScene3dController suppresses selection highlighting while an adjustment input is focused', () => {
    const { controller, adjustmentHostNode, runtimeSelections } =
        createExternalHostController()
    const scaleXInput = adjustmentHostNode.querySelector(
        '[data-scene-3d-adjustment="scale.x"]'
    )

    adjustmentHostNode.dispatchFrom('focusin', scaleXInput)
    adjustmentHostNode.dispatchFrom('focusout', scaleXInput)

    assert.deepEqual(runtimeSelections, ['', 'U9'])
    controller.dispose()
})

test('PcbScene3dController steps adjustment inputs with the mouse wheel', () => {
    const { controller, adjustmentHostNode, adjustmentCalls } =
        createExternalHostController()
    const scaleXInput = adjustmentHostNode.querySelector(
        '[data-scene-3d-adjustment="scale.x"]'
    )
    const renderCountBeforeWheel = adjustmentHostNode.getRenderCount()
    let didPreventDefault = false

    adjustmentHostNode.dispatchFrom('wheel', scaleXInput, {
        deltaY: -1,
        preventDefault() {
            didPreventDefault = true
        }
    })

    assert.equal(didPreventDefault, true)
    assert.equal(adjustmentHostNode.getRenderCount(), renderCountBeforeWheel)
    assert.equal(scaleXInput.value, '1.0001')
    assert.equal(adjustmentCalls.at(-1).designator, 'U9')
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1.0001)

    adjustmentHostNode.dispatchFrom('wheel', scaleXInput, {
        deltaY: 1,
        preventDefault() {}
    })

    assert.equal(scaleXInput.value, '1.0000')
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1)
    controller.dispose()
})

test('PcbScene3dController steps the digit before the cursor with wheel and arrow keys', () => {
    const { controller, adjustmentHostNode, adjustmentCalls } =
        createExternalHostController()
    const scaleXInput = adjustmentHostNode.querySelector(
        '[data-scene-3d-adjustment="scale.x"]'
    )
    let didPreventWheel = false
    let didPreventArrow = false

    scaleXInput.value = '12.3400'
    scaleXInput.setSelectionRange(2, 2)
    adjustmentHostNode.dispatchFrom('wheel', scaleXInput, {
        deltaY: -1,
        preventDefault() {
            didPreventWheel = true
        }
    })

    assert.equal(didPreventWheel, true)
    assert.equal(scaleXInput.value, '13.3400')
    assert.equal(scaleXInput.selectionStart, 2)
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 13.34)

    scaleXInput.setSelectionRange(4, 4)
    adjustmentHostNode.dispatchFrom('keydown', scaleXInput, {
        key: 'ArrowUp',
        preventDefault() {
            didPreventArrow = true
        }
    })

    assert.equal(didPreventArrow, true)
    assert.equal(scaleXInput.value, '13.4400')
    assert.equal(scaleXInput.selectionStart, 4)
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 13.44)

    adjustmentHostNode.dispatchFrom('keydown', scaleXInput, {
        key: 'ArrowDown',
        preventDefault() {}
    })

    assert.equal(scaleXInput.value, '13.3400')
    assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 13.34)
    controller.dispose()
})

test('PcbScene3dController repeats adjustment stepping while spinner buttons are held', () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const timeouts = []
    const intervals = []
    const clearedIntervals = []

    globalThis.setTimeout = (callback, delay) => {
        const id = { callback, delay }
        timeouts.push(id)
        return id
    }
    globalThis.clearTimeout = () => {}
    globalThis.setInterval = (callback, delay) => {
        const id = { callback, delay }
        intervals.push(id)
        return id
    }
    globalThis.clearInterval = (id) => {
        clearedIntervals.push(id)
    }

    try {
        const { controller, adjustmentHostNode, adjustmentCalls } =
            createExternalHostController()
        const scaleXInput = adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment="scale.x"]'
        )
        const scaleXUpButton = adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment-step="up"][data-scene-3d-adjustment-step-for="scale.x"]'
        )
        const scaleXDownButton = adjustmentHostNode.querySelector(
            '[data-scene-3d-adjustment-step="down"][data-scene-3d-adjustment-step-for="scale.x"]'
        )
        let didPreventDefault = false

        adjustmentHostNode.dispatchFrom('pointerdown', scaleXUpButton, {
            button: 0,
            clientX: 150,
            clientY: 6,
            preventDefault() {
                didPreventDefault = true
            }
        })

        assert.equal(didPreventDefault, true)
        assert.equal(scaleXInput.value, '1.0001')
        assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1.0001)
        assert.equal(timeouts.length, 1)

        timeouts[0].callback()
        intervals.at(-1).callback()
        intervals.at(-1).callback()

        assert.equal(scaleXInput.value, '1.0003')
        assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1.0003)

        adjustmentHostNode.dispatchFrom('pointerup', scaleXInput)
        assert.equal(clearedIntervals.length, 1)

        adjustmentHostNode.dispatchFrom('pointerdown', scaleXDownButton, {
            button: 0,
            clientX: 150,
            clientY: 34,
            preventDefault() {}
        })

        assert.equal(scaleXInput.value, '1.0002')
        assert.equal(adjustmentCalls.at(-1).adjustment.scale.x, 1.0002)
        controller.dispose()
    } finally {
        globalThis.setTimeout = originalSetTimeout
        globalThis.clearTimeout = originalClearTimeout
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
    }
})
