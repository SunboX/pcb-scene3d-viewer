import { PcbScene3dMaterialFinish } from './PcbScene3dMaterialFinish.mjs'

/**
 * Builds materials for copper that is visible through solder mask.
 */
export class PcbScene3dMaskCoveredCopperMaterial {
    static #COPPER_COLOR = 0xd9a61d
    static #DEFAULT_SOLDER_MASK_COLOR = 0x2a5f27
    static #COPPER_BLEND = 0.04

    /**
     * Builds a mask-covered copper material.
     * @param {any} THREE Three.js namespace.
     * @param {{ solderMaskColor?: number }} [options] Material options.
     * @returns {any}
     */
    static build(THREE, options = {}) {
        return new THREE.MeshStandardMaterial({
            color: PcbScene3dMaskCoveredCopperMaterial.resolveColor(
                options.solderMaskColor
            ),
            ...PcbScene3dMaterialFinish.semiMatteSolderMaskProperties(),
            side: THREE.DoubleSide
        })
    }

    /**
     * Resolves the blended mask-covered copper color.
     * @param {number | undefined} solderMaskColor Solder-mask color.
     * @returns {number}
     */
    static resolveColor(solderMaskColor) {
        return PcbScene3dMaskCoveredCopperMaterial.#blendHexColor(
            PcbScene3dMaskCoveredCopperMaterial.#resolveHexColor(
                solderMaskColor,
                PcbScene3dMaskCoveredCopperMaterial.#DEFAULT_SOLDER_MASK_COLOR
            ),
            PcbScene3dMaskCoveredCopperMaterial.#COPPER_COLOR,
            PcbScene3dMaskCoveredCopperMaterial.#COPPER_BLEND
        )
    }

    /**
     * Resolves a valid hex color.
     * @param {number | undefined} color Candidate color.
     * @param {number} fallback Fallback color.
     * @returns {number}
     */
    static #resolveHexColor(color, fallback) {
        return Number.isInteger(color) ? color : fallback
    }

    /**
     * Blends two integer RGB colors.
     * @param {number} baseColor Base color.
     * @param {number} overlayColor Overlay color.
     * @param {number} overlayRatio Overlay ratio from 0 to 1.
     * @returns {number}
     */
    static #blendHexColor(baseColor, overlayColor, overlayRatio) {
        const ratio = Math.min(Math.max(Number(overlayRatio || 0), 0), 1)
        const inverse = 1 - ratio

        return [16, 8, 0].reduce((output, shift) => {
            const channel = Math.round(
                ((baseColor >> shift) & 255) * inverse +
                    ((overlayColor >> shift) & 255) * ratio
            )
            return output | (channel << shift)
        }, 0)
    }
}
