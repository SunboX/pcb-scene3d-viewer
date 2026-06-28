/**
 * Centers repeated package model-bounds placements across separate owners.
 */
export class PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair {
    static #MIN_SHIFT_MIL = 1
    static #OWNER_OFFSET_TOLERANCE_MIL = 2
    static #MIN_OWNER_SURFACE_PAD_COUNT = 4
    static #NON_PACKAGE_FAMILIES = new Set([
        'antenna',
        'connector',
        'display',
        'mechanical',
        'module',
        'test-point'
    ])

    /**
     * Re-centers repeated package models when each owner has the same biased
     * source anchor offset from its owned pad center.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, sceneDescription, placement, placementGroup) {
        if (
            !THREE?.Box3 ||
            !THREE?.Vector3 ||
            !placementGroup?.position ||
            !PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#isCandidate(
                sceneDescription,
                placement
            )
        ) {
            return
        }

        const siblingPlacements =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#siblingPlacements(
                sceneDescription,
                placement
            )
        const packageRecords =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#packageRecords(
                sceneDescription,
                siblingPlacements
            )
        const record = packageRecords.find((candidate) =>
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#matchesPlacementRecord(
                candidate.placement,
                placement
            )
        )
        if (
            !record ||
            !PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#hasConsistentOwnerAnchorOffset(
                packageRecords
            )
        ) {
            return
        }

        placementGroup.parent?.updateWorldMatrix?.(true, false)
        placementGroup.updateMatrixWorld?.(true)
        const bounds = new THREE.Box3().setFromObject(placementGroup)
        if (bounds.isEmpty()) {
            return
        }

        const center =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#toParentFrame(
                THREE,
                bounds.getCenter(new THREE.Vector3()),
                placementGroup
            )
        const dx = record.padCenter.x - center.x
        const dy = record.padCenter.y - center.y
        const shiftDistance = Math.hypot(dx, dy)
        const maxReasonableShift =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#maxReasonableShift(
                PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#sourceBounds(
                    placementGroup
                ) || placement?.projection?.boundsMil
            )

        if (
            shiftDistance <
                PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair
                    .#MIN_SHIFT_MIL ||
            shiftDistance > maxReasonableShift
        ) {
            return
        }

        placementGroup.position.x += dx
        placementGroup.position.y += dy
        placementGroup.userData.scene3dRepeatedOwnerModelBoundsCenterRepair = true
        placementGroup.userData.scene3dRepeatedOwnerModelBoundsCenterOffsetMil =
            {
                x: dx,
                y: dy
            }
        placementGroup.updateMatrixWorld?.(true)
    }

    /**
     * Checks whether one placement can participate in owner-package centering.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isCandidate(sceneDescription, placement) {
        return (
            String(sceneDescription?.sourceFormat || '').toLowerCase() ===
                'altium' &&
            String(placement?.projection?.source || '').toLowerCase() ===
                'model-bounds' &&
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#siblingPlacements(
                sceneDescription,
                placement
            ).length > 1
        )
    }

    /**
     * Resolves sibling placements that reuse one package model across owners.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {object[]}
     */
    static #siblingPlacements(sceneDescription, placement) {
        const key =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#groupKey(
                placement
            )
        if (!key || !Array.isArray(sceneDescription?.externalPlacements)) {
            return []
        }

        return sceneDescription.externalPlacements.filter(
            (candidate) =>
                PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#groupKey(
                    candidate
                ) === key
        )
    }

    /**
     * Builds a repeated package model key that intentionally excludes the
     * owner designator.
     * @param {object | null | undefined} placement External placement.
     * @returns {string}
     */
    static #groupKey(placement) {
        const model = placement?.externalModel || {}
        const rotation = placement?.modelTransform?.rotationDeg || {}
        if (!model) {
            return ''
        }

        return [
            String(placement?.mountSide || '').toLowerCase(),
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#normalizeAngle(
                placement?.rotationDeg
            ),
            String(placement?.projection?.source || '').toLowerCase(),
            String(model?.origin || ''),
            String(model?.sourceStream || ''),
            String(model?.relativePath || ''),
            String(model?.name || ''),
            String(model?.format || ''),
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#normalizeAngle(
                rotation.x
            ),
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#normalizeAngle(
                rotation.y
            ),
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#normalizeAngle(
                rotation.z
            )
        ].join('::')
    }

    /**
     * Builds owner package records for a repeated placement group.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object[]} placements Repeated owner placements.
     * @returns {{ placement: object, padCenter: { x: number, y: number }, anchorOffset: { x: number, y: number } }[]}
     */
    static #packageRecords(sceneDescription, placements) {
        return (Array.isArray(placements) ? placements : [])
            .map((placement) => {
                const component =
                    PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#resolveComponent(
                        sceneDescription,
                        placement
                    )
                const padCenter =
                    PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#ownedPackagePadCenter(
                        sceneDescription,
                        component,
                        placement
                    )
                if (!padCenter) {
                    return null
                }

                return {
                    placement,
                    padCenter,
                    anchorOffset: {
                        x: Number(placement?.positionMil?.x || 0) - padCenter.x,
                        y: Number(placement?.positionMil?.y || 0) - padCenter.y
                    }
                }
            })
            .filter(Boolean)
    }

    /**
     * Resolves the owned surface-pad center for one package-like component.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null} component Scene component.
     * @param {object | null | undefined} placement External placement.
     * @returns {{ x: number, y: number } | null}
     */
    static #ownedPackagePadCenter(sceneDescription, component, placement) {
        if (
            !PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#isPackageComponent(
                component
            )
        ) {
            return null
        }

        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return null
        }

        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const isBottom =
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#isBottomPlacement(
                placement
            )
        const points = (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        )
            .filter(
                (pad) =>
                    Number(pad?.componentIndex) === componentIndex &&
                    PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#isSurfacePad(
                        pad,
                        isBottom
                    )
            )
            .map((pad) => ({
                x: Number(pad?.x || 0) - centerX,
                y: Number(pad?.y || 0) - centerY
            }))

        if (
            points.length <
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair
                .#MIN_OWNER_SURFACE_PAD_COUNT
        ) {
            return null
        }

        return PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#pointBounds(
            points
        ).center
    }

    /**
     * Checks whether one scene component describes a package body, not
     * connector or display hardware that may have authored anchor offsets.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static #isPackageComponent(component) {
        const family = String(component?.body?.family || '').toLowerCase()

        return (
            Boolean(component) &&
            !PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#NON_PACKAGE_FAMILIES.has(
                family
            )
        )
    }

    /**
     * Checks whether one pad is a measurable surface-mount pad on the active side.
     * @param {object | null | undefined} pad Source pad row.
     * @param {boolean} isBottom Whether the placement is bottom-side.
     * @returns {boolean}
     */
    static #isSurfacePad(pad, isBottom) {
        const hasPaste = isBottom
            ? pad?.hasBottomPasteMaskOpening
            : pad?.hasTopPasteMaskOpening
        const width = Number(
            (isBottom ? pad?.sizeBottomX : pad?.sizeTopX) || pad?.sizeMidX || 0
        )
        const depth = Number(
            (isBottom ? pad?.sizeBottomY : pad?.sizeTopY) || pad?.sizeMidY || 0
        )

        return (
            Boolean(hasPaste) &&
            Number.isFinite(Number(pad?.x)) &&
            Number.isFinite(Number(pad?.y)) &&
            width > 0 &&
            depth > 0
        )
    }

    /**
     * Checks whether a placement is mounted on the bottom side.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isBottomPlacement(placement) {
        return String(placement?.mountSide || '').toLowerCase() === 'bottom'
    }

    /**
     * Checks whether all records share one non-zero source-anchor offset.
     * @param {{ anchorOffset: { x: number, y: number } }[]} records Owner package records.
     * @returns {boolean}
     */
    static #hasConsistentOwnerAnchorOffset(records) {
        if (!Array.isArray(records) || records.length <= 1) {
            return false
        }

        const reference = records[0].anchorOffset
        if (
            Math.hypot(Number(reference?.x || 0), Number(reference?.y || 0)) <
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair
                .#MIN_SHIFT_MIL
        ) {
            return false
        }

        return records.every(
            (record) =>
                Math.hypot(
                    Number(record?.anchorOffset?.x || 0) -
                        Number(reference?.x || 0),
                    Number(record?.anchorOffset?.y || 0) -
                        Number(reference?.y || 0)
                ) <=
                PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair
                    .#OWNER_OFFSET_TOLERANCE_MIL
        )
    }

    /**
     * Checks whether a source placement record matches the rendered placement copy.
     * @param {object | null | undefined} recordPlacement Source scene placement.
     * @param {object | null | undefined} renderedPlacement Rendered placement.
     * @returns {boolean}
     */
    static #matchesPlacementRecord(recordPlacement, renderedPlacement) {
        if (
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#groupKey(
                recordPlacement
            ) !==
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#groupKey(
                renderedPlacement
            )
        ) {
            return false
        }

        return (
            String(recordPlacement?.designator || '') ===
                String(renderedPlacement?.designator || '') &&
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#samePosition(
                recordPlacement?.positionMil,
                renderedPlacement?.positionMil
            )
        )
    }

    /**
     * Checks whether two scene positions are effectively identical.
     * @param {object | null | undefined} first First position.
     * @param {object | null | undefined} second Second position.
     * @returns {boolean}
     */
    static #samePosition(first, second) {
        return ['x', 'y', 'z'].every(
            (axis) =>
                Math.abs(
                    Number(first?.[axis] || 0) - Number(second?.[axis] || 0)
                ) <= Number.EPSILON
        )
    }

    /**
     * Returns loaded source bounds from a placement root.
     * @param {any} placementGroup Rendered placement root.
     * @returns {object | null}
     */
    static #sourceBounds(placementGroup) {
        return (
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#findAdjustmentModelGroup(
                placementGroup
            )?.userData?.scene3dSourceBoundsMil || null
        )
    }

    /**
     * Converts a world-space point into the placement parent frame.
     * @param {any} THREE Three.js namespace.
     * @param {any} center World-space center.
     * @param {any} placementGroup Rendered placement root.
     * @returns {any}
     */
    static #toParentFrame(THREE, center, placementGroup) {
        const parent = placementGroup?.parent
        if (!THREE?.Matrix4 || !parent?.matrixWorld) {
            return center
        }

        return center.applyMatrix4(
            new THREE.Matrix4().copy(parent.matrixWorld).invert()
        )
    }

    /**
     * Finds the loaded model child below a placement adjustment target.
     * @param {any} rootObject Placement root object.
     * @returns {any | null}
     */
    static #findAdjustmentModelGroup(rootObject) {
        let adjustmentGroup = null
        PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#visitObjects(
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
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.#visitObjects(
                child,
                visitor
            )
        )
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
     * Resolves the largest correction that still looks like source-origin drift.
     * @param {{ sizeX?: number, sizeY?: number, width?: number, depth?: number } | null | undefined} sourceBounds Source bounds.
     * @returns {number}
     */
    static #maxReasonableShift(sourceBounds) {
        return Math.max(
            Math.abs(Number(sourceBounds?.sizeX ?? sourceBounds?.width ?? 0)),
            Math.abs(Number(sourceBounds?.sizeY ?? sourceBounds?.depth ?? 0)),
            PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair
                .#MIN_SHIFT_MIL
        )
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
}
