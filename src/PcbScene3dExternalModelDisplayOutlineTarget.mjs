/**
 * Resolves display-module centering targets from component-owned outline data.
 */
export class PcbScene3dExternalModelDisplayOutlineTarget {
    static #DISPLAY_TOKEN_PATTERN =
        /(^|[^a-z0-9])(display|lcd|oled|screen|tft)([^a-z0-9]|$)/i
    static #MECHANICAL_LAYER_MIN = 57
    static #MECHANICAL_LAYER_MAX = 88
    static #MIN_OUTLINE_OFFSET_MIL = 100
    static #MIN_OUTLINE_SPAN_MIL = 200

    /**
     * Resolves a scene-local target for a display body's visible outline.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {{ x: number, y: number } | null}
     */
    static resolve(sceneDescription, placement, component) {
        return (
            PcbScene3dExternalModelDisplayOutlineTarget.resolveBounds(
                sceneDescription,
                placement,
                component
            )?.center || null
        )
    }

    /**
     * Resolves scene-local outline bounds for a display body's visible outline.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number, center: { x: number, y: number }, size: { x: number, y: number } } | null}
     */
    static resolveBounds(sceneDescription, placement, component) {
        if (
            String(placement?.projection?.source || '').toLowerCase() !==
                'pad-fallback' ||
            !PcbScene3dExternalModelDisplayOutlineTarget.#isDisplayLike(
                placement,
                component
            )
        ) {
            return null
        }

