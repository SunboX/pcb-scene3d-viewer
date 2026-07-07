/**
 * Builds normalized Three.js paths for explicit board cutouts.
 */
export class PcbScene3dBoardCutoutPathFactory {
    /**
     * Resolves explicit board cutout paths.
     * @param {any} THREE Three.js namespace.
     * @param {{ cutouts?: any[] }} board Board metadata.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {{ path: any, points: { x: number, y: number }[] }[]}
     */
    static resolve(THREE, board, normalizeBoardPoint) {
        return (Array.isArray(board?.cutouts) ? board.cutouts : [])
            .map((cutout) =>
                PcbScene3dBoardCutoutPathFactory.#buildPath(
                    THREE,
                    cutout,
                    normalizeBoardPoint
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one explicit board cutout path.
     * @param {any} THREE Three.js namespace.
     * @param {any} cutout Source cutout.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {{ path: any, points: { x: number, y: number }[] } | null}
     */
    static #buildPath(THREE, cutout, normalizeBoardPoint) {
        const points = PcbScene3dBoardCutoutPathFactory.#sourcePoints(cutout)
            .map((point) =>
                PcbScene3dBoardCutoutPathFactory.#normalizePoint(
                    point,
                    normalizeBoardPoint
                )
            )
            .filter(Boolean)

        if (points.length < 3) {
            return null
        }

        const path = new THREE.Path()
        path.moveTo(points[0].x, points[0].y)
        for (let index = 1; index < points.length; index += 1) {
            path.lineTo(points[index].x, points[index].y)
        }
        path.closePath()

        return { path, points }
    }

    /**
     * Resolves one cutout's point list.
     * @param {any} cutout Source cutout.
     * @returns {any[]}
     */
    static #sourcePoints(cutout) {
        if (Array.isArray(cutout?.points)) {
            return cutout.points
        }

        if (Array.isArray(cutout?.vertices)) {
            return cutout.vertices
        }

        return Array.isArray(cutout) ? cutout : []
    }

    /**
     * Normalizes one source point into local board shape coordinates.
     * @param {any} point Source point.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {{ x: number, y: number } | null}
     */
    static #normalizePoint(point, normalizeBoardPoint) {
        const x = Number(point?.x ?? point?.[0])
        const y = Number(point?.y ?? point?.[1])
        return Number.isFinite(x + y) ? normalizeBoardPoint(x, y) : null
    }
}
