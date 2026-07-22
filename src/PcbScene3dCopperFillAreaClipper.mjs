import { PcbScene3dCopperFillCoverageContext } from './PcbScene3dCopperFillCoverageContext.mjs'
import { PcbScene3dCopperFillLoopSetResolver } from './PcbScene3dCopperFillLoopSetResolver.mjs'
import { PcbScene3dTriangleVertexQueryBounds } from './PcbScene3dTriangleVertexQueryBounds.mjs'

/**
 * Clips redundant copper relief where track geometry is already inside a fill.
 */
export class PcbScene3dCopperFillAreaClipper {
    static #GEOMETRY_EPSILON = 0.001
    static #MAX_DEPTH = 10
    static #MAX_EDGE_LENGTH = 2

    /**
     * Removes mesh triangles covered by filled copper areas.
     * @param {any} THREE Three.js namespace.
     * @param {any | null} mesh Mesh to clip.
     * @param {object[]} fills Copper fill primitives.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @param {{ subdividePartialTriangles?: boolean }} [options] Clipping options.
     * @returns {any | null}
     */
    static filter(
        THREE,
        mesh,
        fills,
        normalizeBoardPoint,
        mirrorY,
        options = {}
    ) {
        const loopSets = PcbScene3dCopperFillLoopSetResolver.resolve(
            fills,
            normalizeBoardPoint,
            mirrorY
        )
        const coverageContext =
            PcbScene3dCopperFillCoverageContext.fromLoopSets(loopSets)

        return PcbScene3dCopperFillAreaClipper.filterPrepared(
            THREE,
            mesh,
            coverageContext,
            options
        )
    }

