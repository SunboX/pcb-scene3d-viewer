import { PcbScene3dCutoutCircleDetector } from './PcbScene3dCutoutCircleDetector.mjs'

/**
 * Resolves analytic overlap checks for sampled circular drill cutouts.
 */
export class PcbScene3dCircularCutoutOverlap {
    /**
     * Returns true when one triangle overlaps a circular cutout.
     * @param {{ x: number, y: number }[]} triangle
     * @param {{ points?: { x: number, y: number }[], centerX?: number, centerY?: number, radius?: number }} cutout
     * @param {number} [epsilon]
     * @returns {boolean}
     */
    static overlapsTriangle(triangle, cutout, epsilon = 0.001) {
        const radius = Number(cutout?.radius || 0) + Number(epsilon || 0)
        if (!Number.isFinite(radius) || radius <= 0) {
            return false
        }

        const center = {
            x: Number(cutout?.centerX || 0),
            y: Number(cutout?.centerY || 0)
        }
        const radiusSquared = radius * radius

        for (const point of triangle) {
            if (
                PcbScene3dCutoutCircleDetector.distanceSquared(point, cutout) <=
                radiusSquared
            ) {
                return true
            }
        }

        if (
            PcbScene3dCircularCutoutOverlap.#isPointInsideOrOnTriangle(
                center,
                triangle,
                epsilon
            )
        ) {
            return true
        }

        for (let index = 0; index < triangle.length; index += 1) {
            const current = triangle[index]
            const next = triangle[(index + 1) % triangle.length]

            if (
                PcbScene3dCircularCutoutOverlap.#distanceToSegmentSquared(
                    center,
                    current,
                    next,
                    epsilon
                ) <= radiusSquared
            ) {
                return true
            }
        }

        return PcbScene3dCircularCutoutOverlap.#hasSampledBoundaryOverlap(
            triangle,
            cutout,
            epsilon
        )
    }

    /**
     * Returns true when a sampled cutout boundary point lies in the triangle.
     * @param {{ x: number, y: number }[]} triangle
     * @param {{ points?: { x: number, y: number }[] }} cutout
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #hasSampledBoundaryOverlap(triangle, cutout, epsilon) {
        const boundaryPoints = Array.isArray(cutout?.points)
            ? cutout.points
            : []
        const step = Math.max(1, Math.floor(boundaryPoints.length / 8))

        for (let index = 0; index < boundaryPoints.length; index += step) {
            if (
                PcbScene3dCircularCutoutOverlap.#isPointInsideOrOnTriangle(
                    boundaryPoints[index],
                    triangle,
                    epsilon
                )
            ) {
                return true
            }
        }

        return false
    }

    /**
     * Returns true when a point is inside or on one triangle.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} triangle
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #isPointInsideOrOnTriangle(point, triangle, epsilon) {
        let hasNegative = false
        let hasPositive = false

        for (let index = 0; index < triangle.length; index += 1) {
            const current = triangle[index]
            const next = triangle[(index + 1) % triangle.length]
            const sign = PcbScene3dCircularCutoutOverlap.#cross(
                point,
                current,
                next
            )

            hasNegative = hasNegative || sign < -epsilon
            hasPositive = hasPositive || sign > epsilon
        }

        return !(hasNegative && hasPositive)
    }

    /**
     * Resolves the squared distance from one point to a finite segment.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @param {number} epsilon
     * @returns {number}
     */
    static #distanceToSegmentSquared(point, start, end, epsilon) {
        const dx = end.x - start.x
        const dy = end.y - start.y
        const lengthSquared = dx * dx + dy * dy

        if (lengthSquared <= epsilon) {
            return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
        }

        const ratio = Math.max(
            0,
            Math.min(
                1,
                ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                    lengthSquared
            )
        )
        const projectedX = start.x + ratio * dx
        const projectedY = start.y + ratio * dy

        return (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2
    }

    /**
     * Resolves the signed area for three points.
     * @param {{ x: number, y: number }} first
     * @param {{ x: number, y: number }} second
     * @param {{ x: number, y: number }} third
     * @returns {number}
     */
    static #cross(first, second, third) {
        return (
            (second.x - first.x) * (third.y - first.y) -
            (second.y - first.y) * (third.x - first.x)
        )
    }
}
