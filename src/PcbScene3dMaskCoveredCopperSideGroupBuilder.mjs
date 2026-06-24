import { PcbScene3dGeometryZCompressor } from './PcbScene3dGeometryZCompressor.mjs'

/**
 * Builds side-specific copper relief groups that sit below solder mask.
 */
export class PcbScene3dMaskCoveredCopperSideGroupBuilder {
    /**
     * Builds one side group from prepared mask-covered copper meshes.
     * @param {any} THREE Three.js namespace.
     * @param {{ trackMesh?: any | null, arcMesh?: any | null, fillMesh?: any | null, z?: number, mirrorY?: boolean }} options
     * @returns {any}
     */
    static build(
        THREE,
        {
            trackMesh = null,
            arcMesh = null,
            fillMesh = null,
            z = 0,
            mirrorY = false
        } = {}
    ) {
        const group = new THREE.Group()

        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            trackMesh,
            'mask-covered-copper-tracks',
            z
        )
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            arcMesh,
            'mask-covered-copper-arcs',
            z
        )
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            fillMesh,
            'mask-covered-copper-fills',
            z
        )

        if (mirrorY && group.children.length) {
            group.rotation.x = Math.PI
        }

        return group
    }

    /**
     * Compresses one mesh into mask relief space before adding it to a group.
     * @param {any} group Parent group.
     * @param {any | null} mesh Mesh to add.
     * @param {string} name Scene object name.
     * @param {number} z Source center Z.
     * @returns {void}
     */
    static #addCompressedMesh(group, mesh, name, z) {
        if (!mesh) {
            return
        }

        PcbScene3dGeometryZCompressor.compressMaskCoveredCopperMesh(mesh, z)
        mesh.name = name
        group.add(mesh)
    }
}
