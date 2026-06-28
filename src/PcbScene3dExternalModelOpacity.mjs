import { PcbScene3dTransparentMeshSplitter } from './PcbScene3dTransparentMeshSplitter.mjs'
import { PcbScene3dTransparentMountFaceCuller } from './PcbScene3dTransparentMountFaceCuller.mjs'

/**
 * Applies source-authored display opacity to loaded external model materials.
 */
export class PcbScene3dExternalModelOpacity {
    /**
     * Applies source-authored placement opacity to every material below a
     * loaded external model.
     * @param {any} THREE Three.js namespace.
     * @param {{ bodyOpacity?: number | string } | null | undefined} placement Placement metadata.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, placement, placementGroup) {
        const opacity = Number(placement?.bodyOpacity)
        if (!Number.isFinite(opacity) || opacity < 0 || opacity >= 1) {
            return
        }

        const clampedOpacity = Math.max(0, Math.min(1, opacity))
        PcbScene3dExternalModelOpacity.#visitMaterials(
            placementGroup,
            (material) => {
                material.transparent = true
                material.opacity = clampedOpacity
                material.depthWrite = false
                material.needsUpdate = true
            }
        )
        PcbScene3dTransparentMeshSplitter.split(THREE, placementGroup)
        PcbScene3dTransparentMountFaceCuller.apply(
            THREE,
            placement,
            placementGroup
        )
    }

    /**
     * Visits material instances below one object tree.
     * @param {any} rootObject Root object.
     * @param {(material: any) => void} visitor Material visitor.
     * @returns {void}
     */
    static #visitMaterials(rootObject, visitor) {
        rootObject?.traverse?.((object) => {
            const materials = Array.isArray(object?.material)
                ? object.material
                : object?.material
                  ? [object.material]
                  : []

            materials.filter(Boolean).forEach((material) => visitor(material))
        })
    }
}
