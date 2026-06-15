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
        const validCutouts = (Array.isArray(cutouts) ? cutouts : []).filter(
            (cutout) => Array.isArray(cutout) && cutout.length >= 3
        )

        return validCutouts.filter(
            (cutout, index) =>
                !PcbScene3dDrillCutoutFilter.#isNestedCutout(
                    cutout,
                    index,
                    validCutouts
                )
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

        const authoredHoles = []
        const drillHoles = []
        for (const hole of holes) {
            if (PcbScene3dDrillCutoutFilter.#isDrillHole(hole, cutouts)) {
                drillHoles.push(hole)
            } else {
                authoredHoles.push(hole)
            }
        }

        return {
            authoredHoles,
            drillHoles,
            uncoveredCutouts: cutouts.filter(
                (cutout) =>
                    !holes.some((hole) =>
                        PcbScene3dDrillCutoutFilter.#doesHoleCoverCutout(
                            hole,
                            cutout
                        )
                    )
            )
        }
    }

    /**
     * Returns true when another cutout fully covers this one.
     * @param {{ x: number, y: number }[]} cutout Cutout under test.
     * @param {number} index Cutout index.
     * @param {{ x: number, y: number }[][]} cutouts All cutouts.
     * @returns {boolean}
     */
    static #isNestedCutout(cutout, index, cutouts) {
        const area = PcbScene3dDrillCutoutFilter.#absolutePolygonArea(cutout)

        return cutouts.some((otherCutout, otherIndex) => {
            if (otherIndex === index) {
                return false
            }

            if (
                !PcbScene3dDrillCutoutFilter.#doesHoleCoverCutout(
                    otherCutout,
                    cutout
                )
            ) {
                return false
            }

            const otherArea =
                PcbScene3dDrillCutoutFilter.#absolutePolygonArea(otherCutout)

            return (
                otherArea >
                    area + PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON ||
                (Math.abs(otherArea - area) <=
                    PcbScene3dDrillCutoutFilter.#GEOMETRY_EPSILON &&
                    otherIndex < index)
            )
        })
    }

    /**
     * Resolves the absolute area of a polygon.
     * @param {{ x: number, y: number }[]} points Polygon points.
     * @returns {number}
     */
    static #absolutePolygonArea(points) {
        let area = 0

        for (let index = 0; index < points.length; index += 1) {
            const current = points[index]
            const next = points[(index + 1) % points.length]
            area +=
                Number(current.x || 0) * Number(next.y || 0) -
                Number(next.x || 0) * Number(current.y || 0)
        }

        return Math.abs(area) / 2
    }

    /**
     * Returns true when a fill hole represents one known drill cutout.
     * @param {{ x: number, y: number }[]} hole
     * @param {{ x: number, y: number }[][]} drillCutouts
     * @returns {boolean}
     */
    static #isDrillHole(hole, drillCutouts) {
        return drillCutouts.some((cutout) =>
            PcbScene3dDrillCutoutFilter.#doesHoleCoverCutout(hole, cutout)
        )
    }

    /**
     * Returns true when an authored hole already clears one drill cutout.
     * @param {{ x: number, y: number }[]} hole
     * @param {{ x: number, y: number }[]} cutout
     * @returns {boolean}
     */
    static #doesHoleCoverCutout(hole, cutout) {
        return (
            Array.isArray(hole) &&
            hole.length >= 3 &&
            Array.isArray(cutout) &&
            cutout.length >= 3 &&
            PcbScene3dDrillCutoutFilter.#boundsContain(
                PcbScene3dDrillCutoutFilter.#resolvePolygonBounds(hole),
                PcbScene3dDrillCutoutFilter.#resolvePolygonBounds(cutout)
            ) &&
            PcbScene3dDrillCutoutFilter.#isPointInsideOrOnPolygon(
                PcbScene3dDrillCutoutFilter.#resolvePolygonCentroid(cutout),
                hole
            ) &&
            cutout.every((point) =>
                PcbScene3dDrillCutoutFilter.#isPointInsideOrOnPolygon(
                    point,
                    hole
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
     * Resolves axis-aligned polygon bounds.
     * @param {{ x: number, y: number }[]} points Polygon points.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolvePolygonBounds(points) {
        return points.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, Number(point.x || 0)),
                maxX: Math.max(bounds.maxX, Number(point.x || 0)),
                minY: Math.min(bounds.minY, Number(point.y || 0)),
                maxY: Math.max(bounds.maxY, Number(point.y || 0))
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
            }
        )
    }

    /**
     * Resolves the average center of one polygon.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ x: number, y: number }}
     */
    static #resolvePolygonCentroid(points) {
        const totals = points.reduce(
            (accumulator, point) => ({
                x: accumulator.x + Number(point.x || 0),
                y: accumulator.y + Number(point.y || 0)
            }),
            { x: 0, y: 0 }
        )
        const count = Math.max(points.length, 1)

        return {
            x: totals.x / count,
            y: totals.y / count
        }
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
