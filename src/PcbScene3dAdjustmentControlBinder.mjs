import { PcbScene3dSelectionInspectorRenderer } from './PcbScene3dSelectionInspectorRenderer.mjs'

/**
 * Binds editable component transform controls to controller callbacks.
 */
export class PcbScene3dAdjustmentControlBinder {
    /** @type {HTMLElement | null} */
    #selectionNode

    /** @type {HTMLElement | null} */
    #hostNode

    /** @type {Array<{ node: EventTarget, type: string, listener: (event: any) => void }>} */
    #listeners

    /** @type {Array<{ node: EventTarget, type: string, listener: (event: any) => void }>} */
    #repeatStopListeners

    /** @type {any | null} */
    #repeatStartTimer

    /** @type {any | null} */
    #repeatIntervalTimer

    /** @type {() => string} */
    #resolveDesignator

    /** @type {(designator: string) => { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }} */
    #resolveCurrentAdjustment

    /** @type {(designator: string) => { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }} */
    #resolveBaselineAdjustment

    /** @type {(designator: string, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }) => void} */
    #setAdjustment

    /** @type {(designator: string) => void} */
    #deleteAdjustment

    /** @type {(designator: string, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }) => void} */
    #applyRuntimeAdjustment

    /** @type {(suppressed: boolean) => void} */
    #setSelectionHighlightSuppressed

    /** @type {(designator: string) => void} */
    #refreshSelection

    /**
     * @param {{ resolveDesignator: () => string, resolveCurrentAdjustment: (designator: string) => { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }, resolveBaselineAdjustment: (designator: string) => { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }, setAdjustment: (designator: string, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }) => void, deleteAdjustment: (designator: string) => void, applyRuntimeAdjustment: (designator: string, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }) => void, setSelectionHighlightSuppressed: (suppressed: boolean) => void, refreshSelection: (designator: string) => void }} options Binder callbacks.
     */
    constructor(options) {
        this.#selectionNode = null
        this.#hostNode = null
        this.#listeners = []
        this.#repeatStopListeners = []
        this.#repeatStartTimer = null
        this.#repeatIntervalTimer = null
        this.#resolveDesignator = options.resolveDesignator
        this.#resolveCurrentAdjustment = options.resolveCurrentAdjustment
        this.#resolveBaselineAdjustment = options.resolveBaselineAdjustment
        this.#setAdjustment = options.setAdjustment
        this.#deleteAdjustment = options.deleteAdjustment
        this.#applyRuntimeAdjustment = options.applyRuntimeAdjustment
        this.#setSelectionHighlightSuppressed =
            options.setSelectionHighlightSuppressed
        this.#refreshSelection = options.refreshSelection
    }

    /**
     * Binds delegated controls in the selection inspector.
     * @param {HTMLElement | null} selectionNode Inspector node.
     * @returns {void}
     */
    bindSelectionNode(selectionNode) {
        this.#selectionNode =
            selectionNode && typeof selectionNode === 'object'
                ? selectionNode
                : null
        this.#bindNode(this.#selectionNode)
    }

    /**
     * Replaces the external host node used for transform controls.
     * @param {HTMLElement | null} hostNode External control host.
     * @returns {void}
     */
    setHost(hostNode) {
        const nextHost =
            hostNode && typeof hostNode === 'object' ? hostNode : null
        if (this.#hostNode === nextHost) {
            return
        }

        this.#unbindNode(this.#hostNode)
        this.#hostNode = nextHost
        this.#bindNode(this.#hostNode)
    }

