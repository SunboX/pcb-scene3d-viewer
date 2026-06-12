import { PcbScene3dBufferAttributeFactory } from './PcbScene3dBufferAttributeFactory.mjs'

/**
 * Measures and normalizes loaded 3D model bounds.
 */
export class PcbScene3dModelBounds {
    static #POSITION_EPSILON = 1e-9
    static #SUPPORT_BUCKET_MIL = 5
    static #LOWER_SUPPORT_WINDOW_RATIO = 0.14
    static #LOWER_SUPPORT_WINDOW_MAX_MIL = 30
    static #LOWER_SUPPORT_MIN_GAP_MIL = 1
    static #SUPPORT_BUCKET_MIN_DENSITY = 0.2

    /**
     * Seats one transformed model group on its local mount plane.
     * @param {any} THREE Three.js namespace.
     * @param {{ position?: { z?: number }, updateMatrixWorld?: (force?: boolean) => void }} modelGroup Model group.
     * @returns {void}
     */
    static seatOnMountPlane(THREE, modelGroup) {
        if (!THREE?.Box3 || !modelGroup?.position) {
            return
        }

        modelGroup.updateMatrixWorld?.(true)
        const bounds = new THREE.Box3().setFromObject(modelGroup)
        const currentZ = Number(modelGroup.position.z || 0)
        const modelMinZ = Number(bounds?.min?.z) - currentZ
        const mountPlaneZ = PcbScene3dModelBounds.#resolveMountPlaneZ(
            THREE,
            modelGroup,
            modelMinZ
        )

        if (!Number.isFinite(mountPlaneZ)) {
            return
        }

