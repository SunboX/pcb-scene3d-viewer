/**
 * Detects single embedded connector bodies whose authored source origin lands
 * on one owned drilled pad instead of the footprint center.
 */
export class PcbScene3dExternalModelPadAnchoredBodyCandidate {
    static #PAD_ANCHOR_TOLERANCE_MIL = 1
    static #CONNECTOR_IDENTITY_PATTERN =
        /(?:^|[^a-z0-9])(?:conn|connector|flex|fpc|header|jack|jtag|pinheader|pin\s*header|socket|terminal)(?:$|[^a-z0-9])/i

    /**
     * Checks whether a placement has single pad-anchored connector geometry.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static isCandidate(sceneDescription, placement) {
        const component =
            PcbScene3dExternalModelPadAnchoredBodyCandidate.#resolveComponent(
                sceneDescription,
                placement
            )

        return (
            PcbScene3dExternalModelPadAnchoredBodyCandidate.#isConnectorLikePlacement(
                placement,
                component
            ) &&
            PcbScene3dExternalModelPadAnchoredBodyCandidate.#hasOwnedPadSet(
                sceneDescription,
                component
            ) &&
            PcbScene3dExternalModelPadAnchoredBodyCandidate.#distanceToNearestOwnedPadAnchor(
                sceneDescription,
                placement,
                component
            ) <=
                PcbScene3dExternalModelPadAnchoredBodyCandidate
                    .#PAD_ANCHOR_TOLERANCE_MIL
        )
    }

    /**
     * Resolves the component that owns a placement.
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

    /**
     * Checks whether placement and owner metadata describe connector hardware.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #isConnectorLikePlacement(placement, component) {
        if (
            String(component?.body?.family || '').toLowerCase() === 'connector'
        ) {
            return true
        }

        return PcbScene3dExternalModelPadAnchoredBodyCandidate.#CONNECTOR_IDENTITY_PATTERN.test(
            [
                component?.designator,
                component?.pattern,
                component?.source,
                component?.description,
                PcbScene3dExternalModelPadAnchoredBodyCandidate.#parameterText(
                    component?.parameters
                ),
                placement?.externalModel?.name,
                placement?.externalModel?.relativePath
            ]
                .map((value) => String(value || ''))
                .join(' ')
        )
    }

    /**
     * Builds searchable text from component parameters.
     * @param {object | null | undefined} parameters Component parameters.
     * @returns {string}
     */
    static #parameterText(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return ''
        }

        return Object.values(parameters)
            .map((value) => String(value || ''))
            .join(' ')
    }

    /**
     * Checks whether the owning component has multiple physical pads.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #hasOwnedPadSet(sceneDescription, component) {
        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return false
        }

        return (
            (Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
            ).filter(
                (pad) =>
                    Number(pad?.componentIndex) === componentIndex &&
                    PcbScene3dExternalModelPadAnchoredBodyCandidate.#hasPadGeometry(
                        pad
                    )
            ).length > 1
        )
    }

    /**
     * Measures the distance from a placement anchor to owned drilled pad areas.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {number}
     */
    static #distanceToNearestOwnedPadAnchor(
        sceneDescription,
        placement,
        component
    ) {
        const componentIndex = Number(component?.componentIndex)
        const anchor = placement?.positionMil || {}
        const anchorX = Number(anchor?.x)
        const anchorY = Number(anchor?.y)
        if (
            !Number.isFinite(componentIndex) ||
            !Number.isFinite(anchorX) ||
            !Number.isFinite(anchorY)
        ) {
            return Number.POSITIVE_INFINITY
        }

        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const distances = (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        )
            .filter(
                (pad) =>
                    Number(pad?.componentIndex) === componentIndex &&
                    PcbScene3dExternalModelPadAnchoredBodyCandidate.#hasDrilledPadOpening(
                        pad
                    )
            )
            .map((pad) =>
                PcbScene3dExternalModelPadAnchoredBodyCandidate.#distanceToPadAnchor(
                    { x: anchorX, y: anchorY },
                    {
                        ...pad,
                        x: Number(pad?.x || 0) - centerX,
                        y: Number(pad?.y || 0) - centerY
                    }
                )
            )

        return distances.length
            ? Math.min(...distances)
            : Number.POSITIVE_INFINITY
    }

    /**
     * Checks whether one pad row has usable physical geometry.
     * @param {object | null | undefined} pad Pad row.
     * @returns {boolean}
     */
    static #hasPadGeometry(pad) {
        return [
            pad?.holeDiameter,
            pad?.drillDiameter,
            pad?.holeSize,
            pad?.sizeTopX,
            pad?.sizeTopY,
            pad?.sizeMidX,
            pad?.sizeMidY,
            pad?.sizeBottomX,
            pad?.sizeBottomY
        ].some((value) => Number(value || 0) > 0)
    }

    /**
     * Checks whether a pad contains a drilled or slotted board opening.
     * @param {object | null | undefined} pad Pad row.
     * @returns {boolean}
     */
    static #hasDrilledPadOpening(pad) {
        const holeGeometry = pad?.holeGeometry || {}

        return [
            pad?.holeDiameter,
            pad?.drillDiameter,
            pad?.holeSize,
            pad?.holeSlotLength,
            pad?.slotLength,
            holeGeometry?.diameter,
            holeGeometry?.length,
            holeGeometry?.slotLength
        ].some((value) => Number(value || 0) > 0)
    }

    /**
     * Measures distance from a source point to a drilled pad's anchor area.
     * @param {{ x: number, y: number }} source Source point.
     * @param {object | null | undefined} pad Scene-local pad.
     * @returns {number}
     */
    static #distanceToPadAnchor(source, pad) {
        const centerDistance = Math.hypot(
            Number(pad?.x || 0) - Number(source?.x || 0),
            Number(pad?.y || 0) - Number(source?.y || 0)
        )
        const radius =
            PcbScene3dExternalModelPadAnchoredBodyCandidate.#padAnchorRadiusMil(
                pad
            )

        return radius > 0
            ? Math.max(0, centerDistance - radius)
            : Number.POSITIVE_INFINITY
    }

    /**
     * Resolves a drilled pad's effective XY radius.
     * @param {object | null | undefined} pad Pad row.
     * @returns {number}
     */
    static #padAnchorRadiusMil(pad) {
        const holeGeometry = pad?.holeGeometry || {}
        const diameter = Math.max(
            Number(pad?.sizeTopX || 0),
            Number(pad?.sizeTopY || 0),
            Number(pad?.sizeMidX || 0),
            Number(pad?.sizeMidY || 0),
            Number(pad?.sizeBottomX || 0),
            Number(pad?.sizeBottomY || 0),
            Number(pad?.holeDiameter || 0),
            Number(pad?.drillDiameter || 0),
            Number(pad?.holeSize || 0),
            Number(pad?.holeSlotLength || 0),
            Number(pad?.slotLength || 0),
            Number(holeGeometry?.diameter || 0),
            Number(holeGeometry?.length || 0),
            Number(holeGeometry?.slotLength || 0)
        )

        return Number.isFinite(diameter) && diameter > 0 ? diameter / 2 : 0
    }
}
