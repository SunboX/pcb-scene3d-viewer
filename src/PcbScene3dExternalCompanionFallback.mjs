/**
 * Detects fallback bodies that should remain visible as companions for partial
 * external model placements.
 */
export class PcbScene3dExternalCompanionFallback {
    /**
     * Checks whether a component fallback body should remain visible as the
     * package companion for a partial embedded external model.
     * @param {{ externalPlacements?: object[], staticBodyPlacements?: object[] }} sceneDescription Scene data.
     * @param {{ designator?: string, mountSide?: string, positionMil?: { x?: number, y?: number }, body?: { sizeMil?: { width?: number, depth?: number } } }} component Component scene entry.
     * @returns {boolean}
     */
    static shouldKeepFallback(sceneDescription, component) {
        const designator =
            PcbScene3dExternalCompanionFallback.#normalizedDesignator(
                component?.designator
            )
        if (!designator) {
            return false
        }

        if (
            PcbScene3dExternalCompanionFallback.#hasAuthoredCompanionBase(
                sceneDescription,
                component
            )
        ) {
            return false
        }

        return PcbScene3dExternalCompanionFallback.#externalPlacements(
            sceneDescription
        ).some(
            (placement) =>
                PcbScene3dExternalCompanionFallback.#normalizedDesignator(
                    placement?.designator
                ) === designator &&
                PcbScene3dExternalCompanionFallback.#isPartialEmbeddedPlacement(
                    placement
                )
        )
    }

    /**
     * Checks whether an authored static body already provides the package base
     * for one partial embedded placement.
     * @param {{ staticBodyPlacements?: object[] }} sceneDescription Scene data.
     * @param {{ mountSide?: string, positionMil?: { x?: number, y?: number }, body?: { sizeMil?: { width?: number, depth?: number } } }} component Component scene entry.
     * @returns {boolean}
     */
    static #hasAuthoredCompanionBase(sceneDescription, component) {
        return PcbScene3dExternalCompanionFallback.#staticBodyPlacements(
            sceneDescription
        ).some(
            (placement) =>
                PcbScene3dExternalCompanionFallback.#isSameSide(
                    placement,
                    component
                ) &&
                PcbScene3dExternalCompanionFallback.#isRenderableBase(
                    placement
                ) &&
                PcbScene3dExternalCompanionFallback.#isNearComponent(
                    placement,
                    component
                )
        )
    }

    /**
     * Resolves normalized external placements from one scene description.
     * @param {{ externalPlacements?: object[] }} sceneDescription Scene data.
     * @returns {object[]}
     */
    static #externalPlacements(sceneDescription) {
        return Array.isArray(sceneDescription?.externalPlacements)
            ? sceneDescription.externalPlacements
            : []
    }

    /**
     * Resolves normalized static body placements from one scene description.
     * @param {{ staticBodyPlacements?: object[] }} sceneDescription Scene data.
     * @returns {object[]}
     */
    static #staticBodyPlacements(sceneDescription) {
        return Array.isArray(sceneDescription?.staticBodyPlacements)
            ? sceneDescription.staticBodyPlacements
            : []
    }

    /**
     * Checks whether a placement and component share a board side.
     * @param {object} placement Static body placement.
     * @param {object} component Scene component.
     * @returns {boolean}
     */
    static #isSameSide(placement, component) {
        return (
            String(placement?.mountSide || 'top').toLowerCase() ===
            String(component?.mountSide || 'top').toLowerCase()
        )
    }

    /**
     * Checks whether one static body can act as a package base.
     * @param {object} placement Static body placement.
     * @returns {boolean}
     */
    static #isRenderableBase(placement) {
        const geometry = placement?.geometry || {}
        return (
            String(geometry?.kind || '').toLowerCase() === 'extruded-polygon' &&
            PcbScene3dExternalCompanionFallback.#geometrySpan(geometry).width >
                0 &&
            PcbScene3dExternalCompanionFallback.#geometrySpan(geometry).depth >
                0
        )
    }

    /**
     * Checks whether one authored base is close enough to own a component base.
     * @param {object} placement Static body placement.
     * @param {object} component Scene component.
     * @returns {boolean}
     */
    static #isNearComponent(placement, component) {
        const span = PcbScene3dExternalCompanionFallback.#geometrySpan(
            placement?.geometry
        )
        const componentSize = component?.body?.sizeMil || {}
        const threshold = Math.max(
            30,
            Number(span.width || 0) / 2,
            Number(span.depth || 0) / 2,
            Number(componentSize.width || 0) / 2,
            Number(componentSize.depth || 0) / 2
        )
        const dx =
            Number(placement?.positionMil?.x || 0) -
            Number(component?.positionMil?.x || 0)
        const dy =
            Number(placement?.positionMil?.y || 0) -
            Number(component?.positionMil?.y || 0)

        return Math.hypot(dx, dy) <= threshold
    }

    /**
     * Resolves width and depth for one polygon geometry.
     * @param {{ verticesMil?: { x?: number, y?: number }[] } | undefined} geometry Static geometry.
     * @returns {{ width: number, depth: number }}
     */
    static #geometrySpan(geometry) {
        const vertices = Array.isArray(geometry?.verticesMil)
            ? geometry.verticesMil
            : []
        if (vertices.length < 3) {
            return { width: 0, depth: 0 }
        }

        const xs = vertices.map((vertex) => Number(vertex?.x || 0))
        const ys = vertices.map((vertex) => Number(vertex?.y || 0))

        return {
            width: Math.max(...xs) - Math.min(...xs),
            depth: Math.max(...ys) - Math.min(...ys)
        }
    }

    /**
     * Checks for embedded external placements that represent a sub-body, not a
     * complete replacement for the procedural component body.
     * @param {object} placement External model placement.
     * @returns {boolean}
     */
    static #isPartialEmbeddedPlacement(placement) {
        const projection = placement?.projection || {}
        const bounds = projection?.boundsMil || {}

        return (
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            String(projection?.source || '').toLowerCase() ===
                'model-anchor-fallback' &&
            Math.max(
                Number(bounds.width || 0),
                Number(bounds.depth || 0),
                Number(bounds.height || 0)
            ) <= 0
        )
    }

    /**
     * Normalizes one designator for component/external placement matching.
     * @param {unknown} designator Candidate designator.
     * @returns {string}
     */
    static #normalizedDesignator(designator) {
        return String(designator || '').trim()
    }
}
