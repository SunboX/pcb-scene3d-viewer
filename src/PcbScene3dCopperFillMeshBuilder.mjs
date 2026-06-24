import earcut from 'earcut'
import { PcbAssemblyFillGeometryResolver } from './PcbAssemblyFillGeometryResolver.mjs'
import { PcbScene3dCopperOcclusionClipper } from './PcbScene3dCopperOcclusionClipper.mjs'

/**
 * Builds saved copper fill meshes for the interactive 3D scene.
 */
export class PcbScene3dCopperFillMeshBuilder {
    static #AREA_EPSILON = 0.001

    /**
     * Builds one combined copper fill mesh.
     * @param {any} THREE Three.js namespace.
     * @param {object[]} fills Filled copper primitives.
     * @param {number} z Center Z.
     * @param {number} thickness Visual copper thickness.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @param {any} material Copper material.
     * @param {{ x: number, y: number }[][]} [cutouts] Optional normalized overlay cutouts.
     * @returns {any | null}
     */
    static build(
        THREE,
        fills,
        z,
        thickness,
        normalizeBoardPoint,
        mirrorY,
        material,
        cutouts = []
    ) {
        const positions = []
        const halfThickness = Math.max(Number(thickness || 0), 0.001) / 2
        const bottomZ = Number(z || 0) - halfThickness
        const topZ = Number(z || 0) + halfThickness

        for (const fill of fills || []) {
            PcbScene3dCopperFillMeshBuilder.#appendFillPositions(
                positions,
                fill,
                bottomZ,
                topZ,
                normalizeBoardPoint,
                mirrorY
            )
        }

        if (!positions.length) {
            return null
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        const clippedGeometry = PcbScene3dCopperFillMeshBuilder.#clipGeometry(
            THREE,
            geometry,
            cutouts
        )
        if (!clippedGeometry) {
            return null
        }

