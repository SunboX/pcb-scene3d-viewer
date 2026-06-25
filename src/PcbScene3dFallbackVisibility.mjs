/**
 * Manages when procedural fallback bodies should stay visible alongside
 * external 3D models.
 */
export class PcbScene3dFallbackVisibility {
    /**
     * Registers one fallback render root under a component designator.
     * @param {Map<string, Set<any>>} fallbackRoots
     * @param {string} designator
     * @param {any} rootObject
     * @returns {void}
     */
    static registerFallbackRoot(fallbackRoots, designator, rootObject) {
        if (!(fallbackRoots instanceof Map) || !rootObject) {
            return
        }

        const normalizedDesignator = String(designator || '').trim()
        if (!normalizedDesignator) {
            return
        }

        if (!fallbackRoots.has(normalizedDesignator)) {
            fallbackRoots.set(normalizedDesignator, new Set())
        }

        fallbackRoots.get(normalizedDesignator)?.add(rootObject)
    }

    /**
     * Marks one designator as having a successfully loaded external model.
     * @param {Set<string>} loadedDesignators
     * @param {string} designator
     * @returns {void}
     */
    static markExternalModelLoaded(loadedDesignators, designator) {
        PcbScene3dFallbackVisibility.markDesignatorRepresented(
            loadedDesignators,
            designator
        )
    }

    /**
     * Marks one designator as already represented by non-fallback geometry.
     * @param {Set<string>} loadedDesignators
     * @param {string} designator
     * @returns {void}
     */
    static markDesignatorRepresented(loadedDesignators, designator) {
        if (!(loadedDesignators instanceof Set)) {
            return
        }

        const normalizedDesignator = String(designator || '').trim()
        if (!normalizedDesignator) {
            return
        }

        loadedDesignators.add(normalizedDesignator)
    }

    /**
     * Applies the current visibility policy to all registered fallback roots.
     * Fallbacks stay visible when their toggle is enabled and either no
     * external model loaded for that designator or external models are hidden.
     * @param {Map<string, Set<any>>} fallbackRoots
     * @param {Set<string>} loadedDesignators
     * @param {{ 'fallback-bodies'?: boolean, 'external-models'?: boolean }} toggles
     * @returns {void}
     */
    static applyVisibility(fallbackRoots, loadedDesignators, toggles) {
        if (!(fallbackRoots instanceof Map)) {
            return
        }

        const showFallbackBodies = Boolean(toggles?.['fallback-bodies'])
        const showExternalModels = Boolean(toggles?.['external-models'])

        fallbackRoots.forEach((roots, designator) => {
            const hideForLoadedExternal =
                showExternalModels &&
                loadedDesignators instanceof Set &&
                loadedDesignators.has(String(designator || '').trim())

            roots?.forEach?.((rootObject) => {
                if (!rootObject) {
                    return
                }

                const stitchedCompanion =
                    PcbScene3dFallbackVisibility.shouldKeepExternalCompanion(
                        rootObject,
                        toggles
                    )
                rootObject.visible =
                    showFallbackBodies &&
                    (stitchedCompanion || !hideForLoadedExternal)
            })
        })
    }

    /**
     * Checks whether one fallback body is a stitched external-model companion
     * under the active toggles.
     * @param {any} rootObject Fallback root object.
     * @param {{ 'external-models'?: boolean }} toggles Detail toggles.
     * @returns {boolean}
     */
    static shouldKeepExternalCompanion(rootObject, toggles) {
        return (
            Boolean(toggles?.['external-models']) &&
            PcbScene3dFallbackVisibility.#isExternalCompanion(rootObject)
        )
    }

    /**
     * Checks whether a fallback body is part of a stitched external model.
     * @param {any} rootObject Fallback root object.
     * @returns {boolean}
     */
    static #isExternalCompanion(rootObject) {
        return Boolean(rootObject?.userData?.scene3dFallbackExternalCompanion)
    }
}