        const outline =
            PcbScene3dExternalModelDisplayOutlineTarget.#resolveOwnedOutline(
                sceneDescription,
                component
            )
        const bounds =
            PcbScene3dExternalModelDisplayOutlineTarget.#toSceneLocalBounds(
                sceneDescription,
                outline
            )
        const owner = component?.positionMil || placement?.positionMil || {}
        if (
            !bounds ||
            !PcbScene3dExternalModelDisplayOutlineTarget.#hasFinitePoint(owner)
        ) {
            return null
        }

        return Math.hypot(
            bounds.center.x - owner.x,
            bounds.center.y - owner.y
        ) >= PcbScene3dExternalModelDisplayOutlineTarget.#MIN_OUTLINE_OFFSET_MIL
            ? bounds
            : null
    }

    /**
     * Checks whether one placement/component describes a display-like module.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #isDisplayLike(placement, component) {
        const family = String(component?.body?.family || '').toLowerCase()
        if (family.includes('display')) {
            return true
        }

        return PcbScene3dExternalModelDisplayOutlineTarget.#DISPLAY_TOKEN_PATTERN.test(
            PcbScene3dExternalModelDisplayOutlineTarget.#identityText(
                placement,
                component
            )
        )
    }

    /**
     * Builds lowercase searchable identity text for one component placement.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {string}
     */
    static #identityText(placement, component) {
        return [
            component?.designator,
            component?.pattern,
            component?.source,
            component?.description,
            PcbScene3dExternalModelDisplayOutlineTarget.#parameterText(
                component?.parameters
            ),
            placement?.externalModel?.name
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
    }

    /**
     * Builds searchable text from a component parameter dictionary.
     * @param {object | null | undefined} parameters Component parameters.
     * @returns {string}
     */
    static #parameterText(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return ''
        }

        return Object.entries(parameters)
            .flatMap(([key, value]) => [key, value])
            .filter((value) => value !== null && value !== undefined)
            .join(' ')
    }

    /**
     * Finds component-owned mechanical outline bounds in board coordinates.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} component Scene component.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
     */
    static #resolveOwnedOutline(sceneDescription, component) {
        const tracks = Array.isArray(sceneDescription?.detail?.tracks)
            ? sceneDescription.detail.tracks
            : []
        const ownedTracks = tracks.filter((track) =>
            PcbScene3dExternalModelDisplayOutlineTarget.#isOwnedMechanicalTrack(
                track,
                component
            )
        )

        return PcbScene3dExternalModelDisplayOutlineTarget.#boundsOfTracks(
            ownedTracks
        )
    }

    /**
     * Checks whether one track belongs to the component's mechanical artwork.
     * @param {object | null | undefined} track Source track.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #isOwnedMechanicalTrack(track, component) {
        return (
            PcbScene3dExternalModelDisplayOutlineTarget.#matchesOwner(
                track,
                component
            ) &&
            PcbScene3dExternalModelDisplayOutlineTarget.#isMechanicalLayer(
                track
            )
        )
    }

    /**
     * Checks whether one primitive has the same component owner.
     * @param {object | null | undefined} primitive Source primitive.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #matchesOwner(primitive, component) {
        const primitiveIndex = Number(primitive?.componentIndex)
        const componentIndex = Number(component?.componentIndex)

        return (
            Number.isInteger(primitiveIndex) &&
            Number.isInteger(componentIndex) &&
            primitiveIndex === componentIndex
        )
    }

    /**
     * Checks whether a primitive is on an Altium mechanical layer.
     * @param {object | null | undefined} primitive Source primitive.
     * @returns {boolean}
     */
    static #isMechanicalLayer(primitive) {
        const layerName = String(
            primitive?.layerName || primitive?.layer || ''
        ).toLowerCase()
        if (layerName.includes('mechanical')) {
            return true
        }

        const layerCode = Number(primitive?.layerCode ?? primitive?.layerId)

        return (
            Number.isInteger(layerCode) &&
            layerCode >=
                PcbScene3dExternalModelDisplayOutlineTarget
                    .#MECHANICAL_LAYER_MIN &&
            layerCode <=
                PcbScene3dExternalModelDisplayOutlineTarget
                    .#MECHANICAL_LAYER_MAX
        )
    }

    /**
     * Computes bounding coordinates for a group of tracks.
     * @param {object[]} tracks Source tracks.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null}
     */
    static #boundsOfTracks(tracks) {
        const points = tracks.flatMap((track) => [
            { x: Number(track?.x1), y: Number(track?.y1) },
            { x: Number(track?.x2), y: Number(track?.y2) }
        ])
        const finitePoints = points.filter((point) =>
            PcbScene3dExternalModelDisplayOutlineTarget.#hasFinitePoint(point)
        )
        if (finitePoints.length < 4) {
            return null
        }

        const xs = finitePoints.map((point) => point.x)
        const ys = finitePoints.map((point) => point.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        if (
            Math.min(maxX - minX, maxY - minY) <
            PcbScene3dExternalModelDisplayOutlineTarget.#MIN_OUTLINE_SPAN_MIL
        ) {
            return null
        }

        return { minX, maxX, minY, maxY }
    }

    /**
     * Converts board-space bounds to scene-local coordinates.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number } | null} bounds Board-space bounds.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number, center: { x: number, y: number }, size: { x: number, y: number } } | null}
     */
    static #toSceneLocalBounds(sceneDescription, bounds) {
        if (
            !Number.isFinite(Number(bounds?.minX)) ||
            !Number.isFinite(Number(bounds?.maxX)) ||
            !Number.isFinite(Number(bounds?.minY)) ||
            !Number.isFinite(Number(bounds?.maxY))
        ) {
            return null
        }

        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const localBounds = {
            minX: Number(bounds.minX) - centerX,
            maxX: Number(bounds.maxX) - centerX,
            minY: Number(bounds.minY) - centerY,
            maxY: Number(bounds.maxY) - centerY
        }

        return {
            ...localBounds,
            center: {
                x: (localBounds.minX + localBounds.maxX) / 2,
                y: (localBounds.minY + localBounds.maxY) / 2
            },
            size: {
                x: localBounds.maxX - localBounds.minX,
                y: localBounds.maxY - localBounds.minY
            }
        }
    }

    /**
     * Checks whether a value has finite XY coordinates.
     * @param {object | null | undefined} point Point-like value.
     * @returns {boolean}
     */
    static #hasFinitePoint(point) {
        return (
            Number.isFinite(Number(point?.x)) &&
            Number.isFinite(Number(point?.y))
        )
    }
}
