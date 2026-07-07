/**
 * Keeps only the outward-facing surface of solder-mask-covered copper relief.
 */
export class PcbScene3dMaskCoveredCopperSurfaceFilter {
    static #Z_EPSILON = 0.001

    /**
     * Removes hidden underside and side-wall triangles from one mesh.
     * @param {any | null} mesh Copper relief mesh.
     * @returns {void}
     */
    static keepOuterSurface(mesh) {
        const geometry = mesh?.geometry
        const position = geometry?.getAttribute?.('position')
        const source = position?.array
        if (!source || position.itemSize !== 3) {
            return
        }

        const maxZ = PcbScene3dMaskCoveredCopperSurfaceFilter.#maxZ(source)
        const filtered = []
        for (let index = 0; index + 8 < source.length; index += 9) {
            if (
                [2, 5, 8].every(
                    (offset) =>
                        Math.abs(source[index + offset] - maxZ) <=
                        PcbScene3dMaskCoveredCopperSurfaceFilter.#Z_EPSILON
                )
            ) {
                filtered.push(...source.slice(index, index + 9))
            }
        }

        if (!filtered.length || filtered.length === source.length) {
            return
        }

        geometry.setAttribute(
            'position',
            new position.constructor(
                filtered,
                position.itemSize,
                position.normalized
            )
        )
        geometry.deleteAttribute?.('normal')
        geometry.computeVertexNormals?.()
        geometry.computeBoundingBox?.()
        geometry.computeBoundingSphere?.()
    }

    /**
     * Resolves the highest Z plane in one packed XYZ buffer.
     * @param {ArrayLike<number>} source Position buffer.
     * @returns {number}
     */
    static #maxZ(source) {
        let maxZ = -Infinity
        for (let index = 2; index < source.length; index += 3) {
            maxZ = Math.max(maxZ, Number(source[index]))
        }
        return maxZ
    }
}
