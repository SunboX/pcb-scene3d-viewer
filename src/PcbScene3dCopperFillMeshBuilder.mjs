import earcut from 'earcut'
import { PcbScene3dCopperFillAreaClipper } from './PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCopperFillCoverageContext } from './PcbScene3dCopperFillCoverageContext.mjs'
import { PcbScene3dCopperFillLoopSetResolver } from './PcbScene3dCopperFillLoopSetResolver.mjs'
import { PcbScene3dCopperFillPolygonBoolean } from './PcbScene3dCopperFillPolygonBoolean.mjs'
import { PcbScene3dCopperOcclusionClipper } from './PcbScene3dCopperOcclusionClipper.mjs'

/**
 * Builds saved copper fill meshes for the interactive 3D scene.
 */
export class PcbScene3dCopperFillMeshBuilder {
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
     * @param {{ surfaceOnly?: boolean, clipContainedFillOverlaps?: boolean, loopSets?: { outer: number[][], holes: number[][][], bounds: object }[], coverageContext?: object }} [options] Optional mesh options.
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
        cutouts = [],
        options = {}
    ) {
        const positions = []
        const halfThickness = Math.max(Number(thickness || 0), 0.001) / 2
        const bottomZ = Number(z || 0) - halfThickness
        const topZ = Number(z || 0) + halfThickness
        const loopSets = Array.isArray(options?.loopSets)
            ? options.loopSets
            : PcbScene3dCopperFillLoopSetResolver.resolve(
                  fills,
                  normalizeBoardPoint,
                  mirrorY
              )

        if (
            PcbScene3dCopperFillMeshBuilder.#shouldClipContainedFillOverlaps(
                options
            )
        ) {
            PcbScene3dCopperFillMeshBuilder.#appendClippedFillPositions(
                THREE,
                positions,
                loopSets,
                bottomZ,
                topZ,
                options
            )
        } else {
            for (const loopSet of loopSets) {
                PcbScene3dCopperFillMeshBuilder.#appendNormalizedLoopSetPositions(
                    positions,
                    loopSet,
                    bottomZ,
                    topZ,
                    options
                )
            }
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
     * Appends fill positions while removing duplicate overlap surfaces.
     * @param {any} THREE Three.js namespace.
     * @param {number[]} positions Position buffer.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }[]} loopSets Normalized fill islands.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @param {{ surfaceOnly?: boolean, clipContainedFillOverlaps?: boolean, coverageContext?: object }} options Mesh options.
     * @returns {void}
     */
    static #appendClippedFillPositions(
        THREE,
        positions,
        loopSets,
        bottomZ,
        topZ,
        options
    ) {
        const emittedPolygons = []
        const emittedLoopSets = []
        let coverageContext = null

        for (
            let loopSetIndex = 0;
            loopSetIndex < loopSets.length;
            loopSetIndex += 1
        ) {
            const loopSet = loopSets[loopSetIndex]
            const remainingLoopSets =
                PcbScene3dCopperFillPolygonBoolean.resolveRemainingLoopSets(
                    loopSet,
                    emittedPolygons
                )

            if (remainingLoopSets) {
                for (const remainingLoopSet of remainingLoopSets) {
                    PcbScene3dCopperFillMeshBuilder.#appendNormalizedLoopSetPositions(
                        positions,
                        remainingLoopSet,
                        bottomZ,
                        topZ,
                        options
                    )
                }
            } else {
                if (!coverageContext) {
                    coverageContext =
                        options?.coverageContext?.matchesLoopSets?.(
                            loopSets
                        ) === true
                            ? options.coverageContext
                            : PcbScene3dCopperFillCoverageContext.fromLoopSets(
                                  loopSets
                              )
                }
                PcbScene3dCopperFillMeshBuilder.#appendTriangleClippedLoopSet(
                    THREE,
                    positions,
                    loopSet,
                    emittedLoopSets,
                    loopSetIndex,
                    coverageContext,
                    bottomZ,
                    topZ,
                    options
                )
            }

            emittedLoopSets.push(loopSet)
            emittedPolygons.push(
                ...PcbScene3dCopperFillPolygonBoolean.resolveNormalizedPolygons(
                    loopSet
                )
            )
        }
    }

    /**
     * Appends one loop set using the older triangle clipper fallback.
     * @param {any} THREE Three.js namespace.
     * @param {number[]} positions Position buffer.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }} loopSet Candidate loop set.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }[]} emittedLoopSets Already emitted loop sets.
     * @param {number} loopSetIndex Flattened candidate source index.
     * @param {object} coverageContext Prepared ordered fill coverage.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @param {{ surfaceOnly?: boolean, clipContainedFillOverlaps?: boolean }} options Mesh options.
     * @returns {void}
     */
    static #appendTriangleClippedLoopSet(
        THREE,
        positions,
        loopSet,
        emittedLoopSets,
        loopSetIndex,
        coverageContext,
        bottomZ,
        topZ,
        options
    ) {
        if (
            emittedLoopSets.some((emittedLoopSet) =>
                PcbScene3dCopperFillMeshBuilder.#containsLoopSet(
                    emittedLoopSet,
                    loopSet
                )
            )
        ) {
            return
        }

        const loopPositions = []
        PcbScene3dCopperFillMeshBuilder.#appendNormalizedLoopSetPositions(
            loopPositions,
            loopSet,
            bottomZ,
            topZ,
            options
        )
        PcbScene3dCopperFillMeshBuilder.#appendPositions(
            positions,
            PcbScene3dCopperFillMeshBuilder.#clipPositionsAgainstCoverage(
                THREE,
                loopPositions,
                coverageContext,
                loopSetIndex,
                PcbScene3dCopperFillMeshBuilder.#resolveClipSourceIndexes(
                    loopSet,
                    emittedLoopSets
                )
            )
        )
    }

    /**
     * Resolves indexes of earlier loop sets that can overlap a candidate.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }} candidate Candidate loop set.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }[]} loopSets Emitted loop sets.
     * @returns {Set<number>}
     */
    static #resolveClipSourceIndexes(candidate, loopSets) {
        const sourceIndexes = new Set()

        for (
            let sourceIndex = 0;
            sourceIndex < loopSets.length;
            sourceIndex += 1
        ) {
            const loopSet = loopSets[sourceIndex]
            if (
                PcbScene3dCopperFillMeshBuilder.#boundsOverlap(
                    candidate.bounds,
                    loopSet.bounds
                ) &&
                !PcbScene3dCopperFillMeshBuilder.#isInsideAnyHole(
                    candidate,
                    loopSet
                )
            ) {
                sourceIndexes.add(sourceIndex)
            }
        }

        return sourceIndexes
    }

    /**
     * Appends a potentially large position array without using argument spread.
     * @param {number[]} target Target position buffer.
     * @param {number[]} source Source positions.
     * @returns {void}
     */
    static #appendPositions(target, source) {
        for (const value of source) {
            target.push(value)
        }
    }

    /**
     * Clips position triangles against eligible prepared fill areas.
     * @param {any} THREE Three.js namespace.
     * @param {number[]} positions Candidate triangle positions.
     * @param {object} coverageContext Prepared ordered fill coverage.
     * @param {number} beforeSourceIndex Exclusive source-order prefix.
     * @param {Set<number>} allowedSourceIndexes Eligible earlier sources.
     * @returns {number[]}
     */
    static #clipPositionsAgainstCoverage(
        THREE,
        positions,
        coverageContext,
        beforeSourceIndex,
        allowedSourceIndexes
    ) {
        if (!positions.length || !allowedSourceIndexes.size) {
            return positions
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        const mesh = new THREE.Mesh(geometry)
        const clippedMesh = PcbScene3dCopperFillAreaClipper.filterPrepared(
            THREE,
            mesh,
            coverageContext,
            { beforeSourceIndex, allowedSourceIndexes }
        )
        if (!clippedMesh) {
            return []
        }

        return Array.from(clippedMesh.geometry.attributes.position.array)
    }
    /**
     * Appends one already-normalized fill island loop set.
     * @param {number[]} positions Position buffer.
     * @param {{ outer: number[][], holes: number[][][] }} loops Fill loop set.
     * @param {number} bottomZ Lower Z.
     * @param {number} topZ Upper Z.
     * @param {{ surfaceOnly?: boolean, clipContainedFillOverlaps?: boolean }} options Mesh options.
     * @returns {void}
     */
    static #appendNormalizedLoopSetPositions(
        positions,
        loops,
        bottomZ,
        topZ,
        options
    ) {
        const outer = loops.outer
        const holes = loops.holes || []
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
        if (PcbScene3dCopperFillMeshBuilder.#isSurfaceOnly(options)) {
            return
        }

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
     * Resolves later fill loops fully contained by an earlier loop set.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }} loopSet Current loop set.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }[]} loopSets All loop sets.
     * @param {number} currentIndex Current loop-set index.
     * @returns {number[][][]}
     */
    static #containedLaterLoops(loopSet, loopSets, currentIndex) {
        return loopSets
            .slice(currentIndex + 1)
            .filter((candidate) =>
                PcbScene3dCopperFillMeshBuilder.#containsLoopSet(
                    loopSet,
                    candidate
                )
            )
            .map((candidate) => candidate.outer)
    }

    /**
     * Checks whether one loop set contains another fill loop.
     * @param {{ outer: number[][], holes: number[][][], bounds: object }} outerSet Outer loop set.
     * @param {{ outer: number[][], bounds: object }} candidate Candidate loop set.
     * @returns {boolean}
     */
    static #containsLoopSet(outerSet, candidate) {
        const representative =
            PcbScene3dCopperFillMeshBuilder.#representativePoint(
                candidate.outer
            )

        return (
            PcbScene3dCopperFillMeshBuilder.#boundsContainBounds(
                outerSet.bounds,
                candidate.bounds
            ) &&
            candidate.outer.every((point) =>
                PcbScene3dCopperFillMeshBuilder.#pointInPolygon(
                    point,
                    outerSet.outer
                )
            ) &&
            !outerSet.holes.some((hole) =>
                PcbScene3dCopperFillMeshBuilder.#pointInPolygon(
                    representative,
                    hole
                )
            )
        )
    }

    /**
     * Checks whether a fill should be represented by only its visible face.
     * @param {{ surfaceOnly?: boolean } | undefined} options Mesh options.
     * @returns {boolean}
     */
    static #isSurfaceOnly(options) {
        return options?.surfaceOnly === true
    }

    /**
     * Checks whether contained fill overlaps should be removed before meshing.
     * @param {{ clipContainedFillOverlaps?: boolean } | undefined} options Mesh options.
     * @returns {boolean}
     */
    static #shouldClipContainedFillOverlaps(options) {
        return options?.clipContainedFillOverlaps === true
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
     * Computes axis-aligned bounds for one loop.
     * @param {number[][]} loop Candidate loop.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static #loopBounds(loop) {
        return (loop || []).reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, Number(point?.[0])),
                minY: Math.min(bounds.minY, Number(point?.[1])),
                maxX: Math.max(bounds.maxX, Number(point?.[0])),
                maxY: Math.max(bounds.maxY, Number(point?.[1]))
            }),
            {
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            }
        )
    }

    /**
     * Checks whether one bounds fully contains another.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} outer Outer bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} inner Inner bounds.
     * @returns {boolean}
     */
    static #boundsContainBounds(outer, inner) {
        return (
            Number.isFinite(
                outer.minX +
                    outer.minY +
                    outer.maxX +
                    outer.maxY +
                    inner.minX +
                    inner.minY +
                    inner.maxX +
                    inner.maxY
            ) &&
            inner.minX >= outer.minX - 0.001 &&
            inner.maxX <= outer.maxX + 0.001 &&
            inner.minY >= outer.minY - 0.001 &&
            inner.maxY <= outer.maxY + 0.001
        )
    }

    /**
     * Checks whether one candidate loop set is fully inside a hole.
     * @param {{ outer: number[][], bounds: object }} candidate Candidate loop set.
     * @param {{ holes: number[][][] }} loopSet Previous loop set.
     * @returns {boolean}
     */
    static #isInsideAnyHole(candidate, loopSet) {
        return (loopSet.holes || []).some((hole) => {
            const holeBounds = PcbScene3dCopperFillMeshBuilder.#loopBounds(hole)

            return (
                PcbScene3dCopperFillMeshBuilder.#boundsContainBounds(
                    holeBounds,
                    candidate.bounds
                ) &&
                candidate.outer.every((point) =>
                    PcbScene3dCopperFillMeshBuilder.#pointInPolygon(point, hole)
                )
            )
        })
    }

    /**
     * Checks whether two bounds overlap.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} left Left bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} right Right bounds.
     * @returns {boolean}
     */
    static #boundsOverlap(left, right) {
        return !(
            left.maxX < right.minX - 0.001 ||
            left.minX > right.maxX + 0.001 ||
            left.maxY < right.minY - 0.001 ||
            left.minY > right.maxY + 0.001
        )
    }

    /**
     * Resolves a representative point for one loop.
     * @param {number[][]} loop Candidate loop.
     * @returns {number[]}
     */
    static #representativePoint(loop) {
        const total = (loop || []).reduce(
            (sum, point) => [
                sum[0] + Number(point?.[0]),
                sum[1] + Number(point?.[1])
            ],
            [0, 0]
        )
        const count = Math.max((loop || []).length, 1)
        return [total[0] / count, total[1] / count]
    }

    /**
     * Checks whether a point is inside a polygon loop.
     * @param {number[]} point Candidate point.
     * @param {number[][]} polygon Polygon loop.
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
            const currentY = Number(current?.[1])
            const previousY = Number(previous?.[1])
            const pointY = Number(point?.[1])
            const intersects =
                currentY > pointY !== previousY > pointY &&
                Number(point?.[0]) <
                    ((Number(previous?.[0]) - Number(current?.[0])) *
                        (pointY - currentY)) /
                        (previousY - currentY) +
                        Number(current?.[0])

            if (intersects) inside = !inside
        }

        return inside
    }
}
