/**
 * Resolves which external-model placements can be centered after loading.
 */
export class PcbScene3dExternalModelCenteringPolicy {
    /**
     * Checks whether a loaded model should be centered on its owner footprint.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static shouldCenterOnOwner(placement) {
        const source = String(placement?.projection?.source || '').toLowerCase()
        if (source === 'pad-fallback') {
            return true
        }

        return (
            source === 'model-anchor-fallback' &&
            Boolean(placement?.modelTransform?.ownerAnchorOffsetMil)
        )
    }
}
