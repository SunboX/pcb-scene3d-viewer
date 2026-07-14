const OUTER_COPPER_LAYER_SIDES = new Map([
    ['f.cu', 'top'],
    ['front copper', 'top'],
    ['top copper', 'top'],
    ['top layer', 'top'],
    ['b.cu', 'bottom'],
    ['back copper', 'bottom'],
    ['bottom copper', 'bottom'],
    ['bottom layer', 'bottom']
])

const SOLDER_MASK_LAYER_SIDES = new Map([
    ['f.mask', 'top'],
    ['front mask', 'top'],
    ['top mask', 'top'],
    ['front solder', 'top'],
    ['top solder', 'top'],
    ['front solder mask', 'top'],
    ['top solder mask', 'top'],
    ['b.mask', 'bottom'],
    ['back mask', 'bottom'],
    ['bottom mask', 'bottom'],
    ['back solder', 'bottom'],
    ['bottom solder', 'bottom'],
    ['back solder mask', 'bottom'],
    ['bottom solder mask', 'bottom']
])

/**
 * Classifies source-layer metadata retained beside canonical CircuitJSON rows.
 */
export class PcbScene3dCircuitJsonSourceLayer {
    /**
     * Returns whether an element originated on a silkscreen layer.
     * @param {object} element CircuitJSON element.
     * @returns {boolean}
     */
    static isSilkscreen(element) {
        return PcbScene3dCircuitJsonSourceLayer.#normalizedName(
            element
        ).includes('silk')
    }

    /**
     * Resolves an outer-copper source layer to its board side.
     * @param {object} element CircuitJSON element.
     * @returns {'top' | 'bottom' | null}
     */
    static outerCopperSide(element) {
        return (
            OUTER_COPPER_LAYER_SIDES.get(
                PcbScene3dCircuitJsonSourceLayer.#normalizedName(element)
            ) || null
        )
    }

    /**
     * Returns whether an element originated on an outer copper layer.
     * @param {object} element CircuitJSON element.
     * @returns {boolean}
     */
    static isOuterCopper(element) {
        return (
            PcbScene3dCircuitJsonSourceLayer.outerCopperSide(element) !== null
        )
    }

    /**
     * Resolves a solder-mask source layer to its board side.
     * @param {object} element CircuitJSON element.
     * @returns {'top' | 'bottom' | null}
     */
    static solderMaskSide(element) {
        return (
            SOLDER_MASK_LAYER_SIDES.get(
                PcbScene3dCircuitJsonSourceLayer.#normalizedName(element)
            ) || null
        )
    }

    /**
     * Returns whether an element originated on a solder-mask layer.
     * @param {object} element CircuitJSON element.
     * @returns {boolean}
     */
    static isSolderMask(element) {
        return PcbScene3dCircuitJsonSourceLayer.solderMaskSide(element) !== null
    }

    /**
     * Returns whether an element belongs to copper or its mask aperture data.
     * @param {object} element CircuitJSON element.
     * @returns {boolean}
     */
    static isCopperOrSolderMask(element) {
        return (
            PcbScene3dCircuitJsonSourceLayer.isOuterCopper(element) ||
            PcbScene3dCircuitJsonSourceLayer.isSolderMask(element)
        )
    }

    /**
     * Resolves a normalized source-layer name from one CircuitJSON element.
     * @param {object} element CircuitJSON element.
     * @returns {string}
     */
    static #normalizedName(element) {
        return PcbScene3dCircuitJsonSourceLayer.#name(
            element?.source_layer ?? element?.sourceLayer
        ).toLowerCase()
    }

    /**
     * Resolves a string layer name from scalar or object metadata.
     * @param {unknown} layer Source-layer metadata.
     * @returns {string}
     */
    static #name(layer) {
        if (layer && typeof layer === 'object') {
            return String(layer.name ?? layer.layer ?? '').trim()
        }
        return String(layer ?? '').trim()
    }
}
