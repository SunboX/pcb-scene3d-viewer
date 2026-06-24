/**
 * Resolves source-origin adjustment policy for external model placements.
 */
export class PcbScene3dExternalModelSourceOriginPolicy {
    /**
     * Checks whether an explicit owner anchor should keep source-origin repair
     * disabled. Translucent cover-sized bodies use corner-origin STEP data, so
     * they still need the embedded source-origin correction.
     * @param {{ bodyOpacity?: number | string, modelTransform?: { ownerAnchorOffsetMil?: object }, projection?: { boundsMil?: { width?: number, depth?: number } } }} placement Placement metadata.
     * @returns {boolean}
     */
    static shouldSkipOwnerAnchoredAdjustment(placement) {
        return (
            Boolean(placement?.modelTransform?.ownerAnchorOffsetMil) &&
            !PcbScene3dExternalModelSourceOriginPolicy.#isTransparentCoverSizedPlacement(
                placement
            )
        )
    }

    /**
     * Checks whether a placement looks like an authored translucent cover body.
     * @param {{ bodyOpacity?: number | string, projection?: { boundsMil?: { width?: number, depth?: number } } }} placement Placement metadata.
     * @returns {boolean}
     */
    static #isTransparentCoverSizedPlacement(placement) {
        const opacity = Number(placement?.bodyOpacity)
        const bounds = placement?.projection?.boundsMil || {}
        const width = Number(bounds.width)
        const depth = Number(bounds.depth)

        return (
            Number.isFinite(opacity) &&
            opacity >= 0 &&
            opacity < 1 &&
            Number.isFinite(width) &&
            Number.isFinite(depth) &&
            Math.min(Math.abs(width), Math.abs(depth)) >= 200
        )
    }
}
