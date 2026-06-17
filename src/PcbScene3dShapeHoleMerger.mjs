/**
 * Merges overlapping shape holes before triangulation.
 */
export class PcbScene3dShapeHoleMerger {
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Returns shape-hole polygons with overlapping groups merged.
     * @param {{ x: number, y: number }[][]} holes Shape-hole polygons.
     * @returns {{ x: number, y: number }[][]}
     */
    static mergeOverlapping(holes) {
        const validHoles = (Array.isArray(holes) ? holes : []).filter(
            (hole) => Array.isArray(hole) && hole.length >= 3
        )

        if (validHoles.length < 2) {
            return validHoles
        }

        const parents = validHoles.map((_hole, index) => index)
        for (let index = 0; index < validHoles.length; index += 1) {
            for (
                let otherIndex = index + 1;
                otherIndex < validHoles.length;
                otherIndex += 1
            ) {
                if (
                    PcbScene3dShapeHoleMerger.#polygonsOverlap(
                        validHoles[index],
                        validHoles[otherIndex]
                    )
                ) {
                    PcbScene3dShapeHoleMerger.#union(parents, index, otherIndex)
                }
            }
        }

        return PcbScene3dShapeHoleMerger.#groupPolygons(
            validHoles,
            parents
        ).map((group) =>
            group.length === 1
                ? group[0]
                : PcbScene3dShapeHoleMerger.#convexHull(group.flat())
        )
    }

    /**
     * Groups polygons by union-find parent.
     * @param {{ x: number, y: number }[][]} polygons Source polygons.
     * @param {number[]} parents Union-find parent list.
     * @returns {{ x: number, y: number }[][][]}
     */
    static #groupPolygons(polygons, parents) {
        const groups = new Map()

        polygons.forEach((polygon, index) => {
            const parent = PcbScene3dShapeHoleMerger.#find(parents, index)
            const group = groups.get(parent)

            if (group) {
                group.push(polygon)
            } else {
                groups.set(parent, [polygon])
            }
        })

        return [...groups.values()]
    }

    /**
     * Merges two union-find groups.
     * @param {number[]} parents Union-find parent list.
     * @param {number} first First group index.
     * @param {number} second Second group index.
     * @returns {void}
     */
    static #union(parents, first, second) {
        const firstParent = PcbScene3dShapeHoleMerger.#find(parents, first)
        const secondParent = PcbScene3dShapeHoleMerger.#find(parents, second)

        if (firstParent !== secondParent) {
            parents[secondParent] = firstParent
        }
    }

    /**
     * Resolves one union-find parent.
     * @param {number[]} parents Union-find parent list.
     * @param {number} index Group index.
     * @returns {number}
     */
    static #find(parents, index) {
        let parent = parents[index]

        while (parent !== parents[parent]) {
            parents[parent] = parents[parents[parent]]
            parent = parents[parent]
        }

        return parent
    }

    /**
     * Returns true when two polygons overlap or touch.
     * @param {{ x: number, y: number }[]} first First polygon.
     * @param {{ x: number, y: number }[]} second Second polygon.
     * @returns {boolean}
     */
    static #polygonsOverlap(first, second) {
        if (
            !PcbScene3dShapeHoleMerger.#boundsOverlap(
                PcbScene3dShapeHoleMerger.#bounds(first),
                PcbScene3dShapeHoleMerger.#bounds(second)
            )
        ) {
            return false
        }

        return (
            first.some((point) =>
                PcbScene3dShapeHoleMerger.#isPointInsideOrOnPolygon(
                    point,
                    second
                )
            ) ||
            second.some((point) =>
                PcbScene3dShapeHoleMerger.#isPointInsideOrOnPolygon(
                    point,
                    first
                )
            ) ||
            first.some((start, index) =>
                second.some((otherStart, otherIndex) =>
                    PcbScene3dShapeHoleMerger.#segmentsIntersect(
                        start,
                        first[(index + 1) % first.length],
                        otherStart,
                        second[(otherIndex + 1) % second.length]
                    )
                )
            )
        )
    }

    /**
     * Builds a convex hull around a group of points.
     * @param {{ x: number, y: number }[]} points Source points.
     * @returns {{ x: number, y: number }[]}
     */
    static #convexHull(points) {
        const uniquePoints = PcbScene3dShapeHoleMerger.#uniquePoints(points)
        if (uniquePoints.length < 4) {
            return uniquePoints
        }

        const sortedPoints = [...uniquePoints].sort(
            (first, second) => first.x - second.x || first.y - second.y
        )
        const lower = []
        const upper = []

        for (const point of sortedPoints) {
            PcbScene3dShapeHoleMerger.#appendHullPoint(lower, point)
        }
        for (const point of [...sortedPoints].reverse()) {
            PcbScene3dShapeHoleMerger.#appendHullPoint(upper, point)
        }

        lower.pop()
        upper.pop()
        return lower.concat(upper)
    }

    /**
     * Appends one point to a monotonic-chain hull half.
     * @param {{ x: number, y: number }[]} hull Hull points.
     * @param {{ x: number, y: number }} point Point to append.
     * @returns {void}
     */
    static #appendHullPoint(hull, point) {
        while (
            hull.length >= 2 &&
            PcbScene3dShapeHoleMerger.#cross(
                hull[hull.length - 2],
                hull[hull.length - 1],
                point
            ) <= PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON
        ) {
            hull.pop()
        }

        hull.push(point)
    }

    /**
     * Returns finite unique points sorted by insertion order.
     * @param {{ x?: number, y?: number }[]} points Source points.
     * @returns {{ x: number, y: number }[]}
     */
    static #uniquePoints(points) {
        const seen = new Set()
        const uniquePoints = []

        for (const point of Array.isArray(points) ? points : []) {
            const normalizedPoint = {
                x: PcbScene3dShapeHoleMerger.#snapCoordinate(point?.x),
                y: PcbScene3dShapeHoleMerger.#snapCoordinate(point?.y)
            }

            if (
                !Number.isFinite(normalizedPoint.x) ||
                !Number.isFinite(normalizedPoint.y)
            ) {
                continue
            }

            const key = `${normalizedPoint.x.toFixed(6)}:${normalizedPoint.y.toFixed(6)}`
            if (seen.has(key)) {
                continue
            }

            seen.add(key)
            uniquePoints.push(normalizedPoint)
        }

        return uniquePoints
    }

    /**
     * Snaps one coordinate to the duplicate-detection precision.
     * @param {unknown} value Coordinate value.
     * @returns {number}
     */
    static #snapCoordinate(value) {
        const number = Number(value)

        return Number.isFinite(number) ? Number(number.toFixed(6)) : number
    }

    /**
     * Builds an axis-aligned polygon bounds box.
     * @param {{ x: number, y: number }[]} polygon Source polygon.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #bounds(polygon) {
        return polygon.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                maxX: Math.max(bounds.maxX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxY: Math.max(bounds.maxY, point.y)
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
     * Returns true when two bounds boxes touch or overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first First bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second Second bounds.
     * @returns {boolean}
     */
    static #boundsOverlap(first, second) {
        return (
            first.minX <=
                second.maxX + PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON &&
            first.maxX + PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON >=
                second.minX &&
            first.minY <=
                second.maxY + PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON &&
            first.maxY + PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON >=
                second.minY
        )
    }

    /**
     * Returns true when a point lies inside or on a polygon.
     * @param {{ x: number, y: number }} point Point to test.
     * @param {{ x: number, y: number }[]} polygon Polygon to inspect.
     * @returns {boolean}
     */
    static #isPointInsideOrOnPolygon(point, polygon) {
        return (
            PcbScene3dShapeHoleMerger.#isPointOnPolygonBoundary(
                point,
                polygon
            ) || PcbScene3dShapeHoleMerger.#isPointInsidePolygon(point, polygon)
        )
    }

    /**
     * Returns true when a point lies inside a polygon.
     * @param {{ x: number, y: number }} point Point to test.
     * @param {{ x: number, y: number }[]} polygon Polygon to inspect.
     * @returns {boolean}
     */
    static #isPointInsidePolygon(point, polygon) {
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
     * Returns true when a point lies on a polygon boundary.
     * @param {{ x: number, y: number }} point Point to test.
     * @param {{ x: number, y: number }[]} polygon Polygon to inspect.
     * @returns {boolean}
     */
    static #isPointOnPolygonBoundary(point, polygon) {
        return polygon.some((start, index) =>
            PcbScene3dShapeHoleMerger.#isPointOnSegment(
                point,
                start,
                polygon[(index + 1) % polygon.length]
            )
        )
    }

    /**
     * Returns true when two line segments intersect.
     * @param {{ x: number, y: number }} firstStart First segment start.
     * @param {{ x: number, y: number }} firstEnd First segment end.
     * @param {{ x: number, y: number }} secondStart Second segment start.
     * @param {{ x: number, y: number }} secondEnd Second segment end.
     * @returns {boolean}
     */
    static #segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
        const firstOrientation = PcbScene3dShapeHoleMerger.#cross(
            firstStart,
            firstEnd,
            secondStart
        )
        const secondOrientation = PcbScene3dShapeHoleMerger.#cross(
            firstStart,
            firstEnd,
            secondEnd
        )
        const thirdOrientation = PcbScene3dShapeHoleMerger.#cross(
            secondStart,
            secondEnd,
            firstStart
        )
        const fourthOrientation = PcbScene3dShapeHoleMerger.#cross(
            secondStart,
            secondEnd,
            firstEnd
        )

        if (
            PcbScene3dShapeHoleMerger.#hasOppositeSigns(
                firstOrientation,
                secondOrientation
            ) &&
            PcbScene3dShapeHoleMerger.#hasOppositeSigns(
                thirdOrientation,
                fourthOrientation
            )
        ) {
            return true
        }

        return (
            PcbScene3dShapeHoleMerger.#isCollinearPointOnSegment(
                secondStart,
                firstStart,
                firstEnd,
                firstOrientation
            ) ||
            PcbScene3dShapeHoleMerger.#isCollinearPointOnSegment(
                secondEnd,
                firstStart,
                firstEnd,
                secondOrientation
            ) ||
            PcbScene3dShapeHoleMerger.#isCollinearPointOnSegment(
                firstStart,
                secondStart,
                secondEnd,
                thirdOrientation
            ) ||
            PcbScene3dShapeHoleMerger.#isCollinearPointOnSegment(
                firstEnd,
                secondStart,
                secondEnd,
                fourthOrientation
            )
        )
    }

    /**
     * Returns true when two signed areas have opposite signs.
     * @param {number} first First signed area.
     * @param {number} second Second signed area.
     * @returns {boolean}
     */
    static #hasOppositeSigns(first, second) {
        return (
            (first > PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON &&
                second < -PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON) ||
            (first < -PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON &&
                second > PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON)
        )
    }

    /**
     * Returns true when a collinear point lies on one segment.
     * @param {{ x: number, y: number }} point Point to test.
     * @param {{ x: number, y: number }} start Segment start.
     * @param {{ x: number, y: number }} end Segment end.
     * @param {number} orientation Precomputed signed area.
     * @returns {boolean}
     */
    static #isCollinearPointOnSegment(point, start, end, orientation) {
        return (
            Math.abs(orientation) <=
                PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON &&
            PcbScene3dShapeHoleMerger.#isPointOnSegment(point, start, end)
        )
    }

    /**
     * Returns true when a point lies on a line segment.
     * @param {{ x: number, y: number }} point Point to test.
     * @param {{ x: number, y: number }} start Segment start.
     * @param {{ x: number, y: number }} end Segment end.
     * @returns {boolean}
     */
    static #isPointOnSegment(point, start, end) {
        const cross = PcbScene3dShapeHoleMerger.#cross(start, end, point)
        if (Math.abs(cross) > PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON) {
            return false
        }

        const dot =
            (point.x - start.x) * (end.x - start.x) +
            (point.y - start.y) * (end.y - start.y)
        if (dot < -PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON) {
            return false
        }

        const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2

        return (
            dot <= lengthSquared + PcbScene3dShapeHoleMerger.#GEOMETRY_EPSILON
        )
    }

    /**
     * Resolves the signed area for three points.
     * @param {{ x: number, y: number }} first First point.
     * @param {{ x: number, y: number }} second Second point.
     * @param {{ x: number, y: number }} third Third point.
     * @returns {number}
     */
    static #cross(first, second, third) {
        return (
            (second.x - first.x) * (third.y - first.y) -
            (second.y - first.y) * (third.x - first.x)
        )
    }
}
