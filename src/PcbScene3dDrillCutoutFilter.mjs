/**
 * Filters drill cutout polygons before they are applied to filled artwork.
 */
export class PcbScene3dDrillCutoutFilter {
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Removes cutout polygons that are fully covered by a larger sibling.
     * @param {{ x: number, y: number }[][]} cutouts Cutout polygons.
     * @returns {{ x: number, y: number }[][]}
     */
    static removeNestedCutouts(cutouts) {
        const validCutoutInfos =
            PcbScene3dDrillCutoutFilter.#buildPolygonInfos(cutouts)

        return validCutoutInfos
            .filter(
                (cutoutInfo) =>
                    !PcbScene3dDrillCutoutFilter.#isNestedCutoutInfo(
                        cutoutInfo,
                        validCutoutInfos
                    )
            )
            .map((cutoutInfo) => cutoutInfo.source)
    }

    /**
     * Builds reusable polygon metadata for valid polygons.
     * @param {{ x: number, y: number }[][]} polygons Source polygons.
     * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number }[]}
     */
    static #buildPolygonInfos(polygons) {
        return (Array.isArray(polygons) ? polygons : [])
            .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
            .map((polygon, index) =>
                PcbScene3dDrillCutoutFilter.#buildPolygonInfo(polygon, index)
            )
    }

    /**
     * Builds reusable numeric metadata for one polygon.
     * @param {{ x: number, y: number }[]} polygon Source polygon.
     * @param {number} index Polygon index among valid polygons.
     * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number }}
     */
    static #buildPolygonInfo(polygon, index) {
        const points = polygon.map((point) => ({
            x: Number(point?.x || 0),
            y: Number(point?.y || 0)
        }))
        const bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }
        let area = 0
        let totalX = 0
        let totalY = 0

        points.forEach((point, pointIndex) => {
            const next = points[(pointIndex + 1) % points.length]

            bounds.minX = Math.min(bounds.minX, point.x)
            bounds.maxX = Math.max(bounds.maxX, point.x)
            bounds.minY = Math.min(bounds.minY, point.y)
            bounds.maxY = Math.max(bounds.maxY, point.y)
            totalX += point.x
            totalY += point.y
            area += point.x * next.y - next.x * point.y
        })

        return {
            source: polygon,
            points,
            bounds,
            centroid: {
                x: totalX / Math.max(points.length, 1),
                y: totalY / Math.max(points.length, 1)
            },
            area: Math.abs(area) / 2,
            index
        }
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
     * @returns {{ x: number, y: number }[][]}
     */
    static removeCoveredCutouts(drillCutouts, fillHoles) {
        return PcbScene3dDrillCutoutFilter.partitionFillHoles(
            drillCutouts,
            fillHoles
        ).uncoveredCutouts
    }

    /**
     * Splits authored holes from physical drill holes already copied to a fill.
     * @param {{ x: number, y: number }[][]} drillCutouts
     * @param {{ x: number, y: number }[][]} fillHoles
     * @returns {{ authoredHoles: { x: number, y: number }[][], drillHoles: { x: number, y: number }[][], uncoveredCutouts: { x: number, y: number }[][] }}
     */
    static partitionFillHoles(drillCutouts, fillHoles) {
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

        const cutoutInfos =
            PcbScene3dDrillCutoutFilter.#buildPolygonInfos(cutouts)
        const holeInfos = PcbScene3dDrillCutoutFilter.#buildPolygonInfos(holes)
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
                    cutoutInfos
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
                    !holeInfos.some((holeInfo) =>
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
                holeInfo.points
            ) &&
            cutoutInfo.points.every((point) =>
                PcbScene3dDrillCutoutFilter.#isPointInsideOrOnPolygon(
                    point,
                    holeInfo.points
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
     * @param {{ x: number, y: number }[]} polygon
     * @returns {boolean}
     */
    static #isPointInsideOrOnPolygon(point, polygon) {
        return (
            PcbScene3dDrillCutoutFilter.#isPointOnPolygonBoundary(
                point,
                polygon
            ) ||
            PcbScene3dDrillCutoutFilter.#isPointStrictlyInsidePolygon(
                point,
                polygon
            )
        )
    }

    /**
     * Returns true when a point lies inside a polygon and away from its border.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} polygon
     * @returns {boolean}
     */
    static #isPointStrictlyInsidePolygon(point, polygon) {
        let inside = false
        for (
            let index = 0, previousIndex = polygon.length - 1;
            index < polygon.length;
            previousIndex = index, index += 1
        ) {
            const current = polygon[index]
            const previous = polygon[previousIndex]
            const intersects =
                current.y > point.y !== previous.y > point.y &&
                point.x <
                    ((previous.x - current.x) * (point.y - current.y)) /
                        (previous.y - current.y) +
                        current.x

            if (intersects) {
                inside = !inside
            }
        }

        return inside
    }

    /**
     * Returns true when a point lies on any polygon edge.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} polygon
     * @returns {boolean}
     */
    static #isPointOnPolygonBoundary(point, polygon) {
        return polygon.some((start, index) =>
            PcbScene3dDrillCutoutFilter.#isPointOnSegment(
                point,
                start,
                polygon[(index + 1) % polygon.length]
            )
        )
    }

    /**
     * Returns true when a point lies on one finite segment.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @returns {boolean}
     */
    static #isPointOnSegment(point, start, end) {
        const cross =
            (point.y - start.y) * (end.x - start.x) -
            (point.x - start.x) * (end.y - start.y)

        if (Math.abs(cross) > PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON) {
            return false
        }

        const dot =
            (point.x - start.x) * (end.x - start.x) +
            (point.y - start.y) * (end.y - start.y)

        if (dot < -PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON) {
            return false
        }

        const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2

        return (
            dot <= lengthSquared + PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON
        )
    }
}
