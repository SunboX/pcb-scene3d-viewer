import { PcbScene3dBoardMaterialPalette } from './PcbScene3dBoardMaterialPalette.mjs'
import { PcbScene3dCopperDetailFilter } from './PcbScene3dCopperDetailFilter.mjs'
import { PcbScene3dCopperFactory } from './PcbScene3dCopperFactory.mjs'
import { PcbScene3dViaFactory } from './PcbScene3dViaFactory.mjs'

/**
 * Builds deferred copper-detail groups for the 3D runtime.
 */
export class PcbScene3dCopperDetailGroupBuilder {
    /**
     * Builds visible exposed and mask-covered copper detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static build(THREE, sceneDescription, topZ, normalizePoint) {
        const group = new THREE.Group()
        const coveredGroup =
            PcbScene3dCopperDetailGroupBuilder.#buildCoveredGroup(
                THREE,
                sceneDescription,
                topZ,
                normalizePoint
            )
        const exposedGroup =
            PcbScene3dCopperDetailGroupBuilder.#buildExposedGroup(
                THREE,
                sceneDescription,
                topZ,
                normalizePoint
            )
        const viaGroup = PcbScene3dCopperDetailGroupBuilder.#buildViaGroup(
            THREE,
            sceneDescription,
            normalizePoint
        )

        ;[coveredGroup, exposedGroup, viaGroup]
            .filter((child) => child.children.length)
            .forEach((child) => group.add(child))

        return group
    }

    /**
     * Builds traces covered by solder mask.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static #buildCoveredGroup(THREE, sceneDescription, topZ, normalizePoint) {
        return PcbScene3dCopperFactory.buildMaskCoveredGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolveCoveredByMask(sceneDescription),
            topZ,
            -topZ,
            normalizePoint,
            {
                solderMaskColor:
                    PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
                        sceneDescription?.board,
                        {
                            hasBoardAssemblyModel: Boolean(
                                sceneDescription?.boardAssemblyModel
                            )
                        }
                    )
            }
        )
    }

    /**
     * Builds exposed copper detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static #buildExposedGroup(THREE, sceneDescription, topZ, normalizePoint) {
        return PcbScene3dCopperFactory.buildGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolve(sceneDescription),
            topZ,
            -topZ,
            normalizePoint,
            { coordinateSystem: sceneDescription?.coordinateSystem }
        )
    }

    /**
     * Builds exposed via and through-hole barrel detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static #buildViaGroup(THREE, sceneDescription, normalizePoint) {
        if (
            !PcbScene3dCopperDetailFilter.shouldRenderStandaloneVias(
                sceneDescription
            )
        ) {
            return new THREE.Group()
        }

        return PcbScene3dViaFactory.buildGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolveStandaloneVias(
                sceneDescription
            ),
            sceneDescription?.board?.thicknessMil,
            normalizePoint
        )
    }
}
