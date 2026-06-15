/**
 * Detects polygon overlap for geometry cleanup decisions.
 */
export class PcbScene3dPolygonOverlap {
    static #DEFAULT_EPSILON = 0.001

    /**
     * Returns polygons that overlap at least one sibling polygon.
     * @param {{ x: number, y: number }[][]} polygons
     * @param {number} [epsilon]
     * @returns {{ x: number, y: number }[][]}
     */
    static filterOverlapping(polygons, epsilon = this.#DEFAULT_EPSILON) {
        const validPolygons = (Array.isArray(polygons) ? polygons : []).filter(
            (polygon) => Array.isArray(polygon) && polygon.length >= 3
        )

        return validPolygons.filter((polygon, index) =>
            validPolygons.some(
                (otherPolygon, otherIndex) =>
                    otherIndex !== index &&
                    this.#polygonsOverlap(polygon, otherPolygon, epsilon)
            )
        )
    }

    /**
     * Returns true when two polygon interiors or borders overlap.
     * @param {{ x: number, y: number }[]} first
     * @param {{ x: number, y: number }[]} second
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #polygonsOverlap(first, second, epsilon) {
        if (
            !this.#boundsOverlap(
                this.#polygonBounds(first),
                this.#polygonBounds(second),
                epsilon
            )
        ) {
            return false
        }

        return (
            first.some((point) =>
                this.#isPointInsideOrOnPolygon(point, second, epsilon)
            ) ||
            second.some((point) =>
                this.#isPointInsideOrOnPolygon(point, first, epsilon)
            ) ||
            first.some((start, index) =>
                second.some((otherStart, otherIndex) =>
                    this.#segmentsIntersect(
                        start,
                        first[(index + 1) % first.length],
                        otherStart,
                        second[(otherIndex + 1) % second.length],
                        epsilon
                    )
                )
            )
        )
    }

    /**
     * Builds axis-aligned bounds for one polygon.
     * @param {{ x: number, y: number }[]} polygon
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #polygonBounds(polygon) {
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
     * Returns true when two bounds touch or overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #boundsOverlap(first, second, epsilon) {
        return (
            first.minX <= second.maxX + epsilon &&
            first.maxX + epsilon >= second.minX &&
            first.minY <= second.maxY + epsilon &&
            first.maxY + epsilon >= second.minY
        )
    }

    /**
     * Returns true when a point lies inside a polygon or on its border.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} polygon
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #isPointInsideOrOnPolygon(point, polygon, epsilon) {
        return (
            this.#isPointOnPolygonBoundary(point, polygon, epsilon) ||
            this.#isPointStrictlyInsidePolygon(point, polygon, epsilon)
        )
    }

    /**
     * Returns true when a point lies inside a polygon and away from its border.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} polygon
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #isPointStrictlyInsidePolygon(point, polygon, epsilon) {
        if (this.#isPointOnPolygonBoundary(point, polygon, epsilon)) {
            return false
        }

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
     * Returns true when a point lies on a polygon edge.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} polygon
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #isPointOnPolygonBoundary(point, polygon, epsilon) {
        return polygon.some((start, index) =>
            this.#isPointOnSegment(
                point,
                start,
                polygon[(index + 1) % polygon.length],
                epsilon
            )
        )
    }

    /**
     * Returns true when two line segments intersect.
     * @param {{ x: number, y: number }} firstStart
     * @param {{ x: number, y: number }} firstEnd
     * @param {{ x: number, y: number }} secondStart
     * @param {{ x: number, y: number }} secondEnd
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #segmentsIntersect(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd,
        epsilon
    ) {
        if (
            this.#isPointOnSegment(
                firstStart,
                secondStart,
                secondEnd,
                epsilon
            ) ||
            this.#isPointOnSegment(firstEnd, secondStart, secondEnd, epsilon) ||
            this.#isPointOnSegment(
                secondStart,
                firstStart,
                firstEnd,
                epsilon
            ) ||
            this.#isPointOnSegment(secondEnd, firstStart, firstEnd, epsilon)
        ) {
            return true
        }

        const firstSideStart = this.#segmentSide(
            firstStart,
            firstEnd,
            secondStart,
            epsilon
        )
        const firstSideEnd = this.#segmentSide(
            firstStart,
            firstEnd,
            secondEnd,
            epsilon
        )
        const secondSideStart = this.#segmentSide(
            secondStart,
            secondEnd,
            firstStart,
            epsilon
        )
        const secondSideEnd = this.#segmentSide(
            secondStart,
            secondEnd,
            firstEnd,
            epsilon
        )

        return (
            firstSideStart * firstSideEnd < 0 &&
            secondSideStart * secondSideEnd < 0
        )
    }

    /**
     * Returns true when a point lies on a segment within geometry tolerance.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #isPointOnSegment(point, start, end, epsilon) {
        const cross =
            (point.y - start.y) * (end.x - start.x) -
            (point.x - start.x) * (end.y - start.y)

        if (Math.abs(cross) > epsilon) {
            return false
        }

        const dot =
            (point.x - start.x) * (end.x - start.x) +
            (point.y - start.y) * (end.y - start.y)

        if (dot < -epsilon) {
            return false
        }

        const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2

        return dot <= lengthSquared + epsilon
    }

    /**
     * Calculates which side of a directed segment a point lies on.
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @param {{ x: number, y: number }} point
     * @param {number} epsilon
     * @returns {number}
     */
    static #segmentSide(start, end, point, epsilon) {
        const value =
            (end.x - start.x) * (point.y - start.y) -
            (end.y - start.y) * (point.x - start.x)

        return Math.abs(value) <= epsilon ? 0 : value
    }
}
