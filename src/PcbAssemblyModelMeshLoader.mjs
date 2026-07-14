import { PcbAssemblyGltfModelMeshParser } from './PcbAssemblyGltfModelMeshParser.mjs'
import { PcbAssemblyTextModelMeshParser } from './PcbAssemblyTextModelMeshParser.mjs'
import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'
import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'
import { PcbScene3dStepLoader } from './PcbScene3dStepLoader.mjs'

/**
 * Loads resolved component 3D model assets into faceted meshes for assembly
 * export.
 */
export class PcbAssemblyModelMeshLoader {
    /** @type {PcbScene3dStepLoader} */
    #stepLoader

    /** @type {boolean} */
    #canFetch

    /** @type {object} */
    #modelOptions

    /**
     * @param {{ stepLoader?: PcbScene3dStepLoader, fetch?: (url: string, options: object) => Promise<any>, allowNetworkModelFetch?: boolean, authHeaders?: Record<string, string>, fetchTimeoutMs?: number, modelCache?: Map<string, Promise<Uint8Array>> }} [options] Loader options.
     */
    constructor(options = {}) {
        this.#stepLoader = options.stepLoader || new PcbScene3dStepLoader()
        const modelCache =
            options.modelCache instanceof Map ? options.modelCache : new Map()
        this.#modelOptions = PcbScene3dModelContent.createFetchScope({
            ...PcbScene3dDescriptorSafeRecord.copy(options),
            modelCache
        })
        this.#canFetch = PcbScene3dModelContent.canFetch(this.#modelOptions)
    }

    /**
     * Loads one external placement into export meshes.
     * @param {{ externalModel?: object, designator?: string }} placement Placement metadata.
     * @returns {Promise<object[]>}
     */
    async loadPlacement(placement) {
        const suppliedModel = PcbAssemblyModelMeshLoader.#withCanonicalTextData(
            placement?.externalModel || null
        )
        const model = await this.#modelWithFetchedContent(suppliedModel)
        const format = String(model?.format || '').toLowerCase()
        if (format === 'step' || format === 'stp') {
            return this.#loadStepMeshes(model)
        }

        if (format === 'wrl' || format === 'vrml') {
            return this.#loadWrlMeshes(model)
        }

        if (format === 'stl') {
            return await PcbAssemblyTextModelMeshParser.parseStlModel(model)
        }

        if (format === 'obj') {
            return await PcbAssemblyTextModelMeshParser.parseObjModel(model)
        }

        if (format === 'gltf') {
            return await PcbAssemblyGltfModelMeshParser.parseGltfModel(model)
        }

        if (format === 'glb') {
            return await PcbAssemblyGltfModelMeshParser.parseGlbModel(model)
        }

        throw new Error('Unsupported model format: ' + (format || 'unknown'))
    }

    /**
     * Attaches resolved URL content when the model has no embedded payload.
     * @param {object | null} model External model metadata.
     * @returns {Promise<object | null>}
     */
    async #modelWithFetchedContent(model) {
        if (!model) return model
        const url = String(model.resolvedUrl || model.sourceUrl || '').trim()
        const format = String(model?.format || '').toLowerCase()
        if (PcbAssemblyModelMeshLoader.#hasModelContent(model)) {
            return format === 'gltf' && url && this.#canFetch
                ? await this.#modelWithFetchedGltfBuffers(model, url)
                : model
        }
        if (!url || !this.#canFetch) {
            return model
        }

        const bytes = await this.#fetchModelBytes(url)
        const fetchedModel = {
            ...model,
            payloadBytes: bytes
        }
        if (format === 'gltf') {
            return await this.#modelWithFetchedGltfBuffers(fetchedModel, url)
        }

        return fetchedModel
    }

    /**
     * Reads model bytes from the configured fetcher with caching.
     * @param {string} url Resolved model URL.
     * @returns {Promise<Uint8Array>}
     */
    async #fetchModelBytes(url, mainUrl = url) {
        return PcbScene3dModelContent.bytes(
            {
                format: 'model-resource',
                resolvedUrl: url,
                mainModelUrl: mainUrl
            },
            this.#modelOptions,
            'Model'
        )
    }

    /**
     * Attaches remote GLTF buffer sidecars to the model metadata.
     * @param {object} model Fetched GLTF model metadata.
     * @param {string} modelUrl Resolved GLTF URL.
     * @returns {Promise<object>}
     */
    async #modelWithFetchedGltfBuffers(model, modelUrl) {
        const existingBuffers = PcbAssemblyModelMeshLoader.#resourceArray(
            model?.externalBuffers
        )
        const existingUris = new Set(
            existingBuffers
                .map((resource) =>
                    String(resource?.uri || resource?.name || '').trim()
                )
                .filter(Boolean)
        )
        const uris = PcbAssemblyModelMeshLoader.#externalGltfBufferUris(
            model
        ).filter((uri) => !existingUris.has(uri))
        if (!uris.length) {
            return model
        }

        const fetchedBuffers = []
        for (const uri of uris) {
            const sourceUrl = PcbAssemblyModelMeshLoader.#resolveSidecarUrl(
                uri,
                modelUrl
            )
            fetchedBuffers.push({
                uri,
                name: uri,
                sourceUrl,
                payloadBytes: await this.#fetchModelBytes(sourceUrl, modelUrl)
            })
        }

        return {
            ...model,
            externalBuffers: [...existingBuffers, ...fetchedBuffers]
        }
    }

    /**
     * Lists non-embedded GLTF buffer URIs from a fetched JSON model.
     * @param {object} model GLTF model metadata.
     * @returns {string[]}
     */
    static #externalGltfBufferUris(model) {
        try {
            const gltf = JSON.parse(
                PcbAssemblyModelMeshLoader.#modelText(model)
            )
            const seen = new Set()
            return PcbAssemblyModelMeshLoader.#array(gltf?.buffers)
                .map((buffer) => String(buffer?.uri || '').trim())
                .filter((uri) => uri && !uri.startsWith('data:'))
                .filter((uri) => {
                    if (seen.has(uri)) {
                        return false
                    }
                    seen.add(uri)
                    return true
                })
        } catch (_error) {
            return []
        }
    }

    /**
     * Reads already-fetched model content as UTF-8 text.
     * @param {{ payloadText?: string, payloadBytes?: Uint8Array }} model Model metadata.
     * @returns {string}
     */
    static #modelText(model) {
        if (typeof model?.payloadText === 'string') {
            return model.payloadText
        }
        return new TextDecoder().decode(
            PcbAssemblyModelMeshLoader.#bytes(model?.payloadBytes)
        )
    }

    /**
     * Resolves one sidecar URL against the model URL.
     * @param {string} uri Sidecar URI.
     * @param {string} modelUrl Base model URL.
     * @returns {string}
     */
    static #resolveSidecarUrl(uri, modelUrl) {
        return PcbScene3dModelContent.resolveRelativeUrl(uri, modelUrl)
    }

    /**
     * Maps canonical string `text` or `data` to the text parser contract.
     * @param {object | null} model External model metadata.
     * @returns {object | null}
     */
    static #withCanonicalTextData(model) {
        if (!model || typeof model !== 'object') return model
        let descriptors
        try {
            descriptors = Object.getOwnPropertyDescriptors(model)
        } catch {
            return model
        }
        if (typeof descriptors.payloadText?.value === 'string') {
            return model
        }
        const text = ['text', 'data']
            .map((key) => descriptors[key]?.value)
            .find((value) => typeof value === 'string')
        if (typeof text !== 'string') return model
        return {
            ...PcbScene3dDescriptorSafeRecord.copy(model),
            payloadText: text
        }
    }

    /**
     * Releases owned resources.
     * @returns {void}
     */
    dispose() {
        this.#stepLoader?.dispose?.()
    }

    /**
     * Loads STEP mesh payloads through the existing viewer importer.
     * @param {object} model External model metadata.
     * @returns {Promise<object[]>}
     */
    async #loadStepMeshes(model) {
        const loaded = Array.isArray(model?.preparedMeshPayloads)
            ? { meshPayloads: model.preparedMeshPayloads }
            : await this.#stepLoader.loadModel(model)

        return PcbAssemblyModelMeshLoader.#array(loaded?.meshPayloads)
            .map((payload, index) =>
                PcbAssemblyModelMeshLoader.#meshesFromPayload(
                    payload,
                    model?.name || 'step-model-' + (index + 1)
                )
            )
            .flat()
    }

    /**
     * Converts one normalized STEP mesh payload to export mesh shape.
     * @param {{ positions?: ArrayLike<number>, indices?: ArrayLike<number>, color?: number[] | null, name?: string, faceColors?: object[] }} payload STEP mesh payload.
     * @param {string} fallbackName Fallback mesh name.
     * @returns {object[]}
     */
    static #meshesFromPayload(payload, fallbackName) {
        const positions = Array.from(payload?.positions || [])
        const indices = Array.from(payload?.indices || [])
        const vertices = []

        for (let index = 0; index + 2 < positions.length; index += 3) {
            vertices.push([
                Number(positions[index] || 0) * 1000,
                Number(positions[index + 1] || 0) * 1000,
                Number(positions[index + 2] || 0) * 1000
            ])
        }

        return PcbAssemblyModelMeshLoader.#coloredTriangleMeshes(
            String(payload?.name || fallbackName || 'step-model'),
            vertices,
            indices,
            PcbAssemblyModelMeshLoader.#normalizeColor(payload?.color),
            payload?.faceColors
        )
    }

    /**
     * Loads WRL mesh data from an asset file.
     * @param {object} model External model metadata.
     * @returns {Promise<object[]>}
     */
    async #loadWrlMeshes(model) {
        const text = await PcbAssemblyModelMeshLoader.#readModelText(model)
        const meshes = PcbAssemblyModelMeshLoader.#parseWrlIndexedFaceSets(text)
        if (!meshes.length) {
            throw new Error('No IndexedFaceSet geometry was found in WRL.')
        }

        return meshes.map((mesh, index) => ({
            ...mesh,
            name: mesh.name || String(model?.name || 'wrl-model-' + (index + 1))
        }))
    }

    /**
     * Reads a model as UTF-8 text.
     * @param {{ payloadText?: string, file?: Blob | Uint8Array | null }} model Model metadata.
     * @returns {Promise<string>}
     */
    static async #readModelText(model) {
        if (typeof model?.payloadText === 'string') {
            return model.payloadText
        }
        for (const value of [
            model?.payloadBytes,
            model?.bytes,
            model?.data,
            model?.file
        ]) {
            if (typeof value?.text === 'function') {
                return await value.text()
            }
            const bytes =
                await PcbAssemblyModelMeshLoader.#bytesFromValue(value)
            if (bytes) return new TextDecoder().decode(bytes)
        }

        throw PcbScene3dModelContent.unavailableError('WRL')
    }

    /**
     * Reads one local model payload as bytes.
     * @param {unknown} value Byte or blob candidate.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #bytesFromValue(value) {
        if (!value) return null
        if (value instanceof Uint8Array) return value
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (ArrayBuffer.isView(value)) {
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
     * Parses simple VRML IndexedFaceSet geometry blocks.
     * @param {string} text WRL source.
     * @returns {object[]}
     */
    static #parseWrlIndexedFaceSets(text) {
        const pointBlocks = PcbAssemblyModelMeshLoader.#matchBlocks(
            text,
            /Coordinate\s*\{[\s\S]*?point\s*\[([\s\S]*?)\]/giu
        )
        const indexBlocks = PcbAssemblyModelMeshLoader.#matchBlocks(
            text,
            /coordIndex\s*\[([\s\S]*?)\]/giu
        )
        const colors = PcbAssemblyModelMeshLoader.#parseWrlDiffuseColors(text)
        const meshCount = Math.min(pointBlocks.length, indexBlocks.length)
        const meshes = []

        for (let index = 0; index < meshCount; index += 1) {
            const vertices = PcbAssemblyModelMeshLoader.#parseTriplets(
                pointBlocks[index]
            )
            const faces = PcbAssemblyModelMeshLoader.#parseCoordIndex(
                indexBlocks[index]
            )
            if (vertices.length && faces.length) {
                meshes.push({
                    name: 'wrl-mesh-' + (index + 1),
                    vertices,
                    faces,
                    ...(colors[index] ? { color: colors[index] } : {})
                })
            }
        }

        return meshes
    }

    /**
     * Returns true when a model already carries local content.
     * @param {object} model Model metadata.
     * @returns {boolean}
     */
    static #hasModelContent(model) {
        return Boolean(
            typeof model?.payloadText === 'string' ||
            model?.payloadBytes ||
            model?.bytes ||
            model?.data ||
            model?.file
        )
    }

    /**
     * Normalizes resource metadata into an array.
     * @param {unknown} value Candidate resource collection.
     * @returns {object[]}
     */
    static #resourceArray(value) {
        if (Array.isArray(value)) {
            return value
        }
        if (value && typeof value === 'object') {
            return Object.entries(value).map(([name, entry]) => ({
                name,
                ...(entry || {})
            }))
        }
        return []
    }

    /**
     * Normalizes one byte-like value.
     * @param {unknown} value Candidate bytes.
     * @returns {Uint8Array}
     */
    static #bytes(value) {
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
        return new Uint8Array()
    }

    /**
     * Returns regex capture groups.
     * @param {string} text Source text.
     * @param {RegExp} pattern Capture pattern.
     * @returns {string[]}
     */
    static #matchBlocks(text, pattern) {
        return [...String(text || '').matchAll(pattern)].map(
            (match) => match[1] || ''
        )
    }

    /**
     * Parses numeric triplets.
     * @param {string} text Numeric source.
     * @returns {number[][]}
     */
    static #parseTriplets(text) {
        const values = PcbAssemblyModelMeshLoader.#numbers(text)
        const triplets = []

        for (let index = 0; index + 2 < values.length; index += 3) {
            triplets.push([values[index], values[index + 1], values[index + 2]])
        }

        return triplets
    }

    /**
     * Parses VRML coordIndex face lists.
     * @param {string} text Numeric source.
     * @returns {number[][]}
     */
    static #parseCoordIndex(text) {
        const values = PcbAssemblyModelMeshLoader.#numbers(text)
        const faces = []
        let face = []

        values.forEach((value) => {
            if (Number(value) === -1) {
                if (face.length >= 3) {
                    faces.push(face)
                }
                face = []
                return
            }
            face.push(Number(value))
        })

        if (face.length >= 3) {
            faces.push(face)
        }

        return faces
    }

    /**
     * Builds export meshes grouped by normalized RGB color.
     * @param {string} name Base mesh name.
     * @param {number[][]} vertices Source vertices.
     * @param {number[]} indices Source triangle indices.
     * @param {number[] | null} defaultColor Default mesh color.
     * @param {object[] | undefined} faceColors Face-color ranges.
     * @returns {object[]}
     */
    static #coloredTriangleMeshes(
        name,
        vertices,
        indices,
        defaultColor,
        faceColors
    ) {
        const groups = []
        const normalizedFaceColors =
            PcbAssemblyModelMeshLoader.#normalizeFaceColors(
                faceColors,
                Math.floor(indices.length / 3)
            )
        let faceColorIndex = 0

        for (let index = 0; index + 2 < indices.length; index += 3) {
            const triangleIndex = index / 3
            while (
                normalizedFaceColors[faceColorIndex] &&
                triangleIndex > normalizedFaceColors[faceColorIndex].last
            ) {
                faceColorIndex += 1
            }

            const activeFaceColor = normalizedFaceColors[faceColorIndex]
            const color =
                activeFaceColor &&
                triangleIndex >= activeFaceColor.first &&
                triangleIndex <= activeFaceColor.last
                    ? activeFaceColor.color || defaultColor
                    : defaultColor
            const group = PcbAssemblyModelMeshLoader.#resolveColorGroup(
                groups,
                color
            )
            const face = []

            for (const sourceIndex of indices.slice(index, index + 3)) {
                face.push(
                    PcbAssemblyModelMeshLoader.#appendGroupVertex(
                        group,
                        vertices,
                        sourceIndex
                    )
                )
            }

            group.faces.push(face)
        }

        return groups
            .filter((group) => group.faces.length)
            .map((group, index) => ({
                name: groups.length > 1 ? name + '-' + (index + 1) : name,
                vertices: group.vertices,
                faces: group.faces,
                ...(group.color ? { color: group.color } : {})
            }))
    }

    /**
     * Resolves a mutable color group.
     * @param {object[]} groups Existing groups.
     * @param {number[] | null} color RGB color.
     * @returns {object}
     */
    static #resolveColorGroup(groups, color) {
        const key = PcbAssemblyModelMeshLoader.#colorKey(color)
        let group = groups.find((entry) => entry.key === key)

        if (!group) {
            group = {
                key,
                color,
                indexMap: new Map(),
                vertices: [],
                faces: []
            }
            groups.push(group)
        }

        return group
    }

    /**
     * Appends or reuses one source vertex in a color group.
     * @param {object} group Mutable color group.
     * @param {number[][]} vertices Source vertices.
     * @param {unknown} sourceIndex Source vertex index.
     * @returns {number}
     */
    static #appendGroupVertex(group, vertices, sourceIndex) {
        const index = Number(sourceIndex || 0)
        const existing = group.indexMap.get(index)
        if (Number.isInteger(existing)) {
            return existing
        }

        const vertexIndex = group.vertices.length
        group.indexMap.set(index, vertexIndex)
        group.vertices.push(vertices[index] || [0, 0, 0])
        return vertexIndex
    }

    /**
     * Normalizes valid face-color ranges.
     * @param {object[] | undefined} faceColors Source ranges.
     * @param {number} triangleCount Number of triangles in the payload.
     * @returns {{ first: number, last: number, color: number[] | null }[]}
     */
    static #normalizeFaceColors(faceColors, triangleCount) {
        return PcbAssemblyModelMeshLoader.#array(faceColors)
            .map((faceColor) => {
                const first = Number(faceColor?.first)
                const last = Number(faceColor?.last)

                if (
                    !Number.isInteger(first) ||
                    !Number.isInteger(last) ||
                    first < 0 ||
                    last < first ||
                    first >= triangleCount
                ) {
                    return null
                }

                return {
                    first,
                    last: Math.min(last, triangleCount - 1),
                    color: PcbAssemblyModelMeshLoader.#normalizeColor(
                        faceColor?.color
                    )
                }
            })
            .filter(Boolean)
            .sort((left, right) => left.first - right.first)
    }

    /**
     * Parses VRML material diffuse colors in source order.
     * @param {string} text VRML source.
     * @returns {number[][]}
     */
    static #parseWrlDiffuseColors(text) {
        return [
            ...String(text || '').matchAll(
                /diffuseColor\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/giu
            )
        ]
            .map((match) =>
                PcbAssemblyModelMeshLoader.#normalizeColor([
                    Number(match[1]),
                    Number(match[2]),
                    Number(match[3])
                ])
            )
            .filter(Boolean)
    }

    /**
     * Normalizes an RGB color to clamped components.
     * @param {unknown} color Candidate color.
     * @returns {number[] | null}
     */
    static #normalizeColor(color) {
        if (!Array.isArray(color) || color.length < 3) {
            return null
        }

        return [0, 1, 2].map((index) =>
            Math.max(Math.min(Number(color[index] || 0), 1), 0)
        )
    }

    /**
     * Builds a stable color-group key.
     * @param {number[] | null} color RGB color.
     * @returns {string}
     */
    static #colorKey(color) {
        return Array.isArray(color)
            ? color.map((value) => value.toFixed(6)).join(',')
            : 'default'
    }

    /**
     * Parses all numbers from source text.
     * @param {string} text Numeric source.
     * @returns {number[]}
     */
    static #numbers(text) {
        return (
            String(text || '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) || []
        )
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
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
