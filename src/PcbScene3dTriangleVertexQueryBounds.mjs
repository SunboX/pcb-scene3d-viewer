const FLOAT64_VALUE = new Float64Array(1)
const FLOAT64_BITS = new BigUint64Array(FLOAT64_VALUE.buffer)
const UNIT_ROUNDOFF = Number.EPSILON / 2
// This is the ORIENT2D forward-error coefficient for the unchanged legacy
// determinant order; every magnitude passed to it is rounded outward first.
const ORIENTATION_ERROR_FACTOR = (3 + 16 * UNIT_ROUNDOFF) * UNIT_ROUNDOFF

/**
 * Resolves candidate-complete cutout-vertex bounds for tolerant triangles.
 */
export class PcbScene3dTriangleVertexQueryBounds {
    /**
     * Expands triangle bounds for the legacy signed-area tolerance predicate.
     * Returns null when finite indexed bounds cannot be proven conservative.
     * @param {{ x: number, y: number }[]} triangle Triangle vertices.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds Triangle bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} cutoutBounds Cutout bounds.
     * @param {number} epsilon Signed-area tolerance.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
     */
    static resolve(triangle, triangleBounds, cutoutBounds, epsilon) {
        if (
            !Array.isArray(triangle) ||
            triangle.length !== 3 ||
            !PcbScene3dTriangleVertexQueryBounds.#hasFiniteBounds(
                triangleBounds
            ) ||
            !PcbScene3dTriangleVertexQueryBounds.#hasFiniteBounds(
                cutoutBounds
            ) ||
            !Number.isFinite(epsilon) ||
            epsilon <= 0
        ) {
            return null
        }

        const doubledArea = Math.abs(
            PcbScene3dTriangleVertexQueryBounds.#cross(
                triangle[0],
                triangle[1],
                triangle[2]
            )
        )
        const areaError =
            PcbScene3dTriangleVertexQueryBounds.#resolveCrossErrorBound(
                triangle[0],
                triangle[1],
                triangle[2]
            )
        const minimumArea = PcbScene3dTriangleVertexQueryBounds.#nextDown(
            doubledArea - areaError
        )
        const pointCrossError =
            PcbScene3dTriangleVertexQueryBounds.#resolvePointCrossErrorBound(
                triangle,
                cutoutBounds
            )

        if (
            !Number.isFinite(minimumArea) ||
            minimumArea <= 0 ||
            !Number.isFinite(pointCrossError) ||
            pointCrossError >= epsilon
        ) {
            return null
        }

        const effectiveTolerance = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            epsilon + pointCrossError
        )
        const width = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            triangleBounds.maxX - triangleBounds.minX
        )
        const height = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            triangleBounds.maxY - triangleBounds.minY
        )
        const expansionScale = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            (2 * effectiveTolerance) / minimumArea
        )
        const expansionX = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            width * expansionScale
        )
        const expansionY = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            height * expansionScale
        )
        const result = {
            minX: PcbScene3dTriangleVertexQueryBounds.#nextDown(
                triangleBounds.minX - expansionX
            ),
            maxX: PcbScene3dTriangleVertexQueryBounds.#nextUp(
                triangleBounds.maxX + expansionX
            ),
            minY: PcbScene3dTriangleVertexQueryBounds.#nextDown(
                triangleBounds.minY - expansionY
            ),
            maxY: PcbScene3dTriangleVertexQueryBounds.#nextUp(
                triangleBounds.maxY + expansionY
            )
        }

        return PcbScene3dTriangleVertexQueryBounds.#hasFiniteBounds(result)
            ? result
            : null
    }

    /**
     * Resolves the maximum point-first determinant error over cutout bounds.
     * @param {{ x: number, y: number }[]} triangle Triangle vertices.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Cutout bounds.
     * @returns {number}
     */
    static #resolvePointCrossErrorBound(triangle, bounds) {
        let maximumError = 0

        for (let index = 0; index < triangle.length; index += 1) {
            const start = triangle[index]
            const end = triangle[(index + 1) % triangle.length]
            const firstX =
                PcbScene3dTriangleVertexQueryBounds.#resolveRangeDifferenceBound(
                    start.x,
                    bounds.minX,
                    bounds.maxX
                )
            const firstY =
                PcbScene3dTriangleVertexQueryBounds.#resolveRangeDifferenceBound(
                    start.y,
                    bounds.minY,
                    bounds.maxY
                )
            const secondX =
                PcbScene3dTriangleVertexQueryBounds.#resolveRangeDifferenceBound(
                    end.x,
                    bounds.minX,
                    bounds.maxX
                )
            const secondY =
                PcbScene3dTriangleVertexQueryBounds.#resolveRangeDifferenceBound(
                    end.y,
                    bounds.minY,
                    bounds.maxY
                )
            const error =
                PcbScene3dTriangleVertexQueryBounds.#resolveDeterminantErrorBound(
                    firstX,
                    secondY,
                    firstY,
                    secondX
                )

            maximumError = Math.max(maximumError, error)
        }

        return maximumError
    }

    /**
     * Resolves one point-first determinant error for fixed coordinates.
     * @param {{ x: number, y: number }} point First cross argument.
     * @param {{ x: number, y: number }} start Second cross argument.
     * @param {{ x: number, y: number }} end Third cross argument.
     * @returns {number}
     */
    static #resolveCrossErrorBound(point, start, end) {
        return PcbScene3dTriangleVertexQueryBounds.#resolveDeterminantErrorBound(
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                start.x,
                point.x
            ),
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                end.y,
                point.y
            ),
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                start.y,
                point.y
            ),
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                end.x,
                point.x
            )
        )
    }

    /**
     * Resolves a conservative ORIENT2D forward-error bound.
     * @param {number} firstLeft First product's left magnitude bound.
     * @param {number} firstRight First product's right magnitude bound.
     * @param {number} secondLeft Second product's left magnitude bound.
     * @param {number} secondRight Second product's right magnitude bound.
     * @returns {number}
     */
    static #resolveDeterminantErrorBound(
        firstLeft,
        firstRight,
        secondLeft,
        secondRight
    ) {
        const firstProduct = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            firstLeft * firstRight
        )
        const secondProduct = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            secondLeft * secondRight
        )
        const determinantSum = PcbScene3dTriangleVertexQueryBounds.#nextUp(
            firstProduct + secondProduct
        )

        return PcbScene3dTriangleVertexQueryBounds.#nextUp(
            ORIENTATION_ERROR_FACTOR * determinantSum
        )
    }

    /**
     * Resolves an outward-rounded difference magnitude over one range.
     * @param {number} value Fixed coordinate.
     * @param {number} minimum Range minimum.
     * @param {number} maximum Range maximum.
     * @returns {number}
     */
    static #resolveRangeDifferenceBound(value, minimum, maximum) {
        return Math.max(
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                value,
                minimum
            ),
            PcbScene3dTriangleVertexQueryBounds.#resolveDifferenceBound(
                value,
                maximum
            )
        )
    }

    /**
     * Resolves an outward-rounded difference magnitude.
     * @param {number} first First coordinate.
     * @param {number} second Second coordinate.
     * @returns {number}
     */
    static #resolveDifferenceBound(first, second) {
        return PcbScene3dTriangleVertexQueryBounds.#nextUp(
            Math.abs(first - second)
        )
    }

    /**
     * Returns true for finite, ordered two-dimensional bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds to inspect.
     * @returns {boolean}
     */
    static #hasFiniteBounds(bounds) {
        return (
            Number.isFinite(bounds?.minX) &&
            Number.isFinite(bounds?.maxX) &&
            Number.isFinite(bounds?.minY) &&
            Number.isFinite(bounds?.maxY) &&
            bounds.minX <= bounds.maxX &&
            bounds.minY <= bounds.maxY
        )
    }

    /**
     * Resolves the unchanged legacy signed-area expression.
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

    /**
     * Returns the next representable number toward positive infinity.
     * @param {number} value Source value.
     * @returns {number}
     */
    static #nextUp(value) {
        if (Number.isNaN(value) || value === Infinity) return value
        if (value === 0) return Number.MIN_VALUE

        FLOAT64_VALUE[0] = value
        FLOAT64_BITS[0] += value > 0 ? 1n : -1n
        return FLOAT64_VALUE[0]
    }

    /**
     * Returns the next representable number toward negative infinity.
     * @param {number} value Source value.
     * @returns {number}
     */
    static #nextDown(value) {
        if (Number.isNaN(value) || value === -Infinity) return value
        if (value === 0) return -Number.MIN_VALUE

        FLOAT64_VALUE[0] = value
        FLOAT64_BITS[0] += value > 0 ? -1n : 1n
        return FLOAT64_VALUE[0]
    }
}
