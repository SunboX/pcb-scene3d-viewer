import { PcbScene3dSelectionMarkerFactory } from './PcbScene3dSelectionMarkerFactory.mjs'

/**
 * Owns the render group used for the current selected-component marker.
 */
export class PcbScene3dSelectionMarkerOverlay {
    #markerGroup

    /**
     * @param {any} markerGroup Three group that hosts selection marker meshes.
     */
    constructor(markerGroup) {
        this.#markerGroup = markerGroup
    }

    /**
     * Clears and rebuilds the selected-component marker.
     * @param {any} THREE Three.js namespace.
     * @param {object | null} sceneDescription Normalized scene description.
     * @param {string} selectedDesignator Selected component designator.
     * @param {boolean} selectedComponentHidden Whether the component is hidden.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint Board/detail coordinate normalizer.
     * @param {{ color?: number }} [options] Marker options.
     * @returns {void}
     */
    update(
        THREE,
        sceneDescription,
        selectedDesignator,
        selectedComponentHidden,
        normalizePoint,
        options = {}
    ) {
        if (!this.#markerGroup) {
            return
        }

        PcbScene3dSelectionMarkerOverlay.#clearGroup(this.#markerGroup)
        if (!THREE || !selectedDesignator || selectedComponentHidden) {
            return
        }

        const marker = PcbScene3dSelectionMarkerFactory.build(
            THREE,
            sceneDescription,
            selectedDesignator,
            normalizePoint,
            options
        )
        if (marker) {
            this.#markerGroup.add(marker)
        }
    }

    /**
     * Clears a Three group while keeping tests compatible with tiny fakes.
     * @param {any} group Render group.
     * @returns {void}
     */
    static #clearGroup(group) {
        if (typeof group?.clear === 'function') {
            group.clear()
            return
        }

        if (Array.isArray(group?.children)) {
            group.children.length = 0
        }
    }
}