        const mesh = new THREE.Mesh(clippedGeometry, material)
        mesh.name = 'copper-fills'
        return mesh
    }

    /**
     * Clips fill geometry against optional overlay cutouts.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Source fill geometry.
     * @param {{ x: number, y: number }[][]} cutouts Normalized overlay cutouts.
     * @returns {any | null}
     */
    static #clipGeometry(THREE, geometry, cutouts) {
        if (!Array.isArray(cutouts) || !cutouts.length) {
            geometry.computeVertexNormals?.()
            return geometry
        }

        return PcbScene3dCopperOcclusionClipper.filter(THREE, geometry, cutouts)
    }

    /**
     * Appends one filled primitive to a shared position buffer.
     * @param {number[]} positions Position buffer.
     * @param {object} fill Filled copper primitive.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {void}
     */
    static #appendFillPositions(
        positions,
        fill,
        bottomZ,
        topZ,
        normalizeBoardPoint,
        mirrorY
    ) {
        for (const loops of PcbAssemblyFillGeometryResolver.resolveAll(fill)) {
            PcbScene3dCopperFillMeshBuilder.#appendLoopSetPositions(
                positions,
                loops,
                bottomZ,
                topZ,
                normalizeBoardPoint,
                mirrorY
            )
        }
    }

    /**
     * Appends one fill island loop set to a shared position buffer.
     * @param {number[]} positions Position buffer.
     * @param {{ outer: number[][], holes: number[][][] }} loops Fill loop set.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {void}
     */
    static #appendLoopSetPositions(
        positions,
        loops,
        bottomZ,
        topZ,
        normalizeBoardPoint,
        mirrorY
    ) {
        const outer = PcbScene3dCopperFillMeshBuilder.#normalizeLoop(
            loops.outer,
            normalizeBoardPoint,
            mirrorY
        )
        const holes = (loops.holes || [])
            .map((loop) =>
                PcbScene3dCopperFillMeshBuilder.#normalizeLoop(
                    loop,
                    normalizeBoardPoint,
                    mirrorY
                )
            )
            .filter((loop) =>
                PcbScene3dCopperFillMeshBuilder.#isValidLoop(loop)
            )

        if (!PcbScene3dCopperFillMeshBuilder.#isValidLoop(outer)) {
            return
        }

        const { points, flat, holeIndexes } =
            PcbScene3dCopperFillMeshBuilder.#flattenLoops(outer, holes)
        const triangles = earcut(flat, holeIndexes, 2)
        if (!triangles.length) {
            return
        }

        PcbScene3dCopperFillMeshBuilder.#appendSurfaceTriangles(
            positions,
            points,
            triangles,
            topZ,
            false
        )
        PcbScene3dCopperFillMeshBuilder.#appendSurfaceTriangles(
            positions,
            points,
            triangles,
            bottomZ,
            true
        )
        PcbScene3dCopperFillMeshBuilder.#appendLoopWalls(
            positions,
            outer,
            bottomZ,
            topZ
        )
        for (const hole of holes) {
            PcbScene3dCopperFillMeshBuilder.#appendLoopWalls(
                positions,
                hole,
                bottomZ,
                topZ
            )
        }
    }

    /**
     * Normalizes one loop into local copper-side coordinates.
     * @param {number[][]} loop Source loop.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {number[][]}
     */
    static #normalizeLoop(loop, normalizeBoardPoint, mirrorY) {
        const points = []
        for (const point of loop || []) {
            const normalized = normalizeBoardPoint(
                Number(point?.[0]),
                Number(point?.[1])
            )
            const nextPoint = [
                Number(normalized?.x),
                mirrorY ? -Number(normalized?.y) : Number(normalized?.y)
            ]
            if (nextPoint.every(Number.isFinite)) {
                points.push(nextPoint)
            }
        }
        return PcbScene3dCopperFillMeshBuilder.#cleanLoop(points)
    }

    /**
     * Flattens loops for triangulation.
     * @param {number[][]} outer Outer loop.
     * @param {number[][][]} holes Hole loops.
     * @returns {{ points: number[][], flat: number[], holeIndexes: number[] }}
     */
    static #flattenLoops(outer, holes) {
        const points = []
        const flat = []
        const holeIndexes = []

        for (const loop of [outer, ...holes]) {
            if (points.length) {
                holeIndexes.push(points.length)
            }
            for (const point of loop) {
                points.push(point)
                flat.push(point[0], point[1])
            }
        }

        return { points, flat, holeIndexes }
    }

    /**
     * Appends top or bottom triangulated faces.
     * @param {number[]} positions Position buffer.
     * @param {number[][]} points Flattened points.
     * @param {number[]} triangles Earcut triangle indexes.
     * @param {number} z Face Z.
     * @param {boolean} reverse Whether to reverse winding.
     * @returns {void}
     */
    static #appendSurfaceTriangles(positions, points, triangles, z, reverse) {
        for (let index = 0; index + 2 < triangles.length; index += 3) {
            const face = [
                points[triangles[index]],
                points[triangles[index + 1]],
                points[triangles[index + 2]]
            ]
            if (reverse) face.reverse()
            PcbScene3dCopperFillMeshBuilder.#appendTriangle(positions, face, z)
        }
    }

    /**
     * Appends vertical side walls around one loop.
     * @param {number[]} positions Position buffer.
     * @param {number[][]} loop Loop points.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @returns {void}
     */
    static #appendLoopWalls(positions, loop, bottomZ, topZ) {
        for (let index = 0; index < loop.length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]

            PcbScene3dCopperFillMeshBuilder.#appendVertex(
                positions,
                current,
                bottomZ
            )
            PcbScene3dCopperFillMeshBuilder.#appendVertex(
                positions,
                next,
                bottomZ
            )
            PcbScene3dCopperFillMeshBuilder.#appendVertex(positions, next, topZ)
            PcbScene3dCopperFillMeshBuilder.#appendVertex(
                positions,
                current,
                bottomZ
            )
            PcbScene3dCopperFillMeshBuilder.#appendVertex(positions, next, topZ)
            PcbScene3dCopperFillMeshBuilder.#appendVertex(
                positions,
                current,
                topZ
            )
        }
    }

    /**
     * Appends one triangle.
     * @param {number[]} positions Position buffer.
     * @param {number[][]} face Triangle points.
     * @param {number} z Face Z.
     * @returns {void}
     */
    static #appendTriangle(positions, face, z) {
        for (const point of face) {
            PcbScene3dCopperFillMeshBuilder.#appendVertex(positions, point, z)
        }
    }

    /**
     * Appends one 3D vertex.
     * @param {number[]} positions Position buffer.
     * @param {number[]} point XY point.
     * @param {number} z Z value.
     * @returns {void}
     */
    static #appendVertex(positions, point, z) {
        positions.push(point[0], point[1], z)
    }

    /**
     * Removes invalid and duplicate loop points.
     * @param {number[][]} points Candidate points.
     * @returns {number[][]}
     */
    static #cleanLoop(points) {
        const loop = []
        for (const point of points || []) {
            const x = Number(point?.[0])
            const y = Number(point?.[1])
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                continue
            }

            const previous = loop[loop.length - 1]
            if (
                previous &&
                Math.abs(previous[0] - x) < 0.001 &&
                Math.abs(previous[1] - y) < 0.001
            ) {
                continue
            }
            loop.push([x, y])
        }

        const first = loop[0]
        const last = loop[loop.length - 1]
        if (
            first &&
            last &&
            Math.abs(first[0] - last[0]) < 0.001 &&
            Math.abs(first[1] - last[1]) < 0.001
        ) {
            loop.pop()
        }

        return loop
    }

    /**
     * Checks whether one loop has enough non-collinear area.
     * @param {number[][]} loop Candidate loop.
     * @returns {boolean}
     */
    static #isValidLoop(loop) {
        return (
            Array.isArray(loop) &&
            loop.length >= 3 &&
            Math.abs(PcbScene3dCopperFillMeshBuilder.#signedArea(loop)) >
                PcbScene3dCopperFillMeshBuilder.#AREA_EPSILON
        )
    }

    /**
     * Computes signed loop area.
     * @param {number[][]} loop Candidate loop.
     * @returns {number}
     */
    static #signedArea(loop) {
        let area = 0
        for (let index = 0; index < loop.length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            area += current[0] * next[1] - next[0] * current[1]
        }
        return area / 2
    }
}
