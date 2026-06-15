import { PcbScene3dCutoutGeometryFilter } from './PcbScene3dCutoutGeometryFilter.mjs'

/**
 * Clips mask-covered copper relief where opaque overlay artwork covers it.
 */
export class PcbScene3dCopperOcclusionClipper {
    /**
     * Filters one stroke geometry against opaque overlay cutouts.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Stroke geometry.
     * @param {{ x: number, y: number }[][]} cutouts Normalized occlusion polygons.
     * @returns {any | null}
     */
    static filter(THREE, geometry, cutouts) {
        geometry.computeVertexNormals?.()
        const clippedGeometry = PcbScene3dCutoutGeometryFilter.filter(
            THREE,
            geometry,
            cutouts,
            { maxDepth: 12, maxEdgeLength: 2, discardTerminalOverlaps: true }
        )

        return clippedGeometry.getAttribute?.('position')?.count
            ? clippedGeometry
            : null
    }

    /**
     * Normalizes cutout polygons into local copper-side coordinates.
     * @param {{ x?: number, y?: number }[][] | undefined} cutouts Cutout polygons.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ x: number, y: number }[][]}
     */
    static normalizeCutouts(cutouts, normalizeBoardPoint, mirrorY) {
        if (!Array.isArray(cutouts)) {
            return []
        }

        return cutouts
            .map((cutout) =>
                PcbScene3dCopperOcclusionClipper.#normalizeCutout(
                    cutout,
                    normalizeBoardPoint,
                    mirrorY
                )
            )
            .filter((cutout) => cutout.length >= 3)
    }

    /**
     * Normalizes one cutout polygon.
     * @param {{ x?: number, y?: number }[] | undefined} cutout Cutout polygon.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {boolean} mirrorY Whether to mirror underside Y coordinates.
     * @returns {{ x: number, y: number }[]}
     */
    static #normalizeCutout(cutout, normalizeBoardPoint, mirrorY) {
        return (Array.isArray(cutout) ? cutout : [])
            .map((point) =>
                PcbScene3dCopperOcclusionClipper.#normalizePoint(
                    normalizeBoardPoint,
                    Number(point?.x || 0),
                    Number(point?.y || 0),
                    mirrorY
                )
            )
            .filter(
                (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
            )
    }

    /**
     * Normalizes one point and optionally mirrors underside primitives.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint Board normalizer.
     * @param {number} x
     * @param {number} y
     * @param {boolean} mirrorY
     * @returns {{ x: number, y: number }}
     */
    static #normalizePoint(normalizeBoardPoint, x, y, mirrorY) {
        const point = normalizeBoardPoint(x, y)

        return { x: point.x, y: mirrorY ? -point.y : point.y }
    }
}
