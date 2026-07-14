import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'

/**
 * Resolves authored via layer spans for surface-aware scene geometry.
 */
export class PcbScene3dViaLayerSpan {
    /**
     * Preserves an authored span in normalized scene-detail fields.
     * Explicit layer lists take precedence over legacy default endpoints.
     * @param {object} via CircuitJSON via or normalized scene via.
     * @returns {{ layers: unknown[], fromLayer: unknown | null, toLayer: unknown | null }}
     */
    static fields(via) {
        const span = PcbScene3dViaLayerSpan.#resolve(via)
        return {
            layers: span.layers,
            fromLayer: span.fromLayer,
            toLayer: span.toLayer
        }
    }

    /**
     * Resolves the outer board faces reached by one via.
     * @param {object} via CircuitJSON via or normalized scene via.
     * @returns {('top' | 'bottom')[]}
     */
    static surfaceSides(via) {
        const sides = PcbScene3dViaLayerSpan.#resolve(via)
            .layers.map((layer) =>
                PcbScene3dCircuitJsonLayer.surfaceSide(layer)
            )
            .filter(Boolean)
        return [...new Set(sides)]
    }

    /**
     * Returns true when one via reaches the requested board face.
     * Vias without authored span metadata retain legacy through-board behavior.
     * @param {object} via CircuitJSON via or normalized scene via.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {boolean}
     */
    static reachesSide(via, side) {
        const span = PcbScene3dViaLayerSpan.#resolve(via)
        if (!span.hasAuthoredSpan) return true

        return span.layers.some(
            (layer) => PcbScene3dCircuitJsonLayer.surfaceSide(layer) === side
        )
    }

    /**
     * Resolves the physical surface geometry mode for one via.
     * Inner-only vias have no outer-surface geometry and return null.
     * @param {object} via CircuitJSON via or normalized scene via.
     * @returns {'through' | 'top' | 'bottom' | null}
     */
    static renderMode(via) {
        const span = PcbScene3dViaLayerSpan.#resolve(via)
        if (!span.hasAuthoredSpan) return 'through'

        const sides = span.layers
            .map((layer) => PcbScene3dCircuitJsonLayer.surfaceSide(layer))
            .filter(Boolean)
        const reachesTop = sides.includes('top')
        const reachesBottom = sides.includes('bottom')
        if (reachesTop && reachesBottom) return 'through'
        if (reachesTop) return 'top'
        if (reachesBottom) return 'bottom'
        return null
    }

    /**
     * Resolves one via span while retaining whether it was explicitly authored.
     * @param {object} via CircuitJSON via or normalized scene via.
     * @returns {{ layers: unknown[], fromLayer: unknown | null, toLayer: unknown | null, hasAuthoredSpan: boolean }}
     */
    static #resolve(via) {
        const explicitLayers = PcbScene3dViaLayerSpan.#explicitLayers(
            via?.layers
        )
        const fromLayer =
            explicitLayers[0] ??
            via?.fromLayer ??
            via?.from_layer ??
            via?.layer ??
            null
        const toLayer =
            explicitLayers[explicitLayers.length - 1] ??
            via?.toLayer ??
            via?.to_layer ??
            via?.layer ??
            null
        const layers = explicitLayers.length
            ? [...explicitLayers]
            : [fromLayer, toLayer].filter(
                  (layer, index, values) =>
                      layer !== null && values.indexOf(layer) === index
              )

        return {
            layers,
            fromLayer,
            toLayer,
            hasAuthoredSpan: layers.length > 0
        }
    }

    /**
     * Normalizes an explicit via layer list without interpreting layer names.
     * @param {unknown} layers CircuitJSON layer list.
     * @returns {unknown[]}
     */
    static #explicitLayers(layers) {
        const values = Array.isArray(layers)
            ? layers
            : typeof layers === 'string'
              ? layers.split(',')
              : []
        return values
            .map((layer) => (typeof layer === 'string' ? layer.trim() : layer))
            .filter(
                (layer) => layer !== undefined && layer !== null && layer !== ''
            )
    }
}
