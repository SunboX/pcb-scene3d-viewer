import { PcbScene3dBoardEdgeCutoutBuilder } from './PcbScene3dBoardEdgeCutoutBuilder.mjs'
import { PcbScene3dDrillCutoutFilter } from './PcbScene3dDrillCutoutFilter.mjs'
import { PcbScene3dPreparedPolygon } from './PcbScene3dPreparedPolygon.mjs'

/**
 * Map-compatible cache that prepares normalized cutouts on first consumption.
 */
class PcbScene3dLazyPreparedPolygonCache extends Map {
    /** @type {(cutout: unknown) => void} */
    #prepare

    /**
     * Creates a cache backed by one request-scoped preparation callback.
     * @param {(cutout: unknown) => void} prepare Preparation callback.
     */
    constructor(prepare) {
        super()
        this.#prepare = prepare
    }

    /**
     * Returns whether a source has a compatible preparation.
     * @param {unknown} cutout Candidate source.
     * @returns {boolean}
     */
    has(cutout) {
        this.#prepareIfNeeded(cutout)
        return super.has(cutout)
    }

    /**
     * Returns one compatible preparation when available.
     * @param {unknown} cutout Candidate source.
     * @returns {PcbScene3dPreparedPolygon | undefined}
     */
    get(cutout) {
        this.#prepareIfNeeded(cutout)
        return super.get(cutout)
    }

    /**
     * Prepares a source only when the cache lacks silkscreen capabilities.
     * @param {unknown} cutout Candidate source.
     * @returns {void}
     */
    #prepareIfNeeded(cutout) {
        const prepared = super.get(cutout)

        if (
            prepared?.circleDetectionEnabled !== true ||
            prepared?.pointRepresentation !== 'raw-numeric'
        ) {
            this.#prepare(cutout)
        }
    }
}

/**
 * Owns exact prepared cutout metadata for one silkscreen side build.
 */
export class PcbScene3dSilkscreenCutoutContext {
    static #GEOMETRY_EPSILON = 0.001

