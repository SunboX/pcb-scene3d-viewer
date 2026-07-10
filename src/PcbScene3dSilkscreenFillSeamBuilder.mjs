import { PcbScene3dCutoutGeometryFilter } from './PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dShapePathFactory } from './PcbScene3dShapePathFactory.mjs'
import { PcbScene3dStrokeGeometryBuilder } from './PcbScene3dStrokeGeometryBuilder.mjs'

const SEAM_WIDTH_MIL = 1.5
const SEAM_Z_OFFSET_MIL = 0.02
const MIN_SEGMENT_LENGTH_MIL = 0.001
const POSITION_CHUNK_SIZE = 24000

/**
 * Builds tiny same-color edge covers for adjacent silkscreen fill polygons.
 */
export class PcbScene3dSilkscreenFillSeamBuilder {
    /**
     * Builds seam cover meshes for all filled silkscreen polygons.
     * @param {any} THREE
     * @param {{ points?: { x: number, y: number }[], x1?: number, y1?: number, x2?: number, y2?: number }[]} fills
     * Fill records.
     * @param {number} z Fill plane Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * Board-point normalizer.
     * @param {boolean} mirrorY Whether the side is mirrored.
     * @param {any} material Shared fill material.
     * @param {{ x: number, y: number }[][]} [cutouts] Cutouts that should remain uncovered.
     * @param {{ preparedPolygonCache?: Map }} [options] Request-scoped options.
     * @returns {any[]}
     */
    static buildMeshes(
        THREE,
        fills,
        z,
        normalizeBoardPoint,
        mirrorY,
        material,
        cutouts = [],
        options = {}
    ) {
        const meshes = []
        let positions = []

        for (const fill of Array.isArray(fills) ? fills : []) {
            const points =
                PcbScene3dSilkscreenFillSeamBuilder.#normalizeFillPoints(
                    fill,
                    normalizeBoardPoint,
                    mirrorY
                )
            PcbScene3dSilkscreenFillSeamBuilder.#appendOutline(
                positions,
                points,
                z
            )

            if (positions.length >= POSITION_CHUNK_SIZE) {
                PcbScene3dSilkscreenFillSeamBuilder.#appendMesh(
                    meshes,
                    THREE,
                    positions,
                    material,
                    cutouts,
                    options
                )
                positions = []
            }
        }

        PcbScene3dSilkscreenFillSeamBuilder.#appendMesh(
            meshes,
            THREE,
            positions,
            material,
            cutouts,
            options
        )

        return meshes
    }

    /**
     * Appends a widened closed outline for one polygon.
     * @param {number[]} positions Target position buffer.
     * @param {{ x: number, y: number }[]} points Normalized polygon points.
     * @param {number} z Fill plane Z.
     * @returns {void}
     */
    static #appendOutline(positions, points, z) {
        if (!Array.isArray(points) || points.length < 3) {
            return
        }

        const seamZ = z + SEAM_Z_OFFSET_MIL
        for (let index = 0; index < points.length; index += 1) {
            const start = points[index]
            const end = points[(index + 1) % points.length]
            if (
                Math.hypot(end.x - start.x, end.y - start.y) <
                MIN_SEGMENT_LENGTH_MIL
            ) {
                continue
            }

            PcbScene3dStrokeGeometryBuilder.appendTrack(
                positions,
                start,
                end,
                SEAM_WIDTH_MIL,
                seamZ,
                { minWidth: SEAM_WIDTH_MIL }
            )
        }
    }

    /**
     * Appends one filtered seam mesh.
     * @param {any[]} meshes Target mesh list.
     * @param {any} THREE
     * @param {number[]} positions Position buffer.
     * @param {any} material Shared material.
     * @param {{ x: number, y: number }[][]} cutouts Cutout polygons.
     * @param {{ preparedPolygonCache?: Map }} options Request-scoped options.
     * @returns {void}
     */
    static #appendMesh(meshes, THREE, positions, material, cutouts, options) {
        if (
            !positions.length ||
            !THREE?.BufferGeometry ||
            !THREE?.Float32BufferAttribute ||
            !THREE?.Mesh
        ) {
            return
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        const mesh = new THREE.Mesh(
            PcbScene3dCutoutGeometryFilter.filter(THREE, geometry, cutouts, {
                maxDepth: 12,
                maxEdgeLength: 2,
                preparedPolygonCache: options?.preparedPolygonCache
            }),
            material
        )
        mesh.userData = {
            ...(mesh.userData || {}),
            scene3dSilkscreenFillSeam: true
        }
        meshes.push(mesh)
    }

    /**
     * Normalizes one fill into a polygon outline.
     * @param {{ points?: { x: number, y: number }[], x1?: number, y1?: number, x2?: number, y2?: number }} fill
     * Fill record.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * Board-point normalizer.
     * @param {boolean} mirrorY Whether the side is mirrored.
     * @returns {{ x: number, y: number }[]}
     */
    static #normalizeFillPoints(fill, normalizeBoardPoint, mirrorY) {
        if (Array.isArray(fill?.points)) {
            return PcbScene3dShapePathFactory.normalizeShapePoints(
                fill.points,
                normalizeBoardPoint,
                mirrorY
            )
        }

        return PcbScene3dSilkscreenFillSeamBuilder.#normalizeRectangleFillPoints(
            fill,
            normalizeBoardPoint,
            mirrorY
        )
    }

    /**
     * Normalizes one rectangular fill into polygon points.
     * @param {{ x1?: number, y1?: number, x2?: number, y2?: number }} fill
     * Fill record.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * Board-point normalizer.
     * @param {boolean} mirrorY Whether the side is mirrored.
     * @returns {{ x: number, y: number }[]}
     */
    static #normalizeRectangleFillPoints(fill, normalizeBoardPoint, mirrorY) {
        const x1 = Number(fill?.x1)
        const y1 = Number(fill?.y1)
        const x2 = Number(fill?.x2)
        const y2 = Number(fill?.y2)

        if (
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
        ) {
            return []
        }

        return [
            PcbScene3dSilkscreenFillSeamBuilder.#normalizePoint(
                normalizeBoardPoint,
                x1,
                y1,
                mirrorY
            ),
            PcbScene3dSilkscreenFillSeamBuilder.#normalizePoint(
                normalizeBoardPoint,
                x2,
                y1,
                mirrorY
            ),
            PcbScene3dSilkscreenFillSeamBuilder.#normalizePoint(
                normalizeBoardPoint,
                x2,
                y2,
                mirrorY
            ),
            PcbScene3dSilkscreenFillSeamBuilder.#normalizePoint(
                normalizeBoardPoint,
                x1,
                y2,
                mirrorY
            )
        ]
    }

    /**
     * Normalizes one board coordinate.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * Board-point normalizer.
     * @param {number} x Board X.
     * @param {number} y Board Y.
     * @param {boolean} mirrorY Whether the side is mirrored.
     * @returns {{ x: number, y: number }}
     */
    static #normalizePoint(normalizeBoardPoint, x, y, mirrorY) {
        const point = normalizeBoardPoint(x, y)

        return {
            x: point.x,
            y: mirrorY ? -point.y : point.y
        }
    }
}
