/**
 * Builds lookup indexes for 3D scene selections.
 */
export class PcbScene3dSelectionIndexBuilder {
    /**
     * Builds one selected-key inspector lookup from the scene description.
     * @param {{ components?: any[], externalPlacements?: any[], staticBodyPlacements?: any[] }} sceneDescription Scene data.
     * @returns {Map<string, { component: any | null, externalPlacement: any | null, staticBodyPlacement: any | null }>}
     */
    static build(sceneDescription) {
        const index = new Map()
        const components = Array.isArray(sceneDescription?.components)
            ? sceneDescription.components
            : []
        const externalPlacements = Array.isArray(
            sceneDescription?.externalPlacements
        )
            ? sceneDescription.externalPlacements
            : []
        const staticBodyPlacements = Array.isArray(
            sceneDescription?.staticBodyPlacements
        )
            ? sceneDescription.staticBodyPlacements
            : []

        components.forEach((component) => {
            const designator = String(component?.designator || '').trim()
            if (!designator) {
                return
            }

            index.set(designator, {
                component,
                externalPlacement:
                    index.get(designator)?.externalPlacement || null,
                staticBodyPlacement:
                    index.get(designator)?.staticBodyPlacement || null
            })
        })

        externalPlacements.forEach((externalPlacement) => {
            const designator = String(
                externalPlacement?.designator || ''
            ).trim()
            if (!designator) {
                return
            }

            index.set(designator, {
                component: index.get(designator)?.component || null,
                externalPlacement,
                staticBodyPlacement:
                    index.get(designator)?.staticBodyPlacement || null
            })
        })

        staticBodyPlacements.forEach((staticBodyPlacement) => {
            const selectionKey =
                PcbScene3dSelectionIndexBuilder.#resolveStaticBodySelectionKey(
                    staticBodyPlacement
                )
            if (!selectionKey) {
                return
            }

            index.set(selectionKey, {
                component: index.get(selectionKey)?.component || null,
                externalPlacement:
                    index.get(selectionKey)?.externalPlacement || null,
                staticBodyPlacement
            })
        })

        return index
    }

    /**
     * Resolves the selectable key for one static body placement.
     * @param {{ designator?: string, selectionKey?: string }} placement Static body placement.
     * @returns {string}
     */
    static #resolveStaticBodySelectionKey(placement) {
        return String(
            placement?.selectionKey || placement?.designator || ''
        ).trim()
    }
}
