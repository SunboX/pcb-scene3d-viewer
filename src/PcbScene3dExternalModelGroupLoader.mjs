import { PcbAssemblyModelMeshLoader } from './PcbAssemblyModelMeshLoader.mjs'
import { PcbScene3dBufferAttributeFactory } from './PcbScene3dBufferAttributeFactory.mjs'
import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'
import { PcbScene3dFacetedModelGroupBuilder } from './PcbScene3dFacetedModelGroupBuilder.mjs'
import { PcbScene3dModelBounds } from './PcbScene3dModelBounds.mjs'
import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'
import { PcbScene3dModelIdentity } from './PcbScene3dModelIdentity.mjs'

const FACETED_FORMATS = new Set(['glb', 'gltf', 'obj', 'stl'])
const MM_TO_MIL = 1000 / 25.4

/**
 * Loads raw external model geometry before placement-specific wrapping.
 */
export class PcbScene3dExternalModelGroupLoader {
    /**
     * Loads one raw model group without placement-specific mount transforms.
     * @param {any} THREE Three.js namespace.
     * @param {any} model Resolved external model metadata.
     * @param {import('./PcbScene3dStepLoader.mjs').PcbScene3dStepLoader} stepLoader STEP model loader.
     * @param {string} versionKey Cache-busting version key for dynamic loader imports.
     * @param {{ createVrmlLoader?: () => any | Promise<any>, createModelLoader?: (format: string) => any | Promise<any>, fetch?: (url: string, options: object) => Promise<any>, allowNetworkModelFetch?: boolean, authHeaders?: Record<string, string>, fetchTimeoutMs?: number, modelCache?: Map<string, Promise<Uint8Array>> }} [runtime] Optional loader runtime.
     * @returns {Promise<any>}
     */
    static async load(THREE, model, stepLoader, versionKey = '', runtime = {}) {
        const scopedRuntime = PcbScene3dModelContent.createFetchScope(runtime)
        const format = String(model?.format || '').toLowerCase()
        if (format === 'wrl' || format === 'vrml') {
            return PcbScene3dExternalModelGroupLoader.#loadVrmlModel(
                model,
                versionKey,
                scopedRuntime
            )
        }

