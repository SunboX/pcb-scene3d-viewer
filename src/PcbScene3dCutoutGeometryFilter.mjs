import { PcbScene3dCircularCutoutOverlap } from './PcbScene3dCircularCutoutOverlap.mjs'
import { PcbScene3dCutoutCircleDetector } from './PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dCutoutGridIndex } from './PcbScene3dCutoutGridIndex.mjs'
import { PcbScene3dGeometryBoundsResolver } from './PcbScene3dGeometryBoundsResolver.mjs'
import { PcbScene3dPreparedPolygon } from './PcbScene3dPreparedPolygon.mjs'
import { PcbScene3dTerminalCutoutClassifier } from './PcbScene3dTerminalCutoutClassifier.mjs'
import { PcbScene3dTriangleVertexQueryBounds } from './PcbScene3dTriangleVertexQueryBounds.mjs'

/** Clips filled 2D geometry against drill-cutout polygons. */
export class PcbScene3dCutoutGeometryFilter {
    static #GEOMETRY_EPSILON = 0.001
    static #DEFAULT_MAX_DEPTH = 9
    static #DEFAULT_MAX_EDGE_LENGTH = 4
    /**
     * Removes triangles that still overlap cutouts after triangulation.
     * @param {any} THREE
     * @param {any} geometry
     * @param {{ x: number, y: number }[][]} cutouts
     * @param {{ maxDepth?: number, maxEdgeLength?: number, discardTerminalOverlaps?: boolean, preparedPolygonCache?: Map }} [options]
     * @returns {any}
     */
    static filter(THREE, geometry, cutouts, options = {}) {
        if (
            !Array.isArray(cutouts) ||
            !cutouts.length ||
            !geometry?.getAttribute ||
            !THREE.BufferGeometry ||
            !THREE.Float32BufferAttribute
        ) {
            return geometry
        }
        const sourceGeometry = geometry.index
            ? geometry.toNonIndexed?.() || geometry
            : geometry
        const position = sourceGeometry.getAttribute('position')
        if (!position?.count) {
            return geometry
        }
        const preparedCutouts = PcbScene3dCutoutGeometryFilter.#prepareCutouts(
            cutouts,
            PcbScene3dCutoutGeometryFilter.#resolvePreparedPolygonCache(options)
        )
        if (
            PcbScene3dGeometryBoundsResolver.missesAllPositionBounds(
                position,
                preparedCutouts,
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            )
        )
            return geometry
        const cutoutIndex = new PcbScene3dCutoutGridIndex(preparedCutouts)
        const settings =
            PcbScene3dCutoutGeometryFilter.#resolveSettings(options)
        const positions = []
        const state = { changed: false }
        for (let index = 0; index < position.count; index += 3) {
            const triangle =
                PcbScene3dCutoutGeometryFilter.#resolveGeometryTriangle(
                    position,
                    index
                )
            PcbScene3dCutoutGeometryFilter.#appendFilteredTriangle(
                positions,
                triangle,
                preparedCutouts,
                settings,
                0,
                state,
                cutoutIndex
            )
        }
        if (!state.changed) {
            return geometry
        }
        const filteredGeometry = new THREE.BufferGeometry()
        filteredGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        filteredGeometry.computeVertexNormals?.()
        return filteredGeometry
    }
    /**
     * Resolves clipping settings.
     * @param {{ maxDepth?: number, maxEdgeLength?: number, discardTerminalOverlaps?: boolean, preparedPolygonCache?: Map }} options
     * @returns {{ maxDepth: number, maxEdgeLength: number, maxEdgeLengthSquared: number, discardTerminalOverlaps: boolean }}
     */
    static #resolveSettings(options) {
        const maxEdgeLength = Math.max(
            Number.isFinite(Number(options?.maxEdgeLength))
                ? Number(options.maxEdgeLength)
                : PcbScene3dCutoutGeometryFilter.#DEFAULT_MAX_EDGE_LENGTH,
            PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        )
        return {
            maxDepth: Math.max(
                Number.isFinite(Number(options?.maxDepth))
                    ? Number(options.maxDepth)
                    : PcbScene3dCutoutGeometryFilter.#DEFAULT_MAX_DEPTH,
                0
            ),
            maxEdgeLength,
            maxEdgeLengthSquared: maxEdgeLength * maxEdgeLength,
            discardTerminalOverlaps: options?.discardTerminalOverlaps === true
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
     * Prepares valid cutout polygons for exact indexed queries.
     * @param {{ x: number, y: number }[][]} cutouts
     * @param {Map | null} preparedPolygonCache Request-scoped prepared cache.
     * @returns {PcbScene3dPreparedPolygon[]}
     */
    static #prepareCutouts(cutouts, preparedPolygonCache) {
        return cutouts
            .filter((cutout) => Array.isArray(cutout) && cutout.length >= 3)
            .map((cutout, sourceIndex) => {
                let prepared = preparedPolygonCache?.has(cutout)
                    ? preparedPolygonCache.get(cutout)
                    : null

                if (
                    prepared?.circleDetectionEnabled !== true ||
                    !['raw', 'raw-numeric'].includes(
                        prepared?.pointRepresentation
                    )
                ) {
                    const metadataPoints = cutout.map((point) => ({
                        x: Number(point?.x || 0),
                        y: Number(point?.y || 0)
                    }))
                    prepared = new PcbScene3dPreparedPolygon(cutout, {
                        source: cutout,
                        sourceIndex,
                        epsilon:
                            PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON,
                        detectCircle: true,
                        metadataPoints,
                        pointRepresentation: 'raw'
                    })
                    preparedPolygonCache?.set(cutout, prepared)
                }

                return prepared
            })
    }
    /**
     * Appends a triangle, subdividing near cutouts before removal.
     * @param {number[]} positions
     * @param {{ x: number, y: number, z: number }[]} triangle
     * @param {PcbScene3dPreparedPolygon[]} cutouts
     * @param {{ maxDepth: number, maxEdgeLength: number, maxEdgeLengthSquared: number, discardTerminalOverlaps: boolean }} settings
     * @param {number} depth
     * @param {{ changed: boolean }} state
     * @param {PcbScene3dCutoutGridIndex | null} [cutoutIndex]
     * @returns {void}
     */
    static #appendFilteredTriangle(
        positions,
        triangle,
        cutouts,
        settings,
        depth,
        state,
        cutoutIndex = null
    ) {
        const triangleBounds =
            PcbScene3dCutoutGeometryFilter.#resolveBounds(triangle)
        const candidateCutouts = cutoutIndex
            ? cutoutIndex.query(triangleBounds)
            : cutouts
        const overlappingCutouts = []
        for (const cutout of candidateCutouts) {
            if (
                PcbScene3dCutoutGeometryFilter.#boundsOverlap(
                    triangleBounds,
                    cutout.bounds
                ) &&
                PcbScene3dCutoutGeometryFilter.#doesTriangleOverlapCutout(
                    triangle,
                    cutout,
                    triangleBounds
                )
            ) {
                overlappingCutouts.push(cutout)
            }
        }
        if (!overlappingCutouts.length) {
            PcbScene3dCutoutGeometryFilter.#appendTriangle(positions, triangle)
            return
        }
        state.changed = true
        if (
            overlappingCutouts.some(
                (cutout) =>
                    triangle.every((point) =>
                        PcbScene3dCutoutGeometryFilter.#isPointInsideOrOnCutout(
                            point,
                            cutout
                        )
                    ) &&
                    !PcbScene3dCutoutGeometryFilter.#hasIntersectingEdges(
                        triangle,
                        cutout
                    )
            )
        ) {
            return
        }
        if (
            depth >= settings.maxDepth ||
            PcbScene3dCutoutGeometryFilter.#maxEdgeLengthSquared(triangle) <=
                settings.maxEdgeLengthSquared
        ) {
            if (!settings.discardTerminalOverlaps) {
                PcbScene3dTerminalCutoutClassifier.appendTriangleIfKept(
                    positions,
                    triangle,
                    overlappingCutouts,
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
                )
            }
            return
        }
        PcbScene3dCutoutGeometryFilter.#subdivideTriangle(triangle).forEach(
            (childTriangle) => {
                PcbScene3dCutoutGeometryFilter.#appendFilteredTriangle(
                    positions,
                    childTriangle,
                    overlappingCutouts,
                    settings,
                    depth + 1,
                    state,
                    null
                )
            }
        )
    }

    /**
     * Appends one triangle to the flattened position buffer.
     * @param {number[]} positions
     * @param {{ x: number, y: number, z: number }[]} triangle
     * @returns {void}
     */
    static #appendTriangle(positions, triangle) {
        for (const point of triangle) {
            positions.push(point.x, point.y, point.z)
        }
    }

    /**
     * Splits one triangle into four child triangles.
     * @param {{ x: number, y: number, z: number }[]} triangle
     * @returns {{ x: number, y: number, z: number }[][]}
     */
    static #subdivideTriangle(triangle) {
        const [first, second, third] = triangle
        const firstSecond = PcbScene3dCutoutGeometryFilter.#midpoint(
            first,
            second
        )
        const secondThird = PcbScene3dCutoutGeometryFilter.#midpoint(
            second,
            third
        )
        const thirdFirst = PcbScene3dCutoutGeometryFilter.#midpoint(
            third,
            first
        )

        return [
            [first, firstSecond, thirdFirst],
            [firstSecond, second, secondThird],
            [thirdFirst, secondThird, third],
            [firstSecond, secondThird, thirdFirst]
        ]
    }

    /**
     * Resolves the midpoint between two 3D points.
     * @param {{ x: number, y: number, z: number }} first
     * @param {{ x: number, y: number, z: number }} second
     * @returns {{ x: number, y: number, z: number }}
     */
    static #midpoint(first, second) {
        return {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
            z: (first.z + second.z) / 2
        }
    }

    /**
     * Resolves the longest squared edge length in one triangle.
     * @param {{ x: number, y: number }[]} triangle
     * @returns {number}
     */
    static #maxEdgeLengthSquared(triangle) {
        let maxLengthSquared = 0

        for (let index = 0; index < triangle.length; index += 1) {
            const point = triangle[index]
            const next = triangle[(index + 1) % triangle.length]
            const dx = point.x - next.x
            const dy = point.y - next.y
            maxLengthSquared = Math.max(maxLengthSquared, dx * dx + dy * dy)
        }

        return maxLengthSquared
    }

    /**
     * Resolves a polygon or triangle bounding box.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveBounds(points) {
        const bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }

        for (const point of points) {
            const x = Number(point.x || 0)
            const y = Number(point.y || 0)

            bounds.minX = Math.min(bounds.minX, x)
            bounds.maxX = Math.max(bounds.maxX, x)
            bounds.minY = Math.min(bounds.minY, y)
            bounds.maxY = Math.max(bounds.maxY, y)
        }

        return bounds
    }

    /**
     * Returns true when two bounding boxes overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second
     * @returns {boolean}
     */
    static #boundsOverlap(first, second) {
        return (
            first.minX <=
                second.maxX +
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            first.maxX >=
                second.minX -
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            first.minY <=
                second.maxY +
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            first.maxY >=
                second.minY - PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        )
    }

    /**
     * Resolves one XY triangle from a geometry position attribute.
     * @param {any} position
     * @param {number} startIndex
     * @returns {{ x: number, y: number, z: number }[]}
     */
    static #resolveGeometryTriangle(position, startIndex) {
        return [
            PcbScene3dCutoutGeometryFilter.#resolveGeometryPoint(
                position,
                startIndex
            ),
            PcbScene3dCutoutGeometryFilter.#resolveGeometryPoint(
                position,
                startIndex + 1
            ),
            PcbScene3dCutoutGeometryFilter.#resolveGeometryPoint(
                position,
                startIndex + 2
            )
        ]
    }

    /**
     * Resolves one geometry position as a 3D point.
     * @param {any} position
     * @param {number} index
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveGeometryPoint(position, index) {
        return {
            x: Number(position.getX(index)),
            y: Number(position.getY(index)),
            z: Number(position.getZ?.(index) || 0)
        }
    }

    /**
     * Returns true when one triangle intersects or covers a cutout.
     * @param {{ x: number, y: number }[]} triangle
     * @param {PcbScene3dPreparedPolygon} cutout
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds
     * @returns {boolean}
     */
    static #doesTriangleOverlapCutout(triangle, cutout, triangleBounds) {
        if (
            !Array.isArray(triangle) ||
            triangle.length !== 3 ||
            !Array.isArray(cutout?.points) ||
            cutout.points.length < 3
        ) {
            return false
        }

        if (cutout.isCircular) {
            return PcbScene3dCircularCutoutOverlap.overlapsTriangle(
                triangle,
                cutout,
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            )
        }

        for (const point of triangle) {
            if (
                PcbScene3dCutoutGeometryFilter.#isPointInsideOrOnCutout(
                    point,
                    cutout
                )
            ) {
                return true
            }
        }

        const vertexCandidates =
            PcbScene3dCutoutGeometryFilter.#queryCutoutVertices(
                cutout,
                triangle,
                triangleBounds
            )
        for (const point of vertexCandidates) {
            if (
                PcbScene3dCutoutGeometryFilter.#isPointInsideOrOnTriangle(
                    point,
                    triangle
                )
            ) {
                return true
            }
        }

        return PcbScene3dCutoutGeometryFilter.#hasIntersectingEdges(
            triangle,
            cutout
        )
    }

    /**
     * Returns cutout vertices conservatively admitted by triangle tolerance.
     * @param {PcbScene3dPreparedPolygon} cutout
     * @param {{ x: number, y: number }[]} triangle
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds
     * @returns {{ x: number, y: number }[]}
     */
    static #queryCutoutVertices(cutout, triangle, triangleBounds) {
        const queryBounds = PcbScene3dTriangleVertexQueryBounds.resolve(
            triangle,
            triangleBounds,
            cutout.bounds,
            PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        )

        return queryBounds
            ? cutout.queryVertices(queryBounds, [])
            : cutout.points
    }

    /**
     * Returns true when a point is inside or on a cutout.
     * @param {{ x: number, y: number }} point
     * @param {PcbScene3dPreparedPolygon} cutout
     * @returns {boolean}
     */
    static #isPointInsideOrOnCutout(point, cutout) {
        if (
            !PcbScene3dCutoutGeometryFilter.#pointOverlapsBounds(
                point,
                cutout.bounds
            )
        ) {
            return false
        }

        if (cutout.isCircular) {
            return (
                PcbScene3dCutoutCircleDetector.distanceSquared(point, cutout) <=
                (Number(cutout.radius || 0) +
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON) **
                    2
            )
        }

        return (
            PcbScene3dCutoutGeometryFilter.#isPointOnCutoutBoundary(
                point,
                cutout
            ) ||
            PcbScene3dCutoutGeometryFilter.#isPointStrictlyInsideCutout(
                point,
                cutout
            )
        )
    }

    /**
     * Returns true when a point lies within a bounding box tolerance.
     * @param {{ x: number, y: number }} point
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @returns {boolean}
     */
    static #pointOverlapsBounds(point, bounds) {
        return (
            point.x >=
                bounds.minX -
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            point.x <=
                bounds.maxX +
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            point.y >=
                bounds.minY -
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            point.y <=
                bounds.maxY + PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        )
    }

    /**
     * Returns true when a point lies inside a cutout and away from its border.
     * @param {{ x: number, y: number }} point
     * @param {PcbScene3dPreparedPolygon} cutout
     * @returns {boolean}
     */
    static #isPointStrictlyInsideCutout(point, cutout) {
        if (cutout.isCircular) {
            const radius = Math.max(
                0,
                Number(cutout.radius || 0) -
                    PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            )
            return (
                PcbScene3dCutoutCircleDetector.distanceSquared(point, cutout) <
                radius * radius
            )
        }

        return cutout.containsPointStrict(point, {
            segmentBoundsEpsilon:
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        })
    }

    /**
     * Returns true when a point lies on a cutout edge.
     * @param {{ x: number, y: number }} point
     * @param {PcbScene3dPreparedPolygon} cutout
     * @returns {boolean}
     */
    static #isPointOnCutoutBoundary(point, cutout) {
        if (cutout.isCircular) {
            return (
                Math.abs(
                    Math.sqrt(
                        PcbScene3dCutoutCircleDetector.distanceSquared(
                            point,
                            cutout
                        )
                    ) - Number(cutout.radius || 0)
                ) <= PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            )
        }

        return cutout.isPointOnBoundary(point, {
            segmentBoundsEpsilon:
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        })
    }

    /**
     * Returns true when a point is inside or on one triangle.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }[]} triangle
     * @returns {boolean}
     */
    static #isPointInsideOrOnTriangle(point, triangle) {
        let hasNegative = false
        let hasPositive = false

        for (let index = 0; index < triangle.length; index += 1) {
            const current = triangle[index]
            const next = triangle[(index + 1) % triangle.length]
            const sign = PcbScene3dCutoutGeometryFilter.#cross(
                point,
                current,
                next
            )

            hasNegative =
                hasNegative ||
                sign < -PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            hasPositive =
                hasPositive ||
                sign > PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        }

        return !(hasNegative && hasPositive)
    }

    /**
     * Returns true when any triangle and cutout edges intersect.
     * @param {{ x: number, y: number }[]} triangle
     * @param {PcbScene3dPreparedPolygon} cutout
     * @returns {boolean}
     */
    static #hasIntersectingEdges(triangle, cutout) {
        for (
            let triangleIndex = 0;
            triangleIndex < triangle.length;
            triangleIndex += 1
        ) {
            const triangleStart = triangle[triangleIndex]
            const triangleEnd = triangle[(triangleIndex + 1) % triangle.length]
            const triangleSegmentBounds =
                PcbScene3dCutoutGeometryFilter.#resolveSegmentBounds(
                    triangleStart,
                    triangleEnd
                )

            const segmentCandidates = cutout.querySegments(
                triangleSegmentBounds,
                []
            )
            for (const segment of segmentCandidates) {
                if (
                    PcbScene3dCutoutGeometryFilter.#boundsOverlap(
                        triangleSegmentBounds,
                        segment.bounds
                    ) &&
                    PcbScene3dCutoutGeometryFilter.#segmentsIntersect(
                        triangleStart,
                        triangleEnd,
                        segment.start,
                        segment.end
                    )
                ) {
                    return true
                }
            }
        }

        return false
    }

    /**
     * Resolves one finite segment bounding box.
     * @param {{ x: number, y: number }} firstStart
     * @param {{ x: number, y: number }} firstEnd
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveSegmentBounds(firstStart, firstEnd) {
        return {
            minX: Math.min(firstStart.x, firstEnd.x),
            maxX: Math.max(firstStart.x, firstEnd.x),
            minY: Math.min(firstStart.y, firstEnd.y),
            maxY: Math.max(firstStart.y, firstEnd.y)
        }
    }

    /**
     * Returns true when two finite line segments intersect.
     * @param {{ x: number, y: number }} firstStart
     * @param {{ x: number, y: number }} firstEnd
     * @param {{ x: number, y: number }} secondStart
     * @param {{ x: number, y: number }} secondEnd
     * @returns {boolean}
     */
    static #segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
        const firstOrientation = PcbScene3dCutoutGeometryFilter.#cross(
            firstStart,
            firstEnd,
            secondStart
        )
        const secondOrientation = PcbScene3dCutoutGeometryFilter.#cross(
            firstStart,
            firstEnd,
            secondEnd
        )
        const thirdOrientation = PcbScene3dCutoutGeometryFilter.#cross(
            secondStart,
            secondEnd,
            firstStart
        )
        const fourthOrientation = PcbScene3dCutoutGeometryFilter.#cross(
            secondStart,
            secondEnd,
            firstEnd
        )

        if (
            PcbScene3dCutoutGeometryFilter.#hasOppositeSigns(
                firstOrientation,
                secondOrientation
            ) &&
            PcbScene3dCutoutGeometryFilter.#hasOppositeSigns(
                thirdOrientation,
                fourthOrientation
            )
        ) {
            return true
        }

        return (
            PcbScene3dCutoutGeometryFilter.#isCollinearPointOnSegment(
                secondStart,
                firstStart,
                firstEnd,
                firstOrientation
            ) ||
            PcbScene3dCutoutGeometryFilter.#isCollinearPointOnSegment(
                secondEnd,
                firstStart,
                firstEnd,
                secondOrientation
            ) ||
            PcbScene3dCutoutGeometryFilter.#isCollinearPointOnSegment(
                firstStart,
                secondStart,
                secondEnd,
                thirdOrientation
            ) ||
            PcbScene3dCutoutGeometryFilter.#isCollinearPointOnSegment(
                firstEnd,
                secondStart,
                secondEnd,
                fourthOrientation
            )
        )
    }

    /**
     * Returns true when two signed areas are meaningfully opposite.
     * @param {number} first
     * @param {number} second
     * @returns {boolean}
     */
    static #hasOppositeSigns(first, second) {
        return (
            (first > PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
                second < -PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON) ||
            (first < -PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
                second > PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON)
        )
    }

    /**
     * Returns true when a collinear point lies on a segment.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @param {number} orientation
     * @returns {boolean}
     */
    static #isCollinearPointOnSegment(point, start, end, orientation) {
        return (
            Math.abs(orientation) <=
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON &&
            PcbScene3dCutoutGeometryFilter.#isPointOnSegment(point, start, end)
        )
    }

    /**
     * Returns true when a point lies on a segment within geometry tolerance.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @returns {boolean}
     */
    static #isPointOnSegment(point, start, end) {
        const cross =
            (point.y - start.y) * (end.x - start.x) -
            (point.x - start.x) * (end.y - start.y)
        if (
            Math.abs(cross) > PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        ) {
            return false
        }

        const dot =
            (point.x - start.x) * (end.x - start.x) +
            (point.y - start.y) * (end.y - start.y)
        if (dot < -PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON) {
            return false
        }

        const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2
        return (
            dot <=
            lengthSquared + PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
        )
    }

    /**
     * Resolves the signed area for three points.
     * @param {{ x: number, y: number }} first
     * @param {{ x: number, y: number }} second
     * @param {{ x: number, y: number }} third
     * @returns {number}
     */
    static #cross(first, second, third) {
        return (
            (second.x - first.x) * (third.y - first.y) -
            (second.y - first.y) * (third.x - first.x)
        )
    }
}
