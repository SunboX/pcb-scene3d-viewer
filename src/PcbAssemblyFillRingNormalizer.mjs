const COORDINATE_EPSILON = 0.001
const AREA_EPSILON = 0.001

/**
 * Normalizes saved copper fill rings before triangulation and export.
 */
export class PcbAssemblyFillRingNormalizer {
    /**
     * Normalizes one ring into a clean, optionally oriented loop.
     * @param {unknown[]} points Candidate point rows.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number, winding?: 'positive' | 'negative' }} options Normalization options.
     * @returns {{ loop: number[][], diagnostic: object | null, area: number }}
     */
    static normalize(points, options = {}) {
        const rows = PcbAssemblyFillRingNormalizer.#pointRows(points)
        const hasNonFinitePoint = rows.some((row) => !row.isFinite)
        if (hasNonFinitePoint) {
            return PcbAssemblyFillRingNormalizer.#result(
                [],
                'non-finite-point',
                options,
                rows.length,
                0
            )
        }

        const loop = PcbAssemblyFillRingNormalizer.#cleanLoop(
            rows.map((row) => [row.x, row.y])
        )
        const signedArea = PcbAssemblyFillRingNormalizer.signedArea(loop)
        const area = Math.abs(signedArea)
        if (loop.length < 3) {
            return PcbAssemblyFillRingNormalizer.#result(
                loop,
                'too-few-points',
                options,
                loop.length,
                area
            )
        }
        if (area <= AREA_EPSILON) {
            return PcbAssemblyFillRingNormalizer.#result(
                loop,
                'near-zero-area',
                options,
                loop.length,
                area
            )
        }

        return {
            loop: PcbAssemblyFillRingNormalizer.#orientLoop(
                loop,
                signedArea,
                options.winding
            ),
            diagnostic: null,
            area
        }
    }

    /**
     * Checks whether one loop has enough non-collinear area.
     * @param {number[][]} loop Candidate loop.
     * @returns {boolean}
     */
    static isValidLoop(loop) {
        return (
            Array.isArray(loop) &&
            loop.length >= 3 &&
            Math.abs(PcbAssemblyFillRingNormalizer.signedArea(loop)) >
                AREA_EPSILON
        )
    }

    /**
     * Computes signed polygon area in source units.
     * @param {number[][]} loop Candidate loop.
     * @returns {number}
     */
    static signedArea(loop) {
        let area = 0
        for (let index = 0; index < (loop || []).length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            area += current[0] * next[1] - next[0] * current[1]
        }
        return area / 2
    }

    /**
     * Normalizes candidate point rows into numeric values.
     * @param {unknown[]} points Candidate point rows.
     * @returns {{ x: number, y: number, isFinite: boolean }[]}
     */
    static #pointRows(points) {
        return (Array.isArray(points) ? points : []).map((point) => {
            const x = Number(Array.isArray(point) ? point[0] : point?.x)
            const y = Number(Array.isArray(point) ? point[1] : point?.y)
            return {
                x,
                y,
                isFinite: Number.isFinite(x) && Number.isFinite(y)
            }
        })
    }

    /**
     * Removes invalid, repeated, and closing points from one loop.
     * @param {number[][]} points Candidate numeric points.
     * @returns {number[][]}
     */
    static #cleanLoop(points) {
        const loop = []
        for (const point of points || []) {
            const x = Number(point?.[0])
            const y = Number(point?.[1])
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                continue
            }

            const previous = loop[loop.length - 1]
            if (
                previous &&
                Math.abs(previous[0] - x) < COORDINATE_EPSILON &&
                Math.abs(previous[1] - y) < COORDINATE_EPSILON
            ) {
                continue
            }
            loop.push([x, y])
        }

        const first = loop[0]
        const last = loop[loop.length - 1]
        if (
            first &&
            last &&
            Math.abs(first[0] - last[0]) < COORDINATE_EPSILON &&
            Math.abs(first[1] - last[1]) < COORDINATE_EPSILON
        ) {
            loop.pop()
        }

        return loop
    }

    /**
     * Orients one loop to the requested signed-area winding.
     * @param {number[][]} loop Candidate loop.
     * @param {number} signedArea Signed loop area.
     * @param {'positive' | 'negative' | undefined} winding Requested winding.
     * @returns {number[][]}
     */
    static #orientLoop(loop, signedArea, winding) {
        if (winding === 'positive' && signedArea < 0) {
            return [...loop].reverse()
        }
        if (winding === 'negative' && signedArea > 0) {
            return [...loop].reverse()
        }
        return loop
    }

    /**
     * Builds a normalization result.
     * @param {number[][]} loop Normalized loop.
     * @param {string} reason Drop reason.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number }} options Normalization options.
     * @param {number} pointCount Clean point count.
     * @param {number} area Absolute loop area.
     * @returns {{ loop: number[][], diagnostic: object, area: number }}
     */
    static #result(loop, reason, options, pointCount, area) {
        return {
            loop,
            diagnostic: PcbAssemblyFillRingNormalizer.#diagnostic(
                reason,
                options,
                pointCount,
                area
            ),
            area
        }
    }

    /**
     * Builds one dropped-ring diagnostic row.
     * @param {string} reason Drop reason.
     * @param {{ role?: string, shapeIndex?: number, ringIndex?: number }} options Normalization options.
     * @param {number} pointCount Clean point count.
     * @param {number} area Absolute loop area.
     * @returns {object}
     */
    static #diagnostic(reason, options, pointCount, area) {
        const diagnostic = {
            reason,
            role: String(options.role || 'ring'),
            pointCount,
            area
        }
        if (Number.isInteger(options.shapeIndex)) {
            diagnostic.shapeIndex = options.shapeIndex
        }
        if (Number.isInteger(options.ringIndex)) {
            diagnostic.ringIndex = options.ringIndex
        }
        return diagnostic
    }
}
