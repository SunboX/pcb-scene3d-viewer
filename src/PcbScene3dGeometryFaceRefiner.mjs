/**
 * Subdivides large geometry faces when triangulation artifacts are visible.
 */
export class PcbScene3dGeometryFaceRefiner {
    static #DEFAULT_MAX_DEPTH = 8
    static #DEFAULT_MAX_EDGE_LENGTH = 8
    static #GEOMETRY_EPSILON = 0.001

    /**
     * Returns geometry with large triangles recursively subdivided.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Geometry to refine.
     * @param {{ maxDepth?: number, maxEdgeLength?: number }} [options] Settings.
     * @returns {any}
     */
    static refine(THREE, geometry, options = {}) {
        if (
            !geometry?.getAttribute ||
            !THREE?.BufferGeometry ||
            !THREE?.Float32BufferAttribute
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

        const settings = PcbScene3dGeometryFaceRefiner.#resolveSettings(options)
        const positions = []
        const state = { changed: false }

        for (let index = 0; index + 2 < position.count; index += 3) {
            PcbScene3dGeometryFaceRefiner.#appendRefinedTriangle(
                positions,
                PcbScene3dGeometryFaceRefiner.#resolveTriangle(position, index),
                settings,
                0,
                state
            )
        }

        if (!state.changed) {
            return geometry
        }

        const refinedGeometry = new THREE.BufferGeometry()
        refinedGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        refinedGeometry.computeVertexNormals?.()
        return refinedGeometry
    }

    /**
     * Resolves refinement settings.
     * @param {{ maxDepth?: number, maxEdgeLength?: number }} options Settings.
     * @returns {{ maxDepth: number, maxEdgeLengthSquared: number }}
     */
    static #resolveSettings(options) {
        const maxEdgeLength = Math.max(
            Number.isFinite(Number(options?.maxEdgeLength))
                ? Number(options.maxEdgeLength)
                : PcbScene3dGeometryFaceRefiner.#DEFAULT_MAX_EDGE_LENGTH,
            PcbScene3dGeometryFaceRefiner.#GEOMETRY_EPSILON
        )

        return {
            maxDepth: Math.max(
                Number.isFinite(Number(options?.maxDepth))
                    ? Number(options.maxDepth)
                    : PcbScene3dGeometryFaceRefiner.#DEFAULT_MAX_DEPTH,
                0
            ),
            maxEdgeLengthSquared: maxEdgeLength * maxEdgeLength
        }
    }

    /**
     * Appends one triangle, splitting it when it exceeds the configured edge.
     * @param {number[]} positions Flattened position buffer.
     * @param {{ x: number, y: number, z: number }[]} triangle Triangle points.
     * @param {{ maxDepth: number, maxEdgeLengthSquared: number }} settings Settings.
     * @param {number} depth Recursion depth.
     * @param {{ changed: boolean }} state Mutation marker.
     * @returns {void}
     */
    static #appendRefinedTriangle(positions, triangle, settings, depth, state) {
        if (
            depth >= settings.maxDepth ||
            PcbScene3dGeometryFaceRefiner.#maxEdgeLengthSquared(triangle) <=
                settings.maxEdgeLengthSquared
        ) {
            PcbScene3dGeometryFaceRefiner.#appendTriangle(positions, triangle)
            return
        }

        state.changed = true
        for (const childTriangle of PcbScene3dGeometryFaceRefiner.#subdivide(
            triangle
        )) {
            PcbScene3dGeometryFaceRefiner.#appendRefinedTriangle(
                positions,
                childTriangle,
                settings,
                depth + 1,
                state
            )
        }
    }

    /**
     * Resolves one triangle from a position attribute.
     * @param {any} position Position attribute.
     * @param {number} index First vertex index.
     * @returns {{ x: number, y: number, z: number }[]}
     */
    static #resolveTriangle(position, index) {
        return [
            PcbScene3dGeometryFaceRefiner.#resolvePoint(position, index),
            PcbScene3dGeometryFaceRefiner.#resolvePoint(position, index + 1),
            PcbScene3dGeometryFaceRefiner.#resolvePoint(position, index + 2)
        ]
    }

    /**
     * Resolves one point from a position attribute.
     * @param {any} position Position attribute.
     * @param {number} index Vertex index.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolvePoint(position, index) {
        return {
            x: Number(position.getX(index)),
            y: Number(position.getY(index)),
            z: Number(position.getZ?.(index) || 0)
        }
    }

    /**
     * Splits one triangle into four child triangles.
     * @param {{ x: number, y: number, z: number }[]} triangle Triangle points.
     * @returns {{ x: number, y: number, z: number }[][]}
     */
    static #subdivide(triangle) {
        const [first, second, third] = triangle
        const firstSecond = PcbScene3dGeometryFaceRefiner.#midpoint(
            first,
            second
        )
        const secondThird = PcbScene3dGeometryFaceRefiner.#midpoint(
            second,
            third
        )
        const thirdFirst = PcbScene3dGeometryFaceRefiner.#midpoint(third, first)

        return [
            [first, firstSecond, thirdFirst],
            [firstSecond, second, secondThird],
            [thirdFirst, secondThird, third],
            [firstSecond, secondThird, thirdFirst]
        ]
    }

    /**
     * Resolves the midpoint between two vertices.
     * @param {{ x: number, y: number, z: number }} first First point.
     * @param {{ x: number, y: number, z: number }} second Second point.
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
     * @param {{ x: number, y: number, z: number }[]} triangle Triangle points.
     * @returns {number}
     */
    static #maxEdgeLengthSquared(triangle) {
        let maxLengthSquared = 0

        for (let index = 0; index < triangle.length; index += 1) {
            const point = triangle[index]
            const next = triangle[(index + 1) % triangle.length]
            const dx = point.x - next.x
            const dy = point.y - next.y
            const dz = point.z - next.z
            maxLengthSquared = Math.max(
                maxLengthSquared,
                dx * dx + dy * dy + dz * dz
            )
        }

        return maxLengthSquared
    }

    /**
     * Appends one triangle to a flattened position buffer.
     * @param {number[]} positions Flattened position buffer.
     * @param {{ x: number, y: number, z: number }[]} triangle Triangle points.
     * @returns {void}
     */
    static #appendTriangle(positions, triangle) {
        for (const point of triangle) {
            positions.push(point.x, point.y, point.z)
        }
    }
}
