import { PcbScene3dAabbIndex } from './PcbScene3dAabbIndex.mjs'
import { PcbScene3dCopperOcclusionPlanes } from './PcbScene3dCopperOcclusionPlanes.mjs'

/** Subtracts vertical occlusion prisms without recursive triangle subdivision. */
export class PcbScene3dCopperOcclusionGeometry {
    /**
     * Clips every triangle, interpolating XYZ on its original plane.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Source triangle geometry.
     * @param {object[][]} cutouts Normalized occlusion contours.
     * @returns {any} Clipped or unchanged geometry.
     */
    static filter(THREE, geometry, cutouts) {
        if (
            !Array.isArray(cutouts) ||
            !cutouts.length ||
            !geometry?.getAttribute ||
            !THREE.BufferGeometry ||
            !THREE.Float32BufferAttribute
        )
            return geometry
        const source = geometry.index ? geometry.toNonIndexed() : geometry
        const position = source.getAttribute('position')
        if (!position?.count) return geometry
        const prisms = PcbScene3dCopperOcclusionPlanes.prepare(cutouts)
        const index = new PcbScene3dAabbIndex(prisms)
        const positions = []
        let changed = false
        for (let i = 0; i + 2 < position.count; i += 3) {
            const triangle = [0, 1, 2].map((offset) => ({
                x: position.getX(i + offset),
                y: position.getY(i + offset),
                z: position.getZ(i + offset)
            }))
            let polygons = [triangle]
            for (const prism of index.query(this.#bounds(triangle))) {
                const remaining = []
                for (const polygon of polygons) {
                    const pieces = this.#subtract(polygon, prism)
                    if (pieces.length !== 1 || pieces[0] !== polygon)
                        changed = true
                    for (const piece of pieces) remaining.push(piece)
                }
                polygons = remaining
                if (!polygons.length) break
            }
            for (const polygon of polygons) {
                for (let vertex = 1; vertex + 1 < polygon.length; vertex += 1) {
                    const a = polygon[0],
                        b = polygon[vertex],
                        c = polygon[vertex + 1]
                    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
                }
            }
        }
        if (source !== geometry) source.dispose?.()
        if (!changed) return geometry
        const result = new THREE.BufferGeometry()
        result.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        return result
    }

    /**
     * Subtracts a convex prism, retaining convex outside pieces for triangulation.
     * @param {object[]} polygon Convex polygon on a 3D plane.
     * @param {object} prism Inward half planes and XY bounds.
     * @returns {object[][]} Visible polygons.
     */
    static #subtract(polygon, prism) {
        const bounds = this.#bounds(polygon)
        if (
            bounds.minX > prism.bounds.maxX ||
            bounds.maxX < prism.bounds.minX ||
            bounds.minY > prism.bounds.maxY ||
            bounds.maxY < prism.bounds.minY
        )
            return [polygon]
        let inside = polygon
        const outside = []
        for (const plane of prism.planes) {
            const split = this.#split(inside, plane)
            // No intersection means all tentative pieces together are the input.
            if (split.inside.length < 3) return [polygon]
            if (split.outside.length >= 3) outside.push(split.outside)
            inside = split.inside
        }
        return this.#hasArea(inside) ? outside : [polygon]
    }

    /**
     * Splits a planar polygon using an XY half plane, including vertical walls.
     * @param {object[]} polygon Convex source polygon.
     * @param {{ x: number, y: number, offset: number }} plane Inward half plane.
     * @returns {{ inside: object[], outside: object[] }} Split polygon sides.
     */
    static #split(polygon, plane) {
        const inside = [],
            outside = []
        let hasOutside = false
        let previous = polygon[polygon.length - 1]
        let previousDistance =
            plane.x * previous.x + plane.y * previous.y - plane.offset
        for (const point of polygon) {
            const distance =
                plane.x * point.x + plane.y * point.y - plane.offset
            if (
                (distance > 0 && previousDistance < 0) ||
                (distance < 0 && previousDistance > 0)
            ) {
                const fraction =
                    previousDistance / (previousDistance - distance)
                const crossing = {
                    x: previous.x + fraction * (point.x - previous.x),
                    y: previous.y + fraction * (point.y - previous.y),
                    z: previous.z + fraction * (point.z - previous.z)
                }
                inside.push(crossing)
                outside.push(crossing)
            }
            if (distance >= 0) inside.push(point)
            if (distance <= 0) outside.push(point)
            if (distance < 0) hasOutside = true
            previous = point
            previousDistance = distance
        }
        return {
            inside,
            outside: hasOutside && this.#hasArea(outside) ? outside : []
        }
    }

    /**
     * Rejects boundary-only intersections without dropping vertical surfaces.
     * @param {object[]} polygon Convex planar polygon.
     * @returns {boolean} Whether at least one triangle has nonzero 3D area.
     */
    static #hasArea(polygon) {
        if (polygon.length < 3) return false
        const a = polygon[0]
        for (let i = 1; i + 1 < polygon.length; i += 1) {
            const b = polygon[i],
                c = polygon[i + 1]
            const ux = b.x - a.x,
                uy = b.y - a.y,
                uz = b.z - a.z
            const vx = c.x - a.x,
                vy = c.y - a.y,
                vz = c.z - a.z
            if (
                Math.hypot(
                    uy * vz - uz * vy,
                    uz * vx - ux * vz,
                    ux * vy - uy * vx
                ) > 1e-10
            )
                return true
        }
        return false
    }

    /**
     * Resolves XY bounds for a planar polygon.
     * @param {object[]} points Polygon vertices.
     * @returns {object} Axis-aligned bounds.
     */
    static #bounds(points) {
        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity
        for (const { x, y } of points) {
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
        }
        return { minX, maxX, minY, maxY }
    }
}
