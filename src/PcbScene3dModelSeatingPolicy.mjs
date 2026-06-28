import { PcbScene3dExternalPlacementDefaults } from './PcbScene3dExternalPlacementDefaults.mjs'

/**
 * Applies scene-aware mount-plane corrections after generic model seating.
 */
export class PcbScene3dModelSeatingPolicy {
    static #BELOW_ORIGIN_MIN_GAP_MIL = 1
    static #CONTACT_PAD_MARGIN_MIL = 8
    static #CONTACT_PAD_MIN_VERTEX_COUNT = 6
    static #CONTACT_PAD_MIN_OFFSET_MIL = 5
    static #SUPPORT_BUCKET_MIL = 5
    static #BOTTOM_RAISED_CONTACT_MIN_GAP_MIL = 20
    static #BOTTOM_RAISED_CONTACT_WINDOW_MAX_MIL = 240
    static #BOTTOM_RAISED_CONTACT_WINDOW_RATIO = 0.55
    static #BOTTOM_SUPPORT_MIN_AREA_RATIO = 0.2
    static #HORIZONTAL_NORMAL_MIN_RATIO = 0.65
    static #ZERO_PLANE_MIN_DOMINANCE = 1.5
    static #ZERO_PLANE_MIN_RESET_GAP_MIL = 20
    static #AUTHORED_Z_OFFSET_EPSILON_MIL = 0.001

