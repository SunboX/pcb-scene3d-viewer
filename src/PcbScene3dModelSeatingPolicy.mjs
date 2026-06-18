/**
 * Applies scene-aware mount-plane corrections after generic model seating.
 */
export class PcbScene3dModelSeatingPolicy {
    static #BELOW_ORIGIN_MIN_GAP_MIL = 1
    static #CONTACT_PAD_MARGIN_MIL = 8
    static #CONTACT_PAD_MIN_VERTEX_COUNT = 6
    static #CONTACT_PAD_MIN_OFFSET_MIL = 5
    static #SUPPORT_BUCKET_MIL = 5
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
        if (
            !PcbScene3dModelSeatingPolicy.#isAltiumScene(
                options?.sceneDescription
            )
        ) {
            return
        }

        if (
            PcbScene3dModelSeatingPolicy.#preferContactPadPlane(
                THREE,
                modelGroup,
                options?.placement
            )
        ) {
            return
        }

        PcbScene3dModelSeatingPolicy.#preferDominantZeroBodyPlane(
            THREE,
            modelGroup,
            options?.placement
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
        const offsetMil = placement?.modelTransform?.offsetMil || {}

        return Number(offsetMil.z ?? placement?.modelTransform?.dzMil ?? 0)
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
