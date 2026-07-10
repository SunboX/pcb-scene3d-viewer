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
        let radiusSum = 0
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index]
            radiusSum += Math.hypot(point.x - center.x, point.y - center.y)
        }
        const radius = radiusSum / points.length
        let maxError = -Infinity
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index]
            const value = Math.hypot(point.x - center.x, point.y - center.y)
            maxError = Math.max(maxError, Math.abs(value - radius))
        }
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
        let totalX = 0
        let totalY = 0
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index]
            totalX += Number(point.x || 0)
            totalY += Number(point.y || 0)
        }

        return {
            x: totalX / points.length,
            y: totalY / points.length
        }
    }
}