    /**
     * Checks whether generic mount-plane seating should be skipped.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static shouldSkipGenericSeating(sceneDescription) {
        const sourceFormat = String(sceneDescription?.sourceFormat || '')
            .trim()
            .toLowerCase()

        return (
            sourceFormat === 'kicad' ||
            sceneDescription?.coordinateSystem === 'kicad-3d-y-up'
        )
    }

    /**
     * Applies scene-specific seating after generic mount-plane normalization.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ sceneDescription?: object, placement?: object }} [options] Scene and placement context.
     * @returns {void}
     */
    static applyPostSeat(THREE, modelGroup, options = {}) {
        const sceneDescription = options?.sceneDescription
        const placement = options?.placement

        if (!PcbScene3dModelSeatingPolicy.#isAltiumScene(sceneDescription)) {
            return
        }

        if (
            PcbScene3dModelSeatingPolicy.#preferContactPadPlane(
                THREE,
                modelGroup,
                placement
            )
        ) {
            PcbScene3dModelSeatingPolicy.#keepBottomGeometryBelowBoardFace(
                THREE,
                modelGroup,
                placement,
                sceneDescription
            )
            return
        }

        PcbScene3dModelSeatingPolicy.#preferDominantZeroBodyPlane(
            THREE,
            modelGroup,
            placement
        )
        PcbScene3dModelSeatingPolicy.#keepBottomGeometryBelowBoardFace(
            THREE,
            modelGroup,
            placement,
            sceneDescription
        )
    }

    /**
     * Seats mixed connector bodies by source vertices above their SMT contacts.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {object | null | undefined} placement Current placement.
     * @returns {boolean}
     */
    static #preferContactPadPlane(THREE, modelGroup, placement) {
        const pads =
            PcbScene3dModelSeatingPolicy.#resolveContactPadsInModelFrame(
                placement
            )
        if (!pads.length || !modelGroup?.position) {
            return false
        }

        const values = PcbScene3dModelSeatingPolicy.#collectContactPadVertexZ(
            THREE,
            modelGroup,
            pads
        )
        if (
            values.length <
            PcbScene3dModelSeatingPolicy.#CONTACT_PAD_MIN_VERTEX_COUNT
        ) {
            return false
        }

        const contactPlane = Math.min(...values)
        if (
            !Number.isFinite(contactPlane) ||
            Math.abs(contactPlane) <
                PcbScene3dModelSeatingPolicy.#CONTACT_PAD_MIN_OFFSET_MIL
        ) {
            return false
        }

        modelGroup.position.z = -contactPlane
        modelGroup.updateMatrixWorld?.(true)
        return true
    }

    /**
     * Collects transformed model-local Z values over hinted contact pads.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ x: number, y: number, radius: number }[]} pads Contact pads.
     * @returns {number[]}
     */
    static #collectContactPadVertexZ(THREE, modelGroup, pads) {
        if (!THREE?.Vector3 || typeof modelGroup?.traverse !== 'function') {
            return []
        }

        modelGroup.updateMatrixWorld?.(true)
        modelGroup.parent?.updateMatrixWorld?.(true)
        const currentZ = Number(modelGroup?.position?.z || 0)
        const parentInverse =
            THREE?.Matrix4 && modelGroup.parent?.matrixWorld
                ? new THREE.Matrix4()
                      .copy(modelGroup.parent.matrixWorld)
                      .invert()
                : null
        const vertex = new THREE.Vector3()
        const values = []

        modelGroup.traverse((object) => {
            const position = object?.geometry?.attributes?.position
            if (!position || !object?.matrixWorld) {
                return
            }

            for (
                let index = 0;
                index < Number(position.count || 0);
                index += 1
            ) {
                vertex.fromBufferAttribute(position, index)
                vertex.applyMatrix4(object.matrixWorld)
                if (parentInverse) {
                    vertex.applyMatrix4(parentInverse)
                }
                if (
                    PcbScene3dModelSeatingPolicy.#isInsideContactPad(
                        vertex,
                        pads
                    )
                ) {
                    values.push(vertex.z - currentZ)
                }
            }
        })

        return values.filter((value) => Number.isFinite(value))
    }

    /**
     * Checks whether one transformed vertex sits over a hinted contact pad.
     * @param {{ x?: number, y?: number }} vertex Transformed vertex.
     * @param {{ x: number, y: number, radius: number }[]} pads Contact pads.
     * @returns {boolean}
     */
    static #isInsideContactPad(vertex, pads) {
        return pads.some((pad) => {
            const radius = Math.max(Number(pad?.radius || 0), 0)

            return (
                Math.abs(Number(vertex?.x || 0) - Number(pad?.x || 0)) <=
                    radius &&
                Math.abs(Number(vertex?.y || 0) - Number(pad?.y || 0)) <= radius
            )
        })
    }

    /**
     * Transforms board-local contact pad hints into pre-orientation model space.
     * @param {object | null | undefined} placement Current placement.
     * @returns {{ x: number, y: number, radius: number }[]}
     */
    static #resolveContactPadsInModelFrame(placement) {
        const pads = Array.isArray(placement?.modelTransform?.contactPadsMil)
            ? placement.modelTransform.contactPadsMil
            : []
        if (!pads.length) {
            return []
        }

        const position = placement?.positionMil || {}
        const rootX = Number(position.x || 0)
        const rootY = Number(position.y || 0)
        const sourceScaleY =
            String(placement?.externalModel?.origin || '').toLowerCase() ===
            'embedded'
                ? -1
                : 1
        const radians = (-Number(placement?.rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)

        return pads
            .map((pad) => {
                const x = Number(pad?.x || 0) - rootX
                const y = (Number(pad?.y || 0) - rootY) / sourceScaleY

                return {
                    x: x * cos - y * sin,
                    y: x * sin + y * cos,
                    radius:
                        Math.max(
                            Number(pad?.width || 0),
                            Number(pad?.depth || 0)
                        ) /
                            2 +
                        PcbScene3dModelSeatingPolicy.#CONTACT_PAD_MARGIN_MIL
                }
            })
            .filter(
                (pad) =>
                    Number.isFinite(pad.x) &&
                    Number.isFinite(pad.y) &&
                    Number.isFinite(pad.radius) &&
                    pad.radius > 0
            )
    }

    /**
     * Seats non-tilted bodies on a dominant source-origin body plane.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {object | null | undefined} placement Current placement.
     * @returns {void}
     */
    static #preferDominantZeroBodyPlane(THREE, modelGroup, placement) {
        if (
            !modelGroup?.position ||
            PcbScene3dModelSeatingPolicy.#preservesAuthoredZOffset(placement)
        ) {
            return
        }

        const currentMountPlane = -Number(modelGroup.position.z || 0)
        if (
            !Number.isFinite(currentMountPlane) ||
            currentMountPlane >=
                -PcbScene3dModelSeatingPolicy.#BELOW_ORIGIN_MIN_GAP_MIL ||
            currentMountPlane >
                -PcbScene3dModelSeatingPolicy.#ZERO_PLANE_MIN_RESET_GAP_MIL
        ) {
            return
        }

        const values = PcbScene3dModelSeatingPolicy.#collectTransformedVertexZ(
            THREE,
            modelGroup
        )
        const bucketCounts = PcbScene3dModelSeatingPolicy.#buildZBuckets(values)
        const currentBucket =
            PcbScene3dModelSeatingPolicy.#bucketZ(currentMountPlane)
        const currentCount = Number(bucketCounts.get(currentBucket) || 0)
        const zeroCount = Number(bucketCounts.get(0) || 0)

        if (
            currentCount <= 0 ||
            zeroCount <
                currentCount *
                    PcbScene3dModelSeatingPolicy.#ZERO_PLANE_MIN_DOMINANCE
        ) {
            return
        }

        modelGroup.position.z = 0
        modelGroup.updateMatrixWorld?.(true)
    }

    /**
     * Keeps bottom-side models entirely on the underside after the mount rig
     * mirrors local Z around the board face.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {object | null | undefined} placement Current placement.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {void}
     */
    static #keepBottomGeometryBelowBoardFace(
        THREE,
        modelGroup,
        placement,
        sceneDescription
    ) {
        if (
            String(placement?.mountSide || '').toLowerCase() !== 'bottom' ||
            !modelGroup?.position
        ) {
            return
        }

        const values = PcbScene3dModelSeatingPolicy.#collectTransformedVertexZ(
            THREE,
            modelGroup
        )
        const boardFacePlane =
            PcbScene3dModelSeatingPolicy.#resolveBottomBoardFacePlane(
                THREE,
                modelGroup,
                values,
                placement,
                sceneDescription
            )
        const currentPlaneZ =
            boardFacePlane + Number(modelGroup.position.z || 0)

        if (!Number.isFinite(currentPlaneZ)) {
            return
        }

        modelGroup.position.z -= currentPlaneZ
        modelGroup.updateMatrixWorld?.(true)
    }

    /**
     * Resolves the bottom-side local plane that should sit on the board face.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {number[]} values Z values.
     * @param {object | null | undefined} placement Current placement.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {number}
     */
    static #resolveBottomBoardFacePlane(
        THREE,
        modelGroup,
        values,
        placement,
        sceneDescription
    ) {
        const extents = PcbScene3dModelSeatingPolicy.#resolveZExtents(values)
        const supportPlane =
            PcbScene3dModelSeatingPolicy.#hasThroughHoleMountEvidence(
                sceneDescription,
                placement
            )
                ? PcbScene3dModelSeatingPolicy.#resolveDominantRaisedSupportPlane(
                      THREE,
                      modelGroup,
                      extents
                  )
                : null

        return Number.isFinite(supportPlane) ? supportPlane : extents.minZ
    }

    /**
     * Checks whether sparse lower geometry is allowed to pass through the PCB.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement Current placement.
     * @returns {boolean}
     */
    static #hasThroughHoleMountEvidence(sceneDescription, placement) {
        const designator = String(placement?.designator || '').trim()
        const component = PcbScene3dModelSeatingPolicy.#resolveComponent(
            sceneDescription,
            designator
        )
        const componentIndex = Number(component?.componentIndex)
        const pads =
            PcbScene3dModelSeatingPolicy.#resolveScenePads(sceneDescription)

        return pads.some((pad) => {
            if (
                !PcbScene3dModelSeatingPolicy.#padMatchesPlacement(
                    pad,
                    designator,
                    componentIndex
                )
            ) {
                return false
            }

            return PcbScene3dModelSeatingPolicy.#hasDrilledPadOpening(pad)
        })
    }

    /**
     * Finds a scene component by designator.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {string} designator Placement designator.
     * @returns {object | null}
     */
    static #resolveComponent(sceneDescription, designator) {
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
     * Resolves normalized PCB pad records from a scene.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {object[]}
     */
    static #resolveScenePads(sceneDescription) {
        if (Array.isArray(sceneDescription?.detail?.pads)) {
            return sceneDescription.detail.pads
        }

        return Array.isArray(sceneDescription?.pads)
            ? sceneDescription.pads
            : []
    }

    /**
     * Checks whether one pad belongs to the current external placement.
     * @param {object} pad Pad record.
     * @param {string} designator Placement designator.
     * @param {number} componentIndex Placement component index.
     * @returns {boolean}
     */
    static #padMatchesPlacement(pad, designator, componentIndex) {
        if (
            Number.isFinite(componentIndex) &&
            Number(pad?.componentIndex) === componentIndex
        ) {
            return true
        }

        if (!designator) {
            return false
        }

        return [
            pad?.designator,
            pad?.ownerDesignator,
            pad?.componentDesignator,
            pad?.refdes,
            pad?.reference
        ].some((value) => String(value || '').trim() === designator)
    }

    /**
     * Checks whether one pad has a drilled or slotted through-board opening.
     * @param {object} pad Pad record.
     * @returns {boolean}
     */
    static #hasDrilledPadOpening(pad) {
        const holeGeometry = pad?.holeGeometry || {}

        return [
            pad?.holeDiameter,
            pad?.drillDiameter,
            pad?.holeSlotLength,
            pad?.slotLength,
            holeGeometry?.diameter,
            holeGeometry?.length,
            holeGeometry?.slotLength
        ].some((value) => Number(value || 0) > 0)
    }

    /**
     * Finds a broad housing/support plane above sparse raised contact geometry.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ minZ: number, maxZ: number }} extents Z extents.
     * @returns {number | null}
     */
    static #resolveDominantRaisedSupportPlane(THREE, modelGroup, extents) {
        const minZ = Number(extents?.minZ)
        const maxZ = Number(extents?.maxZ)
        const height = maxZ - minZ
        if (!Number.isFinite(height) || height <= 0) {
            return null
        }

        const supportAreas =
            PcbScene3dModelSeatingPolicy.#collectHorizontalTriangleAreas(
                THREE,
                modelGroup
            )
        const maxArea =
            PcbScene3dModelSeatingPolicy.#resolveMaxBucketArea(supportAreas)
        if (!(maxArea > 0)) {
            return null
        }

        const windowSize = Math.min(
            PcbScene3dModelSeatingPolicy.#BOTTOM_RAISED_CONTACT_WINDOW_MAX_MIL,
            height *
                PcbScene3dModelSeatingPolicy.#BOTTOM_RAISED_CONTACT_WINDOW_RATIO
        )
        const minSupportArea =
            maxArea *
            PcbScene3dModelSeatingPolicy.#BOTTOM_SUPPORT_MIN_AREA_RATIO
        const candidates = [...supportAreas.entries()]
            .filter(([bucketZ, area]) => {
                const gap = bucketZ - minZ

                return (
                    gap >=
                        PcbScene3dModelSeatingPolicy
                            .#BOTTOM_RAISED_CONTACT_MIN_GAP_MIL &&
                    gap <= windowSize &&
                    area >= minSupportArea
                )
            })
            .sort((left, right) => left[0] - right[0] || right[1] - left[1])

        return candidates.length ? candidates[0][0] : null
    }

    /**
     * Collects horizontal triangle area by transformed Z bucket.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @returns {Map<number, number>}
     */
    static #collectHorizontalTriangleAreas(THREE, modelGroup) {
        const areas = new Map()
        if (!THREE?.Vector3 || typeof modelGroup?.traverse !== 'function') {
            return areas
        }

        modelGroup.updateMatrixWorld?.(true)
        modelGroup.parent?.updateMatrixWorld?.(true)
        const currentZ = Number(modelGroup?.position?.z || 0)
        const parentInverse =
            THREE?.Matrix4 && modelGroup.parent?.matrixWorld
                ? new THREE.Matrix4()
                      .copy(modelGroup.parent.matrixWorld)
                      .invert()
                : null
        const first = new THREE.Vector3()
        const second = new THREE.Vector3()
        const third = new THREE.Vector3()
        const firstEdge = new THREE.Vector3()
        const secondEdge = new THREE.Vector3()
        const normalArea = new THREE.Vector3()

        modelGroup.traverse((object) => {
            const position = object?.geometry?.attributes?.position
            if (!position || !object?.matrixWorld) {
                return
            }

            const index = object?.geometry?.index || null
            const triangleCount = Math.floor(
                Number((index || position).count || 0) / 3
            )
            for (
                let triangleIndex = 0;
                triangleIndex < triangleCount;
                triangleIndex += 1
            ) {
                PcbScene3dModelSeatingPolicy.#readTriangleVertices(
                    position,
                    index,
                    triangleIndex,
                    first,
                    second,
                    third
                )
                ;[first, second, third].forEach((vertex) => {
                    vertex.applyMatrix4(object.matrixWorld)
                    if (parentInverse) {
                        vertex.applyMatrix4(parentInverse)
                    }
                    vertex.z -= currentZ
                })
                firstEdge.subVectors(second, first)
                secondEdge.subVectors(third, first)
                normalArea.crossVectors(firstEdge, secondEdge)

                const doubleArea = normalArea.length()
                if (
                    !(doubleArea > 0) ||
                    Math.abs(normalArea.z) / doubleArea <
                        PcbScene3dModelSeatingPolicy
                            .#HORIZONTAL_NORMAL_MIN_RATIO
                ) {
                    continue
                }

                const bucketZ = PcbScene3dModelSeatingPolicy.#bucketZ(
                    (first.z + second.z + third.z) / 3
                )
                areas.set(bucketZ, (areas.get(bucketZ) || 0) + doubleArea / 2)
            }
        })

        return areas
    }

    /**
     * Reads one triangle's position vertices.
     * @param {any} position Position attribute.
     * @param {any} index Index attribute.
     * @param {number} triangleIndex Triangle index.
     * @param {any} first First target vector.
     * @param {any} second Second target vector.
     * @param {any} third Third target vector.
     * @returns {void}
     */
    static #readTriangleVertices(
        position,
        index,
        triangleIndex,
        first,
        second,
        third
    ) {
        first.fromBufferAttribute(
            position,
            PcbScene3dModelSeatingPolicy.#triangleVertexIndex(
                index,
                triangleIndex,
                0
            )
        )
        second.fromBufferAttribute(
            position,
            PcbScene3dModelSeatingPolicy.#triangleVertexIndex(
                index,
                triangleIndex,
                1
            )
        )
        third.fromBufferAttribute(
            position,
            PcbScene3dModelSeatingPolicy.#triangleVertexIndex(
                index,
                triangleIndex,
                2
            )
        )
    }

    /**
     * Resolves a triangle vertex index from indexed or flat geometry.
     * @param {any} index Index attribute.
     * @param {number} triangleIndex Triangle index.
     * @param {number} vertexOffset Vertex offset in the triangle.
     * @returns {number}
     */
    static #triangleVertexIndex(index, triangleIndex, vertexOffset) {
        const flatIndex = triangleIndex * 3 + vertexOffset

        return index ? Number(index.getX(flatIndex) || 0) : flatIndex
    }

    /**
     * Resolves the largest horizontal support area bucket.
     * @param {Map<number, number>} areas Bucketed areas.
     * @returns {number}
     */
    static #resolveMaxBucketArea(areas) {
        let maxArea = 0

        areas?.forEach?.((area) => {
            maxArea = Math.max(maxArea, Number(area || 0))
        })

        return maxArea
    }

    /**
     * Resolves minimum and maximum finite Z from a vertex collection.
     * @param {number[]} values Z values.
     * @returns {{ minZ: number, maxZ: number }}
     */
    static #resolveZExtents(values) {
        const extents = {
            minZ: Number.POSITIVE_INFINITY,
            maxZ: Number.NEGATIVE_INFINITY
        }

        ;(Array.isArray(values) ? values : []).forEach((value) => {
            if (!Number.isFinite(value)) {
                return
            }

            extents.minZ = Math.min(extents.minZ, value)
            extents.maxZ = Math.max(extents.maxZ, value)
        })

        return extents
    }

    /**
     * Checks whether a model has an authored Z offset to preserve.
     * @param {object | null | undefined} placement Current placement.
     * @returns {boolean}
     */
    static #preservesAuthoredZOffset(placement) {
        const offsetZ =
            PcbScene3dModelSeatingPolicy.#resolveModelOffsetZ(placement)

        return (
            Number.isFinite(offsetZ) &&
            Math.abs(offsetZ) >
                PcbScene3dModelSeatingPolicy.#AUTHORED_Z_OFFSET_EPSILON_MIL
        )
    }

    /**
     * Resolves authored model Z offset from current and legacy transform shapes.
     * @param {object | null | undefined} placement Current placement.
     * @returns {number}
     */
    static #resolveModelOffsetZ(placement) {
        return PcbScene3dExternalPlacementDefaults.authoredOffsetZMil(
            placement?.modelTransform
        )
    }

    /**
     * Collects transformed vertex Z values before current group Z is applied.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @returns {number[]}
     */
    static #collectTransformedVertexZ(THREE, modelGroup) {
        if (!THREE?.Vector3 || typeof modelGroup?.traverse !== 'function') {
            return []
        }

        modelGroup.updateMatrixWorld?.(true)
        modelGroup.parent?.updateMatrixWorld?.(true)
        const currentZ = Number(modelGroup?.position?.z || 0)
        const parentInverse =
            THREE?.Matrix4 && modelGroup.parent?.matrixWorld
                ? new THREE.Matrix4()
                      .copy(modelGroup.parent.matrixWorld)
                      .invert()
                : null
        const vertex = new THREE.Vector3()
        const values = []

        modelGroup.traverse((object) => {
            const position = object?.geometry?.attributes?.position
            if (!position || !object?.matrixWorld) {
                return
            }

            for (
                let index = 0;
                index < Number(position.count || 0);
                index += 1
            ) {
                vertex.fromBufferAttribute(position, index)
                vertex.applyMatrix4(object.matrixWorld)
                if (parentInverse) {
                    vertex.applyMatrix4(parentInverse)
                }
                values.push(vertex.z - currentZ)
            }
        })

        return values.filter((value) => Number.isFinite(value))
    }

    /**
     * Buckets transformed Z values by support resolution.
     * @param {number[]} values Z values.
     * @returns {Map<number, number>}
     */
    static #buildZBuckets(values) {
        const buckets = new Map()

        ;(Array.isArray(values) ? values : []).forEach((value) => {
            const bucket = PcbScene3dModelSeatingPolicy.#bucketZ(value)
            buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
        })

        return buckets
    }

    /**
     * Resolves one Z value to a support bucket.
     * @param {number} value Z value.
     * @returns {number}
     */
    static #bucketZ(value) {
        return (
            Math.round(
                Number(value || 0) /
                    PcbScene3dModelSeatingPolicy.#SUPPORT_BUCKET_MIL
            ) * PcbScene3dModelSeatingPolicy.#SUPPORT_BUCKET_MIL
        )
    }

    /**
     * Checks whether one scene was parsed from Altium sources.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static #isAltiumScene(sceneDescription) {
        return (
            String(sceneDescription?.sourceFormat || '')
                .trim()
                .toLowerCase() === 'altium'
        )
    }
}