        const adjustedZ = modelGroup.position.z - mountPlaneZ
        modelGroup.position.z =
            Math.abs(adjustedZ) <= PcbScene3dModelBounds.#POSITION_EPSILON
                ? 0
                : adjustedZ
        modelGroup.updateMatrixWorld?.(true)
    }

    /**
     * Measures raw STEP mesh bounds in mil before the group-level unit scale is
     * applied.
     * @param {{ positions?: ArrayLike<number> }[]} meshPayloads STEP mesh payloads.
     * @returns {{ minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, centerX: number, centerY: number, centerZ: number, sizeX: number, sizeY: number, sizeZ: number } | null}
     */
    static measureSourceBoundsMil(meshPayloads) {
        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let minZ = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        let maxZ = Number.NEGATIVE_INFINITY

        ;(Array.isArray(meshPayloads) ? meshPayloads : []).forEach(
            (meshPayload) => {
                ;(PcbScene3dBufferAttributeFactory.isNumberSequence(
                    meshPayload?.positions
                )
                    ? meshPayload.positions
                    : []
                ).forEach((value, index) => {
                    const numericValue = Number(value || 0) * 1000

                    if (index % 3 === 0) {
                        minX = Math.min(minX, numericValue)
                        maxX = Math.max(maxX, numericValue)
                    } else if (index % 3 === 1) {
                        minY = Math.min(minY, numericValue)
                        maxY = Math.max(maxY, numericValue)
                    } else {
                        minZ = Math.min(minZ, numericValue)
                        maxZ = Math.max(maxZ, numericValue)
                    }
                })
            }
        )

        if (
            !Number.isFinite(minX) ||
            !Number.isFinite(minY) ||
            !Number.isFinite(minZ) ||
            !Number.isFinite(maxX) ||
            !Number.isFinite(maxY) ||
            !Number.isFinite(maxZ)
        ) {
            return null
        }

        return {
            minX,
            minY,
            minZ,
            maxX,
            maxY,
            maxZ,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            centerZ: (minZ + maxZ) / 2,
            sizeX: maxX - minX,
            sizeY: maxY - minY,
            sizeZ: maxZ - minZ
        }
    }

    /**
     * Resolves the model-local plane that should touch the board face.
     * @param {any} THREE Three.js namespace.
     * @param {{ position?: { z?: number }, traverse?: (callback: (object: any) => void) => void, updateMatrixWorld?: (force?: boolean) => void }} modelGroup Model group.
     * @param {number} fallbackMinZ Absolute lower bound fallback.
     * @returns {number}
     */
    static #resolveMountPlaneZ(THREE, modelGroup, fallbackMinZ) {
        const vertexZ = PcbScene3dModelBounds.#collectTransformedVertexZ(
            THREE,
            modelGroup
        )
        const dominantPlane =
            PcbScene3dModelBounds.#resolveDominantLowerPlaneZ(vertexZ)

        return Number.isFinite(dominantPlane) ? dominantPlane : fallbackMinZ
    }

    /**
     * Collects transformed vertex Z coordinates in the model group's parent
     * frame before the current model-group Z offset is applied.
     * @param {any} THREE Three.js namespace.
     * @param {{ position?: { z?: number }, parent?: any, matrixWorld?: any, traverse?: (callback: (object: any) => void) => void, updateMatrixWorld?: (force?: boolean) => void }} modelGroup Model group.
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
     * Finds a dense lower support plane above sparse pin or lead protrusions.
     * @param {number[]} values Model-local transformed Z coordinates.
     * @returns {number | null}
     */
    static #resolveDominantLowerPlaneZ(values) {
        if (!Array.isArray(values) || values.length < 3) {
            return null
        }

        const { minZ, maxZ } = PcbScene3dModelBounds.#resolveZExtents(values)
        const height = maxZ - minZ
        if (!Number.isFinite(height) || height <= 0) {
            return null
        }

        const lowerWindow = Math.min(
            PcbScene3dModelBounds.#LOWER_SUPPORT_WINDOW_MAX_MIL,
            height * PcbScene3dModelBounds.#LOWER_SUPPORT_WINDOW_RATIO
        )
        const bucketCounts = PcbScene3dModelBounds.#buildZBuckets(values)
        const maxBucketCount =
            PcbScene3dModelBounds.#resolveMaxBucketCount(bucketCounts)
        const minCount =
            maxBucketCount * PcbScene3dModelBounds.#SUPPORT_BUCKET_MIN_DENSITY
        const candidates = [...bucketCounts.entries()]
            .filter(([bucketZ, count]) => {
                return (
                    bucketZ >
                        minZ +
                            PcbScene3dModelBounds.#LOWER_SUPPORT_MIN_GAP_MIL &&
                    bucketZ <= minZ + lowerWindow &&
                    count >= minCount
                )
            })
            .sort((left, right) => right[1] - left[1] || left[0] - right[0])

        return candidates.length ? candidates[0][0] : null
    }

    /**
     * Resolves minimum and maximum Z without spreading large vertex arrays.
     * @param {number[]} values Model-local transformed Z coordinates.
     * @returns {{ minZ: number, maxZ: number }}
     */
    static #resolveZExtents(values) {
        let minZ = Number.POSITIVE_INFINITY
        let maxZ = Number.NEGATIVE_INFINITY

        values.forEach((value) => {
            minZ = Math.min(minZ, value)
            maxZ = Math.max(maxZ, value)
        })

        return { minZ, maxZ }
    }

    /**
     * Resolves the largest bucket count without spreading map values.
     * @param {Map<number, number>} bucketCounts Z bucket counts.
     * @returns {number}
     */
    static #resolveMaxBucketCount(bucketCounts) {
        let maxCount = 0

        bucketCounts.forEach((count) => {
            maxCount = Math.max(maxCount, count)
        })

        return maxCount
    }

    /**
     * Buckets transformed Z coordinates to make dense support planes robust to
     * small floating point and tessellation differences.
     * @param {number[]} values Model-local transformed Z coordinates.
     * @returns {Map<number, number>}
     */
    static #buildZBuckets(values) {
        const buckets = new Map()

        values.forEach((value) => {
            const bucket =
                Math.round(value / PcbScene3dModelBounds.#SUPPORT_BUCKET_MIL) *
                PcbScene3dModelBounds.#SUPPORT_BUCKET_MIL
            buckets.set(bucket, (buckets.get(bucket) || 0) + 1)
        })

        return buckets
    }
}
