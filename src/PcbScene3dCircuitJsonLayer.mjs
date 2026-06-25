const TOP_LAYER_ID = 1
const BOTTOM_LAYER_ID = 32

/**
 * Normalizes CircuitJSON layer values for scene-detail primitives.
 */
export class PcbScene3dCircuitJsonLayer {
    /**
     * Resolves a board side, defaulting unknown values to the top side.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom'}
     */
    static side(layer) {
        const value = PcbScene3dCircuitJsonLayer.#value(layer)
        return PcbScene3dCircuitJsonLayer.#isBottomSideValue(value)
            ? 'bottom'
            : 'top'
    }

    /**
     * Resolves an explicit outer copper side.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom' | null}
     */
    static surfaceSide(layer) {
        const value = PcbScene3dCircuitJsonLayer.#value(layer)
        if (PcbScene3dCircuitJsonLayer.#isBottomSurfaceValue(value)) {
            return 'bottom'
        }
        if (PcbScene3dCircuitJsonLayer.#isTopSurfaceValue(value)) {
            return 'top'
        }
        return null
    }

    /**
     * Returns true when a layer value targets an inner layer.
     * @param {unknown} layer Layer value.
     * @returns {boolean}
     */
    static isInner(layer) {
        const value = PcbScene3dCircuitJsonLayer.#value(layer)
        return value.startsWith('inner') || value.includes('.inner')
    }

    /**
     * Resolves the numeric layer ID used by copper detail primitives.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {number}
     */
    static layerId(side) {
        return side === 'bottom' ? BOTTOM_LAYER_ID : TOP_LAYER_ID
    }

    /**
     * Returns true when a layer value targets top copper.
     * @param {string} value Normalized layer value.
     * @returns {boolean}
     */
    static #isTopSurfaceValue(value) {
        return (
            value === 'top' ||
            value === 'front' ||
            value === 'f.cu' ||
            value === '1'
        )
    }

    /**
     * Returns true when a layer value targets bottom copper.
     * @param {string} value Normalized layer value.
     * @returns {boolean}
     */
    static #isBottomSurfaceValue(value) {
        return (
            value === 'bottom' ||
            value === 'back' ||
            value === 'b.cu' ||
            value === '32'
        )
    }

    /**
     * Returns true when a layer value targets bottom-side artwork or copper.
     * @param {string} value Normalized layer value.
     * @returns {boolean}
     */
    static #isBottomSideValue(value) {
        return (
            PcbScene3dCircuitJsonLayer.#isBottomSurfaceValue(value) ||
            value.includes('bottom') ||
            value.includes('back') ||
            value.startsWith('b.') ||
            value.startsWith('b_')
        )
    }

    /**
     * Converts layer-like input into a normalized string token.
     * @param {unknown} layer Layer value.
     * @returns {string}
     */
    static #value(layer) {
        const value =
            typeof layer === 'object' && layer !== null ? layer.name : layer
        return String(value || '')
            .trim()
            .toLowerCase()
    }
}
