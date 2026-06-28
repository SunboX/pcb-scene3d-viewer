import { PcbScene3dExternalModelCenteringPolicy } from './PcbScene3dExternalModelCenteringPolicy.mjs'
import { PcbScene3dExternalModelDisplayOutlineTarget } from './PcbScene3dExternalModelDisplayOutlineTarget.mjs'
import { PcbScene3dExternalModelExactOwnerAnchor } from './PcbScene3dExternalModelExactOwnerAnchor.mjs'

/**
 * Repairs pad-fallback model centers after external model loading.
 */
export class PcbScene3dExternalModelPadFallbackCenterRepair {
    static #MIN_CENTER_ERROR_MIL = 1

    /**
     * Re-centers pad-fallback models on their resolved owner target.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, sceneDescription, placement, placementGroup) {
        const component =
            PcbScene3dExternalModelPadFallbackCenterRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        if (
            !component ||
            !placementGroup?.position ||
            placementGroup?.userData
                ?.scene3dOwnerAnchoredConnectorContactRowRepair ||
            !PcbScene3dExternalModelCenteringPolicy.shouldCenterOnOwner(
                placement
            ) ||
            !THREE?.Box3
        ) {
            return
        }

        const outlineBounds =
            PcbScene3dExternalModelDisplayOutlineTarget.resolveBounds(
                sceneDescription,
                placement,
                component
            )
        const outlineTarget = outlineBounds?.center || null
        if (
            !outlineTarget &&
            PcbScene3dExternalModelExactOwnerAnchor.matches(
                placement,
                component
            )
        ) {
            return
        }

        placementGroup.parent?.updateWorldMatrix?.(true, false)
        placementGroup.updateMatrixWorld?.(true)
        let bounds = new THREE.Box3().setFromObject(placementGroup)
        if (bounds.isEmpty()) {
            return
        }
        if (
            PcbScene3dExternalModelPadFallbackCenterRepair.#rotateToOutlineAspect(
                THREE,
                placementGroup,
                bounds,
                outlineBounds
            )
        ) {
            bounds = new THREE.Box3().setFromObject(placementGroup)
        }

        const center =
            PcbScene3dExternalModelPadFallbackCenterRepair.#toParentFrame(
                THREE,
                bounds.getCenter(new THREE.Vector3()),
                placementGroup
            )
        const target = outlineTarget || component.positionMil || {}
        const dx = Number(target.x || 0) - center.x
        const dy = Number(target.y || 0) - center.y
        if (
            Math.hypot(dx, dy) <
            PcbScene3dExternalModelPadFallbackCenterRepair.#MIN_CENTER_ERROR_MIL
        ) {
            return
        }

        placementGroup.position.x += dx
        placementGroup.position.y += dy
        placementGroup.userData.scene3dPadFallbackCenterRepair = true
        placementGroup.updateMatrixWorld?.(true)
    }

    /**
     * Rotates a display body when its loaded aspect is swapped against outline.
     * @param {any} THREE Three.js namespace.
     * @param {any} placementGroup Rendered placement root.
     * @param {any} bounds Current placement bounds.
     * @param {{ size?: { x?: number, y?: number } } | null | undefined} outlineBounds Scene-local outline bounds.
     * @returns {boolean}
     */
    static #rotateToOutlineAspect(
        THREE,
        placementGroup,
        bounds,
        outlineBounds
    ) {
        if (
            !outlineBounds ||
            !placementGroup?.rotation ||
            !PcbScene3dExternalModelPadFallbackCenterRepair.#hasSwappedAspect(
                THREE,
                bounds,
                outlineBounds
            )
        ) {
            return false
        }

        placementGroup.rotation.z -= Math.PI / 2
        placementGroup.userData.scene3dPadFallbackOutlineYawRepair = true
        placementGroup.updateMatrixWorld?.(true)
        return true
    }

    /**
     * Checks whether model and outline dominant axes are perpendicular.
     * @param {any} THREE Three.js namespace.
     * @param {any} bounds Current placement bounds.
     * @param {{ size?: { x?: number, y?: number } }} outlineBounds Scene-local outline bounds.
     * @returns {boolean}
     */
    static #hasSwappedAspect(THREE, bounds, outlineBounds) {
        if (!THREE?.Vector3 || !bounds || !outlineBounds?.size) {
            return false
        }

        const size = bounds.getSize(new THREE.Vector3())
        const modelAxis =
            PcbScene3dExternalModelPadFallbackCenterRepair.#dominantAxis(
                size.x,
                size.y
            )
        const outlineAxis =
            PcbScene3dExternalModelPadFallbackCenterRepair.#dominantAxis(
                Number(outlineBounds.size.x || 0),
                Number(outlineBounds.size.y || 0)
            )

        return Boolean(modelAxis && outlineAxis && modelAxis !== outlineAxis)
    }

    /**
     * Resolves a strong XY dominant axis.
     * @param {number} x X span.
     * @param {number} y Y span.
     * @returns {'x' | 'y' | null}
     */
    static #dominantAxis(x, y) {
        const absX = Math.abs(Number(x || 0))
        const absY = Math.abs(Number(y || 0))
        const max = Math.max(absX, absY)
        const min = Math.min(absX, absY)
        if (!Number.isFinite(max) || min <= 0 || max / min < 1.1) {
            return null
        }

        return absX >= absY ? 'x' : 'y'
    }

    /**
     * Converts a world-space point into the placement parent frame.
     * @param {any} THREE Three.js namespace.
     * @param {any} center World-space center.
     * @param {any} placementGroup Rendered placement root.
     * @returns {any}
     */
    static #toParentFrame(THREE, center, placementGroup) {
        const parent = placementGroup?.parent
        if (!THREE?.Matrix4 || !parent?.matrixWorld) {
            return center
        }

        return center.applyMatrix4(
            new THREE.Matrix4().copy(parent.matrixWorld).invert()
        )
    }

    /**
     * Finds the scene component for one external placement.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {object | null}
     */
    static #resolveComponent(sceneDescription, placement) {
        const designator = String(placement?.designator || '').trim()
        if (!designator || !Array.isArray(sceneDescription?.components)) {
            return null
        }

        return (
            sceneDescription.components.find(
                (component) =>
                    String(component?.designator || '').trim() === designator
            ) || null
        )
    }
}
