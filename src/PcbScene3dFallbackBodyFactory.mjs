import { PcbScene3dBodyColor } from './PcbScene3dBodyColor.mjs'
import { PcbScene3dComponentAdjustment } from './PcbScene3dComponentAdjustment.mjs'
import { PcbScene3dMountRig } from './PcbScene3dMountRig.mjs'

/**
 * Builds procedural fallback body render roots for PCB components.
 */
export class PcbScene3dFallbackBodyFactory {
    /**
     * Builds one procedural fallback body root.
     * @param {any} THREE Three.js namespace.
     * @param {{ designator?: string, positionMil: { x: number, y: number, z: number }, rotationDeg: number, mountSide: string, body: { family: string, sizeMil: { width: number, depth: number, height: number } } }} component Component scene entry.
     * @param {{ companionBase?: boolean }} [options] Rendering options.
     * @returns {{ rootGroup: any, adjustmentGroup: any }}
     */
    static build(THREE, component, options = {}) {
        const family = component.body.family
        const size = component.body.sizeMil
        const material = new THREE.MeshStandardMaterial({
            color: PcbScene3dFallbackBodyFactory.#resolveColor(family, options),
            roughness: 0.72,
            metalness: family === 'chip' ? 0.12 : 0.08
        })
        const mesh = PcbScene3dFallbackBodyFactory.#buildMesh(
            THREE,
            family,
            size,
            material
        )
        const mountRig = PcbScene3dMountRig.create(THREE, component)
        const adjustmentGroup =
            PcbScene3dFallbackBodyFactory.#buildAdjustmentGroup(
                THREE,
                component
            )

        mountRig.rootGroup.userData.scene3dSelection = {
            designator: String(component?.designator || 'component'),
            sourceType: 'component'
        }
        adjustmentGroup.add(mesh)
        mountRig.faceGroup.add(adjustmentGroup)

        return {
            rootGroup: mountRig.rootGroup,
            adjustmentGroup
        }
    }

    /**
     * Resolves the fallback body color.
     * @param {string} family Package family.
     * @param {{ companionBase?: boolean }} options Rendering options.
     * @returns {number}
     */
    static #resolveColor(family, options) {
        return options?.companionBase
            ? 0x808080
            : PcbScene3dBodyColor.resolve(family)
    }

    /**
     * Builds the body mesh for one package family.
     * @param {any} THREE Three.js namespace.
     * @param {string} family Package family.
     * @param {{ width: number, depth: number, height: number }} size Body size.
     * @param {any} material Mesh material.
     * @returns {any}
     */
    static #buildMesh(THREE, family, size, material) {
        if (family === 'radial-capacitor' || family === 'test-point') {
            return new THREE.Mesh(
                new THREE.CylinderGeometry(
                    size.width / 2,
                    size.width / 2,
                    size.height,
                    28
                ),
                material
            )
        }

        return new THREE.Mesh(
            new THREE.BoxGeometry(size.width, size.depth, size.height),
            material
        )
    }

    /**
     * Builds the transform node used by live component adjustments.
     * @param {any} THREE Three.js namespace.
     * @param {{ designator?: string }} component Component scene entry.
     * @returns {any}
     */
    static #buildAdjustmentGroup(THREE, component) {
        const adjustmentGroup = new THREE.Group()
        adjustmentGroup.userData.scene3dAdjustmentTarget = true
        adjustmentGroup.userData.scene3dAdjustmentDesignator = String(
            component?.designator || 'component'
        )
        adjustmentGroup.userData.scene3dAdjustmentBaseline =
            PcbScene3dComponentAdjustment.neutral()
        return adjustmentGroup
    }
}
