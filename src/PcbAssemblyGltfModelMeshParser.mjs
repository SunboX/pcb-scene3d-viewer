import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'

const MM_TO_MIL = 1000 / 25.4
const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const JSON_CHUNK_TYPE = 0x4e4f534a
const BIN_CHUNK_TYPE = 0x004e4942
const COMPONENT_BYTE_LENGTHS = new Map([
    [5120, 1],
    [5121, 1],
    [5122, 2],
    [5123, 2],
    [5125, 4],
    [5126, 4]
])
const ACCESSOR_WIDTHS = new Map([
    ['SCALAR', 1],
    ['VEC2', 2],
    ['VEC3', 3],
    ['VEC4', 4],
    ['MAT4', 16]
])

/**
 * Parses GLTF 2.0 JSON and binary GLB component models into assembly meshes.
 */
export class PcbAssemblyGltfModelMeshParser {
    /**
     * Parses one GLTF JSON model.
     * @param {{ name?: string, payloadText?: string, file?: any }} model Model metadata.
     * @returns {Promise<object[]>}
     */
    static async parseGltfModel(model) {
        const text = await PcbAssemblyGltfModelMeshParser.#readModelText(
            model,
            'GLTF'
        )
        const gltf = JSON.parse(text)
        return await PcbAssemblyGltfModelMeshParser.#parseDocument(
            gltf,
            model,
            null
        )
    }

    /**
     * Parses one binary GLB model.
     * @param {{ name?: string, payloadBytes?: any, bytes?: any, file?: any }} model Model metadata.
     * @returns {Promise<object[]>}
     */
    static async parseGlbModel(model) {
        const bytes = await PcbAssemblyGltfModelMeshParser.#readModelBytes(
            model,
            'GLB'
        )
        const parsed = PcbAssemblyGltfModelMeshParser.parseGlb(bytes)
        return await PcbAssemblyGltfModelMeshParser.#parseDocument(
            parsed.gltf,
            model,
            parsed.binaryBuffer
        )
    }

    /**
     * Extracts a JSON document and optional binary chunk from GLB bytes.
     * @param {Uint8Array} bytes GLB bytes.
     * @returns {{ gltf: object, binaryBuffer: Uint8Array | null }}
     */
    static parseGlb(bytes) {
        if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20) {
            throw new Error('GLB content is not available.')
        }

        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        )
        if (
            view.getUint32(0, true) !== GLB_MAGIC ||
            view.getUint32(4, true) !== GLB_VERSION
        ) {
            throw new Error('GLB header is not valid.')
        }

        const totalLength = view.getUint32(8, true)
        if (totalLength > bytes.byteLength) {
            throw new Error('GLB length exceeds available bytes.')
        }

        let offset = 12
        let json = null
        let binaryBuffer = null
        while (offset + 8 <= totalLength) {
            const chunkLength = view.getUint32(offset, true)
            const chunkType = view.getUint32(offset + 4, true)
            const chunkOffset = offset + 8
            const chunkEnd = chunkOffset + chunkLength
            if (chunkEnd > totalLength) {
                throw new Error('GLB chunk exceeds container length.')
            }

            const chunk = bytes.slice(chunkOffset, chunkEnd)
            if (chunkType === JSON_CHUNK_TYPE) {
                json = JSON.parse(new TextDecoder().decode(chunk).trim())
            } else if (chunkType === BIN_CHUNK_TYPE) {
                binaryBuffer = chunk
            }
            offset = chunkEnd
        }

        if (!json) {
            throw new Error('GLB JSON chunk is missing.')
        }

        return { gltf: json, binaryBuffer }
    }

    /**
     * Parses a loaded GLTF document.
     * @param {object} gltf GLTF JSON.
     * @param {object} model Model metadata.
     * @param {Uint8Array | null} binaryBuffer Optional GLB binary chunk.
     * @returns {Promise<object[]>}
     */
    static async #parseDocument(gltf, model, binaryBuffer) {
        const buffers = await PcbAssemblyGltfModelMeshParser.#resolveBuffers(
            gltf,
            model,
            binaryBuffer
        )
        const meshes = []
        const sceneNodes =
            PcbAssemblyGltfModelMeshParser.#sceneNodeIndexes(gltf)

        if (sceneNodes.length) {
            sceneNodes.forEach((nodeIndex) => {
                PcbAssemblyGltfModelMeshParser.#appendNodeMeshes(
                    gltf,
                    buffers,
                    nodeIndex,
                    PcbAssemblyGltfModelMeshParser.#identityMatrix(),
                    meshes
                )
            })
        } else {
            PcbAssemblyGltfModelMeshParser.#array(gltf?.meshes).forEach(
                (mesh, index) => {
                    PcbAssemblyGltfModelMeshParser.#appendMeshPrimitives(
                        gltf,
                        buffers,
                        mesh,
                        PcbAssemblyGltfModelMeshParser.#identityMatrix(),
                        meshes,
                        index
                    )
                }
            )
        }

        if (!meshes.length) {
            throw new Error('No mesh geometry was found in GLTF.')
        }

        return meshes.map((mesh, index) => ({
            ...mesh,
            name:
                mesh.name || String(model?.name || 'gltf-model-' + (index + 1))
        }))
    }

    /**
     * Appends meshes from one node and its children.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array[]} buffers Loaded buffers.
     * @param {number} nodeIndex Node index.
     * @param {number[]} parentMatrix Parent transform matrix.
     * @param {object[]} meshes Mutable mesh output.
     * @returns {void}
     */
    static #appendNodeMeshes(gltf, buffers, nodeIndex, parentMatrix, meshes) {
        const node = PcbAssemblyGltfModelMeshParser.#array(gltf?.nodes)[
            nodeIndex
        ]
        if (!node) {
            return
        }

        const matrix = PcbAssemblyGltfModelMeshParser.#multiplyMatrices(
            parentMatrix,
            PcbAssemblyGltfModelMeshParser.#nodeMatrix(node)
        )
        const meshIndex = Number(node.mesh)
        if (Number.isInteger(meshIndex)) {
            PcbAssemblyGltfModelMeshParser.#appendMeshPrimitives(
                gltf,
                buffers,
                PcbAssemblyGltfModelMeshParser.#array(gltf?.meshes)[meshIndex],
                matrix,
                meshes,
                meshIndex,
                node
            )
        }

        PcbAssemblyGltfModelMeshParser.#array(node.children).forEach(
            (childIndex) => {
                PcbAssemblyGltfModelMeshParser.#appendNodeMeshes(
                    gltf,
                    buffers,
                    Number(childIndex),
                    matrix,
                    meshes
                )
            }
        )
    }

    /**
     * Appends primitives from one GLTF mesh.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array[]} buffers Loaded buffers.
     * @param {object | undefined} mesh GLTF mesh.
     * @param {number[]} matrix Node transform matrix.
     * @param {object[]} meshes Mutable mesh output.
     * @param {number} meshIndex Mesh index.
     * @param {object | null} [node] Node metadata.
     * @returns {void}
     */
    static #appendMeshPrimitives(
        gltf,
        buffers,
        mesh,
        matrix,
        meshes,
        meshIndex,
        node = null
    ) {
        PcbAssemblyGltfModelMeshParser.#array(mesh?.primitives).forEach(
            (primitive, primitiveIndex) => {
                const parsed = PcbAssemblyGltfModelMeshParser.#primitiveMesh(
                    gltf,
                    buffers,
                    mesh,
                    primitive,
                    matrix,
                    meshIndex,
                    primitiveIndex,
                    node
                )
                if (parsed) {
                    meshes.push(parsed)
                }
            }
        )
    }

    /**
     * Converts one GLTF primitive into an assembly mesh.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array[]} buffers Loaded buffers.
     * @param {object | undefined} mesh GLTF mesh.
     * @param {object} primitive GLTF primitive.
     * @param {number[]} matrix Node transform matrix.
     * @param {number} meshIndex Mesh index.
     * @param {number} primitiveIndex Primitive index.
     * @param {object | null} node Node metadata.
     * @returns {object | null}
     */
    static #primitiveMesh(
        gltf,
        buffers,
        mesh,
        primitive,
        matrix,
        meshIndex,
        primitiveIndex,
        node
    ) {
        if ((primitive?.mode ?? 4) !== 4) {
            return null
        }

        const positionAccessor = primitive?.attributes?.POSITION
        if (!Number.isInteger(positionAccessor)) {
            return null
        }

        const positions = PcbAssemblyGltfModelMeshParser.#readAccessor(
            gltf,
            buffers,
            positionAccessor
        )
        const vertices = positions.map((point) =>
            PcbAssemblyGltfModelMeshParser.#pointMmToMil(
                PcbAssemblyGltfModelMeshParser.#transformPoint(matrix, point)
            )
        )
        const vertexColors = PcbAssemblyGltfModelMeshParser.#vertexColors(
            gltf,
            buffers,
            primitive,
            vertices.length
        )
        const indexes = Number.isInteger(primitive?.indices)
            ? PcbAssemblyGltfModelMeshParser.#readAccessor(
                  gltf,
                  buffers,
                  primitive.indices
              ).flat()
            : vertices.map((_vertex, index) => index)
        const faces =
            PcbAssemblyGltfModelMeshParser.#triangleFacesFromIndexes(indexes)

        if (!vertices.length || !faces.length) {
            return null
        }

        return {
            name: PcbAssemblyGltfModelMeshParser.#primitiveName(
                mesh,
                node,
                meshIndex,
                primitiveIndex
            ),
            vertices,
            faces,
            ...PcbAssemblyGltfModelMeshParser.#primitiveMaterial(
                gltf,
                primitive
            ),
            ...(vertexColors.length ? { vertexColors } : {})
        }
    }

    /**
     * Reads optional per-vertex GLTF colors.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array[]} buffers Loaded buffers.
     * @param {object} primitive GLTF primitive.
     * @param {number} vertexCount Expected vertex count.
     * @returns {number[][]}
     */
    static #vertexColors(gltf, buffers, primitive, vertexCount) {
        const colorAccessor = primitive?.attributes?.COLOR_0
        if (!Number.isInteger(colorAccessor)) {
            return []
        }

        const colors = PcbAssemblyGltfModelMeshParser.#readAccessor(
            gltf,
            buffers,
            colorAccessor
        )
        if (colors.length !== vertexCount) {
            return []
        }

        return colors.map((color) =>
            PcbAssemblyGltfModelMeshParser.#vertexColor(color)
        )
    }

    /**
     * Normalizes one GLTF vertex color tuple.
     * @param {number[]} color Source color tuple.
     * @returns {number[]}
     */
    static #vertexColor(color) {
        const rgb = [0, 1, 2].map((index) =>
            PcbAssemblyGltfModelMeshParser.#clampUnit(color?.[index])
        )
        if (color.length >= 4) {
            return [
                ...rgb,
                PcbAssemblyGltfModelMeshParser.#clampUnit(color[3], 1)
            ]
        }
        return rgb
    }

    /**
     * Reads an accessor into numeric tuples.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array[]} buffers Loaded buffers.
     * @param {number} accessorIndex Accessor index.
     * @returns {number[][]}
     */
    static #readAccessor(gltf, buffers, accessorIndex) {
        const accessor = PcbAssemblyGltfModelMeshParser.#array(gltf?.accessors)[
            accessorIndex
        ]
        const bufferView = PcbAssemblyGltfModelMeshParser.#array(
            gltf?.bufferViews
        )[Number(accessor?.bufferView)]
        if (!accessor || !bufferView) {
            return []
        }

        const componentLength =
            COMPONENT_BYTE_LENGTHS.get(Number(accessor.componentType)) || 0
        const width =
            ACCESSOR_WIDTHS.get(String(accessor.type || 'SCALAR')) || 1
        const buffer =
            buffers[Number(bufferView.buffer || 0)] || new Uint8Array()
        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        )
        const stride =
            Number(bufferView.byteStride || 0) || componentLength * width
        const baseOffset =
            Number(bufferView.byteOffset || 0) +
            Number(accessor.byteOffset || 0)
        const values = []

        for (let index = 0; index < Number(accessor.count || 0); index += 1) {
            const tuple = []
            const tupleOffset = baseOffset + index * stride
            for (let entry = 0; entry < width; entry += 1) {
                tuple.push(
                    PcbAssemblyGltfModelMeshParser.#readComponent(
                        view,
                        tupleOffset + entry * componentLength,
                        Number(accessor.componentType),
                        accessor.normalized === true
                    )
                )
            }
            values.push(tuple)
        }

        return values
    }

    /**
     * Reads one accessor component.
     * @param {DataView} view Binary view.
     * @param {number} offset Byte offset.
     * @param {number} componentType GLTF component type.
     * @param {boolean} normalized Whether integer data is normalized.
     * @returns {number}
     */
    static #readComponent(view, offset, componentType, normalized) {
        if (offset < 0 || offset >= view.byteLength) {
            return 0
        }

        if (componentType === 5120) {
            const value = view.getInt8(offset)
            return normalized ? Math.max(value / 127, -1) : value
        }
        if (componentType === 5121) {
            const value = view.getUint8(offset)
            return normalized ? value / 255 : value
        }
        if (componentType === 5122) {
            const value = view.getInt16(offset, true)
            return normalized ? Math.max(value / 32767, -1) : value
        }
        if (componentType === 5123) {
            const value = view.getUint16(offset, true)
            return normalized ? value / 65535 : value
        }
        if (componentType === 5125) {
            return view.getUint32(offset, true)
        }
        if (componentType === 5126) {
            return view.getFloat32(offset, true)
        }
        return 0
    }

    /**
     * Builds triangle faces from flat indexes.
     * @param {number[]} indexes Flat indexes.
     * @returns {number[][]}
     */
    static #triangleFacesFromIndexes(indexes) {
        const faces = []
        for (let index = 0; index + 2 < indexes.length; index += 3) {
            faces.push([
                Number(indexes[index] || 0),
                Number(indexes[index + 1] || 0),
                Number(indexes[index + 2] || 0)
            ])
        }
        return faces
    }

    /**
     * Resolves material properties for one primitive.
     * @param {object} gltf GLTF JSON.
     * @param {object} primitive GLTF primitive.
     * @returns {{ color?: number[] }}
     */
    static #primitiveMaterial(gltf, primitive) {
        const materialIndex = Number(primitive?.material)
        const material = Number.isInteger(materialIndex)
            ? PcbAssemblyGltfModelMeshParser.#array(gltf?.materials)[
                  materialIndex
              ]
            : null
        const color =
            material?.pbrMetallicRoughness?.baseColorFactor ||
            material?.baseColorFactor

        if (!Array.isArray(color) || color.length < 3) {
            return {}
        }

        const rgb = [0, 1, 2].map((index) =>
            PcbAssemblyGltfModelMeshParser.#clampUnit(color[index])
        )
        const alpha = PcbAssemblyGltfModelMeshParser.#clampUnit(color[3], 1)

        return {
            color: alpha < 1 ? [...rgb, alpha] : rgb
        }
    }

    /**
     * Clamps a numeric channel into the unit interval.
     * @param {unknown} value Candidate number.
     * @param {number} [fallback] Fallback value.
     * @returns {number}
     */
    static #clampUnit(value, fallback = 0) {
        const number = Number(value)
        return Number.isFinite(number)
            ? Math.min(Math.max(number, 0), 1)
            : fallback
    }

    /**
     * Resolves a stable primitive mesh name.
     * @param {object | undefined} mesh GLTF mesh.
     * @param {object | null} node GLTF node.
     * @param {number} meshIndex Mesh index.
     * @param {number} primitiveIndex Primitive index.
     * @returns {string}
     */
    static #primitiveName(mesh, node, meshIndex, primitiveIndex) {
        return String(
            node?.name ||
                mesh?.name ||
                'gltf-mesh-' + (meshIndex + 1) + '-' + (primitiveIndex + 1)
        )
    }

    /**
     * Resolves all declared buffers.
     * @param {object} gltf GLTF JSON.
     * @param {object} model Model metadata.
     * @param {Uint8Array | null} binaryBuffer GLB binary chunk.
     * @returns {Promise<Uint8Array[]>}
     */
    static async #resolveBuffers(gltf, model, binaryBuffer) {
        const buffers = []
        for (const buffer of PcbAssemblyGltfModelMeshParser.#array(
            gltf?.buffers
        )) {
            buffers.push(
                await PcbAssemblyGltfModelMeshParser.#resolveBuffer(
                    buffer,
                    model,
                    binaryBuffer
                )
            )
        }
        return buffers
    }

    /**
     * Resolves one GLTF buffer.
     * @param {object} buffer GLTF buffer.
     * @param {object} model Model metadata.
     * @param {Uint8Array | null} binaryBuffer GLB binary chunk.
     * @returns {Promise<Uint8Array>}
     */
    static async #resolveBuffer(buffer, model, binaryBuffer) {
        const uri = String(buffer?.uri || '')
        if (!uri && binaryBuffer) {
            return binaryBuffer.slice(0, Number(buffer?.byteLength || 0))
        }

        if (uri.startsWith('data:')) {
            return PcbAssemblyGltfModelMeshParser.#dataUriBytes(uri)
        }

        if (uri) {
            const external = await PcbAssemblyGltfModelMeshParser.#readResource(
                uri,
                model
            )
            if (external) {
                return external
            }
        }

        throw new Error('GLTF buffer content is not available.')
    }

    /**
     * Reads a resource that matches an external buffer URI.
     * @param {string} uri Buffer URI.
     * @param {object} model Model metadata.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #readResource(uri, model) {
        const normalizedUri = PcbAssemblyGltfModelMeshParser.#normalizePath(uri)
        const uriName = normalizedUri.split('/').pop()

        for (const resource of PcbAssemblyGltfModelMeshParser.#resources(
            model
        )) {
            const names =
                PcbAssemblyGltfModelMeshParser.#resourceNames(resource)
            if (
                names.some(
                    (name) =>
                        name === normalizedUri ||
                        name.endsWith('/' + normalizedUri) ||
                        name.split('/').pop() === uriName
                )
            ) {
                const bytes =
                    await PcbAssemblyGltfModelMeshParser.#readAnyBytes(resource)
                if (bytes) {
                    return bytes
                }
            }
        }

        return null
    }

    /**
     * Collects sidecar resource candidates from model metadata.
     * @param {object} model Model metadata.
     * @returns {object[]}
     */
    static #resources(model) {
        const resources = []
        ;[
            model?.resources,
            model?.relatedFiles,
            model?.assets,
            model?.files,
            model?.externalBuffers,
            model?.bufferFiles
        ].forEach((value) => {
            if (Array.isArray(value)) {
                resources.push(...value)
            } else if (value && typeof value === 'object') {
                Object.entries(value).forEach(([name, entry]) => {
                    resources.push({ name, ...(entry || {}) })
                })
            }
        })
        return resources
    }

    /**
     * Returns normalized resource names used for URI matching.
     * @param {object} resource Resource metadata.
     * @returns {string[]}
     */
    static #resourceNames(resource) {
        return [
            resource?.uri,
            resource?.relativePath,
            resource?.name,
            resource?.file?.name,
            resource?.sourceUrl
        ]
            .map((value) =>
                PcbAssemblyGltfModelMeshParser.#normalizePath(value)
            )
            .filter(Boolean)
    }

    /**
     * Builds node indexes from the active scene.
     * @param {object} gltf GLTF JSON.
     * @returns {number[]}
     */
    static #sceneNodeIndexes(gltf) {
        const scenes = PcbAssemblyGltfModelMeshParser.#array(gltf?.scenes)
        const sceneIndex = Number.isInteger(gltf?.scene) ? gltf.scene : 0
        const scene = scenes[sceneIndex] || scenes[0]
        if (Array.isArray(scene?.nodes)) {
            return scene.nodes
                .map((index) => Number(index))
                .filter(Number.isInteger)
        }

        return PcbAssemblyGltfModelMeshParser.#array(gltf?.nodes)
            .map((node, index) => (Number.isInteger(node?.mesh) ? index : -1))
            .filter((index) => index >= 0)
    }

    /**
     * Builds a node transform matrix.
     * @param {object} node GLTF node.
     * @returns {number[]}
     */
    static #nodeMatrix(node) {
        if (Array.isArray(node?.matrix) && node.matrix.length >= 16) {
            return node.matrix.slice(0, 16).map((value) => Number(value || 0))
        }

        return PcbAssemblyGltfModelMeshParser.#trsMatrix(
            node?.translation,
            node?.rotation,
            node?.scale
        )
    }

    /**
     * Builds a transform matrix from translation, rotation, and scale.
     * @param {number[] | undefined} translation Node translation.
     * @param {number[] | undefined} rotation Node quaternion.
     * @param {number[] | undefined} scale Node scale.
     * @returns {number[]}
     */
    static #trsMatrix(translation, rotation, scale) {
        const t = [0, 1, 2].map((index) => Number(translation?.[index] || 0))
        const s = [0, 1, 2].map((index) => Number(scale?.[index] ?? 1) || 1)
        const q = [
            Number(rotation?.[0] || 0),
            Number(rotation?.[1] || 0),
            Number(rotation?.[2] || 0),
            Number(rotation?.[3] ?? 1) || 1
        ]
        const x2 = q[0] + q[0]
        const y2 = q[1] + q[1]
        const z2 = q[2] + q[2]
        const xx = q[0] * x2
        const xy = q[0] * y2
        const xz = q[0] * z2
        const yy = q[1] * y2
        const yz = q[1] * z2
        const zz = q[2] * z2
        const wx = q[3] * x2
        const wy = q[3] * y2
        const wz = q[3] * z2

        return [
            (1 - (yy + zz)) * s[0],
            (xy + wz) * s[0],
            (xz - wy) * s[0],
            0,
            (xy - wz) * s[1],
            (1 - (xx + zz)) * s[1],
            (yz + wx) * s[1],
            0,
            (xz + wy) * s[2],
            (yz - wx) * s[2],
            (1 - (xx + yy)) * s[2],
            0,
            t[0],
            t[1],
            t[2],
            1
        ]
    }

    /**
     * Returns an identity matrix.
     * @returns {number[]}
     */
    static #identityMatrix() {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }

    /**
     * Multiplies two column-major matrices.
     * @param {number[]} left Left matrix.
     * @param {number[]} right Right matrix.
     * @returns {number[]}
     */
    static #multiplyMatrices(left, right) {
        const result = new Array(16).fill(0)
        for (let column = 0; column < 4; column += 1) {
            for (let row = 0; row < 4; row += 1) {
                for (let index = 0; index < 4; index += 1) {
                    result[column * 4 + row] +=
                        left[index * 4 + row] * right[column * 4 + index]
                }
            }
        }
        return result
    }

    /**
     * Transforms one point by a column-major matrix.
     * @param {number[]} matrix Transform matrix.
     * @param {number[]} point Source point.
     * @returns {number[]}
     */
    static #transformPoint(matrix, point) {
        const x = Number(point?.[0] || 0)
        const y = Number(point?.[1] || 0)
        const z = Number(point?.[2] || 0)
        return [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
        ]
    }

    /**
     * Converts one point from millimeters into internal mils.
     * @param {number[]} point Point in millimeters.
     * @returns {number[]}
     */
    static #pointMmToMil(point) {
        return [0, 1, 2].map((index) => Number(point?.[index] || 0) * MM_TO_MIL)
    }

    /**
     * Decodes a data URI into bytes.
     * @param {string} uri Data URI.
     * @returns {Uint8Array}
     */
    static #dataUriBytes(uri) {
        const commaIndex = uri.indexOf(',')
        if (commaIndex < 0) {
            return new Uint8Array()
        }

        const metadata = uri.slice(0, commaIndex)
        const payload = uri.slice(commaIndex + 1)
        if (metadata.includes(';base64')) {
            return PcbAssemblyGltfModelMeshParser.#base64Bytes(payload)
        }

        return new TextEncoder().encode(decodeURIComponent(payload))
    }

    /**
     * Decodes base64 in Node and browser runtimes.
     * @param {string} value Base64 value.
     * @returns {Uint8Array}
     */
    static #base64Bytes(value) {
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(value, 'base64'))
        }

        const binary = atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
        }
        return bytes
    }

    /**
     * Reads model metadata as UTF-8 text.
     * @param {{ payloadText?: string, file?: any }} model Model metadata.
     * @param {string} label Format label.
     * @returns {Promise<string>}
     */
    static async #readModelText(model, label) {
        if (typeof model?.payloadText === 'string') {
            return model.payloadText
        }
        if (typeof model?.file?.text === 'function') {
            return await model.file.text()
        }

        return new TextDecoder().decode(
            await PcbAssemblyGltfModelMeshParser.#readModelBytes(model, label)
        )
    }

    /**
     * Reads model metadata as bytes.
     * @param {{ payloadText?: string, payloadBytes?: any, bytes?: any, file?: any }} model Model metadata.
     * @param {string} label Format label.
     * @returns {Promise<Uint8Array>}
     */
    static async #readModelBytes(model, label) {
        const bytes = await PcbAssemblyGltfModelMeshParser.#readAnyBytes(model)
        if (bytes) {
            return bytes
        }

        throw PcbScene3dModelContent.unavailableError(label)
    }

    /**
     * Reads byte-like values from common metadata shapes.
     * @param {{ payloadText?: string, payloadBytes?: any, bytes?: any, data?: any, file?: any }} source Source metadata.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #readAnyBytes(source) {
        if (typeof source?.payloadText === 'string') {
            return new TextEncoder().encode(source.payloadText)
        }

        for (const value of [
            source?.payloadBytes,
            source?.bytes,
            source?.data,
            source?.file,
            source
        ]) {
            const bytes =
                await PcbAssemblyGltfModelMeshParser.#bytesFromValue(value)
            if (bytes) {
                return bytes
            }
        }

        return null
    }

    /**
     * Converts one byte-like value to a Uint8Array.
     * @param {any} value Candidate value.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #bytesFromValue(value) {
        if (!value || typeof value === 'string') {
            return null
        }
        if (value instanceof Uint8Array) {
            return value
        }
        if (value instanceof ArrayBuffer) {
            return new Uint8Array(value)
        }
        if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        }
        if (typeof value.arrayBuffer === 'function') {
            return new Uint8Array(await value.arrayBuffer())
        }
        return null
    }

    /**
     * Normalizes a path-like value for matching.
     * @param {unknown} value Path candidate.
     * @returns {string}
     */
    static #normalizePath(value) {
        return String(value || '')
            .split(/[?#]/u)[0]
            .replace(/\\/gu, '/')
            .replace(/^\/+/u, '')
            .toLowerCase()
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
