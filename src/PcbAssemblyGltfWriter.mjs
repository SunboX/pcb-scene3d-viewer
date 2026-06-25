import { PcbAssemblyExportCoordinateFrame } from './PcbAssemblyExportCoordinateFrame.mjs'
import { PcbAssemblyPolygonTriangulator } from './PcbAssemblyPolygonTriangulator.mjs'

const FLOAT_COMPONENT = 5126
const UNSIGNED_INT_COMPONENT = 5125
const ARRAY_BUFFER_TARGET = 34962
const ELEMENT_ARRAY_BUFFER_TARGET = 34963
const TRIANGLES_MODE = 4
const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const JSON_CHUNK_TYPE = 0x4e4f534a
const BIN_CHUNK_TYPE = 0x004e4942

/**
 * Writes faceted PCB assembly meshes as GLTF 2.0 JSON or binary GLB.
 */
export class PcbAssemblyGltfWriter {
    /**
     * Writes a GLTF or GLB assembly document.
     * @param {{ name?: string, meshes?: object[], format?: string, binary?: boolean, includeSceneMetadata?: boolean }} assembly Assembly data.
     * @returns {object | Uint8Array}
     */
    static write(assembly = {}) {
        const format = String(assembly?.format || '').toLowerCase()
        const binary = assembly?.binary === true || format === 'glb'
        const document = PcbAssemblyGltfWriter.#buildDocument(assembly, binary)

        return binary
            ? PcbAssemblyGltfWriter.#writeGlb(document.gltf, document.buffer)
            : document.gltf
    }

    /**
     * Builds the GLTF JSON tree and shared binary buffer.
     * @param {{ name?: string, meshes?: object[], includeSceneMetadata?: boolean }} assembly Assembly data.
     * @param {boolean} binary Whether the document will be embedded in GLB.
     * @returns {{ gltf: object, buffer: Uint8Array }}
     */
    static #buildDocument(assembly, binary) {
        const state = PcbAssemblyGltfWriter.#createState()
        const sourceMeshes = Array.isArray(assembly?.meshes)
            ? assembly.meshes
            : []

        sourceMeshes.forEach((mesh) => {
            PcbAssemblyGltfWriter.#appendMesh(state, mesh)
        })
        if (assembly?.includeSceneMetadata === true) {
            PcbAssemblyGltfWriter.#appendSceneMetadata(state, sourceMeshes)
        }