        if (format === 'step' || format === 'stp') {
            return PcbScene3dExternalModelGroupLoader.#loadStepModel(
                THREE,
                model,
                stepLoader,
                scopedRuntime
            )
        }

        if (FACETED_FORMATS.has(format)) {
            return PcbScene3dExternalModelGroupLoader.#loadFacetedModel(
                THREE,
                model,
                stepLoader,
                scopedRuntime
            )
        }

        if (format === '3mf') {
            return PcbScene3dExternalModelGroupLoader.#loadThreeMfModel(
                model,
                versionKey,
                scopedRuntime
            )
        }

        throw new Error('Unsupported external model format.')
    }

    /**
     * Loads one VRML model from canonical bytes, text, or a browser file.
     * @param {any} model Resolved WRL model metadata.
     * @param {string} versionKey Cache-busting version key for the loader import.
     * @param {{ createVrmlLoader?: () => any | Promise<any>, createModelLoader?: (format: string) => any | Promise<any>, fetch?: (url: string, options: object) => Promise<any>, allowNetworkModelFetch?: boolean }} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #loadVrmlModel(model, versionKey, runtime) {
        const sourceText = await PcbScene3dExternalModelGroupLoader.#vrmlText(
            model,
            runtime
        )
        if (!sourceText) {
            throw new Error('Resolved WRL model content is unavailable.')
        }
        const loader = await PcbScene3dExternalModelGroupLoader.#vrmlLoader(
            versionKey,
            runtime
        )
        const safeText =
            await PcbScene3dExternalModelGroupLoader.#vrmlWithSafeTextures(
                sourceText,
                model,
                runtime
            )
        return loader.parse(safeText, '')
    }

    /**
     * Replaces VRML texture references with explicitly loaded data URIs.
     * @param {string} text VRML source text.
     * @param {object} model Resolved WRL model metadata.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<string>}
     */
    static async #vrmlWithSafeTextures(text, model, runtime) {
        const references =
            PcbScene3dExternalModelGroupLoader.#vrmlTextureReferences(text)
        if (!references.length) return text

        const resources =
            PcbScene3dExternalModelGroupLoader.#vrmlResourceIndex(model)
        const resolved = new Map()
        for (const reference of references) {
            resolved.set(
                reference,
                await PcbScene3dExternalModelGroupLoader.#vrmlTextureDataUri(
                    reference,
                    model,
                    resources,
                    runtime
                )
            )
        }

        return String(text).replace(
            /(['"])([^'"]+)\1/gu,
            (match, quote, reference) =>
                resolved.has(reference)
                    ? quote + resolved.get(reference) + quote
                    : match
        )
    }

    /**
     * Lists unique URLs declared by VRML ImageTexture nodes.
     * @param {string} text VRML source text.
     * @returns {string[]}
     */
    static #vrmlTextureReferences(text) {
        const references = new Set()
        for (const block of String(text || '').matchAll(
            /ImageTexture\s*\{[\s\S]*?\}/giu
        )) {
            for (const quoted of String(block[0] || '').matchAll(
                /(['"])([^'"]+)\1/gu
            )) {
                const reference = String(quoted[2] || '').trim()
                if (reference) references.add(reference)
            }
        }
        return [...references]
    }

    /**
     * Resolves one VRML texture through local resources or explicit fetch policy.
     * @param {string} reference Texture URL from the VRML source.
     * @param {object} model Resolved WRL model metadata.
     * @param {Map<string, object>} resources Local resource index.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<string>}
     */
    static async #vrmlTextureDataUri(reference, model, resources, runtime) {
        if (reference.startsWith('data:')) return reference
        const modelPath = PcbScene3dModelIdentity.projectPath(model)
        const baseDirectory = modelPath.includes('/')
            ? modelPath.slice(0, modelPath.lastIndexOf('/') + 1)
            : ''
        const projectPath = PcbScene3dModelContent.safeProjectPath(
            reference,
            baseDirectory
        )
        const resource =
            resources.get(
                PcbScene3dExternalModelGroupLoader.#vrmlResourceKey(projectPath)
            ) ||
            resources.get(
                PcbScene3dExternalModelGroupLoader.#vrmlResourceKey(reference)
            )
        if (resource) {
            const bytes = await PcbScene3dModelContent.bytes(
                resource,
                runtime,
                'VRML texture'
            )
            return PcbScene3dExternalModelGroupLoader.#dataUri(bytes, reference)
        }

        if (
            typeof runtime?.fetch !== 'function' &&
            runtime?.allowNetworkModelFetch !== true
        ) {
            return 'data:,'
        }
        const base = String(
            model?.resolvedUrl || model?.sourceUrl || modelPath || ''
        ).trim()
        const resolvedUrl = PcbScene3dModelContent.resolveRelativeUrl(
            reference,
            base
        )
        if (!resolvedUrl) return 'data:,'
        const bytes = await PcbScene3dModelContent.bytes(
            {
                format: 'texture',
                name: reference,
                resolvedUrl,
                mainModelUrl: base,
                ...(projectPath
                    ? { source: { projectRelativePath: projectPath } }
                    : {})
            },
            runtime,
            'VRML texture'
        )
        return PcbScene3dExternalModelGroupLoader.#dataUri(bytes, reference)
    }

    /**
     * Builds an exact alias index for local WRL companion resources.
     * @param {object} model Resolved WRL model metadata.
     * @returns {Map<string, object>}
     */
    static #vrmlResourceIndex(model) {
        const index = new Map()
        const resources = PcbScene3dExternalModelGroupLoader.#resourceArray(
            PcbScene3dExternalModelGroupLoader.#ownData(model, 'resources')
        )
        resources.forEach((resource) => {
            const source = PcbScene3dExternalModelGroupLoader.#ownData(
                resource,
                'source'
            )
            const aliases = [
                PcbScene3dExternalModelGroupLoader.#ownData(resource, 'uri'),
                PcbScene3dExternalModelGroupLoader.#ownData(resource, 'name'),
                PcbScene3dExternalModelGroupLoader.#ownData(
                    resource,
                    'relativePath'
                ),
                PcbScene3dExternalModelGroupLoader.#ownData(
                    source,
                    'projectRelativePath'
                ),
                PcbScene3dExternalModelGroupLoader.#ownData(
                    source,
                    'project_relative_path'
                )
            ]
            aliases.forEach((alias) => {
                const key =
                    PcbScene3dExternalModelGroupLoader.#vrmlResourceKey(alias)
                if (key && !index.has(key)) index.set(key, resource)
            })
        })
        return index
    }

    /**
     * Converts local resources to a descriptor-safe array.
     * @param {unknown} value Resource collection.
     * @returns {object[]}
     */
    static #resourceArray(value) {
        try {
            if (Array.isArray(value)) {
                if (Object.getPrototypeOf(value) !== Array.prototype) return []
                const descriptors = Object.getOwnPropertyDescriptors(value)
                const length = descriptors.length?.value
                if (!Number.isSafeInteger(length) || length < 0) return []
                const resources = []
                for (let index = 0; index < length; index += 1) {
                    const descriptor = descriptors[String(index)]
                    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
                        return []
                    }
                    resources.push(descriptor.value)
                }
                return resources
            }
            if (!value || typeof value !== 'object') return []
            return Object.entries(Object.getOwnPropertyDescriptors(value))
                .filter(([, descriptor]) => Object.hasOwn(descriptor, 'value'))
                .map(([name, descriptor]) => ({
                    name,
                    ...PcbScene3dDescriptorSafeRecord.copy(descriptor.value)
                }))
        } catch {
            return []
        }
    }

    /**
     * Encodes texture bytes as a browser-safe data URI.
     * @param {Uint8Array} bytes Texture bytes.
     * @param {string} reference Texture file reference.
     * @returns {string}
     */
    static #dataUri(bytes, reference) {
        const alphabet =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        let base64 = ''
        for (let index = 0; index < bytes.length; index += 3) {
            const first = bytes[index]
            const second = bytes[index + 1]
            const third = bytes[index + 2]
            const packed =
                (first << 16) |
                ((second === undefined ? 0 : second) << 8) |
                (third === undefined ? 0 : third)
            base64 += alphabet[(packed >>> 18) & 63]
            base64 += alphabet[(packed >>> 12) & 63]
            base64 += second === undefined ? '=' : alphabet[(packed >>> 6) & 63]
            base64 += third === undefined ? '=' : alphabet[packed & 63]
        }
        return (
            'data:' +
            PcbScene3dExternalModelGroupLoader.#textureMediaType(reference) +
            ';base64,' +
            base64
        )
    }

    /**
     * Resolves a common texture media type from its filename.
     * @param {string} reference Texture file reference.
     * @returns {string}
     */
    static #textureMediaType(reference) {
        const extension = String(reference || '')
            .split(/[?#]/u)[0]
            .split('.')
            .pop()
            .toLowerCase()
        return (
            {
                bmp: 'image/bmp',
                gif: 'image/gif',
                jpeg: 'image/jpeg',
                jpg: 'image/jpeg',
                png: 'image/png',
                webp: 'image/webp'
            }[extension] || 'application/octet-stream'
        )
    }

    /**
     * Normalizes a local resource alias.
     * @param {unknown} value Resource path candidate.
     * @returns {string}
     */
    static #vrmlResourceKey(value) {
        return String(value || '')
            .trim()
            .split(/[?#]/u)[0]
            .replaceAll('\\', '/')
            .replace(/^\.\//u, '')
            .toLowerCase()
    }

    /**
     * Reads one own data property without invoking accessors.
     * @param {unknown} value Record candidate.
     * @param {PropertyKey} key Property key.
     * @returns {unknown}
     */
    static #ownData(value, key) {
        if (!value || typeof value !== 'object') return undefined
        try {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            return descriptor && Object.hasOwn(descriptor, 'value')
                ? descriptor.value
                : undefined
        } catch {
            return undefined
        }
    }

    /**
     * Creates the production or injected Three.js VRML loader.
     * @param {string} versionKey Cache-busting version key.
     * @param {{ createVrmlLoader?: () => any | Promise<any>, createModelLoader?: (format: string) => any | Promise<any> }} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #vrmlLoader(versionKey, runtime) {
        if (typeof runtime?.createModelLoader === 'function') {
            return runtime.createModelLoader('wrl')
        }
        if (typeof runtime?.createVrmlLoader === 'function') {
            return runtime.createVrmlLoader()
        }
        const { VRMLLoader } = await import(
            '/node_modules/three/examples/jsm/loaders/VRMLLoader.js' +
                (versionKey ? '?v=' + encodeURIComponent(versionKey) : '')
        )
        return new VRMLLoader()
    }

    /**
     * Reads UTF-8 VRML text from every supported external-model source shape.
     * @param {any} model Resolved WRL model metadata.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<string>}
     */
    static async #vrmlText(model, runtime) {
        return PcbScene3dModelContent.text(model, runtime, 'WRL')
    }

    /**
     * Loads STL, OBJ, GLTF, or GLB through the shared faceted model pipeline.
     * @param {any} THREE Three.js namespace.
     * @param {any} model Resolved external model metadata.
     * @param {import('./PcbScene3dStepLoader.mjs').PcbScene3dStepLoader} stepLoader STEP model loader.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #loadFacetedModel(THREE, model, stepLoader, runtime) {
        const loader = new PcbAssemblyModelMeshLoader({
            stepLoader,
            fetch: runtime?.fetch,
            allowNetworkModelFetch: runtime?.allowNetworkModelFetch,
            authHeaders: runtime?.authHeaders,
            fetchTimeoutMs: runtime?.fetchTimeoutMs,
            modelCache: runtime?.modelCache
        })
        const meshes = await loader.loadPlacement({ externalModel: model })
        return PcbScene3dFacetedModelGroupBuilder.build(THREE, meshes)
    }

    /**
     * Loads a 3MF model with the Three.js loader and converts millimeters to mils.
     * @param {any} model Resolved 3MF model metadata.
     * @param {string} versionKey Cache-busting loader version.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #loadThreeMfModel(model, versionKey, runtime) {
        const bytes = await PcbScene3dModelContent.bytes(model, runtime, '3MF')
        const loader = await PcbScene3dExternalModelGroupLoader.#threeMfLoader(
            versionKey,
            runtime
        )
        const group = loader.parse(
            PcbScene3dExternalModelGroupLoader.#arrayBuffer(bytes)
        )
        group?.scale?.setScalar?.(MM_TO_MIL)
        return group
    }

    /**
     * Creates the production or injected Three.js 3MF loader.
     * @param {string} versionKey Cache-busting version key.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #threeMfLoader(versionKey, runtime) {
        if (typeof runtime?.createModelLoader === 'function') {
            return runtime.createModelLoader('3mf')
        }
        const { ThreeMFLoader } = await import(
            '/node_modules/three/examples/jsm/loaders/3MFLoader.js' +
                (versionKey ? '?v=' + encodeURIComponent(versionKey) : '')
        )
        return new ThreeMFLoader()
    }

    /**
     * Returns an exact ArrayBuffer view for a byte slice.
     * @param {Uint8Array} bytes Source bytes.
     * @returns {ArrayBuffer}
     */
    static #arrayBuffer(bytes) {
        return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
        )
    }

    /**
     * Loads one STEP model and converts its meshes into Three objects.
     * @param {any} THREE Three.js namespace.
     * @param {any} model Resolved STEP model metadata.
     * @param {import('./PcbScene3dStepLoader.mjs').PcbScene3dStepLoader} stepLoader STEP model loader.
     * @param {object} runtime Loader runtime.
     * @returns {Promise<any>}
     */
    static async #loadStepModel(THREE, model, stepLoader, runtime) {
        const resolvedModel =
            await PcbScene3dExternalModelGroupLoader.#modelWithUrlBytes(
                model,
                runtime,
                'STEP'
            )
        const loadedModel = Array.isArray(model?.preparedMeshPayloads)
            ? { meshPayloads: model.preparedMeshPayloads }
            : await stepLoader.loadModel(resolvedModel)
        const group = new THREE.Group()
        const sourceBounds = PcbScene3dModelBounds.measureSourceBoundsMil(
            loadedModel.meshPayloads
        )
        group.scale.setScalar(1000)
        if (sourceBounds) {
            group.userData.scene3dSourceBoundsMil = sourceBounds
        }

        loadedModel.meshPayloads.forEach((meshPayload) => {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute(
                'position',
                PcbScene3dBufferAttributeFactory.createFloat32(
                    THREE,
                    meshPayload.positions,
                    3
                )
            )
            geometry.setIndex(
                PcbScene3dBufferAttributeFactory.createUint32(
                    THREE,
                    meshPayload.indices,
                    1
                )
            )

            if (meshPayload.normals.length) {
                geometry.setAttribute(
                    'normal',
                    PcbScene3dBufferAttributeFactory.createFloat32(
                        THREE,
                        meshPayload.normals,
                        3
                    )
                )
            } else {
                geometry.computeVertexNormals()
            }
            geometry.computeBoundingSphere()

            const materials =
                PcbScene3dExternalModelGroupLoader.#buildStepMeshMaterials(
                    THREE,
                    geometry,
                    meshPayload
                )
            const mesh = new THREE.Mesh(
                geometry,
                materials.length > 1 ? materials : materials[0]
            )
            group.add(mesh)
        })

        return group
    }

    /**
     * Attaches fetched URL bytes only when a model has no local content.
     * @param {any} model External model metadata.
     * @param {object} runtime Loader runtime.
     * @param {string} format Human-readable model format.
     * @returns {Promise<any>}
     */
    static async #modelWithUrlBytes(model, runtime, format) {
        if (
            Array.isArray(model?.preparedMeshPayloads) ||
            PcbScene3dModelContent.hasLocal(model)
        ) {
            return model
        }
        const url = String(model?.resolvedUrl || model?.sourceUrl || '').trim()
        const canFetch =
            typeof runtime?.fetch === 'function' ||
            (runtime?.allowNetworkModelFetch === true &&
                typeof globalThis.fetch === 'function')
        if (!url || !canFetch) return model
        return {
            ...model,
            payloadBytes: await PcbScene3dModelContent.bytes(
                model,
                runtime,
                format
            )
        }
    }

    /**
     * Builds the material set for one STEP mesh and assigns face-color groups
     * when the importer exposes them.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Three.js buffer geometry.
     * @param {{ color?: number[] | null, indices?: ArrayLike<number>, faceColors?: { first: number, last: number, color: number[] | null }[] }} meshPayload STEP mesh payload.
     * @returns {any[]}
     */
    static #buildStepMeshMaterials(THREE, geometry, meshPayload) {
        const defaultColor =
            PcbScene3dExternalModelGroupLoader.#resolveMeshColor(
                THREE,
                meshPayload?.color
            )
        const defaultMaterial =
            PcbScene3dExternalModelGroupLoader.#createStepMaterial(
                THREE,
                defaultColor
            )
        const faceColors = Array.isArray(meshPayload?.faceColors)
            ? meshPayload.faceColors.filter((faceColor) =>
                  PcbScene3dExternalModelGroupLoader.#isValidFaceColorRange(
                      faceColor,
                      meshPayload?.indices
                  )
              )
            : []

        if (!faceColors.length) {
            return [defaultMaterial]
        }

        const materials = [defaultMaterial]
        faceColors.forEach((faceColor) => {
            const resolvedColor =
                Array.isArray(faceColor?.color) && faceColor.color.length >= 3
                    ? PcbScene3dExternalModelGroupLoader.#resolveMeshColor(
                          THREE,
                          faceColor.color
                      )
                    : defaultColor

            materials.push(
                PcbScene3dExternalModelGroupLoader.#createStepMaterial(
                    THREE,
                    resolvedColor
                )
            )
        })

        PcbScene3dExternalModelGroupLoader.#applyFaceColorGroups(
            geometry,
            meshPayload?.indices || [],
            faceColors
        )

        return materials
    }

    /**
     * Creates one standard material for imported STEP geometry.
     * @param {any} THREE Three.js namespace.
     * @param {any} color Three.js color or numeric fallback color.
     * @returns {any}
     */
    static #createStepMaterial(THREE, color) {
        const options = {
            color,
            roughness: 0.56,
            metalness: 0.14
        }

        if (THREE.DoubleSide !== undefined) {
            options.side = THREE.DoubleSide
        }

        return new THREE.MeshStandardMaterial(options)
    }

    /**
     * Applies grouped material ranges for face-colored STEP triangles.
     * @param {any} geometry Three.js buffer geometry.
     * @param {ArrayLike<number>} indices Mesh index buffer.
     * @param {{ first: number, last: number }[]} faceColors Face color ranges.
     * @returns {void}
     */
    static #applyFaceColorGroups(geometry, indices, faceColors) {
        const triangleCount = Math.floor(Number(indices?.length || 0) / 3)
        let triangleIndex = 0
        let faceColorIndex = 0
        while (triangleIndex < triangleCount) {
            const firstIndex = triangleIndex
            let lastIndex = triangleCount
            let materialIndex = 0
            if (faceColorIndex < faceColors.length) {
                const currentFaceColor = faceColors[faceColorIndex]
                if (triangleIndex < currentFaceColor.first) {
                    lastIndex = currentFaceColor.first
                } else {
                    lastIndex = Math.min(
                        currentFaceColor.last + 1,
                        triangleCount
                    )
                    materialIndex = faceColorIndex + 1
                    faceColorIndex += 1
                }
            }
            geometry.addGroup(
                firstIndex * 3,
                Math.max(lastIndex - firstIndex, 0) * 3,
                materialIndex
            )
            triangleIndex = lastIndex
        }
    }

    /**
     * Returns true when one face-color range overlaps valid triangle indices.
     * @param {{ first?: number, last?: number }} faceColor Face color range.
     * @param {ArrayLike<number> | undefined} indices Mesh index buffer.
     * @returns {boolean}
     */
    static #isValidFaceColorRange(faceColor, indices) {
        const first = Number(faceColor?.first)
        const last = Number(faceColor?.last)
        const triangleCount = Math.floor(Number(indices?.length || 0) / 3)
        return (
            Number.isInteger(first) &&
            Number.isInteger(last) &&
            first >= 0 &&
            last >= first &&
            first < triangleCount
        )
    }

    /**
     * Resolves one STEP mesh color into a Three-friendly color value.
     * @param {any} THREE Three.js namespace.
     * @param {number[] | null} color Source RGB color.
     * @returns {any}
     */
    static #resolveMeshColor(THREE, color) {
        if (!Array.isArray(color) || color.length < 3) {
            return 0xc8c8c8
        }
        return new THREE.Color(
            Number(color[0] || 0),
            Number(color[1] || 0),
            Number(color[2] || 0)
        )
    }
}
