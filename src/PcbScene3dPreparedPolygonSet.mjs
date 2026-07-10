import { PcbScene3dAabbIndex } from './PcbScene3dAabbIndex.mjs'

/**
 * Request-scoped broad-phase index for prepared polygons.
 */
export class PcbScene3dPreparedPolygonSet {
    /** @type {PcbScene3dAabbIndex} */
    #index

    /** @type {Map<*, *>} */
    #sourceMap

    /**
     * Builds a set index while retaining supplied prepared object identities.
     * @param {Iterable<{ source: *, bounds: { minX: number, maxX: number, minY: number, maxY: number } }>} polygons
     */
    constructor(polygons) {
        const preparedPolygons = Array.from(polygons || [])

        this.#index = new PcbScene3dAabbIndex(preparedPolygons, {
            resolveBounds: PcbScene3dPreparedPolygonSet.#resolveBounds,
            resolveSourceIndex: PcbScene3dPreparedPolygonSet.#resolveSetPosition
        })
        this.#sourceMap = new Map()

        for (const polygon of preparedPolygons) {
            if (!this.#sourceMap.has(polygon.source)) {
                this.#sourceMap.set(polygon.source, polygon)
            }
        }
    }

    /**
     * Returns prepared polygons whose bounds overlap requested bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {{ epsilon?: number, stable?: boolean }} [options]
     * @returns {*[]}
     */
    query(bounds, options = {}) {
        return this.#index.query(bounds, options)
    }

    /**
     * Returns the earliest prepared polygon for one source identity.
     * @param {*} source
     * @returns {* | null}
     */
    resolveSource(source) {
        return this.#sourceMap.get(source) ?? null
    }

    /**
     * Resolves prepared polygon bounds for the top-level AABB index.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }} polygon
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveBounds(polygon) {
        return polygon.bounds
    }

    /**
     * Resolves stable order from a polygon's position in this specific set.
     * @param {*} _polygon
     * @param {number} index
     * @returns {number}
     */
    static #resolveSetPosition(_polygon, index) {
        return index
    }
}