        const buffer = PcbAssemblyGltfWriter.#concatBuffer(state.bufferParts)
        const gltf = {
            asset: {
                version: '2.0',
                generator: 'pcb-scene3d-viewer'
            },
            scene: 0,
            scenes: [
                {
                    name: PcbAssemblyGltfWriter.#safeName(
                        assembly?.name || 'pcb-assembly'
                    ),
                    nodes: state.nodes.map((_node, index) => index)
                }
            ],
            nodes: state.nodes,
            meshes: state.meshes,
            materials: state.materials,
            buffers: [
                {
                    byteLength: buffer.byteLength
                }
            ],
            bufferViews: state.bufferViews,
            accessors: state.accessors
        }

        if (!binary) {
            gltf.buffers[0].uri =
                'data:application/octet-stream;base64,' +
                PcbAssemblyGltfWriter.#base64(buffer)
        }
        if (state.images.length) {
            gltf.samplers = [
                {
                    magFilter: 9729,
                    minFilter: 9729,
                    wrapS: 10497,
                    wrapT: 10497
                }
            ]
            gltf.images = state.images
            gltf.textures = state.textures
        }
        if (state.cameras.length) {
            gltf.cameras = state.cameras
        }
        if (state.lights.length) {
            gltf.extensionsUsed = ['KHR_lights_punctual']
            gltf.extensions = {
                KHR_lights_punctual: {
                    lights: state.lights
                }
            }
        }

        return { gltf, buffer }
    }

    /**
     * Creates a mutable writer state object.
     * @returns {object}
     */
    static #createState() {
        return {
            bufferParts: [],
            byteLength: 0,
            bufferViews: [],
            accessors: [],
            materials: [],
            materialIndexes: new Map(),
            images: [],
            imageIndexes: new Map(),
            textures: [],
            textureIndexes: new Map(),
            meshIndexes: new Map(),
            meshes: [],
            nodes: [],
            cameras: [],
            lights: []
        }
    }

    /**
     * Appends default camera and light nodes from scene bounds.
     * @param {object} state Writer state.
     * @param {object[]} meshes Source meshes.
     * @returns {void}
     */
    static #appendSceneMetadata(state, meshes) {
        const bounds = PcbAssemblyGltfWriter.#sceneBounds(meshes)
        const center = [
            (bounds.min[0] + bounds.max[0]) / 2,
            (bounds.min[1] + bounds.max[1]) / 2,
            (bounds.min[2] + bounds.max[2]) / 2
        ]
        const span = Math.max(
            bounds.max[0] - bounds.min[0],
            bounds.max[1] - bounds.min[1],
            bounds.max[2] - bounds.min[2],
            1
        )
        const distance = span * 2.2
        const cameraIndex = state.cameras.length
        state.cameras.push({
            name: 'Default Camera',
            type: 'perspective',
            perspective: {
                yfov: 0.7,
                znear: Math.max(distance / 1000, 0.01),
                zfar: distance * 10
            }
        })
        state.nodes.push({
            name: 'Default Camera',
            camera: cameraIndex,
            translation: [
                center[0] + distance * 0.65,
                center[1] + distance * 0.45,
                center[2] + distance
            ],
            rotation: [-0.260009, 0.279848, 0.076342, 0.920364]
        })

        const lightIndex = state.lights.length
        state.lights.push({
            name: 'Key Light',
            type: 'directional',
            intensity: 4
        })
        state.nodes.push({
            name: 'Key Light',
            translation: [
                center[0] - distance * 0.35,
                center[1] + distance,
                center[2] + distance
            ],
            extensions: {
                KHR_lights_punctual: {
                    light: lightIndex
                }
            }
        })
    }

    /**
     * Appends one mesh node to the document state.
     * @param {object} state Writer state.
     * @param {object} mesh Source mesh.
     * @returns {void}
     */
    static #appendMesh(state, mesh) {
        const name = PcbAssemblyGltfWriter.#safeName(mesh?.name || 'mesh')
        const meshKey = PcbAssemblyGltfWriter.#meshReuseKey(mesh)
        if (meshKey && state.meshIndexes.has(meshKey)) {
            state.nodes.push({
                name,
                mesh: state.meshIndexes.get(meshKey)
            })
            return
        }

        const primitives = PcbAssemblyGltfWriter.#buildPrimitives(state, mesh)
        if (!primitives.length) {
            return
        }

        const meshIndex = state.meshes.length
        state.meshes.push({
            name,
            primitives
        })
        if (meshKey) {
            state.meshIndexes.set(meshKey, meshIndex)
        }
        state.nodes.push({
            name,
            mesh: meshIndex
        })
    }

    /**
     * Builds a stable key for meshes whose emitted geometry can be reused.
     * @param {object} mesh Source mesh.
     * @returns {string}
     */
    static #meshReuseKey(mesh) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : []
        const faces = Array.isArray(mesh?.faces) ? mesh.faces : []
        if (!vertices.length || !faces.length) {
            return ''
        }

        return JSON.stringify({
            vertices: vertices.map((vertex) =>
                [0, 1, 2].map((index) =>
                    PcbAssemblyGltfWriter.#roundedKeyNumber(vertex?.[index])
                )
            ),
            faces: faces.map((face) =>
                (Array.isArray(face) ? face : []).map((index) =>
                    Number(index || 0)
                )
            ),
            color: PcbAssemblyGltfWriter.#color(mesh?.color, mesh?.opacity).map(
                (value) => PcbAssemblyGltfWriter.#roundedKeyNumber(value)
            ),
            texture: {
                top: String(mesh?.texture?.top || ''),
                bottom: String(mesh?.texture?.bottom || '')
            },
            material: mesh?.material || null,
            vertexColors: Array.isArray(mesh?.vertexColors)
                ? mesh.vertexColors
                : []
        })
    }

    /**
     * Builds GLTF primitives for one source mesh.
     * @param {object} state Writer state.
     * @param {object} mesh Source mesh.
     * @returns {object[]}
     */
    static #buildPrimitives(state, mesh) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : []
        const faces = Array.isArray(mesh?.faces) ? mesh.faces : []
        const bounds = PcbAssemblyGltfWriter.#meshBounds2d(vertices)
        const vertexColors = PcbAssemblyGltfWriter.#vertexColors(mesh)
        const groups = new Map()

        faces.forEach((face) => {
            const indexes = Array.isArray(face) ? face : []
            const triangles = PcbAssemblyPolygonTriangulator.triangulateFace(
                indexes,
                vertices
            )
            const textureKind = PcbAssemblyGltfWriter.#faceTextureKind(
                mesh,
                indexes
            )
            const materialIndex = PcbAssemblyGltfWriter.#materialIndex(
                state,
                mesh,
                textureKind
            )
            const groupKey = String(materialIndex) + ':' + textureKind
            const group =
                groups.get(groupKey) ||
                PcbAssemblyGltfWriter.#createPrimitiveGroup(materialIndex)
            groups.set(groupKey, group)

            triangles.forEach((triangle) => {
                PcbAssemblyGltfWriter.#appendTriangle(
                    group,
                    vertices,
                    triangle,
                    bounds,
                    textureKind !== 'solid',
                    vertexColors
                )
            })
        })

        return Array.from(groups.values())
            .filter((group) => group.positions.length)
            .map((group) => PcbAssemblyGltfWriter.#writePrimitive(state, group))
    }

    /**
     * Resolves normalized vertex colors parallel to source vertices.
     * @param {object} mesh Source mesh.
     * @returns {(number[] | null)[]}
     */
    static #vertexColors(mesh) {
        const vertexColors = Array.isArray(mesh?.vertexColors)
            ? mesh.vertexColors
            : []
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : []
        if (
            !vertices.length ||
            vertexColors.length !== vertices.length ||
            !vertexColors.some(Boolean)
        ) {
            return []
        }

        return vertexColors.map((color) =>
            Array.isArray(color) && color.length >= 3
                ? PcbAssemblyGltfWriter.#color(color)
                : null
        )
    }

    /**
     * Creates a primitive accumulator.
     * @param {number} materialIndex Material index.
     * @returns {object}
     */
    static #createPrimitiveGroup(materialIndex) {
        return {
            materialIndex,
            positions: [],
            normals: [],
            texcoords: [],
            colors: [],
            indexes: []
        }
    }

    /**
     * Appends one flat-shaded triangle.
     * @param {object} group Primitive group.
     * @param {number[][]} vertices Source vertices.
     * @param {number[]} triangle Source vertex indexes.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds XY bounds.
     * @param {boolean} includeTexcoords Whether to emit texture coordinates.
     * @param {(number[] | null)[]} vertexColors Optional vertex colors.
     * @returns {void}
     */
    static #appendTriangle(
        group,
        vertices,
        triangle,
        bounds,
        includeTexcoords,
        vertexColors
    ) {
        const points = triangle.map((index) =>
            PcbAssemblyGltfWriter.#exportedVertex(vertices[index])
        )
        const normal = PcbAssemblyGltfWriter.#triangleNormal(points)
        const firstIndex = group.positions.length / 3

        points.forEach((point, index) => {
            group.positions.push(point[0], point[1], point[2])
            group.normals.push(normal[0], normal[1], normal[2])
            if (includeTexcoords) {
                const uv = PcbAssemblyGltfWriter.#uvForVertex(
                    vertices[triangle[index]],
                    bounds
                )
                group.texcoords.push(uv[0], uv[1])
            }
            if (vertexColors.length) {
                const color = vertexColors[triangle[index]] || [1, 1, 1, 1]
                group.colors.push(color[0], color[1], color[2], color[3])
            }
        })
        group.indexes.push(firstIndex, firstIndex + 1, firstIndex + 2)
    }

    /**
     * Serializes one primitive group into GLTF accessors.
     * @param {object} state Writer state.
     * @param {object} group Primitive group.
     * @returns {object}
     */
    static #writePrimitive(state, group) {
        const positionAccessor = PcbAssemblyGltfWriter.#appendAccessor(
            state,
            PcbAssemblyGltfWriter.#floatBytes(group.positions),
            FLOAT_COMPONENT,
            'VEC3',
            group.positions.length / 3,
            ARRAY_BUFFER_TARGET,
            PcbAssemblyGltfWriter.#accessorBounds(group.positions, 3)
        )
        const normalAccessor = PcbAssemblyGltfWriter.#appendAccessor(
            state,
            PcbAssemblyGltfWriter.#floatBytes(group.normals),
            FLOAT_COMPONENT,
            'VEC3',
            group.normals.length / 3,
            ARRAY_BUFFER_TARGET
        )
        const indexAccessor = PcbAssemblyGltfWriter.#appendAccessor(
            state,
            PcbAssemblyGltfWriter.#uintBytes(group.indexes),
            UNSIGNED_INT_COMPONENT,
            'SCALAR',
            group.indexes.length,
            ELEMENT_ARRAY_BUFFER_TARGET
        )
        const attributes = {
            POSITION: positionAccessor,
            NORMAL: normalAccessor
        }

        if (group.texcoords.length) {
            attributes.TEXCOORD_0 = PcbAssemblyGltfWriter.#appendAccessor(
                state,
                PcbAssemblyGltfWriter.#floatBytes(group.texcoords),
                FLOAT_COMPONENT,
                'VEC2',
                group.texcoords.length / 2,
                ARRAY_BUFFER_TARGET
            )
        }
        if (group.colors.length) {
            attributes.COLOR_0 = PcbAssemblyGltfWriter.#appendAccessor(
                state,
                PcbAssemblyGltfWriter.#floatBytes(group.colors),
                FLOAT_COMPONENT,
                'VEC4',
                group.colors.length / 4,
                ARRAY_BUFFER_TARGET
            )
        }

        return {
            mode: TRIANGLES_MODE,
            attributes,
            indices: indexAccessor,
            material: group.materialIndex
        }
    }

    /**
     * Adds binary data and a matching accessor.
     * @param {object} state Writer state.
     * @param {Uint8Array} bytes Binary data.
     * @param {number} componentType GLTF component type.
     * @param {string} type GLTF accessor type.
     * @param {number} count Element count.
     * @param {number} target Buffer view target.
     * @param {{ min: number[], max: number[] } | null} [bounds] Optional bounds.
     * @returns {number}
     */
    static #appendAccessor(
        state,
        bytes,
        componentType,
        type,
        count,
        target,
        bounds = null
    ) {
        const bufferView = PcbAssemblyGltfWriter.#appendBufferView(
            state,
            bytes,
            target
        )
        const accessor = {
            bufferView,
            byteOffset: 0,
            componentType,
            count,
            type
        }

        if (bounds) {
            accessor.min = bounds.min
            accessor.max = bounds.max
        }

        state.accessors.push(accessor)
        return state.accessors.length - 1
    }

    /**
     * Adds one aligned buffer view to the document.
     * @param {object} state Writer state.
     * @param {Uint8Array} bytes Binary data.
     * @param {number} target Buffer target.
     * @returns {number}
     */
    static #appendBufferView(state, bytes, target) {
        const padding = PcbAssemblyGltfWriter.#paddingLength(state.byteLength)
        if (padding) {
            state.bufferParts.push(new Uint8Array(padding))
            state.byteLength += padding
        }

        const bufferView = {
            buffer: 0,
            byteOffset: state.byteLength,
            byteLength: bytes.byteLength,
            target
        }
        state.bufferViews.push(bufferView)
        state.bufferParts.push(bytes)
        state.byteLength += bytes.byteLength
        return state.bufferViews.length - 1
    }

    /**
     * Resolves a material index for a face group.
     * @param {object} state Writer state.
     * @param {object} mesh Source mesh.
     * @param {string} textureKind Texture kind.
     * @returns {number}
     */
    static #materialIndex(state, mesh, textureKind) {
        const color = PcbAssemblyGltfWriter.#color(mesh?.color, mesh?.opacity)
        const textureUri =
            textureKind === 'top'
                ? mesh?.texture?.top
                : textureKind === 'bottom'
                  ? mesh?.texture?.bottom
                  : ''
        const key =
            color.join(',') +
            ':' +
            String(textureKind || 'solid') +
            ':' +
            String(textureUri || '') +
            ':' +
            JSON.stringify(mesh?.material || null)

        if (state.materialIndexes.has(key)) {
            return state.materialIndexes.get(key)
        }

        const pbr = {
            baseColorFactor: color,
            metallicFactor: 0,
            roughnessFactor: 0.72
        }
        if (textureUri) {
            pbr.baseColorTexture = {
                index: PcbAssemblyGltfWriter.#textureIndex(state, textureUri)
            }
        }

        const material = {
            name: textureKind === 'solid' ? 'solid' : textureKind + '-texture',
            doubleSided: true,
            pbrMetallicRoughness: pbr
        }
        if (mesh?.material && typeof mesh.material === 'object') {
            material.extras = {
                sourceMaterial: mesh.material
            }
        }
        if (color[3] < 1) {
            material.alphaMode = 'BLEND'
        }
        state.materials.push(material)
        state.materialIndexes.set(key, state.materials.length - 1)
        return state.materials.length - 1
    }

    /**
     * Resolves a texture index for a data URI.
     * @param {object} state Writer state.
     * @param {string} uri Image data URI.
     * @returns {number}
     */
    static #textureIndex(state, uri) {
        if (state.textureIndexes.has(uri)) {
            return state.textureIndexes.get(uri)
        }

        const imageIndex = PcbAssemblyGltfWriter.#imageIndex(state, uri)
        state.textures.push({
            sampler: 0,
            source: imageIndex
        })
        state.textureIndexes.set(uri, state.textures.length - 1)
        return state.textures.length - 1
    }

    /**
     * Resolves an image index for a data URI.
     * @param {object} state Writer state.
     * @param {string} uri Image data URI.
     * @returns {number}
     */
    static #imageIndex(state, uri) {
        if (state.imageIndexes.has(uri)) {
            return state.imageIndexes.get(uri)
        }

        state.images.push({ uri })
        state.imageIndexes.set(uri, state.images.length - 1)
        return state.images.length - 1
    }

    /**
     * Resolves which texture, if any, applies to a face.
     * @param {object} mesh Source mesh.
     * @param {number[]} face Face vertex indexes.
     * @returns {'top' | 'bottom' | 'solid'}
     */
    static #faceTextureKind(mesh, face) {
        if (!mesh?.texture?.top && !mesh?.texture?.bottom) {
            return 'solid'
        }

        const normal = PcbAssemblyGltfWriter.#sourceFaceNormal(
            mesh?.vertices || [],
            face
        )
        if (normal[2] > 0.5 && mesh?.texture?.top) {
            return 'top'
        }
        if (normal[2] < -0.5 && mesh?.texture?.bottom) {
            return 'bottom'
        }
        return 'solid'
    }

    /**
     * Computes a source-space face normal.
     * @param {number[][]} vertices Source vertices.
     * @param {number[]} face Face vertex indexes.
     * @returns {number[]}
     */
    static #sourceFaceNormal(vertices, face) {
        const points = face.map((index) => vertices[index]).filter(Boolean)
        if (points.length < 3) {
            return [0, 0, 1]
        }

        return PcbAssemblyGltfWriter.#triangleNormal([
            points[0],
            points[1],
            points[2]
        ])
    }

    /**
     * Converts a source vertex to exported millimeters.
     * @param {number[]} vertex Source vertex in mils.
     * @returns {number[]}
     */
    static #exportedVertex(vertex) {
        return PcbAssemblyExportCoordinateFrame.vertexMilToMm(
            vertex || [0, 0, 0]
        )
    }

    /**
     * Computes a normalized triangle normal.
     * @param {number[][]} points Triangle points.
     * @returns {number[]}
     */
    static #triangleNormal(points) {
        const a = points[0] || [0, 0, 0]
        const b = points[1] || [0, 0, 0]
        const c = points[2] || [0, 0, 0]
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        const normal = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0]
        ]
        const length = Math.hypot(normal[0], normal[1], normal[2]) || 1
        return normal.map((value) => value / length)
    }

    /**
     * Computes XY bounds for texture coordinate generation.
     * @param {number[][]} vertices Source vertices.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #meshBounds2d(vertices) {
        return vertices.reduce(
            (bounds, vertex) => ({
                minX: Math.min(bounds.minX, Number(vertex?.[0] || 0)),
                maxX: Math.max(bounds.maxX, Number(vertex?.[0] || 0)),
                minY: Math.min(bounds.minY, Number(vertex?.[1] || 0)),
                maxY: Math.max(bounds.maxY, Number(vertex?.[1] || 0))
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
            }
        )
    }

    /**
     * Computes exported scene bounds.
     * @param {object[]} meshes Source meshes.
     * @returns {{ min: number[], max: number[] }}
     */
    static #sceneBounds(meshes) {
        const bounds = {
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity]
        }
        meshes.forEach((mesh) => {
            PcbAssemblyGltfWriter.#array(mesh?.vertices).forEach((vertex) => {
                const point = PcbAssemblyGltfWriter.#exportedVertex(vertex)
                for (let index = 0; index < 3; index += 1) {
                    bounds.min[index] = Math.min(
                        bounds.min[index],
                        point[index]
                    )
                    bounds.max[index] = Math.max(
                        bounds.max[index],
                        point[index]
                    )
                }
            })
        })

        if (!bounds.min.every(Number.isFinite)) {
            return {
                min: [-0.5, -0.5, -0.5],
                max: [0.5, 0.5, 0.5]
            }
        }
        return bounds
    }

    /**
     * Builds a texture coordinate from a source vertex.
     * @param {number[]} vertex Source vertex.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds XY bounds.
     * @returns {number[]}
     */
    static #uvForVertex(vertex, bounds) {
        const width = Math.max(bounds.maxX - bounds.minX, 0.001)
        const height = Math.max(bounds.maxY - bounds.minY, 0.001)
        return [
            (Number(vertex?.[0] || 0) - bounds.minX) / width,
            1 - (Number(vertex?.[1] || 0) - bounds.minY) / height
        ]
    }

    /**
     * Computes accessor min/max bounds.
     * @param {number[]} values Flat values.
     * @param {number} width Values per element.
     * @returns {{ min: number[], max: number[] }}
     */
    static #accessorBounds(values, width) {
        const min = Array.from({ length: width }, () => Infinity)
        const max = Array.from({ length: width }, () => -Infinity)

        for (let index = 0; index < values.length; index += width) {
            for (let offset = 0; offset < width; offset += 1) {
                const value = values[index + offset]
                min[offset] = Math.min(min[offset], value)
                max[offset] = Math.max(max[offset], value)
            }
        }

        return { min, max }
    }

    /**
     * Converts RGBA input into a GLTF material color.
     * @param {unknown} color Candidate color.
     * @param {unknown} opacity Optional opacity override.
     * @returns {number[]}
     */
    static #color(color, opacity = undefined) {
        const fallback = [0.55, 0.56, 0.58]
        if (!Array.isArray(color)) {
            return [
                ...fallback,
                PcbAssemblyGltfWriter.#alpha(opacity, undefined)
            ]
        }

        const rgb = [0, 1, 2].map((index) => {
            const value = Number(color[index])
            return Number.isFinite(value)
                ? Math.min(Math.max(value, 0), 1)
                : fallback[index]
        })
        return [...rgb, PcbAssemblyGltfWriter.#alpha(opacity, color[3])]
    }

    /**
     * Resolves a material alpha value.
     * @param {unknown} opacity Candidate opacity override.
     * @param {unknown} colorAlpha Candidate color alpha.
     * @returns {number}
     */
    static #alpha(opacity, colorAlpha) {
        for (const value of [opacity, colorAlpha]) {
            const number = Number(value)
            if (Number.isFinite(number)) {
                return Math.min(Math.max(number, 0), 1)
            }
        }
        return 1
    }

    /**
     * Converts float values into little-endian bytes.
     * @param {number[]} values Float values.
     * @returns {Uint8Array}
     */
    static #floatBytes(values) {
        const bytes = new Uint8Array(values.length * 4)
        const view = new DataView(bytes.buffer)
        values.forEach((value, index) => {
            view.setFloat32(index * 4, Number(value || 0), true)
        })
        return bytes
    }

    /**
     * Converts unsigned integer values into little-endian bytes.
     * @param {number[]} values Integer values.
     * @returns {Uint8Array}
     */
    static #uintBytes(values) {
        const bytes = new Uint8Array(values.length * 4)
        const view = new DataView(bytes.buffer)
        values.forEach((value, index) => {
            view.setUint32(index * 4, Math.max(Number(value || 0), 0), true)
        })
        return bytes
    }

    /**
     * Concatenates binary buffer parts.
     * @param {Uint8Array[]} parts Buffer parts.
     * @returns {Uint8Array}
     */
    static #concatBuffer(parts) {
        const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
        const buffer = new Uint8Array(total)
        let offset = 0

        parts.forEach((part) => {
            buffer.set(part, offset)
            offset += part.byteLength
        })

        return buffer
    }

    /**
     * Writes a GLB wrapper around GLTF JSON and binary payload.
     * @param {object} gltf GLTF JSON.
     * @param {Uint8Array} binaryBuffer Binary payload.
     * @returns {Uint8Array}
     */
    static #writeGlb(gltf, binaryBuffer) {
        const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf))
        const jsonPadding = PcbAssemblyGltfWriter.#paddingLength(
            jsonBytes.byteLength
        )
        const binPadding = PcbAssemblyGltfWriter.#paddingLength(
            binaryBuffer.byteLength
        )
        const jsonChunkLength = jsonBytes.byteLength + jsonPadding
        const binChunkLength = binaryBuffer.byteLength + binPadding
        const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength
        const glb = new Uint8Array(totalLength)
        const view = new DataView(glb.buffer)

        view.setUint32(0, GLB_MAGIC, true)
        view.setUint32(4, GLB_VERSION, true)
        view.setUint32(8, totalLength, true)
        view.setUint32(12, jsonChunkLength, true)
        view.setUint32(16, JSON_CHUNK_TYPE, true)
        glb.set(jsonBytes, 20)
        glb.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonChunkLength)

        const binHeaderOffset = 20 + jsonChunkLength
        view.setUint32(binHeaderOffset, binChunkLength, true)
        view.setUint32(binHeaderOffset + 4, BIN_CHUNK_TYPE, true)
        glb.set(binaryBuffer, binHeaderOffset + 8)

        return glb
    }

    /**
     * Computes 4-byte alignment padding.
     * @param {number} byteLength Current byte length.
     * @returns {number}
     */
    static #paddingLength(byteLength) {
        return (4 - (byteLength % 4)) % 4
    }

    /**
     * Encodes bytes as base64 in browser and Node runtimes.
     * @param {Uint8Array} bytes Binary bytes.
     * @returns {string}
     */
    static #base64(bytes) {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64')
        }

        let binary = ''
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte)
        })
        return btoa(binary)
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate array.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }

    /**
     * Rounds numbers for stable mesh reuse keys.
     * @param {unknown} value Candidate number.
     * @returns {number}
     */
    static #roundedKeyNumber(value) {
        const number = Number(value || 0)
        return Number.isFinite(number) ? Math.round(number * 1e9) / 1e9 : 0
    }

    /**
     * Builds a stable GLTF node or mesh name.
     * @param {unknown} value Candidate name.
     * @returns {string}
     */
    static #safeName(value) {
        return (
            String(value || 'mesh')
                .replace(/[^A-Za-z0-9_.-]+/gu, '_')
                .replace(/^_+|_+$/gu, '')
                .slice(0, 80) || 'mesh'
        )
    }
}
