import { PcbScene3dAabbIndex } from './PcbScene3dAabbIndex.mjs'
import { PcbScene3dPreparedPolygon } from './PcbScene3dPreparedPolygon.mjs'

/**
 * Immutable request-scoped acceleration for normalized copper fill loop sets.
 */
export class PcbScene3dCopperFillCoverageContext {
    static #GEOMETRY_EPSILON = 0.001

    /** @type {{ outer: PcbScene3dPreparedPolygon, holes: PcbScene3dPreparedPolygon[], bounds: object, sourceIndex: number }[]} */
    #areas

    /** @type {PcbScene3dAabbIndex} */
    #index

    /** @type {object[]} */
    #loopSets

    /** @type {object[] | null} */
    #sourceLoopSets

    /**
     * Creates one context from already-normalized ordered loop sets.
     * @param {{ outer?: number[][], holes?: number[][][] }[]} loopSets Ordered fill islands.
     * @returns {PcbScene3dCopperFillCoverageContext}
     */
    static fromLoopSets(loopSets) {
        return new PcbScene3dCopperFillCoverageContext(loopSets)
    }

    /**
     * Prepares every loop coordinate once and builds one top-level area index.
     * @param {{ outer?: number[][], holes?: number[][][] }[]} loopSets Ordered fill islands.
     */
    constructor(loopSets) {
        this.#sourceLoopSets = Array.isArray(loopSets) ? loopSets : null
        this.#loopSets = Object.freeze(Array.from(loopSets || []))
        this.#areas = Object.freeze(
            Array.from(this.#loopSets, (loopSet, sourceIndex) =>
                PcbScene3dCopperFillCoverageContext.#prepareArea(
                    loopSet,
                    sourceIndex
                )
            )
        )
        this.#index = new PcbScene3dAabbIndex(this.#areas, {
            resolveBounds: PcbScene3dCopperFillCoverageContext.#resolveBounds,
            resolveSourceIndex:
                PcbScene3dCopperFillCoverageContext.#resolveSourceIndex
        })
    }

    /**
     * Returns the immutable number of prepared fill areas.
     * @returns {number}
     */
    get areaCount() {
        return this.#areas.length
    }

    /**
     * Returns whether the request array and loop-set order match preparation.
     * @param {object[]} loopSets Active normalized fill islands.
     * @returns {boolean}
     */
    matchesLoopSets(loopSets) {
        if (
            !Array.isArray(loopSets) ||
            loopSets !== this.#sourceLoopSets ||
            loopSets.length !== this.#loopSets.length
        ) {
            return false
        }

        for (let index = 0; index < loopSets.length; index += 1) {
            if (loopSets[index] !== this.#loopSets[index]) {
                return false
            }
        }

        return true
    }

    /**
     * Appends stable broad-phase area candidates into a caller-owned target.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds Triangle bounds.
     * @param {object[]} [target] Candidate accumulator.
     * @param {{ beforeSourceIndex?: number, allowedSourceIndexes?: Set<number> | number[] | null }} [options] Source-order filters.
     * @returns {object[]}
     */
    queryAreas(triangleBounds, target = [], options = {}) {
        const candidates = this.#index.query(triangleBounds, {
            epsilon: PcbScene3dCopperFillCoverageContext.#GEOMETRY_EPSILON,
            stable: true
        })
        const beforeSourceIndex = options.beforeSourceIndex ?? Infinity
        const allowedSourceIndexes = options.allowedSourceIndexes ?? null

        for (const area of candidates) {
            if (
                area.sourceIndex < beforeSourceIndex &&
                PcbScene3dCopperFillCoverageContext.#isAllowedSourceIndex(
                    area.sourceIndex,
                    allowedSourceIndexes
                )
            ) {
                target.push(area)
            }
        }

        return target
    }

    /**
     * Prepares one outer loop and its authored holes.
     * @param {{ outer?: number[][], holes?: number[][][] }} loopSet Source loop set.
     * @param {number} sourceIndex Flattened source position.
     * @returns {{ outer: PcbScene3dPreparedPolygon, holes: PcbScene3dPreparedPolygon[], bounds: object, sourceIndex: number }}
     */
    static #prepareArea(loopSet, sourceIndex) {
        const outer = PcbScene3dCopperFillCoverageContext.#prepareLoop(
            loopSet?.outer,
            sourceIndex
        )
        const holes = Object.freeze(
            Array.from(loopSet?.holes || [], (hole) =>
                PcbScene3dCopperFillCoverageContext.#prepareLoop(
                    hole,
                    sourceIndex
                )
            )
        )

        return Object.freeze({
            outer,
            holes,
            bounds: outer.bounds,
            sourceIndex
        })
    }

    /**
     * Converts one normalized pair loop to numeric point objects once.
     * @param {number[][] | undefined} loop Source loop.
     * @param {number} sourceIndex Flattened source position.
     * @returns {PcbScene3dPreparedPolygon}
     */
    static #prepareLoop(loop, sourceIndex) {
        const source = Array.isArray(loop) ? loop : []
        const points = Object.freeze(
            source.map((point) => {
                const x = Number(point?.[0])
                const y = Number(point?.[1])
                return Object.freeze({ x, y })
            })
        )

        return new PcbScene3dPreparedPolygon(points, {
            source,
            sourceIndex,
            epsilon: PcbScene3dCopperFillCoverageContext.#GEOMETRY_EPSILON,
            pointRepresentation: 'numeric'
        })
    }

    /**
     * Returns whether an optional source-index collection permits one area.
     * @param {number} sourceIndex Candidate source position.
     * @param {Set<number> | number[] | null} allowedSourceIndexes Optional allow set.
     * @returns {boolean}
     */
    static #isAllowedSourceIndex(sourceIndex, allowedSourceIndexes) {
        if (allowedSourceIndexes === null) {
            return true
        }

        if (typeof allowedSourceIndexes?.has === 'function') {
            return allowedSourceIndexes.has(sourceIndex)
        }

        return (
            Array.isArray(allowedSourceIndexes) &&
            allowedSourceIndexes.includes(sourceIndex)
        )
    }

    /**
     * Resolves area bounds for the AABB index.
     * @param {{ bounds: object }} area Prepared area.
     * @returns {object}
     */
    static #resolveBounds(area) {
        return area.bounds
    }

    /**
     * Resolves stable flattened fill-island order for the AABB index.
     * @param {{ sourceIndex: number }} area Prepared area.
     * @returns {number}
     */
    static #resolveSourceIndex(area) {
        return area.sourceIndex
    }
}
