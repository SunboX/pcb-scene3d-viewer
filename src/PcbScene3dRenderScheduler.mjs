/**
 * Coalesces high-frequency scene renders into animation frames.
 */
export class PcbScene3dRenderScheduler {
    /** @type {() => void} */
    #render

    /** @type {number | null} */
    #pendingFrame

    /**
     * @param {() => void} render Render callback.
     */
    constructor(render) {
        this.#render = render
        this.#pendingFrame = null
    }

    /**
     * Queues a render for the next animation frame.
     * @returns {void}
     */
    schedule() {
        if (this.#pendingFrame !== null) {
            return
        }

        const requestFrame = globalThis.window?.requestAnimationFrame
        if (typeof requestFrame !== 'function') {
            this.#render()
            return
        }

        this.#pendingFrame = requestFrame(() => {
            this.#pendingFrame = null
            this.#render()
        })
    }

    /**
     * Cancels one pending animation-frame render.
     * @returns {void}
     */
    cancel() {
        if (this.#pendingFrame === null) {
            return
        }

        const cancelFrame = globalThis.window?.cancelAnimationFrame
        if (typeof cancelFrame === 'function') {
            cancelFrame(this.#pendingFrame)
        }
        this.#pendingFrame = null
    }
}