    /** @type {Map<any, PcbScene3dPreparedPolygon>} */
    #preparedPolygonCache = new PcbScene3dLazyPreparedPolygonCache((cutout) =>
        this.#prepareNormalizedCutout(cutout)
    )

    /**
     * Returns the lazy cache shared by exact geometry consumers.
     * @returns {Map<any, PcbScene3dPreparedPolygon>}
     */
    get preparedPolygonCache() {
        return this.#preparedPolygonCache
    }

    /**
     * Resolves one circular-enabled finite source preparation.
     * @param {unknown} cutout Candidate normalized cutout points.
     * @returns {PcbScene3dPreparedPolygon | null}
     */
    resolve(cutout) {
        if (!PcbScene3dSilkscreenCutoutContext.#isNormalizedCutout(cutout)) {
            this.#preparedPolygonCache.delete(cutout)
            return null
        }

        return this.#resolveNormalizedCutout(cutout)
    }

    /**
     * Resolves one source already proven to be finite and normalized.
     * @param {{ x: number, y: number }[]} cutout Normalized cutout points.
     * @returns {PcbScene3dPreparedPolygon}
     */
    #resolveNormalizedCutout(cutout) {
        let prepared = Map.prototype.get.call(
            this.#preparedPolygonCache,
            cutout
        )

        if (
            prepared?.circleDetectionEnabled === true &&
            prepared?.pointRepresentation === 'raw-numeric'
        ) {
            return prepared
        }

        prepared = new PcbScene3dPreparedPolygon(cutout, {
            source: cutout,
            epsilon: PcbScene3dSilkscreenCutoutContext.#GEOMETRY_EPSILON,
            detectCircle: true,
            pointRepresentation: 'raw-numeric'
        })
        Map.prototype.set.call(this.#preparedPolygonCache, cutout, prepared)
        return prepared
    }

    /**
     * Prepares one finite normalized cutout requested by a real cache consumer.
     * @param {unknown} cutout Candidate normalized cutout points.
     * @returns {void}
     */
    #prepareNormalizedCutout(cutout) {
        if (PcbScene3dSilkscreenCutoutContext.#isNormalizedCutout(cutout)) {
            this.#resolveNormalizedCutout(cutout)
        }
    }

    /**
     * Resolves cached sampled-circle metadata for one normalized cutout.
     * @param {unknown} cutout Candidate normalized cutout points.
     * @returns {{ isCircular: true, centerX: number, centerY: number, radius: number } | null}
     */
    resolveCircle(cutout) {
        return this.resolve(cutout)?.circle ?? null
    }

    /**
     * Returns true when a cutout can safely become a shape hole.
     * @param {{ x: number, y: number }[]} hole Cutout polygon.
     * @param {{ x: number, y: number }[]} contour Fill contour.
     * @returns {boolean}
     */
    isHoleInsideContour(hole, contour) {
        const prepared = this.resolve(hole)
        if (!prepared) {
            return false
        }

        return PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
            hole,
            contour,
            prepared.circle
        )
    }

    /**
     * Converts circular edge-crossing cutouts into one fill contour.
     * @param {{ x: number, y: number }[]} contourPoints Fill contour.
     * @param {{ x: number, y: number }[][]} cutouts Candidate cutouts.
     * @returns {{ points: { x: number, y: number }[], appliedCutouts: { x: number, y: number }[][] }}
     */
    applyCircularEdgeCutouts(contourPoints, cutouts) {
        let points = contourPoints
        const appliedCutouts = []
        const candidates = PcbScene3dDrillCutoutFilter.removeNestedCutouts(
            (Array.isArray(cutouts) ? cutouts : []).filter(
                (cutout) =>
                    this.resolveCircle(cutout) &&
                    !this.isHoleInsideContour(cutout, contourPoints)
            ),
            { preparedPolygonCache: this.#preparedPolygonCache }
        )

        for (const cutout of candidates) {
            const circularCutout = this.resolveCircle(cutout)
            if (!circularCutout || this.isHoleInsideContour(cutout, points)) {
                continue
            }

            const nextPoints =
                PcbScene3dBoardEdgeCutoutBuilder.applyCircularEdgeCutouts(
                    points,
                    [circularCutout]
                )
            if (
                PcbScene3dSilkscreenCutoutContext.#samePointList(
                    points,
                    nextPoints
                )
            ) {
                continue
            }

            points = nextPoints
            appliedCutouts.push(cutout)
        }

        return { points, appliedCutouts }
    }

    /**
     * Returns true when a source is already a finite normalized polygon.
     * @param {unknown} cutout Candidate point collection.
     * @returns {cutout is { x: number, y: number }[]}
     */
    static #isNormalizedCutout(cutout) {
        if (!Array.isArray(cutout) || cutout.length < 3) {
            return false
        }

        for (let index = 0; index < cutout.length; index += 1) {
            if (!Object.hasOwn(cutout, index)) {
                return false
            }

            const point = cutout[index]
            if (
                typeof point?.x !== 'number' ||
                !Number.isFinite(point.x) ||
                typeof point?.y !== 'number' ||
                !Number.isFinite(point.y)
            ) {
                return false
            }
        }

        return true
    }

    /**
     * Returns true when two point lists share identical coordinates.
     * @param {{ x: number, y: number }[]} first First point list.
     * @param {{ x: number, y: number }[]} second Second point list.
     * @returns {boolean}
     */
    static #samePointList(first, second) {
        return (
            Array.isArray(first) &&
            Array.isArray(second) &&
            first.length === second.length &&
            first.every((point, index) => {
                const otherPoint = second[index]

                return (
                    Math.abs(point.x - otherPoint.x) <=
                        PcbScene3dSilkscreenCutoutContext.#GEOMETRY_EPSILON &&
                    Math.abs(point.y - otherPoint.y) <=
                        PcbScene3dSilkscreenCutoutContext.#GEOMETRY_EPSILON
                )
            })
        )
    }
}
