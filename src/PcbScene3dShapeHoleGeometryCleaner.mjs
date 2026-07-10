import { PcbScene3dCutoutGeometryFilter } from './PcbScene3dCutoutGeometryFilter.mjs'

/**
 * Cleans shape-fill triangles when Three's triangulator misses compact holes.
 */
export class PcbScene3dShapeHoleGeometryCleaner {
    static #GEOMETRY_EPSILON = 0.001
    static #CUTOUT_MAX_EDGE_LENGTH = 1.5

    /**
     * Removes triangles that still cover the centers of declared shape holes.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Shape geometry.
     * @param {{ x: number, y: number }[][]} holes Shape hole polygons.
     * @param {{ preparedPolygonCache?: Map }} [options] Request-scoped options.
     * @returns {any}
     */
    static removeCoveredHoleCenters(THREE, geometry, holes, options = {}) {
        const coveredHoles =
            PcbScene3dShapeHoleGeometryCleaner.resolveCoveredHoleCenters(
                geometry,
                holes
            )

        if (!coveredHoles.length) {
            return geometry
        }

        return PcbScene3dCutoutGeometryFilter.filter(
            THREE,
            geometry,
            coveredHoles,
            {
                maxDepth: 12,
                maxEdgeLength:
                    PcbScene3dShapeHoleGeometryCleaner.#CUTOUT_MAX_EDGE_LENGTH,
                preparedPolygonCache: options?.preparedPolygonCache
            }
        )
    }

    /**
     * Resolves shape holes whose center point is still covered by geometry.
     * @param {any} geometry Shape geometry.
     * @param {{ x: number, y: number }[][]} holes Shape hole polygons.
     * @returns {{ x: number, y: number }[][]}
     */
    static resolveCoveredHoleCenters(geometry, holes) {
        const sourceGeometry =
            geometry?.index && geometry?.toNonIndexed
                ? geometry.toNonIndexed()
                : geometry
        const position = sourceGeometry?.getAttribute?.('position')

        if (!position?.count || !Array.isArray(holes) || !holes.length) {
            return []
        }

        return holes.filter((hole) => {
            const center =
                PcbScene3dShapeHoleGeometryCleaner.#resolvePolygonCenter(hole)

            return (
                center &&
                PcbScene3dShapeHoleGeometryCleaner.#geometryContainsPoint(
                    position,
                    center
                )
            )
        })
    }

    /**
     * Resolves the average center of a finite polygon.
     * @param {{ x?: number, y?: number }[]} polygon Polygon points.
     * @returns {{ x: number, y: number } | null}
     */
    static #resolvePolygonCenter(polygon) {
        const points = (Array.isArray(polygon) ? polygon : [])
            .map((point) => ({
                x: Number(point?.x),
                y: Number(point?.y)
            }))
            .filter(
                (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
            )

        if (points.length < 3) {
            return null
        }

        const total = points.reduce(
            (sum, point) => ({
                x: sum.x + point.x,
                y: sum.y + point.y
            }),
            { x: 0, y: 0 }
        )

        return {
            x: total.x / points.length,
            y: total.y / points.length
        }
    }

    /**
     * Returns true when any geometry triangle covers one point.
     * @param {any} position Geometry position attribute.
     * @param {{ x: number, y: number }} point Point to test.
     * @returns {boolean}
     */
    static #geometryContainsPoint(position, point) {
        for (let index = 0; index < position.count; index += 3) {
            const triangle =
                PcbScene3dShapeHoleGeometryCleaner.#resolveGeometryTriangle(
                    position,
                    index
                )

            if (
                PcbScene3dShapeHoleGeometryCleaner.#triangleBoundsContainPoint(
                    triangle,
                    point
                ) &&
                PcbScene3dShapeHoleGeometryCleaner.#isPointInsideTriangle(
                    point,
                    triangle
                )
            ) {
                return true
            }
        }

        return false
    }

    /**
     * Resolves one XY triangle from a position attribute.
     * @param {any} position Geometry position attribute.
     * @param {number} startIndex Triangle start index.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveGeometryTriangle(position, startIndex) {
        return [0, 1, 2].map((offset) => ({
            x: Number(position.getX(startIndex + offset)),
            y: Number(position.getY(startIndex + offset))
        }))
    }

    /**
     * Returns true when triangle bounds include one point.
     * @param {{ x: number, y: number }[]} triangle Triangle points.
     * @param {{ x: number, y: number }} point Point to test.
     * @returns {boolean}
     */
    static #triangleBoundsContainPoint(triangle, point) {
        const bounds = triangle.reduce(
            (currentBounds, trianglePoint) => ({
                minX: Math.min(currentBounds.minX, trianglePoint.x),
                maxX: Math.max(currentBounds.maxX, trianglePoint.x),
                minY: Math.min(currentBounds.minY, trianglePoint.y),
                maxY: Math.max(currentBounds.maxY, trianglePoint.y)
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
            }
        )

        return (
            point.x >=
                bounds.minX -
                    PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON &&
            point.x <=
                bounds.maxX +
                    PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON &&
            point.y >=
                bounds.minY -
                    PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON &&
            point.y <=
                bounds.maxY +
                    PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON
        )
    }

    /**
     * Returns true when a point lies inside or on one triangle.
     * @param {{ x: number, y: number }} point Point to test.
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
            (sign) =>
                sign < -PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON
        )
        const hasPositive = signs.some(
            (sign) =>
                sign > PcbScene3dShapeHoleGeometryCleaner.#GEOMETRY_EPSILON
        )

        return !(hasNegative && hasPositive)
    }
}
