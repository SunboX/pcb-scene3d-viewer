/**
 * Filters copper primitives to one outer board side.
 */
export class PcbScene3dCopperLayerFilter {
    static #TOP_COPPER_LAYER_ID = 1
    static #BOTTOM_COPPER_LAYER_ID = 32

    /**
     * Filters one track list to one outer copper face.
     * @param {any[] | undefined} tracks Track primitives.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {any[]}
     */
    static tracks(tracks, side) {
        return (tracks || []).filter((track) =>
            PcbScene3dCopperLayerFilter.#matchesCopperLayer(track, side)
        )
    }

    /**
     * Filters one arc list to one outer copper face.
     * @param {any[] | undefined} arcs Arc primitives.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {any[]}
     */
    static arcs(arcs, side) {
        return (arcs || []).filter((arc) =>
            PcbScene3dCopperLayerFilter.#matchesCopperLayer(arc, side)
        )
    }

    /**
     * Filters one filled copper list to one outer copper face.
     * @param {any[] | undefined} fills Filled copper primitives.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {any[]}
     */
    static fills(fills, side) {
        return (fills || []).filter((fill) =>
            PcbScene3dCopperLayerFilter.#matchesCopperLayer(fill, side)
        )
    }

    /**
     * Returns true when one primitive belongs to the requested outer copper
     * face.
     * @param {{ layerId?: number, layerCode?: number, layer?: string, layerName?: string, side?: string, layerSide?: string, mountSide?: string }} primitive Primitive.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean}
     */
    static #matchesCopperLayer(primitive, side) {
        const layerId = Number(
            primitive?.layerId ?? primitive?.layerCode ?? NaN
        )
        if (Number.isFinite(layerId)) {
            return side === 'bottom'
                ? layerId ===
                      PcbScene3dCopperLayerFilter.#BOTTOM_COPPER_LAYER_ID
                : layerId === PcbScene3dCopperLayerFilter.#TOP_COPPER_LAYER_ID
        }

        const layerName = String(
            primitive?.layer ||
                primitive?.layerName ||
                primitive?.side ||
                primitive?.layerSide ||
                primitive?.mountSide ||
                ''
        )
            .trim()
            .toLowerCase()

        return side === 'bottom'
            ? ['b.cu', 'bottom', 'back'].includes(layerName)
            : ['f.cu', 'top', 'front'].includes(layerName)
    }
}
