import { PcbAssemblyFillGeometryResolver } from './PcbAssemblyFillGeometryResolver.mjs'

/**
 * Clips redundant copper relief where track geometry is already inside a fill.
 */
export class PcbScene3dCopperFillAreaClipper {
    static #AREA_EPSILON = 0.001
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
        const areas = PcbScene3dCopperFillAreaClipper.#prepareAreas(
            fills,
            normalizeBoardPoint,
            mirrorY
        )
        const sourceGeometry = mesh?.geometry?.index
            ? mesh.geometry.toNonIndexed?.() || mesh.geometry
            : mesh?.geometry
        const position = sourceGeometry?.getAttribute?.('position')

        if (!mesh || !position?.count || !areas.length) {
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
                areas,
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
     * Resolves normalized fill areas with internal holes.
     * @param {object[]} fills Copper fill primitives.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ outer: { x: number, y: number }[], holes: { points: { x: number, y: number }[], bounds: object, segments: object[] }[], bounds: object, segments: object[] }[]}
     */
    static #prepareAreas(fills, normalizeBoardPoint, mirrorY) {
        return (fills || []).flatMap((fill) =>
            PcbAssemblyFillGeometryResolver.resolveAll(fill)
                .map((loops) =>
                    PcbScene3dCopperFillAreaClipper.#prepareLoopSet(
                        loops,
                        normalizeBoardPoint,
                        mirrorY
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Resolves one normalized fill loop set.
     * @param {{ outer?: any[], holes?: any[][] }} loops Fill loop set.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {object | null}
     */
    static #prepareLoopSet(loops, normalizeBoardPoint, mirrorY) {
        const outer = PcbScene3dCopperFillAreaClipper.#normalizeLoop(
            loops?.outer,
            normalizeBoardPoint,
            mirrorY
        )

        if (!PcbScene3dCopperFillAreaClipper.#isValidLoop(outer)) {
            return null
        }

        const holes = (loops?.holes || [])
            .map((hole) =>
                PcbScene3dCopperFillAreaClipper.#normalizeLoop(
                    hole,
                    normalizeBoardPoint,
                    mirrorY
                )
            )
            .filter((hole) =>
                PcbScene3dCopperFillAreaClipper.#isValidLoop(hole)
            )
            .map((hole) => ({
                points: hole,
                bounds: PcbScene3dCopperFillAreaClipper.#resolveBounds(hole),
                segments: PcbScene3dCopperFillAreaClipper.#segments(hole)
            }))

        return {
            outer,
            holes,
            bounds: PcbScene3dCopperFillAreaClipper.#resolveBounds(outer),
            segments: PcbScene3dCopperFillAreaClipper.#segments(outer)
        }
    }

    /**
     * Normalizes one fill loop.
     * @param {any[]} loop Source loop points.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ x: number, y: number }[]}
     */
    static #normalizeLoop(loop, normalizeBoardPoint, mirrorY) {
        const points = []
        for (const point of loop || []) {
            const normalized = normalizeBoardPoint(
                Number(point?.x ?? point?.[0]),
                Number(point?.y ?? point?.[1])
            )
            const nextPoint = {
                x: Number(normalized?.x),
                y: mirrorY ? -Number(normalized?.y) : Number(normalized?.y)
            }
            if (Number.isFinite(nextPoint.x) && Number.isFinite(nextPoint.y)) {
                points.push(nextPoint)
            }
        }
        return PcbScene3dCopperFillAreaClipper.#cleanLoop(points)
    }

    /**
     * Appends one triangle after removing filled-area overlap.
     * @param {number[]} positions Output position buffer.
     * @param {{ x: number, y: number, z: number }[]} triangle Source triangle.
     * @param {object[]} areas Filled copper areas.
     * @param {number} depth Subdivision depth.
     * @param {{ changed: boolean }} state Mutation state.
     * @param {{ subdividePartialTriangles?: boolean }} options Clipping options.
     * @returns {void}
     */
    static #appendFilteredTriangle(
        positions,
        triangle,
        areas,
        depth,
        state,
        options
    ) {
        const coverage =
            PcbScene3dCopperFillAreaClipper.#resolveTriangleCoverage(
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
                areas,
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
     * Resolves whether a triangle is outside, inside, or crossing filled areas.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {object[]} areas Filled copper areas.
     * @returns {'none' | 'partial' | 'full'}
     */
    static #resolveTriangleCoverage(triangle, areas) {
        const samples = [
            ...triangle,
            PcbScene3dCopperFillAreaClipper.#centroid(triangle)
        ]
        const coveredSamples = samples.filter((point) =>
            PcbScene3dCopperFillAreaClipper.#isPointInAnyArea(point, areas)
        ).length
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
        return areas.some((area) =>
            PcbScene3dCopperFillAreaClipper.#isPointInArea(point, area)
        )
    }

    /**
     * Returns true when one point is inside a fill outer and outside holes.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ outer: { x: number, y: number }[], holes: object[], bounds: object }} area Filled copper area.
     * @returns {boolean}
     */
    static #isPointInArea(point, area) {
        if (
            !PcbScene3dCopperFillAreaClipper.#boundsContainPoint(
                area.bounds,
                point
            ) ||
            !PcbScene3dCopperFillAreaClipper.#pointInPolygon(point, area.outer)
        ) {
            return false
        }

        return !area.holes.some(
            (hole) =>
                PcbScene3dCopperFillAreaClipper.#boundsContainPoint(
                    hole.bounds,
                    point
                ) &&
                PcbScene3dCopperFillAreaClipper.#pointInPolygon(
                    point,
                    hole.points
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
                    area
                )
        )
    }

    /**
     * Returns true when a triangle crosses one filled area's boundaries.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ outer: { x: number, y: number }[], holes: object[], segments: object[] }} area Filled copper area.
     * @returns {boolean}
     */
    static #triangleCrossesAreaBoundary(triangle, area) {
        return [area, ...area.holes].some((loop) =>
            PcbScene3dCopperFillAreaClipper.#triangleCrossesLoopBoundary(
                triangle,
                loop.points || loop.outer,
                loop.segments
            )
        )
    }

    /**
     * Returns true when triangle edges cross one loop.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ x: number, y: number }[]} loop Loop points.
     * @param {{ start: object, end: object, bounds: object }[]} segments Loop segments.
     * @returns {boolean}
     */
    static #triangleCrossesLoopBoundary(triangle, loop, segments) {
        for (let index = 0; index < triangle.length; index += 1) {
            const start = triangle[index]
            const end = triangle[(index + 1) % triangle.length]
            const edgeBounds = PcbScene3dCopperFillAreaClipper.#resolveBounds([
                start,
                end
            ])
            if (
                segments.some(
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

        return loop.some((point) =>
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
     * Builds loop segments with cached bounds.
     * @param {{ x: number, y: number }[]} points Loop points.
     * @returns {{ start: object, end: object, bounds: object }[]}
     */
    static #segments(points) {
        return points.map((start, index) => {
            const end = points[(index + 1) % points.length]
            return {
                start,
                end,
                bounds: PcbScene3dCopperFillAreaClipper.#resolveBounds([
                    start,
                    end
                ])
            }
        })
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
     * Returns true when one point is inside a polygon.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ x: number, y: number }[]} polygon Polygon points.
     * @returns {boolean}
     */
    static #pointInPolygon(point, polygon) {
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
     * Returns true when one point is inside or on a triangle.
     * @param {{ x: number, y: number }} point Candidate point.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @returns {boolean}
     */
    static #isPointInsideTriangle(point, triangle) {
        const signs = triangle.map((current, index) => {
            const next = triangle[(index + 1) % triangle.length]
            return (
                (point.x - next.x) * (current.y - next.y) -
                (current.x - next.x) * (point.y - next.y)
            )
        })
        const hasNegative = signs.some(
            (sign) => sign < -PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
        const hasPositive = signs.some(
            (sign) => sign > PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        )
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
     * Removes duplicate and closing points.
     * @param {{ x: number, y: number }[]} points Candidate points.
     * @returns {{ x: number, y: number }[]}
     */
    static #cleanLoop(points) {
        const output = []
        for (const point of points || []) {
            const previous = output[output.length - 1]
            if (
                previous &&
                Math.abs(previous.x - point.x) <
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
                Math.abs(previous.y - point.y) <
                    PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
            ) {
                continue
            }
            output.push(point)
        }

        const first = output[0]
        const last = output[output.length - 1]
        if (
            first &&
            last &&
            Math.abs(first.x - last.x) <
                PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON &&
            Math.abs(first.y - last.y) <
                PcbScene3dCopperFillAreaClipper.#GEOMETRY_EPSILON
        ) {
            output.pop()
        }
        return output
    }

    /**
     * Checks whether one loop has enough area.
     * @param {{ x: number, y: number }[]} loop Candidate loop.
     * @returns {boolean}
     */
    static #isValidLoop(loop) {
        return (
            loop.length >= 3 &&
            Math.abs(PcbScene3dCopperFillAreaClipper.#signedArea(loop)) >
                PcbScene3dCopperFillAreaClipper.#AREA_EPSILON
        )
    }

    /**
     * Computes signed loop area.
     * @param {{ x: number, y: number }[]} loop Candidate loop.
     * @returns {number}
     */
    static #signedArea(loop) {
        let area = 0
        for (let index = 0; index < loop.length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            area += current.x * next.y - next.x * current.y
        }
        return area / 2
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
