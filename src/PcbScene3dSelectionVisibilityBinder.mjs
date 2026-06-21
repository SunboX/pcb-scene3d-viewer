/**
 * Binds the selected-component visibility toggle in the inspector.
 */
export class PcbScene3dSelectionVisibilityBinder {
    /** @type {HTMLElement | null} */
    #selectionNode

    /** @type {{ node: EventTarget, type: string, listener: (event: any) => void } | null} */
    #listenerRecord

    /** @type {() => string} */
    #resolveDesignator

    /** @type {(designator: string) => boolean} */
    #resolveHidden

    /** @type {(designator: string, hidden: boolean) => void} */
    #setHidden

    /** @type {(designator: string, sourceType: string) => void} */
    #refreshSelection

    /**
     * @param {{ resolveDesignator: () => string, resolveHidden: (designator: string) => boolean, setHidden: (designator: string, hidden: boolean) => void, refreshSelection: (designator: string, sourceType: string) => void }} options Binder callbacks.
     */
    constructor(options) {
        this.#selectionNode = null
        this.#listenerRecord = null
        this.#resolveDesignator = options.resolveDesignator
        this.#resolveHidden = options.resolveHidden
        this.#setHidden = options.setHidden
        this.#refreshSelection = options.refreshSelection
    }

    /**
     * Binds delegated visibility toggles in the selection inspector.
     * @param {HTMLElement | null} selectionNode Inspector node.
     * @returns {void}
     */
    bindSelectionNode(selectionNode) {
        this.dispose()
        this.#selectionNode =
            selectionNode && typeof selectionNode === 'object'
                ? selectionNode
                : null
        if (!this.#selectionNode) {
            return
        }

        const listener = (event) => this.#handleClick(event)
        this.#selectionNode.addEventListener?.('click', listener)
        this.#listenerRecord = {
            node: this.#selectionNode,
            type: 'click',
            listener
        }
    }

    /**
     * Removes the active delegated click listener.
     * @returns {void}
     */
    dispose() {
        if (this.#listenerRecord) {
            const { node, type, listener } = this.#listenerRecord
            node.removeEventListener?.(type, listener)
        }
        this.#listenerRecord = null
        this.#selectionNode = null
    }

    /**
     * Handles one delegated visibility-button click.
     * @param {any} event DOM event.
     * @returns {void}
     */
    #handleClick(event) {
        const button =
            PcbScene3dSelectionVisibilityBinder.#closestVisibilityButton(
                event?.target
            )
        if (!button) {
            return
        }

        event?.preventDefault?.()
        const designator = String(
            button?.getAttribute?.('data-scene-3d-component-visibility') ||
                this.#resolveDesignator() ||
                ''
        ).trim()
        if (!designator) {
            return
        }

        this.#setHidden(designator, !this.#resolveHidden(designator))
        this.#refreshSelection(
            designator,
            String(
                button?.getAttribute?.('data-scene-3d-component-source') || ''
            )
        )
    }

    /**
     * Finds a visibility button from an event target.
     * @param {any} target Event target.
     * @returns {any | null}
     */
    static #closestVisibilityButton(target) {
        const closest = target?.closest?.(
            '[data-scene-3d-component-visibility]'
        )
        return closest ||
            target?.getAttribute?.('data-scene-3d-component-visibility')
            ? closest || target
            : null
    }
}
