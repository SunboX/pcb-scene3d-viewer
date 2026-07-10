import { PcbScene3dPreparedPolygon } from './PcbScene3dPreparedPolygon.mjs'
import { PcbScene3dPreparedPolygonSet } from './PcbScene3dPreparedPolygonSet.mjs'

/**
 * Filters drill cutout polygons before they are applied to filled artwork.
 */
export class PcbScene3dDrillCutoutFilter {
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Removes cutout polygons that are fully covered by a larger sibling.
     * @param {{ x: number, y: number }[][]} cutouts Cutout polygons.
     * @param {{ preparedPolygonCache?: Map }} [options] Request-scoped options.
     * @returns {{ x: number, y: number }[][]}
     */
    static removeNestedCutouts(cutouts, options = {}) {
        const preparedPolygonCache =
            PcbScene3dDrillCutoutFilter.#resolvePreparedPolygonCache(options)
        const validCutoutInfos = PcbScene3dDrillCutoutFilter.#buildPolygonInfos(
            cutouts,
            preparedPolygonCache
        )
        const candidateContext =
            PcbScene3dDrillCutoutFilter.#buildCandidateContext(validCutoutInfos)

        return validCutoutInfos
            .filter(
                (cutoutInfo) =>
                    !PcbScene3dDrillCutoutFilter.#isNestedCutoutInfo(
                        cutoutInfo,
                        PcbScene3dDrillCutoutFilter.#queryCandidates(
                            candidateContext,
                            cutoutInfo.bounds
                        )
                    )
            )
            .map((cutoutInfo) => cutoutInfo.source)
    }

    /**
     * Builds reusable polygon metadata for valid polygons.
     * @param {{ x: number, y: number }[][]} polygons Source polygons.
     * @param {Map | null} preparedPolygonCache Request-scoped prepared cache.
     * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number, prepared: PcbScene3dPreparedPolygon }[]}
     */
    static #buildPolygonInfos(polygons, preparedPolygonCache) {
        return (Array.isArray(polygons) ? polygons : [])
            .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
            .map((polygon, index) =>
                PcbScene3dDrillCutoutFilter.#buildPolygonInfo(
                    polygon,
                    index,
                    preparedPolygonCache
                )
            )
    }

    /**
     * Builds reusable numeric metadata for one polygon.
     * @param {{ x: number, y: number }[]} polygon Source polygon.
     * @param {number} index Polygon index among valid polygons.
     * @param {Map | null} preparedPolygonCache Request-scoped prepared cache.
     * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number, prepared: PcbScene3dPreparedPolygon }}
     */
    static #buildPolygonInfo(polygon, index, preparedPolygonCache) {
        let prepared = preparedPolygonCache?.has(polygon)
            ? preparedPolygonCache.get(polygon)
            : null

        if (!prepared) {
            const points = polygon.map((point) => ({
                x: Number(point?.x || 0),
                y: Number(point?.y || 0)
            }))
            prepared = new PcbScene3dPreparedPolygon(points, {
                source: polygon,
                sourceIndex: index,
                epsilon: PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON,
                detectCircle: false
            })
            preparedPolygonCache?.set(polygon, prepared)
        }

        return {
            source: polygon,
            points: prepared.points,
            bounds: prepared.bounds,
            centroid: prepared.centroid,
            area: prepared.area,
            index,
            prepared
        }
    }

    /**
     * Resolves a supported request-scoped prepared polygon cache.
     * @param {{ preparedPolygonCache?: Map }} options Request options.
     * @returns {Map | null}
     */
    static #resolvePreparedPolygonCache(options) {
        return options?.preparedPolygonCache instanceof Map
            ? options.preparedPolygonCache
            : null
    }

    /**
     * Builds one stable broad-phase set and duplicate-aware info groups.
     * @param {{ prepared: PcbScene3dPreparedPolygon }[]} polygonInfos Polygon metadata.
     * @returns {{ set: PcbScene3dPreparedPolygonSet, infoGroups: Map<PcbScene3dPreparedPolygon, object[]> }}
     */
    static #buildCandidateContext(polygonInfos) {
        const infoGroups = new Map()

        for (const polygonInfo of polygonInfos) {
            const group = infoGroups.get(polygonInfo.prepared) || []
            group.push(polygonInfo)
            infoGroups.set(polygonInfo.prepared, group)
        }

        return {
            set: new PcbScene3dPreparedPolygonSet(
                polygonInfos.map((polygonInfo) => polygonInfo.prepared)
            ),
            infoGroups
        }
    }

    /**
     * Returns stable polygon-info candidates whose bounds overlap a query.
     * @param {{ set: PcbScene3dPreparedPolygonSet, infoGroups: Map<PcbScene3dPreparedPolygon, object[]> }} context Candidate context.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Query bounds.
     * @returns {object[]}
     */
    static #queryCandidates(context, bounds) {
        const groupOffsets = new Map()

        return context.set
            .query(bounds, {
                epsilon: PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON,
                stable: true
            })
            .map((prepared) => {
                const offset = groupOffsets.get(prepared) || 0
                const group = context.infoGroups.get(prepared)
                groupOffsets.set(prepared, offset + 1)
                return group[offset]
            })
    }

    /**
     * Maps polygon source arrays to their reusable metadata.
     * @param {{ source: { x: number, y: number }[] }[]} polygonInfos Polygon metadata.
     * @returns {Map<{ x: number, y: number }[], object>}
     */
    static #buildPolygonInfoMap(polygonInfos) {
        return new Map(
            polygonInfos.map((polygonInfo) => [polygonInfo.source, polygonInfo])
        )
    }

    /**
     * Removes drill cutouts that are already covered by authored fill holes.
     * @param {{ x: number, y: number }[][]} drillCutouts
     * @param {{ x: number, y: number }[][]} fillHoles
     * @param {{ preparedPolygonCache?: Map }} [options] Request-scoped options.
     * @returns {{ x: number, y: number }[][]}
     */
    static removeCoveredCutouts(drillCutouts, fillHoles, options = {}) {
        return PcbScene3dDrillCutoutFilter.partitionFillHoles(
            drillCutouts,
            fillHoles,
            options
        ).uncoveredCutouts
    }

    /**
     * Splits authored holes from physical drill holes already copied to a fill.
     * @param {{ x: number, y: number }[][]} drillCutouts
     * @param {{ x: number, y: number }[][]} fillHoles
     * @param {{ preparedPolygonCache?: Map }} [options] Request-scoped options.
     * @returns {{ authoredHoles: { x: number, y: number }[][], drillHoles: { x: number, y: number }[][], uncoveredCutouts: { x: number, y: number }[][] }}
     */
    static partitionFillHoles(drillCutouts, fillHoles, options = {}) {
        const cutouts = Array.isArray(drillCutouts) ? drillCutouts : []
        const holes = Array.isArray(fillHoles) ? fillHoles : []

        if (!holes.length) {
            return {
                authoredHoles: [],
                drillHoles: [],
                uncoveredCutouts: cutouts
            }
        }

        if (!cutouts.length) {
            return {
                authoredHoles: holes,
                drillHoles: [],
                uncoveredCutouts: []
            }
        }

        const preparedPolygonCache =
            PcbScene3dDrillCutoutFilter.#resolvePreparedPolygonCache(options)
        const cutoutInfos = PcbScene3dDrillCutoutFilter.#buildPolygonInfos(
            cutouts,
            preparedPolygonCache
        )
        const holeInfos = PcbScene3dDrillCutoutFilter.#buildPolygonInfos(
            holes,
            preparedPolygonCache
        )
        const candidateContext =
            PcbScene3dDrillCutoutFilter.#buildCandidateContext([
                ...cutoutInfos,
                ...holeInfos
            ])
        const cutoutInfoSet = new Set(cutoutInfos)
        const holeInfoSet = new Set(holeInfos)
        const cutoutInfoMap =
            PcbScene3dDrillCutoutFilter.#buildPolygonInfoMap(cutoutInfos)
        const holeInfoMap =
            PcbScene3dDrillCutoutFilter.#buildPolygonInfoMap(holeInfos)

        const authoredHoles = []
        const drillHoles = []
        for (const hole of holes) {
            const holeInfo = holeInfoMap.get(hole)
            if (
                holeInfo &&
                PcbScene3dDrillCutoutFilter.#isDrillHoleInfo(
                    holeInfo,
                    PcbScene3dDrillCutoutFilter.#queryCandidates(
                        candidateContext,
                        holeInfo.bounds
                    ).filter((candidate) => cutoutInfoSet.has(candidate))
                )
            ) {
                drillHoles.push(hole)
            } else {
                authoredHoles.push(hole)
            }
        }

        return {
            authoredHoles,
            drillHoles,
            uncoveredCutouts: cutouts.filter((cutout) => {
                const cutoutInfo = cutoutInfoMap.get(cutout)
                return (
                    !cutoutInfo ||
                    !PcbScene3dDrillCutoutFilter.#queryCandidates(
                        candidateContext,
                        cutoutInfo.bounds
                    )
                        .filter((candidate) => holeInfoSet.has(candidate))
                        .some((holeInfo) =>
                            PcbScene3dDrillCutoutFilter.#doesHoleInfoCoverCutout(
                                holeInfo,
                                cutoutInfo
                            )
                        )
                )
            })
        }
    }

    /**
     * Returns true when another cutout fully covers this one.
     * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }} cutoutInfo Cutout under test.
     * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }[]} cutoutInfos All cutouts.
     * @returns {boolean}
     */
    static #isNestedCutoutInfo(cutoutInfo, cutoutInfos) {
        return cutoutInfos.some((otherCutoutInfo) => {
            if (otherCutoutInfo.index === cutoutInfo.index) {
                return false
            }

            if (
                !PcbScene3dDrillCutoutFilter.#doesHoleInfoCoverCutout(
                    otherCutoutInfo,
                    cutoutInfo
                )
            ) {
                return false
            }

            return (
                otherCutoutInfo.area >
                    cutoutInfo.area +
                        PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON ||
                (Math.abs(otherCutoutInfo.area - cutoutInfo.area) <=
                    PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON &&
                    otherCutoutInfo.index < cutoutInfo.index)
            )
        })
    }

    /**
     * Returns true when a fill hole represents one known drill cutout.
     * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }} holeInfo Fill-hole metadata.
     * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }[]} drillCutoutInfos Drill-cutout metadata.
     * @returns {boolean}
     */
    static #isDrillHoleInfo(holeInfo, drillCutoutInfos) {
        return drillCutoutInfos.some((cutoutInfo) =>
            PcbScene3dDrillCutoutFilter.#doesHoleInfoCoverCutout(
                holeInfo,
                cutoutInfo
            )
        )
    }

    /**
     * Returns true when an authored hole already clears one drill cutout.
     * @param {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }} holeInfo Fill-hole metadata.
     * @param {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number } }} cutoutInfo Drill-cutout metadata.
     * @returns {boolean}
     */
    static #doesHoleInfoCoverCutout(holeInfo, cutoutInfo) {
        return (
            PcbScene3dDrillCutoutFilter.#boundsContain(
                holeInfo.bounds,
                cutoutInfo.bounds
            ) &&
            PcbScene3dDrillCutoutFilter.#isPointInsideOrOnPolygon(
                cutoutInfo.centroid,
                holeInfo
            ) &&
            cutoutInfo.points.every((point) =>
                PcbScene3dDrillCutoutFilter.#isPointInsideOrOnPolygon(
                    point,
                    holeInfo
                )
            )
        )
    }

    /**
     * Returns true when one bounds fully contains another.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} outer
     * Outer bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} inner
     * Inner bounds.
     * @returns {boolean}
     */
    static #boundsContain(outer, inner) {
        return (
            outer.minX <=
                inner.minX + PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON &&
            outer.maxX >=
                inner.maxX - PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON &&
            outer.minY <=
                inner.minY + PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON &&
            outer.maxY >=
                inner.maxY - PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON
        )
    }

    /**
     * Returns true when a point is inside or on one polygon.
     * @param {{ x: number, y: number }} point
     * @param {{ prepared: PcbScene3dPreparedPolygon }} polygonInfo
     * @returns {boolean}
     */
    static #isPointInsideOrOnPolygon(point, polygonInfo) {
        return polygonInfo.prepared.containsPointOrBoundary(point)
    }
}