    /**
     * Removes all bound event listeners.
     * @returns {void}
     */
    dispose() {
        this.#stopRepeat()
        this.#listeners.forEach(({ node, type, listener }) => {
            node.removeEventListener?.(type, listener)
        })
        this.#listeners = []
        this.#selectionNode = null
        this.#hostNode = null
    }

    /**
     * Binds delegated input and reset events for one node.
     * @param {HTMLElement | null} node Control container.
     * @returns {void}
     */
    #bindNode(node) {
        if (!node) {
            return
        }

        const inputListener = (event) => this.#handleInput(event)
        const resetListener = (event) => this.#handleReset(event)
        const focusInListener = (event) => this.#handleFocus(event, true)
        const focusOutListener = (event) => this.#handleFocus(event, false)
        const wheelListener = (event) => this.#handleWheel(event)
        const keyDownListener = (event) => this.#handleKeyDown(event)
        const pointerDownListener = (event) => this.#handlePointerDown(event)
        const stopRepeatListener = () => this.#stopRepeat()
        const bindings = [
            { node, type: 'input', listener: inputListener },
            { node, type: 'change', listener: inputListener },
            { node, type: 'click', listener: resetListener },
            { node, type: 'focusin', listener: focusInListener },
            { node, type: 'focusout', listener: focusOutListener },
            { node, type: 'wheel', listener: wheelListener },
            { node, type: 'keydown', listener: keyDownListener },
            { node, type: 'pointerdown', listener: pointerDownListener },
            { node, type: 'pointerup', listener: stopRepeatListener },
            { node, type: 'pointercancel', listener: stopRepeatListener }
        ]

        bindings.forEach((binding) => {
            binding.node.addEventListener?.(binding.type, binding.listener)
            this.#listeners.push(binding)
        })
    }

    /**
     * Removes delegated listeners for one node.
     * @param {HTMLElement | null} node Control container.
     * @returns {void}
     */
    #unbindNode(node) {
        if (!node) {
            return
        }

        this.#listeners = this.#listeners.filter((binding) => {
            if (binding.node !== node) {
                return true
            }

            binding.node.removeEventListener?.(binding.type, binding.listener)
            return false
        })
    }

    /**
     * Handles one transform adjustment input change.
     * @param {{ target?: any }} event Input event.
     * @returns {void}
     */
    #handleInput(event) {
        const input = PcbScene3dSelectionInspectorRenderer.closestInput(
            event?.target
        )
        this.#applyInputValue(input)
    }

    /**
     * Handles focus changes for transform adjustment inputs.
     * @param {{ target?: any }} event Focus event.
     * @param {boolean} focused Whether the input is focused.
     * @returns {void}
     */
    #handleFocus(event, focused) {
        if (PcbScene3dSelectionInspectorRenderer.closestInput(event?.target)) {
            if (!focused) {
                this.#stopRepeat()
            }
            this.#setSelectionHighlightSuppressed(focused)
        }
    }

    /**
     * Handles one mouse wheel step over a transform adjustment input.
     * @param {{ target?: any, deltaY?: number, preventDefault?: () => void }} event Wheel event.
     * @returns {void}
     */
    #handleWheel(event) {
        const input = PcbScene3dSelectionInspectorRenderer.closestInput(
            event?.target
        )
        if (!input) {
            return
        }

        this.#stepInput(input, Number(event?.deltaY || 0) < 0 ? 1 : -1)
        event?.preventDefault?.()
    }

    /**
     * Handles keyboard stepping over a transform adjustment input.
     * @param {{ target?: any, key?: string, preventDefault?: () => void }} event Keyboard event.
     * @returns {void}
     */
    #handleKeyDown(event) {
        const input = PcbScene3dSelectionInspectorRenderer.closestInput(
            event?.target
        )
        if (!input) {
            return
        }

        const key = String(event?.key || '')
        const direction = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0
        if (direction === 0) {
            return
        }

        event?.preventDefault?.()
        this.#stepInput(input, direction)
    }

    /**
     * Handles a press on the native number input spinner area.
     * @param {{ target?: any, button?: number, clientX?: number, clientY?: number, preventDefault?: () => void }} event Pointer event.
     * @returns {void}
     */
    #handlePointerDown(event) {
        if (Number(event?.button || 0) !== 0) {
            return
        }

        const stepButton = PcbScene3dAdjustmentControlBinder.#closestStepButton(
            event?.target
        )
        let input =
            PcbScene3dAdjustmentControlBinder.#resolveStepButtonInput(
                stepButton
            )
        let direction =
            PcbScene3dAdjustmentControlBinder.#resolveStepButtonDirection(
                stepButton
            )
        if (!input || direction === 0) {
            input = PcbScene3dSelectionInspectorRenderer.closestInput(
                event?.target
            )
            direction =
                PcbScene3dAdjustmentControlBinder.#resolveSpinnerDirection(
                    input,
                    event
                )
        }
        if (!input || direction === 0) {
            return
        }

        event?.preventDefault?.()
        input.focus?.()
        this.#setSelectionHighlightSuppressed(true)
        this.#stopRepeat()
        this.#stepInput(input, direction)
        this.#bindRepeatStopListeners(input)
        this.#repeatStartTimer = globalThis.setTimeout?.(() => {
            this.#repeatStartTimer = null
            this.#repeatIntervalTimer = globalThis.setInterval?.(() => {
                this.#stepInput(input, direction)
            }, 75)
        }, 350)
    }

    /**
     * Steps one adjustment input by one declared step.
     * @param {any} input Adjustment input.
     * @param {number} direction Positive to increment, negative to decrement.
     * @returns {void}
     */
    #stepInput(input, direction) {
        const declaredStep =
            PcbScene3dAdjustmentControlBinder.#resolveStep(input)
        const step =
            PcbScene3dAdjustmentControlBinder.#resolveCaretStep(input) ||
            declaredStep
        const decimals = PcbScene3dAdjustmentControlBinder.#resolveDecimals(
            input,
            declaredStep
        )
        const previousValue = String(input?.value || '')
        const previousCaret =
            PcbScene3dAdjustmentControlBinder.#resolveCaretPosition(input)
        const currentValue =
            PcbScene3dAdjustmentControlBinder.#resolveInputNumber(input)
        const nextValue = currentValue + Math.sign(direction || 0) * step
        input.value = PcbScene3dAdjustmentControlBinder.#formatInputValue(
            nextValue,
            decimals,
            PcbScene3dAdjustmentControlBinder.#resolveDecimalSeparator(
                previousValue
            )
        )
        PcbScene3dAdjustmentControlBinder.#restoreCaret(
            input,
            previousCaret,
            previousValue,
            input.value
        )
        this.#applyInputValue(input)
    }

    /**
     * Applies the current value of one transform adjustment input.
     * @param {any | null} input Adjustment input.
     * @returns {void}
     */
    #applyInputValue(input) {
        const designator = String(this.#resolveDesignator() || '').trim()
        if (!input || !designator) {
            return
        }

        const path = String(
            input?.getAttribute?.('data-scene-3d-adjustment') || ''
        )
        const numericValue =
            PcbScene3dAdjustmentControlBinder.#resolveInputNumber(input)
        if (!Number.isFinite(numericValue)) {
            return
        }

        const adjustment = PcbScene3dSelectionInspectorRenderer.cloneAdjustment(
            this.#resolveCurrentAdjustment(designator)
        )
        if (
            !PcbScene3dSelectionInspectorRenderer.writePath(
                adjustment,
                path,
                numericValue
            )
        ) {
            return
        }

        this.#setAdjustment(designator, adjustment)
        this.#applyRuntimeAdjustment(designator, adjustment)
    }

    /**
     * Resolves the numeric step size for one adjustment input.
     * @param {any} input Adjustment input.
     * @returns {number}
     */
    static #resolveStep(input) {
        const step = Number(input?.getAttribute?.('step') || 1)
        return Number.isFinite(step) && step > 0 ? step : 1
    }

    /**
     * Resolves the current numeric value from one adjustment input.
     * @param {any} input Adjustment input.
     * @returns {number}
     */
    static #resolveInputNumber(input) {
        const numericValue = Number(String(input?.value || 0).replace(',', '.'))
        return Number.isFinite(numericValue) ? numericValue : 0
    }

    /**
     * Resolves the decimal place represented by the digit before the caret.
     * @param {any} input Adjustment input.
     * @returns {number | null}
     */
    static #resolveCaretStep(input) {
        const valueText = String(input?.value || '')
        const caretPosition =
            PcbScene3dAdjustmentControlBinder.#resolveCaretPosition(input)
        if (!Number.isFinite(caretPosition)) {
            return null
        }

        const digitIndex =
            PcbScene3dAdjustmentControlBinder.#findPreviousDigitIndex(
                valueText,
                caretPosition
            )
        if (digitIndex < 0) {
            return null
        }

        const decimalIndex =
            PcbScene3dAdjustmentControlBinder.#resolveDecimalIndex(valueText)
        const integerEndIndex =
            decimalIndex >= 0 ? decimalIndex : valueText.length
        const exponent =
            decimalIndex >= 0 && digitIndex > decimalIndex
                ? decimalIndex - digitIndex
                : integerEndIndex - digitIndex - 1
        const step = Math.pow(10, exponent)
        return Number.isFinite(step) && step > 0 ? step : null
    }

    /**
     * Resolves a usable caret position from one input.
     * @param {any} input Adjustment input.
     * @returns {number}
     */
    static #resolveCaretPosition(input) {
        const caretPosition = Number(input?.selectionStart)
        return Number.isFinite(caretPosition) ? caretPosition : Number.NaN
    }

    /**
     * Finds the digit immediately before the caret, skipping separators.
     * @param {string} valueText Current input text.
     * @param {number} caretPosition Caret position.
     * @returns {number}
     */
    static #findPreviousDigitIndex(valueText, caretPosition) {
        const startIndex = Math.min(
            Math.max(Math.floor(caretPosition) - 1, 0),
            valueText.length - 1
        )
        for (let index = startIndex; index >= 0; index -= 1) {
            if (/\d/.test(valueText[index])) {
                return index
            }
        }
        return -1
    }

    /**
     * Resolves the first decimal separator index.
     * @param {string} valueText Current input text.
     * @returns {number}
     */
    static #resolveDecimalIndex(valueText) {
        const dotIndex = valueText.indexOf('.')
        const commaIndex = valueText.indexOf(',')
        if (dotIndex < 0) return commaIndex
        if (commaIndex < 0) return dotIndex
        return Math.min(dotIndex, commaIndex)
    }

    /**
     * Resolves which decimal separator style to preserve.
     * @param {string} valueText Current input text.
     * @returns {string}
     */
    static #resolveDecimalSeparator(valueText) {
        const decimalIndex =
            PcbScene3dAdjustmentControlBinder.#resolveDecimalIndex(valueText)
        return decimalIndex >= 0 && valueText[decimalIndex] === ',' ? ',' : '.'
    }

    /**
     * Formats one stepped value for display.
     * @param {number} value Numeric value.
     * @param {number} decimals Decimal places.
     * @param {string} decimalSeparator Separator to preserve.
     * @returns {string}
     */
    static #formatInputValue(value, decimals, decimalSeparator) {
        const formatted = value.toFixed(decimals)
        return decimalSeparator === ','
            ? formatted.replace('.', ',')
            : formatted
    }

    /**
     * Restores the caret after replacing the input value.
     * @param {any} input Adjustment input.
     * @param {number} previousCaret Previous caret position.
     * @param {string} previousValue Previous input text.
     * @param {string} nextValue Next input text.
     * @returns {void}
     */
    static #restoreCaret(input, previousCaret, previousValue, nextValue) {
        if (
            !Number.isFinite(previousCaret) ||
            typeof input?.setSelectionRange !== 'function'
        ) {
            return
        }

        const nextPosition = Math.max(
            0,
            Math.min(
                nextValue.length,
                previousCaret + nextValue.length - previousValue.length
            )
        )
        try {
            input.setSelectionRange(nextPosition, nextPosition)
        } catch (_error) {
            // Some native input types reject selection APIs. Text inputs do not.
        }
    }

    /**
     * Resolves display precision from one input step.
     * @param {any} input Adjustment input.
     * @param {number} step Numeric step.
     * @returns {number}
     */
    static #resolveDecimals(input, step) {
        const stepText = String(input?.getAttribute?.('step') || step)
        const decimalText = stepText.includes('.')
            ? stepText.split('.')[1] || ''
            : ''
        return decimalText.replace(/0+$/, '').length || decimalText.length
    }

    /**
     * Resolves which native spinner half was pressed.
     * @param {any | null} input Adjustment input.
     * @param {{ clientX?: number, clientY?: number }} event Pointer event.
     * @returns {-1 | 0 | 1}
     */
    static #resolveSpinnerDirection(input, event) {
        const rect = input?.getBoundingClientRect?.()
        const clientX = Number(event?.clientX)
        const clientY = Number(event?.clientY)
        if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
            return 0
        }

        const left = Number(rect.left ?? rect.x ?? 0)
        const top = Number(rect.top ?? rect.y ?? 0)
        const width = Number(rect.width || 0)
        const height = Number(rect.height || 0)
        const right = Number(rect.right ?? left + width)
        const spinnerWidth = Math.min(36, Math.max(24, width * 0.2))
        if (clientX < right - spinnerWidth) {
            return 0
        }

        return clientY <= top + height / 2 ? 1 : -1
    }

    /**
     * Finds a custom step button from an event target.
     * @param {any} target Event target.
     * @returns {any | null}
     */
    static #closestStepButton(target) {
        const closest = target?.closest?.('[data-scene-3d-adjustment-step]')
        return closest ||
            target?.getAttribute?.('data-scene-3d-adjustment-step')
            ? closest || target
            : null
    }

    /**
     * Resolves the input controlled by one custom step button.
     * @param {any | null} stepButton Custom step button.
     * @returns {any | null}
     */
    static #resolveStepButtonInput(stepButton) {
        return (
            stepButton
                ?.closest?.('.scene-3d__adjustment-row')
                ?.querySelector?.('[data-scene-3d-adjustment]') || null
        )
    }

    /**
     * Resolves one custom step button direction.
     * @param {any | null} stepButton Custom step button.
     * @returns {-1 | 0 | 1}
     */
    static #resolveStepButtonDirection(stepButton) {
        const direction = String(
            stepButton?.getAttribute?.('data-scene-3d-adjustment-step') || ''
        )
        if (direction === 'up') return 1
        if (direction === 'down') return -1
        return 0
    }

    /**
     * Binds document-level release events for active repeat stepping.
     * @param {any} input Adjustment input.
     * @returns {void}
     */
    #bindRepeatStopListeners(input) {
        this.#unbindRepeatStopListeners()
        const stopListener = () => this.#stopRepeat()
        const ownerDocument = input?.ownerDocument || globalThis.document
        const ownerWindow = ownerDocument?.defaultView || globalThis.window
        const bindings = [
            [ownerDocument, 'pointerup'],
            [ownerDocument, 'pointercancel'],
            [ownerDocument, 'mouseup'],
            [ownerDocument, 'touchend'],
            [ownerWindow, 'blur']
        ]

        this.#repeatStopListeners = bindings
            .filter(([node]) => node?.addEventListener)
            .map(([node, type]) => ({ node, type, listener: stopListener }))
        this.#repeatStopListeners.forEach(({ node, type, listener }) => {
            node.addEventListener?.(type, listener)
        })
    }

    /**
     * Stops any active spinner repeat and removes release listeners.
     * @returns {void}
     */
    #stopRepeat() {
        if (this.#repeatStartTimer) {
            globalThis.clearTimeout?.(this.#repeatStartTimer)
            this.#repeatStartTimer = null
        }
        if (this.#repeatIntervalTimer) {
            globalThis.clearInterval?.(this.#repeatIntervalTimer)
            this.#repeatIntervalTimer = null
        }
        this.#unbindRepeatStopListeners()
    }

    /**
     * Removes document-level release listeners.
     * @returns {void}
     */
    #unbindRepeatStopListeners() {
        this.#repeatStopListeners.forEach(({ node, type, listener }) => {
            node.removeEventListener?.(type, listener)
        })
        this.#repeatStopListeners = []
    }

    /**
     * Handles one transform reset click.
     * @param {{ target?: any, preventDefault?: () => void }} event Click event.
     * @returns {void}
     */
    #handleReset(event) {
        const resetButton = event?.target?.closest?.(
            '[data-scene-3d-adjustment-reset]'
        )
        const designator = String(this.#resolveDesignator() || '').trim()
        if (!resetButton || !designator) {
            return
        }

        event?.preventDefault?.()
        this.#deleteAdjustment(designator)
        const baseline = this.#resolveBaselineAdjustment(designator)
        this.#applyRuntimeAdjustment(designator, baseline)
        this.#refreshSelection(designator)
    }
}
