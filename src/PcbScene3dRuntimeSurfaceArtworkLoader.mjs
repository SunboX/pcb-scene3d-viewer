import { PcbScene3dRuntimeHelpers } from './PcbScene3dRuntimeHelpers.mjs'
import { PcbScene3dSilkscreenChunkedFactory } from './PcbScene3dSilkscreenChunkedFactory.mjs'
import { PcbScene3dTrueTypeTextFactory } from './PcbScene3dTrueTypeTextFactory.mjs'

/**
 * Loads deferred surface artwork groups into the runtime scene.
 */
export class PcbScene3dRuntimeSurfaceArtworkLoader {
    /**
     * Builds and attaches one surface artwork group.
     * @param {object} options Loader options.
     * @param {any} options.three Three.js namespace.
     * @param {any} options.group Target group.
     * @param {object} options.artwork Side-specific artwork detail.
     * @param {number} options.topZ Top-side center Z.
     * @param {number} options.bottomZ Bottom-side center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} options.normalizePoint Coordinate normalizer.
     * @param {() => boolean} options.shouldContinue Continuation guard.
     * @param {boolean} [options.prepareFonts] Whether to prepare embedded fonts.
     * @param {object[]} [options.embeddedFonts] Embedded font descriptors.
     * @returns {Promise<boolean> | boolean}
     */
    static load(options) {
        if (
            !options?.group ||
            options.group.children.length ||
            options.artwork == null
        ) {
            return false
        }

        if (
            !PcbScene3dRuntimeSurfaceArtworkLoader.#hasArtwork(options.artwork)
        ) {
            PcbScene3dRuntimeSurfaceArtworkLoader.#buildGroup(options)
            return false
        }

        return (
            options.prepareFonts
                ? PcbScene3dTrueTypeTextFactory.prepareEmbeddedFonts(
                      options.embeddedFonts || []
                  )
                : Promise.resolve()
        )
            .then(() =>
                PcbScene3dRuntimeSurfaceArtworkLoader.#buildGroup(options)
            )
            .then((detailGroup) => {
                if (!options.shouldContinue() || !detailGroup.children.length) {
                    return false
                }

                options.group.add(detailGroup)
                return true
            })
    }

    /**
     * Builds one overlay group.
     * @param {object} options Loader options.
     * @returns {Promise<any> | any}
     */
    static #buildGroup(options) {
        return PcbScene3dSilkscreenChunkedFactory.buildGroup(
            options.three,
            options.artwork || {},
            options.topZ,
            options.bottomZ,
            options.normalizePoint,
            {
                shouldContinue: options.shouldContinue,
                yieldToMain: () =>
                    PcbScene3dRuntimeHelpers.yieldToNextFrame(globalThis)
            }
        )
    }

    /**
     * Checks whether surface artwork has drawable records.
     * @param {{ top?: object, bottom?: object }} artwork Surface artwork.
     * @returns {boolean}
     */
    static #hasArtwork(artwork) {
        return ['top', 'bottom'].some((side) =>
            ['tracks', 'arcs', 'fills', 'texts'].some(
                (recordKey) => (artwork?.[side]?.[recordKey] || []).length > 0
            )
        )
    }
}
