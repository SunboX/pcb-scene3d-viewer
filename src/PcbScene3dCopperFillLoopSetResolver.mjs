import { PcbAssemblyFillGeometryResolver } from './PcbAssemblyFillGeometryResolver.mjs'

/**
 * Resolves copper fills into canonical side-local polygon loop sets.
 */
export class PcbScene3dCopperFillLoopSetResolver {
    static #AREA_EPSILON = 0.001
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Resolves every valid fill island in source order.
     * @param {object[]} fills Filled copper primitives.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ outer: number[][], holes: number[][][], bounds: { minX: number, minY: number, maxX: number, maxY: number } }[]}
     */
    static resolve(fills, normalizeBoardPoint, mirrorY) {
        const loopSets = []

        for (const fill of fills || []) {
            for (const loops of PcbAssemblyFillGeometryResolver.resolveAll(
                fill
            )) {
                const loopSet =
                    PcbScene3dCopperFillLoopSetResolver.#normalizeLoopSet(
                        loops,
                        normalizeBoardPoint,
                        mirrorY
                    )
                if (loopSet) {
                    loopSets.push(loopSet)
                }
            }
        }

        return loopSets
    }

    /**
     * Normalizes one fill island and discards degenerate outer geometry.
     * @param {{ outer?: any[], holes?: any[][] }} loops Source loops.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ outer: number[][], holes: number[][][], bounds: { minX: number, minY: number, maxX: number, maxY: number } } | null}
     */
    static #normalizeLoopSet(loops, normalizeBoardPoint, mirrorY) {
        const outer = PcbScene3dCopperFillLoopSetResolver.#normalizeLoop(
            loops?.outer,
            normalizeBoardPoint,
            mirrorY
        )
        if (!PcbScene3dCopperFillLoopSetResolver.#isValidLoop(outer)) {
            return null
        }

        const holes = []
        for (const sourceHole of loops?.holes || []) {
            const hole = PcbScene3dCopperFillLoopSetResolver.#normalizeLoop(
                sourceHole,
                normalizeBoardPoint,
                mirrorY
            )
            if (PcbScene3dCopperFillLoopSetResolver.#isValidLoop(hole)) {
                holes.push(hole)
            }
        }

        return {
            outer,
            holes,
            bounds: PcbScene3dCopperFillLoopSetResolver.#resolveBounds(outer)
        }
    }

    /**
     * Converts one loop into clean finite side-local coordinate pairs.
     * @param {any[]} loop Source points.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {number[][]}
     */
    static #normalizeLoop(loop, normalizeBoardPoint, mirrorY) {
        const points = []

        for (const point of loop || []) {
            const normalized = normalizeBoardPoint(
                Number(point?.x ?? point?.[0]),
                Number(point?.y ?? point?.[1])
            )
            const x = Number(normalized?.x)
            const y = mirrorY ? -Number(normalized?.y) : Number(normalized?.y)

            if (Number.isFinite(x) && Number.isFinite(y)) {
                points.push([x, y])
            }
        }

        return PcbScene3dCopperFillLoopSetResolver.#cleanLoop(points)
    }

    /**
     * Removes consecutive duplicate and explicit closing points.
     * @param {number[][]} points Candidate points.
     * @returns {number[][]}
     */
    static #cleanLoop(points) {
        const loop = []

        for (const point of points || []) {
            const previous = loop[loop.length - 1]
            if (
                previous &&
                Math.abs(previous[0] - point[0]) <
                    PcbScene3dCopperFillLoopSetResolver.#GEOMETRY_EPSILON &&
                Math.abs(previous[1] - point[1]) <
                    PcbScene3dCopperFillLoopSetResolver.#GEOMETRY_EPSILON
            ) {
                continue
            }
            loop.push(point)
        }

        const first = loop[0]
        const last = loop[loop.length - 1]
        if (
            first &&
            last &&
            Math.abs(first[0] - last[0]) <
                PcbScene3dCopperFillLoopSetResolver.#GEOMETRY_EPSILON &&
            Math.abs(first[1] - last[1]) <
                PcbScene3dCopperFillLoopSetResolver.#GEOMETRY_EPSILON
        ) {
            loop.pop()
        }

        return loop
    }

    /**
     * Returns true when one loop has sufficient non-collinear area.
     * @param {number[][]} loop Candidate loop.
     * @returns {boolean}
     */
    static #isValidLoop(loop) {
        return (
            Array.isArray(loop) &&
            loop.length >= 3 &&
            Math.abs(PcbScene3dCopperFillLoopSetResolver.#signedArea(loop)) >
                PcbScene3dCopperFillLoopSetResolver.#AREA_EPSILON
        )
    }

    /**
     * Computes one loop's signed shoelace area.
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

    /**
     * Resolves finite axis-aligned bounds for a valid loop.
     * @param {number[][]} loop Candidate loop.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static #resolveBounds(loop) {
        const bounds = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        }

        for (const point of loop) {
            bounds.minX = Math.min(bounds.minX, point[0])
            bounds.minY = Math.min(bounds.minY, point[1])
            bounds.maxX = Math.max(bounds.maxX, point[0])
            bounds.maxY = Math.max(bounds.maxY, point[1])
        }

        return bounds
    }
}
