/**
 * Centralizes PCB surface finish values for Three.js materials.
 */
export class PcbScene3dMaterialFinish {
    static #DIELECTRIC_METALNESS = 0
    static #GLOSSY_SILKSCREEN_ROUGHNESS = 0.18
    static #SEMI_MATTE_SOLDER_MASK_ROUGHNESS = 0.56

    /**
     * Builds glossy non-metal material properties for silkscreen ink.
     * @returns {{ roughness: number, metalness: number }}
     */
    static glossySilkscreenProperties() {
        return {
            roughness: PcbScene3dMaterialFinish.#GLOSSY_SILKSCREEN_ROUGHNESS,
            metalness: PcbScene3dMaterialFinish.#DIELECTRIC_METALNESS
        }
    }

    /**
     * Builds semi-matte non-metal material properties for solder mask.
     * @returns {{ roughness: number, metalness: number }}
     */
    static semiMatteSolderMaskProperties() {
        return {
            roughness:
                PcbScene3dMaterialFinish.#SEMI_MATTE_SOLDER_MASK_ROUGHNESS,
            metalness: PcbScene3dMaterialFinish.#DIELECTRIC_METALNESS
        }
    }

    /**
     * Applies the semi-matte solder-mask finish to one material or list.
     * @param {any | any[]} material Material or material list.
     * @returns {void}
     */
    static applySemiMatteSolderMask(material) {
        const properties =
            PcbScene3dMaterialFinish.semiMatteSolderMaskProperties()

        ;(Array.isArray(material) ? material : [material])
            .filter(Boolean)
            .forEach((entry) => {
                entry.roughness = properties.roughness
                entry.metalness = properties.metalness
                entry.needsUpdate = true
            })
    }
}
