import earcut from 'earcut'
import { PcbScene3dCutoutCircleDetector } from './PcbScene3dCutoutCircleDetector.mjs'

/** Prepares convex vertical prisms for copper occlusion subtraction. */
export class PcbScene3dCopperOcclusionPlanes {
    /**
     * Decomposes simple concave contours while retaining convex contours whole.
     * @param {{ x: number, y: number }[][]} cutouts Occlusion contours.
     * @returns {object[]} Convex prisms with bounds and inward half planes.
     */
    static prepare(cutouts) {
        const result = []
        for (const cutout of cutouts) {
            const points = []
            for (const point of Array.isArray(cutout) ? cutout : []) {
                const x = Number(point?.x || 0)
                const y = Number(point?.y || 0)
                const previous = points[points.length - 1]
                if (
                    Number.isFinite(x) &&
                    Number.isFinite(y) &&
                    (!previous || x !== previous.x || y !== previous.y)
                ) {
                    points.push({ x, y })
                }
            }
            if (
                points.length > 1 &&
                points[0].x === points.at(-1).x &&
                points[0].y === points.at(-1).y
            )
                points.pop()
            if (points.length < 3) continue
            const circle = PcbScene3dCutoutCircleDetector.resolve(points)
            if (circle) {
                result.push(this.#circle(circle, points.length))
                continue
            }
            if (this.#isConvex(points)) {
                result.push(this.#polygon(points))
                continue
            }
            const indices = earcut(points.flatMap(({ x, y }) => [x, y]))
            for (let i = 0; i < indices.length; i += 3) {
                result.push(
                    this.#polygon([
                        points[indices[i]],
                        points[indices[i + 1]],
                        points[indices[i + 2]]
                    ])
                )
            }
        }
        return result.filter((entry) => entry.planes.length >= 3)
    }

    /**
     * Checks turn orientation, including collinear vertices.
     * @param {object[]} points Contour vertices.
     * @returns {boolean} Whether the contour is convex.
     */
    static #isConvex(points) {
        let direction = 0
        for (let i = 0; i < points.length; i += 1) {
            const a = points[i],
                b = points[(i + 1) % points.length],
                c = points[(i + 2) % points.length]
            const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
            if (cross === 0) continue
            if (direction && Math.sign(cross) !== direction) return false
            direction = Math.sign(cross)
        }
        return direction !== 0
    }

    /**
     * Builds normalized inward half planes for either contour winding.
     * @param {object[]} points Convex contour vertices.
     * @returns {object} Prepared prism.
     */
    static #polygon(points) {
        let area = 0
        const origin = points[0]
        for (let i = 1; i + 1 < points.length; i += 1) {
            area +=
                (points[i].x - origin.x) * (points[i + 1].y - origin.y) -
                (points[i].y - origin.y) * (points[i + 1].x - origin.x)
        }
        const direction = Math.sign(area)
        const planes = []
        const bounds = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        }
        for (let i = 0; i < points.length; i += 1) {
            const a = points[i],
                b = points[(i + 1) % points.length]
            const length = Math.hypot(b.x - a.x, b.y - a.y)
            if (length && direction) {
                const x = (direction * (a.y - b.y)) / length
                const y = (direction * (b.x - a.x)) / length
                planes.push({ x, y, offset: x * a.x + y * a.y })
            }
            bounds.minX = Math.min(bounds.minX, a.x)
            bounds.maxX = Math.max(bounds.maxX, a.x)
            bounds.minY = Math.min(bounds.minY, a.y)
            bounds.maxY = Math.max(bounds.maxY, a.y)
        }
        return { planes, bounds }
    }

    /**
     * Uses tangents so sampled circles never leave copper slivers inside a pad.
     * @param {object} circle Analytic circle metadata.
     * @param {number} pointCount Source contour resolution.
     * @returns {object} Conservative circular prism.
     */
    static #circle(circle, pointCount) {
        const count = Math.max(32, pointCount)
        const { centerX, centerY, radius } = circle
        const planes = []
        for (let i = 0; i < count; i += 1) {
            const angle = (2 * Math.PI * i) / count
            const x = Math.cos(angle),
                y = Math.sin(angle)
            planes.push({
                x: -x,
                y: -y,
                offset: -x * centerX - y * centerY - radius
            })
        }
        const extent = radius / Math.cos(Math.PI / count)
        return {
            planes,
            bounds: {
                minX: centerX - extent,
                maxX: centerX + extent,
                minY: centerY - extent,
                maxY: centerY + extent
            }
        }
    }
}
