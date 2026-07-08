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
        PcbScene3dMaskCoveredCopperSurfaceFilter.#filterOuterTriangles(mesh, {
            keepSideWalls: false
        })
    }

    /**
     * Removes the hidden underside while keeping shallow edge walls.
     * @param {any | null} mesh Copper relief mesh.
     * @returns {void}
     */
    static keepOuterRelief(mesh) {
        PcbScene3dMaskCoveredCopperSurfaceFilter.#filterOuterTriangles(mesh, {
            keepSideWalls: true
        })
    }

    /**
     * Keeps only triangles that are visible above the solder mask.
     * @param {any | null} mesh Copper relief mesh.
     * @param {{ keepSideWalls?: boolean }} options Filter options.
     * @returns {void}
     */
    static #filterOuterTriangles(mesh, options) {
        const geometry = mesh?.geometry
        const position = geometry?.getAttribute?.('position')
        const source = position?.array
        if (!source || position.itemSize !== 3) {
            return
        }

        const zBounds =
            PcbScene3dMaskCoveredCopperSurfaceFilter.#zBounds(source)
        const filtered = []
        for (let index = 0; index + 8 < source.length; index += 9) {
            if (
                PcbScene3dMaskCoveredCopperSurfaceFilter.#keepsTriangle(
                    source,
                    index,
                    zBounds,
                    options
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
     * Checks whether one triangle should stay in the visible relief mesh.
     * @param {ArrayLike<number>} source Position buffer.
     * @param {number} index Triangle start index.
     * @param {{ minZ: number, maxZ: number }} zBounds Geometry Z bounds.
     * @param {{ keepSideWalls?: boolean }} options Filter options.
     * @returns {boolean}
     */
    static #keepsTriangle(source, index, zBounds, options) {
        const zValues = [2, 5, 8].map((offset) => source[index + offset])
        const hasTop = zValues.some((z) =>
            PcbScene3dMaskCoveredCopperSurfaceFilter.#matchesZ(z, zBounds.maxZ)
        )
        const hasBottom = zValues.some((z) =>
            PcbScene3dMaskCoveredCopperSurfaceFilter.#matchesZ(z, zBounds.minZ)
        )

        if (hasTop && !hasBottom) {
            return true
        }

        return options?.keepSideWalls === true && hasTop && hasBottom
    }

    /**
     * Checks whether a Z value matches one target plane.
     * @param {number} value Candidate Z.
     * @param {number} target Target Z.
     * @returns {boolean}
     */
    static #matchesZ(value, target) {
        return (
            Math.abs(Number(value) - Number(target)) <=
            PcbScene3dMaskCoveredCopperSurfaceFilter.#Z_EPSILON
        )
    }

    /**
     * Resolves the lowest and highest Z planes in one packed XYZ buffer.
     * @param {ArrayLike<number>} source Position buffer.
     * @returns {{ minZ: number, maxZ: number }}
     */
    static #zBounds(source) {
        let minZ = Infinity
        let maxZ = -Infinity
        for (let index = 2; index < source.length; index += 3) {
            const z = Number(source[index])
            minZ = Math.min(minZ, z)
            maxZ = Math.max(maxZ, z)
        }
        return { minZ, maxZ }
    }
}
