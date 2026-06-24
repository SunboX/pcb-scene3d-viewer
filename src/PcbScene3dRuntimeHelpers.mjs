/**
 * Small runtime utilities that do not need access to private runtime state.
 */
export class PcbScene3dRuntimeHelpers {
    /**
     * Yields one turn so the browser can present a rendered frame.
     * @param {typeof globalThis} globalScope Runtime global object.
     * @returns {Promise<void>}
     */
    static async yieldToNextFrame(globalScope) {
        const frameScheduler =
            globalScope?.window?.requestAnimationFrame ||
            globalScope?.requestAnimationFrame
        if (typeof frameScheduler === 'function') {
            await new Promise((resolve) => {
                frameScheduler.call(globalScope?.window || globalScope, () =>
                    resolve()
                )
            })
            return
        }

        await new Promise((resolve) => {
            globalScope?.setTimeout(resolve, 0)
        })
    }

    /**
     * Resolves the drag travel between two pointer positions.
     * @param {{ x: number, y: number }} start Pointer-down position.
     * @param {{ x: number, y: number }} end Pointer-up position.
     * @returns {number}
     */
    static pointerTravel(start, end) {
        const dx = Number(end?.x || 0) - Number(start?.x || 0)
        const dy = Number(end?.y || 0) - Number(start?.y || 0)
        return Math.hypot(dx, dy)
    }
}
