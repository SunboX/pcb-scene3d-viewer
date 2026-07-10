import { PcbScene3dAabbIndex } from './PcbScene3dAabbIndex.mjs'
import { PcbScene3dCutoutCircleDetector } from './PcbScene3dCutoutCircleDetector.mjs'

/**
 * @typedef {object} PcbScene3dPreparedPolygonBounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minY
 * @property {number} maxY
 */

/**
 * @typedef {object} PcbScene3dPreparedPolygonSegment
 * @property {{ x: number, y: number }} start
 * @property {{ x: number, y: number }} end
 * @property {number} dx
 * @property {number} dy
 * @property {number} lengthSquared
 * @property {PcbScene3dPreparedPolygonBounds} bounds
 */

/**
 * Request-scoped polygon metadata and exact-query acceleration.
 */
export class PcbScene3dPreparedPolygon {
    static #DEFAULT_EPSILON = 0.001
    static #LINEAR_QUERY_LIMIT = 64

    /** @type {*} */
    #source

    /** @type {number} */
    #sourceIndex

    /** @type {{ x: number, y: number }[]} */
    #points

    /** @type {PcbScene3dPreparedPolygonSegment[]} */
    #segments

    /** @type {PcbScene3dPreparedPolygonBounds} */
    #bounds

    /** @type {{ x: number, y: number }} */
    #centroid

    /** @type {number} */
    #signedArea

    /** @type {number} */
    #epsilon

    /** @type {{ isCircular: true, centerX: number, centerY: number, radius: number } | null} */
    #circle

    /** @type {boolean} */
    #circleDetectionEnabled

    /** @type {'raw' | 'numeric' | 'raw-numeric' | null} */
    #pointRepresentation

    /** @type {PcbScene3dAabbIndex | null} */
    #segmentIndex

    /** @type {PcbScene3dAabbIndex | null} */
    #vertexIndex

    /**
     * Prepares reusable polygon metadata without mutating source points.
     * @param {{ x: number, y: number }[]} points
     * @param {{ source?: *, sourceIndex?: number, epsilon?: number, detectCircle?: boolean, metadataPoints?: { x: number, y: number }[], pointRepresentation?: 'raw' | 'numeric' | 'raw-numeric' }} [options]
     */
    constructor(points, options = {}) {
        this.#points = Array.isArray(points) ? points : []
        this.#source = Object.prototype.hasOwnProperty.call(options, 'source')
            ? options.source
            : points
        this.#sourceIndex = options.sourceIndex ?? 0
        this.#epsilon = Number(
            options.epsilon ?? PcbScene3dPreparedPolygon.#DEFAULT_EPSILON
        )

