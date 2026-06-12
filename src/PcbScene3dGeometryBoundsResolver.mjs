/**
 * Resolves lightweight XY bounds for Three.js-style geometry attributes.
 */
export class PcbScene3dGeometryBoundsResolver {
    /**
     * Resolves the XY bounds for one position attribute.
     * @param {{ count?: number, getX?: (index: number) => number, getY?: (index: number) => number }} position Position attribute.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static resolvePositionBounds(position) {
        const bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }

        for (let index = 0; index < Number(position?.count || 0); index += 1) {
            const x = Number(position.getX?.(index) || 0)
            const y = Number(position.getY?.(index) || 0)

            bounds.minX = Math.min(bounds.minX, x)
            bounds.maxX = Math.max(bounds.maxX, x)
            bounds.minY = Math.min(bounds.minY, y)
            bounds.maxY = Math.max(bounds.maxY, y)
        }

        return bounds
    }

    /**
     * Returns true when one bounds box overlaps any entry bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds to test.
     * @param {{ bounds?: { minX: number, maxX: number, minY: number, maxY: number } }[]} entries Entries with bounds.
     * @param {number} [epsilon] Overlap tolerance.
     * @returns {boolean}
     */
    static overlapsAny(bounds, entries, epsilon = 0) {
        return (Array.isArray(entries) ? entries : []).some((entry) =>
            PcbScene3dGeometryBoundsResolver.#boundsOverlap(
                bounds,
                entry?.bounds,
                epsilon
            )
        )
    }

    /**
     * Returns true when one position attribute cannot overlap any entry bounds.
     * @param {{ count?: number, getX?: (index: number) => number, getY?: (index: number) => number }} position Position attribute.
     * @param {{ bounds?: { minX: number, maxX: number, minY: number, maxY: number } }[]} entries Entries with bounds.
     * @param {number} [epsilon] Overlap tolerance.
     * @returns {boolean}
     */
    static missesAllPositionBounds(position, entries, epsilon = 0) {
        return !PcbScene3dGeometryBoundsResolver.overlapsAny(
            PcbScene3dGeometryBoundsResolver.resolvePositionBounds(position),
            entries,
            epsilon
        )
    }

    /**
     * Returns true when two bounding boxes overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first First bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number } | undefined} second Second bounds.
     * @param {number} epsilon Overlap tolerance.
     * @returns {boolean}
     */
    static #boundsOverlap(first, second, epsilon) {
        return (
            first.minX <= Number(second?.maxX) + epsilon &&
            first.maxX >= Number(second?.minX) - epsilon &&
            first.minY <= Number(second?.maxY) + epsilon &&
            first.maxY >= Number(second?.minY) - epsilon
        )
    }
}