    /**
     * Removes triangles covered by a prepared fill-coverage context.
     * @param {any} THREE Three.js namespace.
     * @param {any | null} mesh Mesh to clip.
     * @param {{ queryAreas: (bounds: object, target: object[], options?: object) => object[] }} coverageContext Prepared side-local fill coverage.
     * @param {{ subdividePartialTriangles?: boolean, beforeSourceIndex?: number, allowedSourceIndexes?: Set<number> | number[] | null }} [options] Clipping and source-order options.
     * @returns {any | null}
     */
    static filterPrepared(THREE, mesh, coverageContext, options = {}) {
        if (!mesh || coverageContext?.areaCount === 0) {
            return mesh
        }

        const sourceGeometry = mesh?.geometry?.index
            ? mesh.geometry.toNonIndexed?.() || mesh.geometry
            : mesh?.geometry
        const position = sourceGeometry?.getAttribute?.('position')

        if (
            !position?.count ||
            typeof coverageContext?.queryAreas !== 'function'
        ) {
            return mesh
        }

        const positions = []
        const state = { changed: false }
        for (let index = 0; index < position.count; index += 3) {
            PcbScene3dCopperFillAreaClipper.#appendFilteredTriangle(
                positions,
                PcbScene3dCopperFillAreaClipper.#resolveTriangle(
                    position,
                    index
                ),
                coverageContext,
                0,
                state,
                options
            )
        }

        if (!state.changed) {
            return mesh
        }

        if (!positions.length) {
            return null
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        geometry.computeVertexNormals?.()
        mesh.geometry = geometry
        return mesh
    }

    /**
     * Appends one triangle after removing filled-area overlap.
     * @param {number[]} positions Output position buffer.
     * @param {{ x: number, y: number, z: number }[]} triangle Source triangle.
     * @param {{ queryAreas: (bounds: object, target: object[], options?: object) => object[] }} coverageContext Prepared fill coverage.
     * @param {number} depth Subdivision depth.
     * @param {{ changed: boolean }} state Mutation state.
     * @param {{ subdividePartialTriangles?: boolean, beforeSourceIndex?: number, allowedSourceIndexes?: Set<number> | number[] | null }} options Clipping options.
     * @returns {void}
     */
    static #appendFilteredTriangle(
        positions,
        triangle,
        coverageContext,
        depth,
        state,
        options
    ) {
        const areas = coverageContext.queryAreas(
            PcbScene3dCopperFillAreaClipper.#resolveBounds(triangle),
            [],
            options
        )
        const coverage =
            PcbScene3dCopperFillAreaClipper.#shouldSubdividePartialTriangles(
                options
            )
                ? PcbScene3dCopperFillAreaClipper.#resolveTriangleCoverage(
                      triangle,
                      areas
                  )
                : PcbScene3dCopperFillAreaClipper.#resolveNonSubdividingCoverage(
                      triangle,
                      areas
                  )

        if (coverage === 'none') {
            PcbScene3dCopperFillAreaClipper.#appendTriangle(positions, triangle)
            return
        }

        if (
            coverage === 'partial' &&
            !PcbScene3dCopperFillAreaClipper.#shouldSubdividePartialTriangles(
                options
            )
        ) {
            PcbScene3dCopperFillAreaClipper.#appendTriangle(positions, triangle)
            return
        }

        state.changed = true
        if (coverage === 'full') {
            return
        }

        if (
            depth >= PcbScene3dCopperFillAreaClipper.#MAX_DEPTH ||
            PcbScene3dCopperFillAreaClipper.#maxEdgeLengthSquared(triangle) <=
                PcbScene3dCopperFillAreaClipper.#MAX_EDGE_LENGTH ** 2
        ) {
            if (
                !PcbScene3dCopperFillAreaClipper.#isPointInAnyArea(
                    PcbScene3dCopperFillAreaClipper.#centroid(triangle),
                    areas
                )
            ) {
                PcbScene3dCopperFillAreaClipper.#appendTriangle(
                    positions,
                    triangle
                )
            }
            return
        }

        for (const child of PcbScene3dCopperFillAreaClipper.#subdivideTriangle(
            triangle
        )) {
            PcbScene3dCopperFillAreaClipper.#appendFilteredTriangle(
                positions,
                child,
                coverageContext,
                depth + 1,
                state,
                options
            )
        }
    }

    /**
     * Checks whether partial triangles should be recursively clipped.
     * @param {{ subdividePartialTriangles?: boolean } | undefined} options Clipping options.
     * @returns {boolean}
     */
    static #shouldSubdividePartialTriangles(options) {
        return options?.subdividePartialTriangles !== false
    }

    /**
     * Resolves coverage when partial triangles are kept without subdivision.
     * Partial and uncovered triangles have the same observable keep result in
     * this mode, so the first uncovered sample can return without querying area
     * boundaries. Fully sampled triangles still require the exact boundary
     * predicate to distinguish complete coverage from a crossing.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {object[]} areas Filled copper areas.
     * @returns {'none' | 'full'}
     */
    static #resolveNonSubdividingCoverage(triangle, areas) {
        const samples = [
            triangle[0],
            triangle[1],
            triangle[2],
            PcbScene3dCopperFillAreaClipper.#centroid(triangle)
        ]
        for (const point of samples) {
            if (
                !PcbScene3dCopperFillAreaClipper.#isPointInAnyArea(point, areas)
            ) {
                return 'none'
            }
        }

        return PcbScene3dCopperFillAreaClipper.#triangleCrossesAnyBoundary(
            triangle,
            areas
        )
            ? 'none'
            : 'full'
    }

    /**
     * Resolves whether a triangle is outside, inside, or crossing filled areas.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {object[]} areas Filled copper areas.
     * @returns {'none' | 'partial' | 'full'}
     */
    static #resolveTriangleCoverage(triangle, areas) {
        const samples = [
            triangle[0],
            triangle[1],
            triangle[2],
            PcbScene3dCopperFillAreaClipper.#centroid(triangle)
        ]
        let coveredSamples = 0
        for (const point of samples) {
            if (
                PcbScene3dCopperFillAreaClipper.#isPointInAnyArea(point, areas)
            ) {
                coveredSamples += 1
            }
        }
        const crosses =
            PcbScene3dCopperFillAreaClipper.#triangleCrossesAnyBoundary(
                triangle,
                areas
            )

        if (coveredSamples === 0 && !crosses) {
            return 'none'
        }

        if (coveredSamples === samples.length && !crosses) {
            return 'full'
        }

        return 'partial'
    }

    /**
     * Returns true when one point is in any filled area.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {object[]} areas Filled copper areas.
     * @returns {boolean}
     */
    static #isPointInAnyArea(point, areas) {
        for (const area of areas) {
            if (PcbScene3dCopperFillAreaClipper.#isPointInArea(point, area)) {
                return true
            }
        }

        return false
    }

    /**
     * Returns true when one point is inside a fill outer and outside holes.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ outer: object, holes: object[], bounds: object }} area Filled copper area.
     * @returns {boolean}
     */
    static #isPointInArea(point, area) {
        if (
            !PcbScene3dCopperFillAreaClipper.#boundsContainPoint(
                area.bounds,
                point
            ) ||
            !PcbScene3dCopperFillAreaClipper.#pointInPreparedPolygon(
                point,
                area.outer
            )
        ) {
            return false
        }

        return !area.holes.some(
            (hole) =>
                PcbScene3dCopperFillAreaClipper.#boundsContainPoint(
                    hole.bounds,
                    point
                ) &&
                PcbScene3dCopperFillAreaClipper.#pointInPreparedPolygon(
                    point,
                    hole
                )
        )
    }

    /**
     * Returns true when a triangle crosses a fill or hole boundary.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {object[]} areas Filled copper areas.
     * @returns {boolean}
     */
    static #triangleCrossesAnyBoundary(triangle, areas) {
        const triangleBounds =
            PcbScene3dCopperFillAreaClipper.#resolveBounds(triangle)

        return areas.some(
            (area) =>
                PcbScene3dCopperFillAreaClipper.#boundsOverlap(
                    triangleBounds,
                    area.bounds
                ) &&
                PcbScene3dCopperFillAreaClipper.#triangleCrossesAreaBoundary(
                    triangle,
                    area,
                    triangleBounds
                )
        )
    }

    /**
     * Returns true when a triangle crosses one filled area's boundaries.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ outer: object, holes: object[] }} area Filled copper area.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds Triangle bounds.
     * @returns {boolean}
     */
    static #triangleCrossesAreaBoundary(triangle, area, triangleBounds) {
        return [area.outer, ...area.holes].some((loop) =>
            PcbScene3dCopperFillAreaClipper.#triangleCrossesLoopBoundary(
                triangle,
                loop,
                triangleBounds
            )
        )
    }

    /**
     * Returns true when triangle edges cross one loop.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ points: { x: number, y: number }[], bounds: object, querySegments: (bounds: object, target: object[]) => object[], queryVertices: (bounds: object, target: object[]) => object[] }} loop Prepared loop.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} triangleBounds Triangle bounds.
     * @returns {boolean}
     */
    static #triangleCrossesLoopBoundary(triangle, loop, triangleBounds) {
        for (let index = 0; index < triangle.length; index += 1) {
            const start = triangle[index]
            const end = triangle[(index + 1) % triangle.length]
            const edgeBounds = PcbScene3dCopperFillAreaClipper.#resolveBounds([
                start,
                end
            ])
            if (
                loop
                    .querySegments(edgeBounds, [])
                    .some(
                        (segment) =>
                            PcbScene3dCopperFillAreaClipper.#boundsOverlap(
                                edgeBounds,
                                segment.bounds
                            ) &&
                            PcbScene3dCopperFillAreaClipper.#segmentsIntersect(
                                start,
                                end,
                                segment.start,
                                segment.end
                            )
                    )
            ) {
                return true
            }
        }

        const queryBounds = PcbScene3dTriangleVertexQueryBounds.resolve(
            triangle,
            triangleBounds,
            loop.bounds,
            PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
        const vertices = queryBounds
            ? loop.queryVertices(queryBounds, [])
            : loop.points

        return vertices.some((point) =>
            PcbScene3dCopperFillAreaClipper.#isPointInsideTriangle(
                point,
                triangle
            )
        )
    }

    /**
     * Resolves one triangle from a Three position attribute.
     * @param {any} position Position attribute.
     * @param {number} startIndex Triangle start index.
     * @returns {{ x: number, y: number, z: number }[]}
     */
    static #resolveTriangle(position, startIndex) {
        return [0, 1, 2].map((offset) => ({
            x: Number(position.getX(startIndex + offset)),
            y: Number(position.getY(startIndex + offset)),
            z: Number(position.getZ(startIndex + offset))
        }))
    }

    /**
     * Subdivides one triangle into four children.
     * @param {{ x: number, y: number, z: number }[]} triangle Source triangle.
     * @returns {{ x: number, y: number, z: number }[][]}
     */
    static #subdivideTriangle(triangle) {
        const [a, b, c] = triangle
        const ab = PcbScene3dCopperFillAreaClipper.#midpoint(a, b)
        const bc = PcbScene3dCopperFillAreaClipper.#midpoint(b, c)
        const ca = PcbScene3dCopperFillAreaClipper.#midpoint(c, a)

        return [
            [a, ab, ca],
            [ab, b, bc],
            [ca, bc, c],
            [ab, bc, ca]
        ]
    }

    /**
     * Resolves a midpoint.
     * @param {{ x: number, y: number, z: number }} a First point.
     * @param {{ x: number, y: number, z: number }} b Second point.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #midpoint(a, b) {
        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            z: (a.z + b.z) / 2
        }
    }

    /**
     * Resolves triangle centroid.
     * @param {{ x: number, y: number, z?: number }[]} triangle Triangle points.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #centroid(triangle) {
        return {
            x: (triangle[0].x + triangle[1].x + triangle[2].x) / 3,
            y: (triangle[0].y + triangle[1].y + triangle[2].y) / 3,
            z:
                (Number(triangle[0].z || 0) +
                    Number(triangle[1].z || 0) +
                    Number(triangle[2].z || 0)) /
                3
        }
    }

    /**
     * Appends one triangle to a position buffer.
     * @param {number[]} positions Output position buffer.
     * @param {{ x: number, y: number, z: number }[]} triangle Triangle points.
     * @returns {void}
     */
    static #appendTriangle(positions, triangle) {
        for (const point of triangle) {
            positions.push(point.x, point.y, point.z)
        }
    }

    /**
     * Resolves maximum squared edge length.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @returns {number}
     */
    static #maxEdgeLengthSquared(triangle) {
        let maximum = 0
        for (let index = 0; index < triangle.length; index += 1) {
            const start = triangle[index]
            const end = triangle[(index + 1) % triangle.length]
            maximum = Math.max(
                maximum,
                (end.x - start.x) ** 2 + (end.y - start.y) ** 2
            )
        }
        return maximum
    }

    /**
     * Replays the legacy horizontal-ray expression on prepared edge candidates.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ bounds: object, querySegments: (bounds: object, target: object[]) => object[] }} polygon Prepared polygon.
     * @returns {boolean}
     */
    static #pointInPreparedPolygon(point, polygon) {
        const segments = polygon.querySegments(
            {
                minX: point.x,
                maxX: polygon.bounds.maxX,
                minY: point.y,
                maxY: point.y
            },
            []
        )
        let inside = false

        for (const segment of segments) {
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
     * Returns true when one point is inside or on a triangle.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @returns {boolean}
     */
    static #isPointInsideTriangle(point, triangle) {
        let hasNegative = false
        let hasPositive = false

        for (let index = 0; index < triangle.length; index += 1) {
            const current = triangle[index]
            const next = triangle[(index + 1) % triangle.length]
            const sign =
                (point.x - next.x) * (current.y - next.y) -
                (current.x - next.x) * (point.y - next.y)

            hasNegative ||=
                sign < -PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
            hasPositive ||=
                sign > PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        }

        return !(hasNegative && hasPositive)
    }

    /**
     * Returns true when two segments intersect.
     * @param {{ x: number, y: number }} a First segment start.
     * @param {{ x: number, y: number }} b First segment end.
     * @param {{ x: number, y: number }} c Second segment start.
     * @param {{ x: number, y: number }} d Second segment end.
     * @returns {boolean}
     */
    static #segmentsIntersect(a, b, c, d) {
        const abC = PcbScene3dCopperFillAreaClipper.#orientation(a, b, c)
        const abD = PcbScene3dCopperFillAreaClipper.#orientation(a, b, d)
        const cdA = PcbScene3dCopperFillAreaClipper.#orientation(c, d, a)
        const cdB = PcbScene3dCopperFillAreaClipper.#orientation(c, d, b)

        return (
            abC * abD <= PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
            cdA * cdB <= PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
    }

    /**
     * Resolves oriented segment side.
     * @param {{ x: number, y: number }} a Segment start.
     * @param {{ x: number, y: number }} b Segment end.
     * @param {{ x: number, y: number }} point Candidate point.
     * @returns {number}
     */
    static #orientation(a, b, point) {
        return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    }

    /**
     * Resolves bounds for points.
     * @param {{ x: number, y: number }[]} points Candidate points.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveBounds(points) {
        return points.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                maxX: Math.max(bounds.maxX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxY: Math.max(bounds.maxY, point.y)
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        )
    }

    /**
     * Returns true when bounds include one point.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds.
     * @param {{ x: number, y: number }} point Candidate point.
     * @returns {boolean}
     */
    static #boundsContainPoint(bounds, point) {
        return (
            point.x >=
                bounds.minX -
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
            point.x <=
                bounds.maxX +
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
            point.y >=
                bounds.minY -
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
            point.y <=
                bounds.maxY + PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
    }

    /**
     * Returns true when two bounds overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} left Left bounds.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} right Right bounds.
     * @returns {boolean}
     */
    static #boundsOverlap(left, right) {
        return !(
            left.maxX <
                right.minX -
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON ||
            left.minX >
                right.maxX +
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON ||
            left.maxY <
                right.minY -
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON ||
            left.minY >
                right.maxY + PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
    }
}
