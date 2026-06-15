import { PcbScene3dCircularCutoutOverlap } from './PcbScene3dCircularCutoutOverlap.mjs'
import { PcbScene3dCutoutCircleDetector } from './PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dGeometryBoundsResolver } from './PcbScene3dGeometryBoundsResolver.mjs'
import { PcbScene3dTerminalCutoutClassifier } from './PcbScene3dTerminalCutoutClassifier.mjs'

/** Clips filled 2D geometry against drill-cutout polygons. */
export class PcbScene3dCutoutGeometryFilter {
    static #GEOMETRY_EPSILON = 0.001
    static #DEFAULT_MAX_DEPTH = 9
    static #DEFAULT_MAX_EDGE_LENGTH = 4
    static #SPATIAL_INDEX_MIN_CELL_SIZE = 8
    static #SPATIAL_INDEX_MAX_CELLS_PER_CUTOUT = 128
    /**
     * Removes triangles that still overlap cutouts after triangulation.
     * @param {any} THREE
     * @param {any} geometry
     * @param {{ x: number, y: number }[][]} cutouts
     * @param {{ maxDepth?: number, maxEdgeLength?: number, discardTerminalOverlaps?: boolean }} [options]
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
        const preparedCutouts =
            PcbScene3dCutoutGeometryFilter.#prepareCutouts(cutouts)
        if (
            PcbScene3dGeometryBoundsResolver.missesAllPositionBounds(
                position,
                preparedCutouts,
                PcbScene3dCutoutGeometryFilter.#GEOMETRY_EPSILON
            )
        )
            return geometry
        const cutoutIndex =
            PcbScene3dCutoutGeometryFilter.#buildCutoutSpatialIndex(
                preparedCutouts
            )
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
     * @param {{ maxDepth?: number, maxEdgeLength?: number, discardTerminalOverlaps?: boolean }} options
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
     * Prepares cutout polygons with bounds for fast overlap checks.
     * @param {{ x: number, y: number }[][]} cutouts
     * @returns {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }[]}
     */
    static #prepareCutouts(cutouts) {
        return cutouts
            .filter((cutout) => Array.isArray(cutout) && cutout.length >= 3)
            .map((cutout) => {
                const circularCutout =
                    PcbScene3dCutoutCircleDetector.resolve(cutout)

                return {
                    points: cutout,
                    segments:
                        PcbScene3dCutoutGeometryFilter.#buildCutoutSegments(
                            cutout
                        ),
                    bounds: PcbScene3dCutoutGeometryFilter.#resolveBounds(
                        cutout
                    ),
                    ...circularCutout
                }
            })
    }
    /**
     * Builds reusable segment metadata for one cutout polygon.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]}
     */
    static #buildCutoutSegments(points) {
        const segments = []

        for (let index = 0; index < points.length; index += 1) {
            const start = points[index]
            const end = points[(index + 1) % points.length]
            const dx = end.x - start.x
            const dy = end.y - start.y

            segments.push({
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
            })
        }

        return segments
    }
    /**
     * Appends a triangle, subdividing near cutouts before removal.
     * @param {number[]} positions
     * @param {{ x: number, y: number, z: number }[]} triangle
     * @param {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} cutouts
     * @param {{ maxDepth: number, maxEdgeLength: number, maxEdgeLengthSquared: number, discardTerminalOverlaps: boolean }} settings
     * @param {number} depth
     * @param {{ changed: boolean }} state
     * @param {object | null} [cutoutIndex]
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
            ? PcbScene3dCutoutGeometryFilter.#collectCandidateCutouts(
                  triangleBounds,
                  cutoutIndex
              )
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
                    cutout
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
     * Builds a spatial index for prepared cutout bounds.
     * @param {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} cutouts
     * @returns {{ cutouts: object[], cellSize: number, cells: Map<string, number[]>, overflowIndexes: number[], marks: Uint32Array, mark: number }}
     */
    static #buildCutoutSpatialIndex(cutouts) {
        const cellSize =
            PcbScene3dCutoutGeometryFilter.#resolveSpatialCellSize(cutouts)
        const cells = new Map()
        const overflowIndexes = []

        cutouts.forEach((cutout, index) => {
            const range = PcbScene3dCutoutGeometryFilter.#resolveCellRange(
                cutout.bounds,
                cellSize
            )
            const cellCount =
                (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)

            if (
                cellCount >
                PcbScene3dCutoutGeometryFilter
                    .#SPATIAL_INDEX_MAX_CELLS_PER_CUTOUT
            ) {
                overflowIndexes.push(index)
                return
            }

            for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
                for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                    const key = PcbScene3dCutoutGeometryFilter.#cellKey(
                        cellX,
                        cellY
                    )
                    const bucket = cells.get(key)

                    if (bucket) {
                        bucket.push(index)
                    } else {
                        cells.set(key, [index])
                    }
                }
            }
        })

        return {
            cutouts,
            cellSize,
            cells,
            overflowIndexes,
            marks: new Uint32Array(cutouts.length),
            mark: 0
        }
    }

    /**
     * Collects cutouts whose spatial buckets overlap one triangle bounds box.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {{ cutouts: object[], cellSize: number, cells: Map<string, number[]>, overflowIndexes: number[], marks: Uint32Array, mark: number }} cutoutIndex
     * @returns {object[]}
     */
    static #collectCandidateCutouts(bounds, cutoutIndex) {
        const candidates = []
        const range = PcbScene3dCutoutGeometryFilter.#resolveCellRange(
            bounds,
            cutoutIndex.cellSize
        )

        cutoutIndex.mark += 1
        if (cutoutIndex.mark >= 0xffffffff) {
            cutoutIndex.marks.fill(0)
            cutoutIndex.mark = 1
        }

        for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                const bucket = cutoutIndex.cells.get(
                    PcbScene3dCutoutGeometryFilter.#cellKey(cellX, cellY)
                )

                if (bucket) {
                    for (const index of bucket) {
                        PcbScene3dCutoutGeometryFilter.#appendCutoutCandidate(
                            candidates,
                            cutoutIndex,
                            index
                        )
                    }
                }
            }
        }

        for (const index of cutoutIndex.overflowIndexes) {
            PcbScene3dCutoutGeometryFilter.#appendCutoutCandidate(
                candidates,
                cutoutIndex,
                index
            )
        }
        return candidates
    }

    /**
     * Appends one unique spatial-index cutout candidate.
     * @param {object[]} candidates
     * @param {{ cutouts: object[], marks: Uint32Array, mark: number }} cutoutIndex
     * @param {number} index
     * @returns {void}
     */
    static #appendCutoutCandidate(candidates, cutoutIndex, index) {
        if (cutoutIndex.marks[index] === cutoutIndex.mark) {
            return
        }

        cutoutIndex.marks[index] = cutoutIndex.mark
        candidates.push(cutoutIndex.cutouts[index])
    }

    /**
     * Resolves a spatial index cell size from typical cutout spans.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} cutouts
     * @returns {number}
     */
    static #resolveSpatialCellSize(cutouts) {
        const spans = cutouts
            .map((cutout) =>
                Math.max(
                    Number(cutout.bounds.maxX) - Number(cutout.bounds.minX),
                    Number(cutout.bounds.maxY) - Number(cutout.bounds.minY),
                    0
                )
            )
            .filter((span) => Number.isFinite(span))
            .sort((left, right) => left - right)
        const medianSpan = spans[Math.floor(spans.length / 2)] || 0

        return Math.max(
            medianSpan * 4,
            PcbScene3dCutoutGeometryFilter.#DEFAULT_MAX_EDGE_LENGTH * 2,
            PcbScene3dCutoutGeometryFilter.#SPATIAL_INDEX_MIN_CELL_SIZE
        )
    }

    /**
     * Resolves the inclusive spatial cell range for a bounds box.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {number} cellSize
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveCellRange(bounds, cellSize) {
        return {
            minX: Math.floor(Number(bounds.minX) / cellSize),
            maxX: Math.floor(Number(bounds.maxX) / cellSize),
            minY: Math.floor(Number(bounds.minY) / cellSize),
            maxY: Math.floor(Number(bounds.maxY) / cellSize)
        }
    }

    /**
     * Builds one deterministic spatial index key.
     * @param {number} cellX
     * @param {number} cellY
     * @returns {string}
     */
    static #cellKey(cellX, cellY) {
        return `${cellX}:${cellY}`
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
     * @param {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} cutout
     * @returns {boolean}
     */
    static #doesTriangleOverlapCutout(triangle, cutout) {
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

        for (const point of cutout.points) {
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
     * Returns true when a point is inside or on a cutout.
     * @param {{ x: number, y: number }} point
     * @param {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} cutout
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
     * @param {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} cutout
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

        const polygon = cutout.points

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
     * Returns true when a point lies on a cutout edge.
     * @param {{ x: number, y: number }} point
     * @param {{ segments: { start: { x: number, y: number }, end: { x: number, y: number }, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} cutout
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

        for (const segment of cutout.segments) {
            if (
                PcbScene3dCutoutGeometryFilter.#pointOverlapsBounds(
                    point,
                    segment.bounds
                ) &&
                PcbScene3dCutoutGeometryFilter.#isPointOnSegment(
                    point,
                    segment.start,
                    segment.end
                )
            ) {
                return true
            }
        }

        return false
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
     * @param {{ segments: { start: { x: number, y: number }, end: { x: number, y: number }, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[] }} cutout
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

            for (const segment of cutout.segments) {
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
