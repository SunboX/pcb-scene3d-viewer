import polygonClipping from 'polygon-clipping'

/**
 * Normalizes and subtracts copper fill loop sets with polygon booleans.
 */
export class PcbScene3dCopperFillPolygonBoolean {
    static #AREA_EPSILON = 0.001

    /**
     * Resolves the remaining loop sets after subtracting already emitted
     * copper areas.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }} loopSet Candidate loop set.
     * @param {number[][][][]} emittedPolygons Already emitted polygon-clipping polygons.
     * @returns {{ outer: number[][], holes: number[][][], bounds: object }[] | null}
     */
    static resolveRemainingLoopSets(loopSet, emittedPolygons) {
        const subjectPolygons =
            PcbScene3dCopperFillPolygonBoolean.resolveNormalizedPolygons(
                loopSet
            )
        if (!subjectPolygons.length) {
            return []
        }

        if (!emittedPolygons.length) {
            return PcbScene3dCopperFillPolygonBoolean.#multiPolygonToLoopSets(
                subjectPolygons
            )
        }

        try {
            return PcbScene3dCopperFillPolygonBoolean.#multiPolygonToLoopSets(
                polygonClipping.difference(subjectPolygons, ...emittedPolygons)
            )
        } catch {
            return null
        }
    }

    /**
     * Normalizes one loop set with polygon boolean semantics.
     * @param {{ outer: number[][], holes: number[][][] }} loopSet Normalized loop set.
     * @returns {number[][][][]}
     */
    static resolveNormalizedPolygons(loopSet) {
        const subject =
            PcbScene3dCopperFillPolygonBoolean.#loopSetToPolygon(loopSet)
        if (!subject) {
            return []
        }

        try {
            return polygonClipping.union(subject)
        } catch {
            return [subject]
        }
    }

    /**
     * Converts one normalized loop set to a polygon-clipping polygon.
     * @param {{ outer: number[][], holes: number[][][] }} loopSet Normalized loop set.
     * @returns {number[][][] | null}
     */
    static #loopSetToPolygon(loopSet) {
        const outer = PcbScene3dCopperFillPolygonBoolean.#closedRing(
            loopSet?.outer
        )
        if (!outer.length) {
            return null
        }

        return [
            outer,
            ...(loopSet?.holes || [])
                .map((hole) =>
                    PcbScene3dCopperFillPolygonBoolean.#closedRing(hole)
                )
                .filter((hole) => hole.length)
        ]
    }

    /**
     * Converts polygon-clipping output into normalized loop sets.
     * @param {number[][][][]} multiPolygon Clipped multipolygon.
     * @returns {{ outer: number[][], holes: number[][][], bounds: object }[]}
     */
    static #multiPolygonToLoopSets(multiPolygon) {
        return (multiPolygon || [])
            .map((polygon) => {
                const outer = PcbScene3dCopperFillPolygonBoolean.#cleanLoop(
                    polygon?.[0] || []
                )
                if (!PcbScene3dCopperFillPolygonBoolean.#isValidLoop(outer)) {
                    return null
                }

                const holes = (polygon || [])
                    .slice(1)
                    .map((ring) =>
                        PcbScene3dCopperFillPolygonBoolean.#cleanLoop(ring)
                    )
                    .filter((ring) =>
                        PcbScene3dCopperFillPolygonBoolean.#isValidLoop(ring)
                    )

                return {
                    outer,
                    holes,
                    bounds: PcbScene3dCopperFillPolygonBoolean.#loopBounds(
                        outer
                    )
                }
            })
            .filter(Boolean)
    }

    /**
     * Closes one loop for polygon boolean operations.
     * @param {number[][]} loop Candidate loop.
     * @returns {number[][]}
     */
    static #closedRing(loop) {
        const cleanLoop = PcbScene3dCopperFillPolygonBoolean.#cleanLoop(loop)
        if (!PcbScene3dCopperFillPolygonBoolean.#isValidLoop(cleanLoop)) {
            return []
        }

        const first = cleanLoop[0]
        const last = cleanLoop[cleanLoop.length - 1]
        const closed = cleanLoop.map((point) => [point[0], point[1]])
        if (
            Math.abs(first[0] - last[0]) >=
                PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON ||
            Math.abs(first[1] - last[1]) >=
                PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON
        ) {
            closed.push([first[0], first[1]])
        }
        return closed
    }

    /**
     * Removes invalid and duplicate loop points.
     * @param {number[][]} points Candidate points.
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
                Math.abs(previous[0] - x) <
                    PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON &&
                Math.abs(previous[1] - y) <
                    PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON
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
            Math.abs(first[0] - last[0]) <
                PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON &&
            Math.abs(first[1] - last[1]) <
                PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON
        ) {
            loop.pop()
        }

        return loop
    }

    /**
     * Checks whether one loop has enough non-collinear area.
     * @param {number[][]} loop Candidate loop.
     * @returns {boolean}
     */
    static #isValidLoop(loop) {
        return (
            Array.isArray(loop) &&
            loop.length >= 3 &&
            Math.abs(PcbScene3dCopperFillPolygonBoolean.#signedArea(loop)) >
                PcbScene3dCopperFillPolygonBoolean.#AREA_EPSILON
        )
    }

    /**
     * Computes axis-aligned bounds for one loop.
     * @param {number[][]} loop Candidate loop.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static #loopBounds(loop) {
        return (loop || []).reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, Number(point?.[0])),
                minY: Math.min(bounds.minY, Number(point?.[1])),
                maxX: Math.max(bounds.maxX, Number(point?.[0])),
                maxY: Math.max(bounds.maxY, Number(point?.[1]))
            }),
            {
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            }
        )
    }

    /**
     * Computes signed loop area.
     * @param {number[][]} loop Candidate loop.
     * @returns {number}
     */
    static #signedArea(loop) {
        let area = 0
        for (let index = 0; index < loop.length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            area += current[0] * next[1] - next[0] * current[1]
        }
        return area / 2
    }
}
