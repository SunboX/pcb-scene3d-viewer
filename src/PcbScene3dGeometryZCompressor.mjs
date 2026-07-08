const MASK_COVERED_CENTER_OFFSET_MIL = 0.075
const MASK_COVERED_THICKNESS_MIL = 0.45

/**
 * Compresses mesh geometry along Z while keeping its XY topology unchanged.
 */
export class PcbScene3dGeometryZCompressor {
    /**
     * Rewrites mask-covered copper relief below exposed copper height.
     * @param {any | null} mesh Mesh with a position attribute.
     * @param {number} sourceCenterZ Original geometry center Z.
     * @param {{ centerOffsetMil?: number, thicknessMil?: number }} [options] Compression options.
     * @returns {void}
     */
    static compressMaskCoveredCopperMesh(mesh, sourceCenterZ, options = {}) {
        PcbScene3dGeometryZCompressor.compressMesh(
            mesh,
            sourceCenterZ,
            sourceCenterZ +
                MASK_COVERED_CENTER_OFFSET_MIL +
                Number(options?.centerOffsetMil || 0),
            Number.isFinite(Number(options?.thicknessMil))
                ? Math.max(Number(options.thicknessMil), 0)
                : MASK_COVERED_THICKNESS_MIL
        )
    }

    /**
     * Rewrites one mesh's position buffer to a new center and thickness.
     * @param {any | null} mesh Mesh with a position attribute.
     * @param {number} sourceCenterZ Original geometry center Z.
     * @param {number} targetCenterZ New geometry center Z.
     * @param {number} targetThickness New geometry thickness.
     * @returns {void}
     */
    static compressMesh(mesh, sourceCenterZ, targetCenterZ, targetThickness) {
        const positions = mesh?.geometry?.attributes?.position?.array
        const halfThickness = Math.max(Number(targetThickness || 0), 0) / 2

        if (!positions) {
            return
        }

        for (let index = 2; index < positions.length; index += 3) {
            positions[index] =
                Number(positions[index]) >= sourceCenterZ
                    ? targetCenterZ + halfThickness
                    : targetCenterZ - halfThickness
        }
        mesh.geometry.attributes.position.needsUpdate = true
        mesh.geometry.computeVertexNormals?.()
    }
}
