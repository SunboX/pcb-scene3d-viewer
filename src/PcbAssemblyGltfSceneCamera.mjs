const DEFAULT_ASPECT_RATIO = 1
const DEFAULT_YFOV = 0.7
const FIT_MARGIN = 1.18

/**
 * Resolves fitted GLTF camera metadata for exported PCB assemblies.
 */
export class PcbAssemblyGltfSceneCamera {
    /**
     * Resolves a perspective camera pose and projection from scene bounds.
     * @param {{ min?: number[], max?: number[] }} bounds Exported scene bounds.
     * @param {{ sceneCameraPreset?: string, sceneCameraAspectRatio?: number, sceneCameraFovDegrees?: number }} [options] Camera options.
     * @returns {{ center: number[], distance: number, position: number[], rotation: number[], perspective: object }}
     */
    static resolve(bounds, options = {}) {
        const normalizedBounds = PcbAssemblyGltfSceneCamera.#bounds(bounds)
        const center = PcbAssemblyGltfSceneCamera.#center(normalizedBounds)
        const frame = PcbAssemblyGltfSceneCamera.#viewFrame(
            options.sceneCameraPreset
        )
        const yfov = PcbAssemblyGltfSceneCamera.#yfov(
            options.sceneCameraFovDegrees
        )
        const aspectRatio = PcbAssemblyGltfSceneCamera.#aspectRatio(
            options.sceneCameraAspectRatio
        )
        const distance = PcbAssemblyGltfSceneCamera.#fitDistance(
            normalizedBounds,
            center,
            frame,
            yfov,
            aspectRatio
        )
        const position = center.map(
            (value, index) => value + frame.backward[index] * distance
        )
        const perspective = {
            yfov,
            znear: Math.max(distance / 1000, 0.01),
            zfar: Math.max(distance * 10, distance + 10)
        }

        if (PcbAssemblyGltfSceneCamera.#hasAspectRatioOption(options)) {
            perspective.aspectRatio = aspectRatio
        }

        return {
            center,
            distance,
            position,
            rotation: PcbAssemblyGltfSceneCamera.#lookRotation(
                position,
                center,
                frame.up
            ),
            perspective
        }
    }

    /**
     * Normalizes scene bounds.
     * @param {{ min?: number[], max?: number[] }} bounds Candidate bounds.
     * @returns {{ min: number[], max: number[] }}
     */
    static #bounds(bounds) {
        const min = Array.isArray(bounds?.min) ? bounds.min : []
        const max = Array.isArray(bounds?.max) ? bounds.max : []
        const normalized = {
            min: [0, 1, 2].map((index) =>
                Number.isFinite(Number(min[index])) ? Number(min[index]) : -0.5
            ),
            max: [0, 1, 2].map((index) =>
                Number.isFinite(Number(max[index])) ? Number(max[index]) : 0.5
            )
        }

        for (let index = 0; index < 3; index += 1) {
            if (normalized.min[index] > normalized.max[index]) {
                const value = normalized.min[index]
                normalized.min[index] = normalized.max[index]
                normalized.max[index] = value
            }
        }

        return normalized
    }

    /**
     * Computes the bounds center.
     * @param {{ min: number[], max: number[] }} bounds Scene bounds.
     * @returns {number[]}
     */
    static #center(bounds) {
        return [0, 1, 2].map(
            (index) => (bounds.min[index] + bounds.max[index]) / 2
        )
    }

    /**
     * Resolves a camera view frame from a named preset.
     * @param {string | undefined} preset Candidate preset.
     * @returns {{ backward: number[], up: number[] }}
     */
    static #viewFrame(preset) {
        const normalized = PcbAssemblyGltfSceneCamera.#preset(preset)
        const frames = {
            top: {
                backward: [0, 1, 0],
                up: [0, 0, -1]
            },
            bottom: {
                backward: [0, -1, 0],
                up: [0, 0, 1]
            },
            front: {
                backward: [0, 0, 1],
                up: [0, 1, 0]
            },
            back: {
                backward: [0, 0, -1],
                up: [0, 1, 0]
            },
            right: {
                backward: [1, 0, 0],
                up: [0, 1, 0]
            },
            left: {
                backward: [-1, 0, 0],
                up: [0, 1, 0]
            },
            isometric: {
                backward: PcbAssemblyGltfSceneCamera.#normalize([
                    0.65, 0.45, 1
                ]),
                up: [0, 1, 0]
            }
        }

        return frames[normalized] || frames.isometric
    }

    /**
     * Normalizes a camera preset name.
     * @param {string | undefined} preset Candidate preset.
     * @returns {string}
     */
    static #preset(preset) {
        const normalized = String(preset || 'isometric')
            .toLowerCase()
            .replace(/[\s-]+/gu, '_')
        const aliases = {
            top_down: 'top',
            bottom_up: 'bottom',
            left_side: 'left',
            right_side: 'right'
        }
        const value = aliases[normalized] || normalized

        return [
            'isometric',
            'top',
            'bottom',
            'front',
            'back',
            'left',
            'right'
        ].includes(value)
            ? value
            : 'isometric'
    }

    /**
     * Resolves vertical field of view in radians.
     * @param {number | undefined} fovDegrees Candidate field of view.
     * @returns {number}
     */
    static #yfov(fovDegrees) {
        const degrees = Number(fovDegrees)
        if (!Number.isFinite(degrees)) {
            return DEFAULT_YFOV
        }

        return (Math.min(Math.max(degrees, 10), 100) * Math.PI) / 180
    }

    /**
     * Resolves camera aspect ratio.
     * @param {number | undefined} aspectRatio Candidate aspect ratio.
     * @returns {number}
     */
    static #aspectRatio(aspectRatio) {
        const value = Number(aspectRatio)
        if (!Number.isFinite(value) || value <= 0) {
            return DEFAULT_ASPECT_RATIO
        }

        return Math.min(Math.max(value, 0.1), 10)
    }

    /**
     * Returns true when an explicit aspect ratio should be emitted.
     * @param {object} options Camera options.
     * @returns {boolean}
     */
    static #hasAspectRatioOption(options) {
        const value = Number(options?.sceneCameraAspectRatio)
        return Number.isFinite(value) && value > 0
    }

    /**
     * Computes a perspective camera distance that frames the scene bounds.
     * @param {{ min: number[], max: number[] }} bounds Scene bounds.
     * @param {number[]} center Scene center.
     * @param {{ backward: number[], up: number[] }} frame Camera frame.
     * @param {number} yfov Vertical field of view in radians.
     * @param {number} aspectRatio Camera aspect ratio.
     * @returns {number}
     */
    static #fitDistance(bounds, center, frame, yfov, aspectRatio) {
        const basis = PcbAssemblyGltfSceneCamera.#basis(
            frame.backward,
            frame.up
        )
        const tanY = Math.tan(yfov / 2)
        const tanX = tanY * Math.max(aspectRatio, 0.0001)
        const requiredDistance = PcbAssemblyGltfSceneCamera.#corners(bounds)
            .map((corner) => {
                const offset = PcbAssemblyGltfSceneCamera.#subtract(
                    corner,
                    center
                )
                const depth = PcbAssemblyGltfSceneCamera.#dot(
                    offset,
                    basis.backward
                )
                const horizontal =
                    Math.abs(
                        PcbAssemblyGltfSceneCamera.#dot(offset, basis.right)
                    ) / tanX
                const vertical =
                    Math.abs(
                        PcbAssemblyGltfSceneCamera.#dot(offset, basis.up)
                    ) / tanY

                return Math.max(depth + horizontal, depth + vertical)
            })
            .reduce((max, value) => Math.max(max, value), 0)

        return Math.max(
            requiredDistance * FIT_MARGIN,
            PcbAssemblyGltfSceneCamera.#diagonal(bounds) * 0.55,
            1
        )
    }

    /**
     * Builds all bounding-box corners.
     * @param {{ min: number[], max: number[] }} bounds Scene bounds.
     * @returns {number[][]}
     */
    static #corners(bounds) {
        const corners = []
        for (const x of [bounds.min[0], bounds.max[0]]) {
            for (const y of [bounds.min[1], bounds.max[1]]) {
                for (const z of [bounds.min[2], bounds.max[2]]) {
                    corners.push([x, y, z])
                }
            }
        }
        return corners
    }

    /**
     * Computes bounds diagonal length.
     * @param {{ min: number[], max: number[] }} bounds Scene bounds.
     * @returns {number}
     */
    static #diagonal(bounds) {
        return Math.hypot(
            bounds.max[0] - bounds.min[0],
            bounds.max[1] - bounds.min[1],
            bounds.max[2] - bounds.min[2]
        )
    }

    /**
     * Resolves an orthonormal camera basis.
     * @param {number[]} backward Camera backward direction.
     * @param {number[]} upHint Preferred up direction.
     * @returns {{ right: number[], up: number[], backward: number[] }}
     */
    static #basis(backward, upHint) {
        const z = PcbAssemblyGltfSceneCamera.#normalize(backward)
        const fallbackUp = Math.abs(z[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]
        const candidateUp =
            Math.abs(PcbAssemblyGltfSceneCamera.#dot(z, upHint)) > 0.95
                ? fallbackUp
                : upHint
        const right = PcbAssemblyGltfSceneCamera.#normalize(
            PcbAssemblyGltfSceneCamera.#cross(candidateUp, z)
        )
        const up = PcbAssemblyGltfSceneCamera.#normalize(
            PcbAssemblyGltfSceneCamera.#cross(z, right)
        )

        return {
            right,
            up,
            backward: z
        }
    }

    /**
     * Builds a GLTF node quaternion that looks from position to target.
     * @param {number[]} position Camera position.
     * @param {number[]} target Camera target.
     * @param {number[]} upHint Preferred up direction.
     * @returns {number[]}
     */
    static #lookRotation(position, target, upHint) {
        const backward = PcbAssemblyGltfSceneCamera.#normalize(
            PcbAssemblyGltfSceneCamera.#subtract(position, target)
        )
        const basis = PcbAssemblyGltfSceneCamera.#basis(backward, upHint)

        return PcbAssemblyGltfSceneCamera.#quaternionFromBasis(basis)
    }

    /**
     * Converts a camera basis into a quaternion.
     * @param {{ right: number[], up: number[], backward: number[] }} basis Camera basis.
     * @returns {number[]}
     */
    static #quaternionFromBasis(basis) {
        const m00 = basis.right[0]
        const m01 = basis.up[0]
        const m02 = basis.backward[0]
        const m10 = basis.right[1]
        const m11 = basis.up[1]
        const m12 = basis.backward[1]
        const m20 = basis.right[2]
        const m21 = basis.up[2]
        const m22 = basis.backward[2]
        const trace = m00 + m11 + m22
        let quaternion

        if (trace > 0) {
            const scale = Math.sqrt(trace + 1) * 2
            quaternion = [
                (m21 - m12) / scale,
                (m02 - m20) / scale,
                (m10 - m01) / scale,
                0.25 * scale
            ]
        } else if (m00 > m11 && m00 > m22) {
            const scale = Math.sqrt(1 + m00 - m11 - m22) * 2
            quaternion = [
                0.25 * scale,
                (m01 + m10) / scale,
                (m02 + m20) / scale,
                (m21 - m12) / scale
            ]
        } else if (m11 > m22) {
            const scale = Math.sqrt(1 + m11 - m00 - m22) * 2
            quaternion = [
                (m01 + m10) / scale,
                0.25 * scale,
                (m12 + m21) / scale,
                (m02 - m20) / scale
            ]
        } else {
            const scale = Math.sqrt(1 + m22 - m00 - m11) * 2
            quaternion = [
                (m02 + m20) / scale,
                (m12 + m21) / scale,
                0.25 * scale,
                (m10 - m01) / scale
            ]
        }

        return PcbAssemblyGltfSceneCamera.#normalizeQuaternion(quaternion)
    }

    /**
     * Normalizes a quaternion.
     * @param {number[]} quaternion Candidate quaternion.
     * @returns {number[]}
     */
    static #normalizeQuaternion(quaternion) {
        const length = Math.hypot(
            quaternion[0],
            quaternion[1],
            quaternion[2],
            quaternion[3]
        )
        if (!Number.isFinite(length) || length <= 0) {
            return [0, 0, 0, 1]
        }

        return quaternion.map((value) => value / length)
    }

    /**
     * Subtracts two vectors.
     * @param {number[]} left Left vector.
     * @param {number[]} right Right vector.
     * @returns {number[]}
     */
    static #subtract(left, right) {
        return [0, 1, 2].map((index) => left[index] - right[index])
    }

    /**
     * Computes a dot product.
     * @param {number[]} left Left vector.
     * @param {number[]} right Right vector.
     * @returns {number}
     */
    static #dot(left, right) {
        return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
    }

    /**
     * Computes a cross product.
     * @param {number[]} left Left vector.
     * @param {number[]} right Right vector.
     * @returns {number[]}
     */
    static #cross(left, right) {
        return [
            left[1] * right[2] - left[2] * right[1],
            left[2] * right[0] - left[0] * right[2],
            left[0] * right[1] - left[1] * right[0]
        ]
    }

    /**
     * Normalizes a vector.
     * @param {number[]} vector Candidate vector.
     * @returns {number[]}
     */
    static #normalize(vector) {
        const length = Math.hypot(vector[0], vector[1], vector[2])
        if (!Number.isFinite(length) || length <= 0) {
            return [0, 0, 1]
        }

        return vector.map((value) => value / length)
    }
}
