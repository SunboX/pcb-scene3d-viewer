/**
 * Builds polygon cutouts matching round-capped scene stroke geometry.
 */
export class PcbScene3dStrokeCutoutBuilder {
    static #ROUND_CAP_SEGMENTS = 16

    /**
     * Builds one capsule-shaped cutout around a stroke segment.
     * @param {{ x: number, y: number }} start Segment start.
     * @param {{ x: number, y: number }} end Segment end.
     * @param {number} width Stroke width.
     * @param {{ minWidth?: number }} [options] Width constraints.
     * @returns {{ x: number, y: number }[]}
     */
    static build(start, end, width, options = {}) {
        const startPoint = PcbScene3dStrokeCutoutBuilder.#point(start)
        const endPoint = PcbScene3dStrokeCutoutBuilder.#point(end)
        if (!startPoint || !endPoint) return []

        const radius =
            Math.max(Number(width) || 1, Number(options?.minWidth) || 1) / 2
        const dx = endPoint.x - startPoint.x
        const dy = endPoint.y - startPoint.y
        const length = Math.hypot(dx, dy)
        if (length <= 0.001) {
            return PcbScene3dStrokeCutoutBuilder.#circle(startPoint, radius)
        }

        const angle = Math.atan2(dy, dx)
        return [
            ...PcbScene3dStrokeCutoutBuilder.#semicircle(
                startPoint,
                radius,
                angle + Math.PI / 2
            ),
            ...PcbScene3dStrokeCutoutBuilder.#semicircle(
                endPoint,
                radius,
                angle - Math.PI / 2
            )
        ]
    }

    /**
     * Builds one semicircular cap in contour order.
     * @param {{ x: number, y: number }} center Cap center.
     * @param {number} radius Cap radius.
     * @param {number} startAngle Starting angle in radians.
     * @returns {{ x: number, y: number }[]}
     */
    static #semicircle(center, radius, startAngle) {
        return Array.from(
            { length: PcbScene3dStrokeCutoutBuilder.#ROUND_CAP_SEGMENTS + 1 },
            (_unused, index) => {
                const angle =
                    startAngle +
                    (Math.PI * index) /
                        PcbScene3dStrokeCutoutBuilder.#ROUND_CAP_SEGMENTS
                return {
                    x: center.x + Math.cos(angle) * radius,
                    y: center.y + Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Builds one circular cutout.
     * @param {{ x: number, y: number }} center Circle center.
     * @param {number} radius Circle radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #circle(center, radius) {
        return Array.from(
            { length: PcbScene3dStrokeCutoutBuilder.#ROUND_CAP_SEGMENTS },
            (_unused, index) => {
                const angle =
                    (Math.PI * 2 * index) /
                    PcbScene3dStrokeCutoutBuilder.#ROUND_CAP_SEGMENTS
                return {
                    x: center.x + Math.cos(angle) * radius,
                    y: center.y + Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Resolves one finite point.
     * @param {unknown} point Candidate point.
     * @returns {{ x: number, y: number } | null}
     */
    static #point(point) {
        const x = Number(point?.x)
        const y = Number(point?.y)
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
    }
}