        const metadataPoints = Array.isArray(options.metadataPoints)
            ? options.metadataPoints
            : this.#points
        const metadata =
            PcbScene3dPreparedPolygon.#resolveMetadata(metadataPoints)
        this.#bounds = metadata.bounds
        this.#centroid = metadata.centroid
        this.#signedArea = metadata.signedArea
        this.#pointRepresentation = ['raw', 'numeric', 'raw-numeric'].includes(
            options.pointRepresentation
        )
            ? options.pointRepresentation
            : null
        this.#segments = PcbScene3dPreparedPolygon.#buildSegments(this.#points)
        this.#segmentIndex = null
        this.#vertexIndex = null
        this.#circleDetectionEnabled = options.detectCircle === true
        this.#circle = this.#circleDetectionEnabled
            ? PcbScene3dCutoutCircleDetector.resolve(
                  this.#points,
                  this.#epsilon
              )
            : null
    }

    /**
     * Returns the optional original source identity.
     * @returns {*}
     */
    get source() {
        return this.#source
    }

    /**
     * Returns the source position supplied by the preparing caller.
     * @returns {number}
     */
    get sourceIndex() {
        return this.#sourceIndex
    }

    /**
     * Returns the exact points supplied by the caller.
     * @returns {{ x: number, y: number }[]}
     */
    get points() {
        return this.#points
    }

    /**
     * Returns the producer-declared exact-point representation for cache reuse.
     * @returns {'raw' | 'numeric' | 'raw-numeric' | null}
     */
    get pointRepresentation() {
        return this.#pointRepresentation
    }

    /**
     * Returns source-order polygon segments with cached arithmetic.
     * @returns {PcbScene3dPreparedPolygonSegment[]}
     */
    get segments() {
        return this.#segments
    }

    /**
     * Returns polygon axis-aligned bounds.
     * @returns {PcbScene3dPreparedPolygonBounds}
     */
    get bounds() {
        return this.#bounds
    }

    /**
     * Returns the source-order arithmetic-mean centroid.
     * @returns {{ x: number, y: number }}
     */
    get centroid() {
        return this.#centroid
    }

    /**
     * Returns the signed shoelace area.
     * @returns {number}
     */
    get signedArea() {
        return this.#signedArea
    }

    /**
     * Returns the absolute shoelace area.
     * @returns {number}
     */
    get area() {
        return Math.abs(this.#signedArea)
    }

    /**
     * Returns whether sampled-circle detection was performed during preparation.
     * @returns {boolean}
     */
    get circleDetectionEnabled() {
        return this.#circleDetectionEnabled
    }

    /**
     * Returns cached sampled-circle metadata when detection was requested.
     * @returns {{ isCircular: true, centerX: number, centerY: number, radius: number } | null}
     */
    get circle() {
        return this.#circle
    }

    /**
     * Returns whether sampled-circle metadata was detected.
     * @returns {boolean}
     */
    get isCircular() {
        return this.#circle?.isCircular === true
    }

    /**
     * Returns the cached circle center X coordinate when available.
     * @returns {number | undefined}
     */
    get centerX() {
        return this.#circle?.centerX
    }

    /**
     * Returns the cached circle center Y coordinate when available.
     * @returns {number | undefined}
     */
    get centerY() {
        return this.#circle?.centerY
    }

    /**
     * Returns the cached circle radius when available.
     * @returns {number | undefined}
     */
    get radius() {
        return this.#circle?.radius
    }

    /**
     * Returns true when a point lies strictly inside the polygon.
     * @param {{ x: number, y: number }} point
     * @param {{ segmentBoundsEpsilon?: number }} [options]
     * @returns {boolean}
     */
    containsPointStrict(point, options = {}) {
        if (this.isPointOnBoundary(point, options)) {
            return false
        }

        return (
            PcbScene3dPreparedPolygon.#pointOverlapsBounds(
                point,
                this.#bounds
            ) && this.#containsPointByHorizontalRay(point)
        )
    }

    /**
     * Returns true when a point lies inside or on the polygon boundary.
     * @param {{ x: number, y: number }} point
     * @param {{ segmentBoundsEpsilon?: number }} [options]
     * @returns {boolean}
     */
    containsPointOrBoundary(point, options = {}) {
        if (this.isPointOnBoundary(point, options)) {
            return true
        }

        return (
            PcbScene3dPreparedPolygon.#pointOverlapsBounds(
                point,
                this.#bounds
            ) && this.#containsPointByHorizontalRay(point)
        )
    }

    /**
     * Returns true when a point lies on a polygon segment within tolerance.
     * @param {{ x: number, y: number }} point
     * @param {{ segmentBoundsEpsilon?: number }} [options]
     * @returns {boolean}
     */
    isPointOnBoundary(point, options = {}) {
        const candidates = this.querySegments(
            {
                minX: point.x,
                maxX: point.x,
                minY: point.y,
                maxY: point.y
            },
            []
        )
        const segmentBoundsEpsilon = Number(options.segmentBoundsEpsilon)
        const requireSegmentBoundsOverlap =
            Number.isFinite(segmentBoundsEpsilon)

        return candidates.some(
            (segment) =>
                (!requireSegmentBoundsOverlap ||
                    PcbScene3dPreparedPolygon.#pointOverlapsBounds(
                        point,
                        segment.bounds,
                        Math.max(0, segmentBoundsEpsilon)
                    )) &&
                this.#isPointOnSegment(point, segment)
        )
    }

    /**
     * Appends segment broad-phase candidates to a target.
     * @param {PcbScene3dPreparedPolygonBounds} bounds
     * @param {PcbScene3dPreparedPolygonSegment[]} [target]
     * @returns {PcbScene3dPreparedPolygonSegment[]}
     */
    querySegments(bounds, target = []) {
        if (
            this.#segments.length <=
            PcbScene3dPreparedPolygon.#LINEAR_QUERY_LIMIT
        ) {
            return this.#querySegmentsLinear(bounds, target)
        }

        return this.#resolveSegmentIndex().queryInto(bounds, target)
    }

    /**
     * Appends vertex broad-phase candidates to a target.
     * @param {PcbScene3dPreparedPolygonBounds} bounds
     * @param {{ x: number, y: number }[]} [target]
     * @returns {{ x: number, y: number }[]}
     */
    queryVertices(bounds, target = []) {
        if (
            this.#points.length <= PcbScene3dPreparedPolygon.#LINEAR_QUERY_LIMIT
        ) {
            return this.#queryVerticesLinear(bounds, target)
        }

        return this.#resolveVertexIndex().queryInto(bounds, target, {
            epsilon: this.#epsilon
        })
    }

    /**
     * Resolves and caches the segment AABB index on its first large query.
     * @returns {PcbScene3dAabbIndex}
     */
    #resolveSegmentIndex() {
        if (!this.#segmentIndex) {
            this.#segmentIndex = new PcbScene3dAabbIndex(this.#segments, {
                resolveBounds: (segment) =>
                    PcbScene3dPreparedPolygon.#resolveSegmentIndexBounds(
                        segment,
                        this.#epsilon
                    )
            })
        }

        return this.#segmentIndex
    }

    /**
     * Resolves and caches the vertex AABB index on its first large query.
     * @returns {PcbScene3dAabbIndex}
     */
    #resolveVertexIndex() {
        if (!this.#vertexIndex) {
            this.#vertexIndex = new PcbScene3dAabbIndex(this.#points, {
                resolveBounds: PcbScene3dPreparedPolygon.#resolvePointBounds
            })
        }

        return this.#vertexIndex
    }

    /**
     * Appends exact segment candidates without constructing a small index.
     * @param {PcbScene3dPreparedPolygonBounds} bounds Query bounds.
     * @param {PcbScene3dPreparedPolygonSegment[]} target Candidate target.
     * @returns {PcbScene3dPreparedPolygonSegment[]}
     */
    #querySegmentsLinear(bounds, target) {
        for (const segment of this.#segments) {
            if (
                PcbScene3dPreparedPolygon.#segmentOverlapsQuery(
                    segment,
                    bounds,
                    this.#epsilon
                )
            ) {
                target.push(segment)
            }
        }

        return target
    }

    /**
     * Appends exact vertex candidates without constructing a small index.
     * @param {PcbScene3dPreparedPolygonBounds} bounds Query bounds.
     * @param {{ x: number, y: number }[]} target Candidate target.
     * @returns {{ x: number, y: number }[]}
     */
    #queryVerticesLinear(bounds, target) {
        for (const point of this.#points) {
            if (
                PcbScene3dPreparedPolygon.#pointOverlapsQuery(
                    point,
                    bounds,
                    this.#epsilon
                )
            ) {
                target.push(point)
            }
        }

        return target
    }

    /**
     * Applies the existing horizontal ray expression to crossing candidates.
     * @param {{ x: number, y: number }} point
     * @returns {boolean}
     */
    #containsPointByHorizontalRay(point) {
        const candidates = this.querySegments(
            {
                minX: point.x,
                maxX: this.#bounds.maxX,
                minY: point.y,
                maxY: point.y
            },
            []
        )
        let inside = false

        for (const segment of candidates) {
            const current = segment.end
            const previous = segment.start
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
     * Returns true when a point passes current cross, dot, and length checks.
     * @param {{ x: number, y: number }} point
     * @param {PcbScene3dPreparedPolygonSegment} segment
     * @returns {boolean}
     */
    #isPointOnSegment(point, segment) {
        const cross =
            (point.y - segment.start.y) * segment.dx -
            (point.x - segment.start.x) * segment.dy

        if (Math.abs(cross) > this.#epsilon) {
            return false
        }

        const dot =
            (point.x - segment.start.x) * segment.dx +
            (point.y - segment.start.y) * segment.dy

        if (dot < -this.#epsilon) {
            return false
        }

        return dot <= segment.lengthSquared + this.#epsilon
    }

    /**
     * Builds source-order segments and their reusable arithmetic.
     * @param {{ x: number, y: number }[]} points
     * @returns {PcbScene3dPreparedPolygonSegment[]}
     */
    static #buildSegments(points) {
        return points.map((start, index) => {
            const end = points[(index + 1) % points.length]
            const dx = end.x - start.x
            const dy = end.y - start.y

            return {
                start,
                end,
                dx,
                dy,
                lengthSquared: dx * dx + dy * dy,
                bounds: {
                    minX: Math.min(start.x, end.x),
                    maxX: Math.max(start.x, end.x),
                    minY: Math.min(start.y, end.y),
                    maxY: Math.max(start.y, end.y)
                }
            }
        })
    }

    /**
     * Resolves source-order bounds, centroid, and signed area.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ bounds: PcbScene3dPreparedPolygonBounds, centroid: { x: number, y: number }, signedArea: number }}
     */
    static #resolveMetadata(points) {
        const bounds = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }
        let totalX = 0
        let totalY = 0
        let doubledArea = 0

        for (let index = 0; index < points.length; index += 1) {
            const point = points[index]
            const next = points[(index + 1) % points.length]

            bounds.minX = Math.min(bounds.minX, point.x)
            bounds.maxX = Math.max(bounds.maxX, point.x)
            bounds.minY = Math.min(bounds.minY, point.y)
            bounds.maxY = Math.max(bounds.maxY, point.y)
            totalX += point.x
            totalY += point.y
            doubledArea += point.x * next.y - next.x * point.y
        }

        const count = Math.max(points.length, 1)
        return {
            bounds,
            centroid: { x: totalX / count, y: totalY / count },
            signedArea: doubledArea / 2
        }
    }

    /**
     * Expands index bounds enough to retain all tolerance predicate matches.
     * @param {PcbScene3dPreparedPolygonSegment} segment
     * @param {number} epsilon
     * @returns {PcbScene3dPreparedPolygonBounds}
     */
    static #resolveSegmentIndexBounds(segment, epsilon) {
        if (
            segment.lengthSquared === 0 ||
            !Number.isFinite(segment.lengthSquared) ||
            !PcbScene3dPreparedPolygon.#hasFiniteBounds(segment.bounds)
        ) {
            return PcbScene3dPreparedPolygon.#resolveAllSpaceBounds()
        }

        const margin = Math.max(
            epsilon,
            (Math.SQRT2 * epsilon) / Math.sqrt(segment.lengthSquared)
        )
        return {
            minX: segment.bounds.minX - margin,
            maxX: segment.bounds.maxX + margin,
            minY: segment.bounds.minY - margin,
            maxY: segment.bounds.maxY + margin
        }
    }

    /**
     * Resolves a point as zero-area AABB index bounds.
     * @param {{ x: number, y: number }} point
     * @returns {PcbScene3dPreparedPolygonBounds}
     */
    static #resolvePointBounds(point) {
        const x = Number(point?.x)
        const y = Number(point?.y)

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return PcbScene3dPreparedPolygon.#resolveAllSpaceBounds()
        }

        return {
            minX: x,
            maxX: x,
            minY: y,
            maxY: y
        }
    }

    /**
     * Returns whether a segment's conservative index envelope overlaps a query.
     * @param {PcbScene3dPreparedPolygonSegment} segment Segment metadata.
     * @param {PcbScene3dPreparedPolygonBounds} queryBounds Query bounds.
     * @param {number} epsilon Exact predicate tolerance.
     * @returns {boolean}
     */
    static #segmentOverlapsQuery(segment, queryBounds, epsilon) {
        if (
            !PcbScene3dPreparedPolygon.#hasFiniteBounds(queryBounds) ||
            segment.lengthSquared === 0 ||
            !Number.isFinite(segment.lengthSquared) ||
            !PcbScene3dPreparedPolygon.#hasFiniteBounds(segment.bounds)
        ) {
            return true
        }

        const margin = Math.max(
            epsilon,
            (Math.SQRT2 * epsilon) / Math.sqrt(segment.lengthSquared)
        )
        const minX = segment.bounds.minX - margin
        const maxX = segment.bounds.maxX + margin
        const minY = segment.bounds.minY - margin
        const maxY = segment.bounds.maxY + margin

        return (
            !Number.isFinite(minX) ||
            !Number.isFinite(maxX) ||
            !Number.isFinite(minY) ||
            !Number.isFinite(maxY) ||
            !(
                maxX < queryBounds.minX ||
                minX > queryBounds.maxX ||
                maxY < queryBounds.minY ||
                minY > queryBounds.maxY
            )
        )
    }

    /**
     * Returns whether a vertex's conservative index envelope overlaps a query.
     * @param {{ x: number, y: number }} point Vertex.
     * @param {PcbScene3dPreparedPolygonBounds} queryBounds Query bounds.
     * @param {number} epsilon Exact predicate tolerance.
     * @returns {boolean}
     */
    static #pointOverlapsQuery(point, queryBounds, epsilon) {
        if (!PcbScene3dPreparedPolygon.#hasFiniteBounds(queryBounds)) {
            return true
        }

        const x = Number(point?.x)
        const y = Number(point?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return true
        }

        return !(
            x < queryBounds.minX - epsilon ||
            x > queryBounds.maxX + epsilon ||
            y < queryBounds.minY - epsilon ||
            y > queryBounds.maxY + epsilon
        )
    }

    /**
     * Returns true when every bounds coordinate is finite.
     * @param {PcbScene3dPreparedPolygonBounds} bounds
     * @returns {boolean}
     */
    static #hasFiniteBounds(bounds) {
        return Boolean(
            bounds &&
            Number.isFinite(bounds.minX) &&
            Number.isFinite(bounds.maxX) &&
            Number.isFinite(bounds.minY) &&
            Number.isFinite(bounds.maxY)
        )
    }

    /**
     * Resolves conservative all-space bounds for non-finite exact geometry.
     * @returns {PcbScene3dPreparedPolygonBounds}
     */
    static #resolveAllSpaceBounds() {
        return {
            minX: -Infinity,
            maxX: Infinity,
            minY: -Infinity,
            maxY: Infinity
        }
    }

    /**
     * Returns true when a point falls inside finite polygon bounds.
     * @param {{ x: number, y: number }} point
     * @param {PcbScene3dPreparedPolygonBounds} bounds
     * @param {number} [epsilon]
     * @returns {boolean}
     */
    static #pointOverlapsBounds(point, bounds, epsilon = 0) {
        return (
            point.x >= bounds.minX - epsilon &&
            point.x <= bounds.maxX + epsilon &&
            point.y >= bounds.minY - epsilon &&
            point.y <= bounds.maxY + epsilon
        )
    }
}
