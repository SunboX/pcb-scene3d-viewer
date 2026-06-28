import { PcbScene3dExternalModelPadAnchoredBodyCandidate } from './PcbScene3dExternalModelPadAnchoredBodyCandidate.mjs'
import { PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair } from './PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.mjs'

/**
 * Centers repeated model-bounds placements as one authored body group.
 */
export class PcbScene3dExternalModelRepeatedBoundsCenterRepair {
    static #MIN_SHIFT_MIL = 1
    static #PAD_ANCHOR_TOLERANCE_MIL = 1

    /**
     * Re-centers one repeated model-bounds placement group on its owner pads.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, sceneDescription, placement, placementGroup) {
        PcbScene3dExternalModelRepeatedBoundsCenterRepair.#repairSameOwnerBodyGroup(
            THREE,
            sceneDescription,
            placement,
            placementGroup
        )
        PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.apply(
            THREE,
            sceneDescription,
            placement,
            placementGroup
        )
    }

    /**
     * Re-centers repeated model-bounds bodies that belong to one owner.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #repairSameOwnerBodyGroup(
        THREE,
        sceneDescription,
        placement,
        placementGroup
    ) {
        const modelGroup =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#findAdjustmentModelGroup(
                placementGroup
            )
        const sourceBounds =
            modelGroup?.userData?.scene3dSourceBoundsMil || null
        if (
            !placementGroup?.position ||
            !PcbScene3dExternalModelRepeatedBoundsCenterRepair.#isCandidate(
                sceneDescription,
                placement,
                sourceBounds
            ) ||
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#hasRepeatedOwnedDrilledPadAnchors(
                sceneDescription,
                placement
            )
        ) {
            return
        }

        const centeringPlacements =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#centeringPlacements(
                sceneDescription,
                placement,
                sourceBounds
            )
        const component =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        const padCenter =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#ownedPadCenter(
                sceneDescription,
                component
            )
        if (!centeringPlacements.length || !padCenter) {
            return
        }

        const anchorCenter =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#placementAnchorCenter(
                centeringPlacements
            )
        const currentCenter =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#currentBodyGroupCenter(
                THREE,
                placementGroup,
                placement,
                sourceBounds,
                anchorCenter,
                centeringPlacements
            )
        if (!currentCenter) {
            return
        }

        const dx = padCenter.x - currentCenter.x
        const dy = padCenter.y - currentCenter.y
        const shiftDistance = Math.hypot(dx, dy)
        const maxReasonableShift =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#maxReasonableShift(
                sourceBounds
            )

        if (
            shiftDistance <
                PcbScene3dExternalModelRepeatedBoundsCenterRepair
                    .#MIN_SHIFT_MIL ||
            shiftDistance > maxReasonableShift ||
            Math.hypot(
                padCenter.x - anchorCenter.x,
                padCenter.y - anchorCenter.y
            ) > maxReasonableShift
        ) {
            return
        }

        placementGroup.position.x += dx
        placementGroup.position.y += dy
        placementGroup.userData.scene3dRepeatedModelBoundsCenterRepair = true
        placementGroup.userData.scene3dRepeatedModelBoundsCenterOffsetMil = {
            x: dx,
            y: dy
        }
        placementGroup.updateMatrixWorld?.(true)
    }

    /**
     * Resolves the center that should be aligned to the owner pad center.
     * @param {any} THREE Three.js namespace.
     * @param {any} placementGroup Rendered placement root.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} sourceBounds Loaded source bounds in mil.
     * @param {{ x: number, y: number }} anchorCenter Center of placement anchors.
     * @param {object[]} centeringPlacements Placements being centered together.
     * @returns {{ x: number, y: number } | null}
     */
    static #currentBodyGroupCenter(
        THREE,
        placementGroup,
        placement,
        sourceBounds,
        anchorCenter,
        centeringPlacements
    ) {
        if (centeringPlacements.length === 1) {
            const renderedCenter =
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#renderedPlacementCenter(
                    THREE,
                    placementGroup
                )
            if (renderedCenter) {
                return renderedCenter
            }
        }

        const sourceCenter =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#transformedSourceCenter(
                placement,
                sourceBounds
            )

        return sourceCenter
            ? {
                  x: anchorCenter.x + sourceCenter.x,
                  y: anchorCenter.y + sourceCenter.y
              }
            : null
    }

    /**
     * Measures a rendered placement center in its parent coordinate frame.
     * @param {any} THREE Three.js namespace.
     * @param {any} placementGroup Rendered placement root.
     * @returns {{ x: number, y: number } | null}
     */
    static #renderedPlacementCenter(THREE, placementGroup) {
        if (!THREE?.Box3 || !THREE?.Vector3 || !placementGroup) {
            return null
        }

        placementGroup.parent?.updateWorldMatrix?.(true, false)
        placementGroup.updateMatrixWorld?.(true)
        const bounds = new THREE.Box3().setFromObject(placementGroup)
        if (bounds.isEmpty()) {
            return null
        }

        const center = bounds.getCenter(new THREE.Vector3())
        const parent = placementGroup.parent
        if (THREE?.Matrix4 && parent?.matrixWorld) {
            center.applyMatrix4(
                new THREE.Matrix4().copy(parent.matrixWorld).invert()
            )
        }

        return { x: center.x, y: center.y }
    }

    /**
     * Checks whether one placement has enough context for group centering.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} sourceBounds Loaded source bounds in mil.
     * @returns {boolean}
     */
    static #isCandidate(sceneDescription, placement, sourceBounds) {
        const modelRotation = placement?.modelTransform?.rotationDeg || {}

        return (
            String(sceneDescription?.sourceFormat || '').toLowerCase() ===
                'altium' &&
            String(placement?.projection?.source || '').toLowerCase() ===
                'model-bounds' &&
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            (PcbScene3dExternalModelRepeatedBoundsCenterRepair.#siblingPlacements(
                sceneDescription,
                placement
            ).length > 1 ||
                PcbScene3dExternalModelPadAnchoredBodyCandidate.isCandidate(
                    sceneDescription,
                    placement
                )) &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                modelRotation.x
            ) === 0 &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                modelRotation.y
            ) === 0 &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#hasFiniteSourceBounds(
                sourceBounds
            )
        )
    }

    /**
     * Resolves the placement set whose anchor center should be aligned.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} sourceBounds Loaded source bounds in mil.
     * @returns {object[]}
     */
    static #centeringPlacements(sceneDescription, placement, sourceBounds) {
        const siblingPlacements =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#siblingPlacements(
                sceneDescription,
                placement
            )
        if (siblingPlacements.length > 1) {
            return siblingPlacements
        }

        return PcbScene3dExternalModelPadAnchoredBodyCandidate.isCandidate(
            sceneDescription,
            placement
        ) &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#hasFiniteSourceBounds(
                sourceBounds
            )
            ? [placement]
            : []
    }

    /**
     * Resolves repeated sibling placements with the same model identity.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {object[]}
     */
    static #siblingPlacements(sceneDescription, placement) {
        const key =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#groupKey(
                placement
            )
        if (!key || !Array.isArray(sceneDescription?.externalPlacements)) {
            return []
        }

        return sceneDescription.externalPlacements.filter(
            (candidate) =>
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#groupKey(
                    candidate
                ) === key
        )
    }

    /**
     * Builds a stable repeated model-bounds group key.
     * @param {object | null | undefined} placement External placement.
     * @returns {string}
     */
    static #groupKey(placement) {
        const designator = String(placement?.designator || '').trim()
        const model = placement?.externalModel || {}
        if (!designator || !model) {
            return ''
        }

        return [
            designator,
            String(placement?.mountSide || '').toLowerCase(),
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                placement?.rotationDeg
            ),
            String(placement?.projection?.source || '').toLowerCase(),
            String(model?.origin || ''),
            String(model?.sourceStream || ''),
            String(model?.relativePath || ''),
            String(model?.name || ''),
            String(model?.format || '')
        ].join('::')
    }

    /**
     * Resolves the source center after model yaw, embedded frame, and placement yaw.
     * @param {object | null | undefined} placement External placement.
     * @param {{ centerX?: number, centerY?: number }} sourceBounds Source bounds.
     * @returns {{ x: number, y: number } | null}
     */
    static #transformedSourceCenter(placement, sourceBounds) {
        const centerX = Number(sourceBounds?.centerX)
        const centerY = Number(sourceBounds?.centerY)
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            return null
        }

        const modelRotation = placement?.modelTransform?.rotationDeg || {}
        const modelYaw =
            -PcbScene3dExternalModelRepeatedBoundsCenterRepair.#degreesToRadians(
                modelRotation.z
            )
        const modelRotated =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#rotatePoint(
                centerX,
                centerY,
                modelYaw
            )
        const sourceFrame = {
            x: modelRotated.x,
            y: PcbScene3dExternalModelRepeatedBoundsCenterRepair.#isEmbeddedModel(
                placement
            )
                ? -modelRotated.y
                : modelRotated.y
        }

        return PcbScene3dExternalModelRepeatedBoundsCenterRepair.#rotatePoint(
            sourceFrame.x,
            sourceFrame.y,
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#degreesToRadians(
                placement?.rotationDeg
            )
        )
    }

    /**
     * Resolves the center of repeated placement anchors.
     * @param {object[]} placements Sibling placements.
     * @returns {{ x: number, y: number }}
     */
    static #placementAnchorCenter(placements) {
        const bounds =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#pointBounds(
                placements
                    .map((placement) => placement?.positionMil)
                    .filter(Boolean)
            )

        return bounds.center
    }

    /**
     * Resolves the center of the owning component's pads in scene coordinates.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null} component Scene component.
     * @returns {{ x: number, y: number } | null}
     */
    static #ownedPadCenter(sceneDescription, component) {
        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return null
        }

        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const points = (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        )
            .filter(
                (pad) =>
                    Number(pad?.componentIndex) === componentIndex &&
                    PcbScene3dExternalModelRepeatedBoundsCenterRepair.#hasPadGeometry(
                        pad
                    )
            )
            .map((pad) => ({
                x: Number(pad?.x || 0) - centerX,
                y: Number(pad?.y || 0) - centerY
            }))

        if (points.length <= 1) {
            return null
        }

        return PcbScene3dExternalModelRepeatedBoundsCenterRepair.#pointBounds(
            points
        ).center
    }

    /**
     * Checks whether repeated placements are already authored at owned drilled pads.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #hasRepeatedOwnedDrilledPadAnchors(sceneDescription, placement) {
        const component =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return false
        }

        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const drilledPads =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#ownedDrilledPads(
                sceneDescription,
                componentIndex,
                centerX,
                centerY
            )
        if (
            drilledPads.length < 2 ||
            !drilledPads.some((pad) =>
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#placementCoversPad(
                    placement,
                    pad
                )
            )
        ) {
            return false
        }

        const padAnchoredPlacements =
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#ownerModelBoundsPlacements(
                sceneDescription,
                placement
            ).filter((candidate) =>
                drilledPads.some((pad) =>
                    PcbScene3dExternalModelRepeatedBoundsCenterRepair.#placementCoversPad(
                        candidate,
                        pad
                    )
                )
            )

        return (
            padAnchoredPlacements.length >= drilledPads.length &&
            drilledPads.every((pad) =>
                padAnchoredPlacements.some((candidate) =>
                    PcbScene3dExternalModelRepeatedBoundsCenterRepair.#placementCoversPad(
                        candidate,
                        pad
                    )
                )
            )
        )
    }

    /**
     * Resolves same-owner model-bounds placements regardless of model identity.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {object[]}
     */
    static #ownerModelBoundsPlacements(sceneDescription, placement) {
        const designator = String(placement?.designator || '').trim()
        if (
            !designator ||
            !Array.isArray(sceneDescription?.externalPlacements)
        ) {
            return []
        }

        return sceneDescription.externalPlacements.filter(
            (candidate) =>
                String(candidate?.designator || '').trim() === designator &&
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#isSamePlacementContext(
                    candidate,
                    placement
                )
        )
    }

    /**
     * Checks whether two placements share the same owner-side transform context.
     * @param {object | null | undefined} candidate Candidate placement.
     * @param {object | null | undefined} placement Reference placement.
     * @returns {boolean}
     */
    static #isSamePlacementContext(candidate, placement) {
        const candidateRotation = candidate?.modelTransform?.rotationDeg || {}
        const placementRotation = placement?.modelTransform?.rotationDeg || {}

        return (
            String(candidate?.mountSide || '').toLowerCase() ===
                String(placement?.mountSide || '').toLowerCase() &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                candidate?.rotationDeg
            ) ===
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                    placement?.rotationDeg
                ) &&
            String(candidate?.projection?.source || '').toLowerCase() ===
                'model-bounds' &&
            String(candidate?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                candidateRotation.x
            ) ===
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                    placementRotation.x
                ) &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                candidateRotation.y
            ) ===
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                    placementRotation.y
                ) &&
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                candidateRotation.z
            ) ===
                PcbScene3dExternalModelRepeatedBoundsCenterRepair.#normalizeAngle(
                    placementRotation.z
                )
        )
    }

    /**
     * Resolves owned drilled pads in scene-local coordinates.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {number} componentIndex Owning component index.
     * @param {number} centerX Board center X.
     * @param {number} centerY Board center Y.
     * @returns {object[]}
     */
    static #ownedDrilledPads(
        sceneDescription,
        componentIndex,
        centerX,
        centerY
    ) {
        return (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        )
            .filter(
                (pad) =>
                    Number(pad?.componentIndex) === componentIndex &&
                    PcbScene3dExternalModelRepeatedBoundsCenterRepair.#hasDrilledPadOpening(
                        pad
                    )
            )
            .map((pad) => ({
                ...pad,
                x: Number(pad?.x || 0) - centerX,
                y: Number(pad?.y || 0) - centerY
            }))
    }

    /**
     * Checks whether a placement anchor sits inside one drilled pad.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} pad Scene-local pad.
     * @returns {boolean}
     */
    static #placementCoversPad(placement, pad) {
        const position = placement?.positionMil || {}
        const x = Number(position.x)
        const y = Number(position.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return false
        }

        return (
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#distanceToPadAnchor(
                { x, y },
                pad
            ) <=
            PcbScene3dExternalModelRepeatedBoundsCenterRepair
                .#PAD_ANCHOR_TOLERANCE_MIL
        )
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
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#padAnchorRadiusMil(
                pad
            )

        return radius > 0
            ? Math.max(0, centerDistance - radius)
            : Number.POSITIVE_INFINITY
    }

    /**
     * Resolves a drilled pad's effective XY anchor radius.
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
     * Resolves bounding-box center for finite XY points.
     * @param {{ x?: number, y?: number }[]} points Points.
     * @returns {{ center: { x: number, y: number } }}
     */
    static #pointBounds(points) {
        const finitePoints = points
            .map((point) => ({
                x: Number(point?.x),
                y: Number(point?.y)
            }))
            .filter(
                (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
            )
        const xs = finitePoints.map((point) => point.x)
        const ys = finitePoints.map((point) => point.y)

        return {
            center: {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2
            }
        }
    }

    /**
     * Resolves the scene component for one placement.
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
     * Checks whether source bounds include finite center and size values.
     * @param {object | null} sourceBounds Source bounds.
     * @returns {boolean}
     */
    static #hasFiniteSourceBounds(sourceBounds) {
        return [
            sourceBounds?.centerX,
            sourceBounds?.centerY,
            sourceBounds?.sizeX,
            sourceBounds?.sizeY
        ].every((value) => Number.isFinite(Number(value)))
    }

    /**
     * Resolves the largest correction that still looks like source-origin drift.
     * @param {{ sizeX?: number, sizeY?: number }} sourceBounds Source bounds.
     * @returns {number}
     */
    static #maxReasonableShift(sourceBounds) {
        const sizeX = Math.abs(Number(sourceBounds?.sizeX || 0))
        const sizeY = Math.abs(Number(sourceBounds?.sizeY || 0))

        return Math.max(
            Math.hypot(sizeX, sizeY),
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#MIN_SHIFT_MIL
        )
    }

    /**
     * Checks whether one placement uses an embedded model frame.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isEmbeddedModel(placement) {
        return (
            String(placement?.externalModel?.origin || '').toLowerCase() ===
            'embedded'
        )
    }

    /**
     * Rotates one XY point.
     * @param {number} x X coordinate.
     * @param {number} y Y coordinate.
     * @param {number} radians Rotation angle.
     * @returns {{ x: number, y: number }}
     */
    static #rotatePoint(x, y, radians) {
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)

        return {
            x: x * cos - y * sin,
            y: x * sin + y * cos
        }
    }

    /**
     * Converts degrees to radians.
     * @param {number | string | undefined} degrees Degrees.
     * @returns {number}
     */
    static #degreesToRadians(degrees) {
        return (Number(degrees || 0) * Math.PI) / 180
    }

    /**
     * Normalizes one angle into [0, 360).
     * @param {number | string | undefined} angle Source angle.
     * @returns {number}
     */
    static #normalizeAngle(angle) {
        const normalized = Number(angle || 0) % 360

        return normalized < 0 ? normalized + 360 : normalized
    }

    /**
     * Finds the loaded model child below a placement adjustment target.
     * @param {any} rootObject Placement root object.
     * @returns {any | null}
     */
    static #findAdjustmentModelGroup(rootObject) {
        let adjustmentGroup = null
        PcbScene3dExternalModelRepeatedBoundsCenterRepair.#visitObjects(
            rootObject,
            (object) => {
                if (
                    !adjustmentGroup &&
                    object?.userData?.scene3dAdjustmentTarget
                ) {
                    adjustmentGroup = object
                }
            }
        )

        return adjustmentGroup?.children?.[0] || null
    }

    /**
     * Visits every object below a root.
     * @param {any} rootObject Root object.
     * @param {(object: any) => void} visitor Object visitor.
     * @returns {void}
     */
    static #visitObjects(rootObject, visitor) {
        if (!rootObject) {
            return
        }

        visitor(rootObject)
        ;(Array.isArray(rootObject.children)
            ? rootObject.children
            : []
        ).forEach((child) =>
            PcbScene3dExternalModelRepeatedBoundsCenterRepair.#visitObjects(
                child,
                visitor
            )
        )
    }
}
