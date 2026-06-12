/**
 * Tracks external model placements that came from app-side model lookup.
 */
export class PcbScene3dModelSearchPlacement {
    /**
     * Adds one loaded placement root when its model came from lookup.
     * @param {any} placement External model placement.
     * @param {any} rootObject Loaded model root.
     * @param {Set<any>} roots Tracked lookup model roots.
     * @returns {void}
     */
    static registerRoot(placement, rootObject, roots) {
        if (
            rootObject &&
            roots &&
            PcbScene3dModelSearchPlacement.isPlacement(placement)
        ) {
            roots.add(rootObject)
        }
    }

    /**
     * Checks whether an external placement came from app-side model lookup.
     * @param {{ source?: string, origin?: string, externalModel?: { source?: string, origin?: string } }} placement External model placement.
     * @returns {boolean}
     */
    static isPlacement(placement) {
        return [
            placement?.source,
            placement?.origin,
            placement?.externalModel?.source,
            placement?.externalModel?.origin
        ].some(
            (value) =>
                String(value || '')
                    .trim()
                    .toLowerCase() === 'model-search'
        )
    }
}
