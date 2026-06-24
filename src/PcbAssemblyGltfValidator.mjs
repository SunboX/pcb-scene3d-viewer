import { PcbAssemblyGltfModelMeshParser } from './PcbAssemblyGltfModelMeshParser.mjs'

/**
 * Performs structural validation for generated GLTF and GLB assembly payloads.
 */
export class PcbAssemblyGltfValidator {
    /**
     * Validates a GLTF JSON object, GLTF JSON string, or GLB byte payload.
     * @param {object | string | Uint8Array} payload GLTF or GLB payload.
     * @returns {{ severity: 'error', code: string, message: string }[]}
     */
    static validate(payload) {
        const issues = []

        try {
            const parsed = PcbAssemblyGltfValidator.#parsePayload(payload)
            PcbAssemblyGltfValidator.#validateDocument(parsed, issues)
        } catch (error) {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_parse_failed',
                    String(error?.message || error || 'Invalid GLTF payload.')
                )
            )
        }

        return issues
    }

    /**
     * Parses a supported validation payload.
     * @param {object | string | Uint8Array} payload GLTF or GLB payload.
     * @returns {{ gltf: object, binaryBuffer: Uint8Array | null }}
     */
    static #parsePayload(payload) {
        if (payload instanceof Uint8Array) {
            return PcbAssemblyGltfModelMeshParser.parseGlb(payload)
        }

        if (typeof payload === 'string') {
            return { gltf: JSON.parse(payload), binaryBuffer: null }
        }

        if (payload && typeof payload === 'object') {
            return { gltf: payload, binaryBuffer: null }
        }

        throw new Error('Unsupported GLTF validation payload.')
    }

    /**
     * Validates the main GLTF document graph.
     * @param {{ gltf: object, binaryBuffer: Uint8Array | null }} parsed Parsed payload.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateDocument(parsed, issues) {
        const gltf = parsed.gltf || {}
        if (String(gltf?.asset?.version || '') !== '2.0') {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_asset_version_invalid',
                    'GLTF asset version must be 2.0.'
                )
            )
        }

        PcbAssemblyGltfValidator.#validateScenes(gltf, issues)
        PcbAssemblyGltfValidator.#validateNodes(gltf, issues)
        PcbAssemblyGltfValidator.#validateMeshes(gltf, issues)
        PcbAssemblyGltfValidator.#validateBufferViews(
            gltf,
            parsed.binaryBuffer,
            issues
        )
        PcbAssemblyGltfValidator.#validateAccessors(gltf, issues)
        PcbAssemblyGltfValidator.#validateTextures(gltf, issues)
    }

    /**
     * Validates scenes and root node references.
     * @param {object} gltf GLTF JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateScenes(gltf, issues) {
        const scenes = PcbAssemblyGltfValidator.#array(gltf?.scenes)
        if (!scenes.length) {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_scene_missing',
                    'GLTF document must include at least one scene.'
                )
            )
            return
        }

        scenes.forEach((scene, sceneIndex) => {
            PcbAssemblyGltfValidator.#array(scene?.nodes).forEach(
                (nodeIndex) => {
                    if (
                        !PcbAssemblyGltfValidator.#hasIndex(
                            gltf?.nodes,
                            nodeIndex
                        )
                    ) {
                        issues.push(
                            PcbAssemblyGltfValidator.#issue(
                                'gltf_scene_node_invalid',
                                'Scene ' +
                                    sceneIndex +
                                    ' references a missing node.'
                            )
                        )
                    }
                }
            )
        })
    }

    /**
     * Validates node mesh and child references.
     * @param {object} gltf GLTF JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateNodes(gltf, issues) {
        PcbAssemblyGltfValidator.#array(gltf?.nodes).forEach(
            (node, nodeIndex) => {
                if (
                    Number.isInteger(node?.mesh) &&
                    !PcbAssemblyGltfValidator.#hasIndex(gltf?.meshes, node.mesh)
                ) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_node_mesh_invalid',
                            'Node ' + nodeIndex + ' references a missing mesh.'
                        )
                    )
                }

                PcbAssemblyGltfValidator.#array(node?.children).forEach(
                    (childIndex) => {
                        if (
                            !PcbAssemblyGltfValidator.#hasIndex(
                                gltf?.nodes,
                                childIndex
                            )
                        ) {
                            issues.push(
                                PcbAssemblyGltfValidator.#issue(
                                    'gltf_node_child_invalid',
                                    'Node ' +
                                        nodeIndex +
                                        ' references a missing child node.'
                                )
                            )
                        }
                    }
                )
            }
        )
    }

    /**
     * Validates mesh primitive references.
     * @param {object} gltf GLTF JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateMeshes(gltf, issues) {
        PcbAssemblyGltfValidator.#array(gltf?.meshes).forEach(
            (mesh, meshIndex) => {
                PcbAssemblyGltfValidator.#array(mesh?.primitives).forEach(
                    (primitive, primitiveIndex) => {
                        PcbAssemblyGltfValidator.#validatePrimitive(
                            gltf,
                            meshIndex,
                            primitiveIndex,
                            primitive,
                            issues
                        )
                    }
                )
            }
        )
    }

    /**
     * Validates one primitive.
     * @param {object} gltf GLTF JSON.
     * @param {number} meshIndex Mesh index.
     * @param {number} primitiveIndex Primitive index.
     * @param {object} primitive Primitive JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validatePrimitive(
        gltf,
        meshIndex,
        primitiveIndex,
        primitive,
        issues
    ) {
        const positionAccessor = primitive?.attributes?.POSITION
        if (
            !Number.isInteger(positionAccessor) ||
            !PcbAssemblyGltfValidator.#hasIndex(
                gltf?.accessors,
                positionAccessor
            )
        ) {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_primitive_position_invalid',
                    'Mesh ' +
                        meshIndex +
                        ' primitive ' +
                        primitiveIndex +
                        ' must reference a POSITION accessor.'
                )
            )
        }

        if (
            Number.isInteger(primitive?.indices) &&
            !PcbAssemblyGltfValidator.#hasIndex(
                gltf?.accessors,
                primitive.indices
            )
        ) {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_primitive_indices_invalid',
                    'Mesh ' +
                        meshIndex +
                        ' primitive ' +
                        primitiveIndex +
                        ' references a missing index accessor.'
                )
            )
        }

        if (
            Number.isInteger(primitive?.material) &&
            !PcbAssemblyGltfValidator.#hasIndex(
                gltf?.materials,
                primitive.material
            )
        ) {
            issues.push(
                PcbAssemblyGltfValidator.#issue(
                    'gltf_primitive_material_invalid',
                    'Mesh ' +
                        meshIndex +
                        ' primitive ' +
                        primitiveIndex +
                        ' references a missing material.'
                )
            )
        }
    }

    /**
     * Validates buffer view ranges.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array | null} binaryBuffer GLB binary chunk.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateBufferViews(gltf, binaryBuffer, issues) {
        const buffers = PcbAssemblyGltfValidator.#array(gltf?.buffers)
        PcbAssemblyGltfValidator.#array(gltf?.bufferViews).forEach(
            (bufferView, index) => {
                const bufferIndex = Number(bufferView?.buffer || 0)
                const buffer = buffers[bufferIndex]
                if (!buffer) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_buffer_view_buffer_invalid',
                            'Buffer view ' +
                                index +
                                ' references a missing buffer.'
                        )
                    )
                    return
                }

                const bufferLength =
                    Number(buffer.byteLength || 0) ||
                    PcbAssemblyGltfValidator.#bufferUriLength(buffer?.uri) ||
                    Number(binaryBuffer?.byteLength || 0)
                const end =
                    Number(bufferView.byteOffset || 0) +
                    Number(bufferView.byteLength || 0)
                if (end > bufferLength) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_buffer_view_range_invalid',
                            'Buffer view ' + index + ' exceeds its buffer.'
                        )
                    )
                }
            }
        )
    }

    /**
     * Validates accessor buffer-view references.
     * @param {object} gltf GLTF JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateAccessors(gltf, issues) {
        PcbAssemblyGltfValidator.#array(gltf?.accessors).forEach(
            (accessor, index) => {
                if (
                    !PcbAssemblyGltfValidator.#hasIndex(
                        gltf?.bufferViews,
                        accessor?.bufferView
                    )
                ) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_accessor_buffer_view_invalid',
                            'Accessor ' +
                                index +
                                ' references a missing buffer view.'
                        )
                    )
                }
                if (!(Number(accessor?.count || 0) > 0)) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_accessor_count_invalid',
                            'Accessor ' + index + ' must contain values.'
                        )
                    )
                }
            }
        )
    }

    /**
     * Validates texture, sampler, and image references.
     * @param {object} gltf GLTF JSON.
     * @param {{ severity: 'error', code: string, message: string }[]} issues Mutable issues.
     * @returns {void}
     */
    static #validateTextures(gltf, issues) {
        PcbAssemblyGltfValidator.#array(gltf?.textures).forEach(
            (texture, index) => {
                if (
                    !PcbAssemblyGltfValidator.#hasIndex(
                        gltf?.images,
                        texture?.source
                    )
                ) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_texture_image_invalid',
                            'Texture ' + index + ' references a missing image.'
                        )
                    )
                }
            }
        )

        PcbAssemblyGltfValidator.#array(gltf?.materials).forEach(
            (material, index) => {
                const textureIndex =
                    material?.pbrMetallicRoughness?.baseColorTexture?.index
                if (
                    Number.isInteger(textureIndex) &&
                    !PcbAssemblyGltfValidator.#hasIndex(
                        gltf?.textures,
                        textureIndex
                    )
                ) {
                    issues.push(
                        PcbAssemblyGltfValidator.#issue(
                            'gltf_material_texture_invalid',
                            'Material ' +
                                index +
                                ' references a missing texture.'
                        )
                    )
                }
            }
        )
    }

    /**
     * Returns embedded buffer URI byte length.
     * @param {string | undefined} uri Buffer URI.
     * @returns {number}
     */
    static #bufferUriLength(uri) {
        const text = String(uri || '')
        const commaIndex = text.indexOf(',')
        if (!text.startsWith('data:') || commaIndex < 0) {
            return 0
        }

        const payload = text.slice(commaIndex + 1)
        if (text.slice(0, commaIndex).includes(';base64')) {
            return PcbAssemblyGltfValidator.#base64Length(payload)
        }

        return decodeURIComponent(payload).length
    }

    /**
     * Computes decoded base64 byte length.
     * @param {string} value Base64 string.
     * @returns {number}
     */
    static #base64Length(value) {
        const normalized = String(value || '').replace(/=+$/u, '')
        return Math.floor((normalized.length * 3) / 4)
    }

    /**
     * Returns true when an array contains an integer index.
     * @param {unknown} value Candidate array.
     * @param {unknown} index Candidate index.
     * @returns {boolean}
     */
    static #hasIndex(value, index) {
        return (
            Array.isArray(value) &&
            Number.isInteger(index) &&
            index >= 0 &&
            index < value.length
        )
    }

    /**
     * Creates one validation issue.
     * @param {string} code Issue code.
     * @param {string} message Human-readable message.
     * @returns {{ severity: 'error', code: string, message: string }}
     */
    static #issue(code, message) {
        return {
            severity: 'error',
            code,
            message
        }
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate value.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }
}
