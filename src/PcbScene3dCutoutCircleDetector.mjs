/**
 * Detects sampled circular drill cutouts for faster geometry clipping.
 */
export class PcbScene3dCutoutCircleDetector {
    static #DEFAULT_EPSILON = 0.001
    static #MAX_RELATIVE_ERROR = 0.025
    static #MIN_POINT_COUNT = 8

    /**
     * Resolves circle metadata for sampled circular drill cutouts.
     * @param {{ x: number, y: number }[]} points
     * @param {number} [epsilon]
     * @returns {{ isCircular: true, centerX: number, centerY: number, radius: number } | null}
     */
    static resolve(points, epsilon = this.#DEFAULT_EPSILON) {
        if (
            !Array.isArray(points) ||
            points.length < PcbScene3dCutoutCircleDetector.#MIN_POINT_COUNT
        ) {
            return null
        }

        const center = PcbScene3dCutoutCircleDetector.#resolveCentroid(points)
        const radii = points.map((point) =>
            Math.hypot(point.x - center.x, point.y - center.y)
        )
        const radius =
            radii.reduce((sum, value) => sum + value, 0) / radii.length
        const maxError = Math.max(
            ...radii.map((value) => Math.abs(value - radius))
        )
        const tolerance = Math.max(
            Number(epsilon || 0),
            radius * PcbScene3dCutoutCircleDetector.#MAX_RELATIVE_ERROR
        )

        if (
            !Number.isFinite(radius) ||
            radius <= Number(epsilon || 0) ||
            maxError > tolerance
        ) {
            return null
        }

        return {
            isCircular: true,
            centerX: center.x,
            centerY: center.y,
            radius
        }
    }

    /**
     * Resolves squared distance from a point to circular cutout center.
     * @param {{ x: number, y: number }} point
     * @param {{ centerX?: number, centerY?: number }} cutout
     * @returns {number}
     */
    static distanceSquared(point, cutout) {
        const dx = point.x - Number(cutout.centerX || 0)
        const dy = point.y - Number(cutout.centerY || 0)
        return dx * dx + dy * dy
    }

    /**
     * Resolves the centroid of one point list.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ x: number, y: number }}
     */
    static #resolveCentroid(points) {
        const sum = points.reduce(
            (accumulator, point) => ({
                x: accumulator.x + Number(point.x || 0),
                y: accumulator.y + Number(point.y || 0)
            }),
            { x: 0, y: 0 }
        )

        return {
            x: sum.x / points.length,
            y: sum.y / points.length
        }
    }
}
