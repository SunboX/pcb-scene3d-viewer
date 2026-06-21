/**
 * Applies per-component hidden state on top of existing 3D visibility toggles.
 */
export class PcbScene3dComponentVisibility {
    /**
     * Stores one component hidden state.
     * @param {Set<string>} hiddenDesignators Hidden designator set.
     * @param {string} designator Component designator.
     * @param {boolean} hidden Whether the component should be hidden.
     * @returns {boolean}
     */
    static setHidden(hiddenDesignators, designator, hidden) {
        if (!(hiddenDesignators instanceof Set)) {
            return false
        }

        const normalizedDesignator =
            PcbScene3dComponentVisibility.#normalizeDesignator(designator)
        if (!normalizedDesignator) {
            return false
        }

        const wasHidden = hiddenDesignators.has(normalizedDesignator)
        if (hidden) {
            hiddenDesignators.add(normalizedDesignator)
        } else {
            hiddenDesignators.delete(normalizedDesignator)
        }
        return wasHidden !== hiddenDesignators.has(normalizedDesignator)
    }

    /**
     * Checks whether one component is hidden.
     * @param {Set<string>} hiddenDesignators Hidden designator set.
     * @param {string} designator Component designator.
     * @returns {boolean}
     */
    static isHidden(hiddenDesignators, designator) {
        return (
            hiddenDesignators instanceof Set &&
            hiddenDesignators.has(
                PcbScene3dComponentVisibility.#normalizeDesignator(designator)
            )
        )
    }

    /**
     * Applies component visibility to all selectable render roots.
     * @param {{ selectionRoots?: Map<string, Set<any>>, hiddenDesignators?: Set<string>, fallbackBodyRoots?: Map<string, Set<any>>, loadedExternalModelDesignators?: Set<string>, modelSearchExternalModelRoots?: Set<any>, toggles?: { 'external-models'?: boolean, 'fallback-bodies'?: boolean, 'model-search-models'?: boolean }, hasLoadedBoardAssemblyModel?: boolean }} state Visibility state.
     * @returns {void}
     */
    static apply(state) {
        const selectionRoots = state?.selectionRoots
        if (!(selectionRoots instanceof Map)) {
            return
        }

        selectionRoots.forEach((roots, designator) => {
            roots?.forEach?.((rootObject) => {
                if (!rootObject) {
                    return
                }

                rootObject.visible =
                    !PcbScene3dComponentVisibility.isHidden(
                        state?.hiddenDesignators,
                        designator
                    ) &&
                    PcbScene3dComponentVisibility.#resolveRootVisible(
                        state,
                        designator,
                        rootObject
                    )
            })
        })
    }

    /**
     * Resolves root-level visibility before selected-component hiding.
     * @param {{ fallbackBodyRoots?: Map<string, Set<any>>, loadedExternalModelDesignators?: Set<string>, modelSearchExternalModelRoots?: Set<any>, toggles?: { 'external-models'?: boolean, 'fallback-bodies'?: boolean, 'model-search-models'?: boolean }, hasLoadedBoardAssemblyModel?: boolean }} state Visibility state.
     * @param {string} designator Component designator.
     * @param {any} rootObject Render root.
     * @returns {boolean}
     */
    static #resolveRootVisible(state, designator, rootObject) {
        if (
            PcbScene3dComponentVisibility.#isFallbackRoot(
                state?.fallbackBodyRoots,
                designator,
                rootObject
            )
        ) {
            return PcbScene3dComponentVisibility.#resolveFallbackVisible(
                state,
                designator
            )
        }

        if (state?.modelSearchExternalModelRoots?.has?.(rootObject)) {
            return (
                Boolean(state?.toggles?.['external-models']) &&
                state?.toggles?.['model-search-models'] !== false
            )
        }

        return true
    }

    /**
     * Resolves fallback root visibility from current detail toggles.
     * @param {{ loadedExternalModelDesignators?: Set<string>, toggles?: { 'external-models'?: boolean, 'fallback-bodies'?: boolean }, hasLoadedBoardAssemblyModel?: boolean }} state Visibility state.
     * @param {string} designator Component designator.
     * @returns {boolean}
     */
    static #resolveFallbackVisible(state, designator) {
        const boardAssemblyActive =
            Boolean(state?.hasLoadedBoardAssemblyModel) &&
            Boolean(state?.toggles?.['external-models'])
        const showFallbackBodies =
            Boolean(state?.toggles?.['fallback-bodies']) && !boardAssemblyActive
        const hideForLoadedExternal =
            Boolean(state?.toggles?.['external-models']) &&
            state?.loadedExternalModelDesignators?.has?.(
                PcbScene3dComponentVisibility.#normalizeDesignator(designator)
            )

        return showFallbackBodies && !hideForLoadedExternal
    }

    /**
     * Checks whether a root belongs to fallback-body tracking.
     * @param {Map<string, Set<any>> | undefined} fallbackBodyRoots Fallback roots.
     * @param {string} designator Component designator.
     * @param {any} rootObject Render root.
     * @returns {boolean}
     */
    static #isFallbackRoot(fallbackBodyRoots, designator, rootObject) {
        if (!(fallbackBodyRoots instanceof Map)) {
            return false
        }

        return Boolean(
            fallbackBodyRoots
                .get(
                    PcbScene3dComponentVisibility.#normalizeDesignator(
                        designator
                    )
                )
                ?.has?.(rootObject)
        )
    }

    /**
     * Normalizes component designator keys.
     * @param {string} designator Raw designator.
     * @returns {string}
     */
    static #normalizeDesignator(designator) {
        return String(designator || '').trim()
    }
}
