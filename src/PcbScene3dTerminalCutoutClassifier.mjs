/**
 * Classifies terminal clipped triangles that still touch cutout boundaries.
 */
export class PcbScene3dTerminalCutoutClassifier {
    /**
     * Appends a terminal triangle only when it should remain after clipping.
     * @param {number[]} positions Flattened triangle positions.
     * @param {{ x: number, y: number, z?: number }[]} triangle Triangle points.
     * @param {{ isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }[]} cutouts Overlapping cutouts.
     * @param {number} epsilon Geometry tolerance.
     * @returns {void}
     */
    static appendTriangleIfKept(positions, triangle, cutouts, epsilon = 0.001) {
        if (
            !PcbScene3dTerminalCutoutClassifier.shouldKeepTriangle(
                triangle,
                cutouts,
                epsilon
            )
        ) {
            return
        }

        for (const point of triangle) {
            positions.push(point.x, point.y, point.z)
        }
    }

    /**
     * Returns true when a terminal triangle should remain after clipping.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }[]} cutouts Overlapping cutouts.
     * @param {number} epsilon Geometry tolerance.
     * @returns {boolean}
     */
    static shouldKeepTriangle(triangle, cutouts, epsilon = 0.001) {
        if (
            !Array.isArray(cutouts) ||
            cutouts.some((cutout) => !cutout?.isCircular)
        ) {
            return false
        }

        const centroid =
            PcbScene3dTerminalCutoutClassifier.#resolveTriangleCentroid(
                triangle
            )

        return !cutouts.some((cutout) =>
            PcbScene3dTerminalCutoutClassifier.#isPointInsideCircle(
                centroid,
                cutout,
                epsilon
            )
        )
    }

    /**
     * Resolves one triangle centroid.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @returns {{ x: number, y: number }}
     */
    static #resolveTriangleCentroid(triangle) {
        return {
            x:
                (Number(triangle?.[0]?.x || 0) +
                    Number(triangle?.[1]?.x || 0) +
                    Number(triangle?.[2]?.x || 0)) /
                3,
            y:
                (Number(triangle?.[0]?.y || 0) +
                    Number(triangle?.[1]?.y || 0) +
                    Number(triangle?.[2]?.y || 0)) /
                3
        }
    }

    /**
     * Returns true when a point lies in one circular cutout.
     * @param {{ x: number, y: number }} point Point to inspect.
     * @param {{ centerX?: number, centerY?: number, radius?: number }} cutout Circular cutout metadata.
     * @param {number} epsilon Geometry tolerance.
     * @returns {boolean}
     */
    static #isPointInsideCircle(point, cutout, epsilon) {
        const dx = Number(point.x || 0) - Number(cutout?.centerX || 0)
        const dy = Number(point.y || 0) - Number(cutout?.centerY || 0)
        const radius = Math.max(0, Number(cutout?.radius || 0) - epsilon)

        return dx * dx + dy * dy <= radius * radius
    }
}
