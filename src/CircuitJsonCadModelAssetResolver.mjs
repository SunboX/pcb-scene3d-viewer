import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { ToolkitAsset } from 'circuitjson-toolkit/parser'
import { PcbScene3dCircuitJsonInput } from './PcbScene3dCircuitJsonInput.mjs'
import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'
import { PcbScene3dCircuitJsonModelAsset } from './PcbScene3dCircuitJsonModelAsset.mjs'
import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'
import { PcbScene3dModelIdentity } from './PcbScene3dModelIdentity.mjs'

const AMBIGUOUS_ASSET = Symbol('ambiguous-model-asset')

/**
 * Bridges CAD component model asset metadata to scene model resolution.
 */
export class CircuitJsonCadModelAssetResolver {
    /**
     * Adds URL fields derived from CAD `model_asset` records.
     * @param {object | object[]} documentModel Document model.
     * @returns {object | object[]}
     */
    static withModelAssetUrls(documentModel) {
        const elements =
            CircuitJsonCadModelAssetResolver.#elements(documentModel)
        if (!PcbScene3dCircuitJsonInput.isModel(elements)) {
            return documentModel
        }
        if (
            !elements.some((element) =>
                CircuitJsonCadModelAssetResolver.#modelAssetUrlField(element)
            )
        ) {
            return documentModel
        }

        const nextElements = elements.map((element) =>
            CircuitJsonCadModelAssetResolver.#withModelAssetUrl(element)
        )

        if (Array.isArray(documentModel)) {
            Object.assign(nextElements, {
                sourceFormat: CircuitJsonCadModelAssetResolver.#ownData(
                    documentModel,
                    'sourceFormat'
                ),
                kind: CircuitJsonCadModelAssetResolver.#ownData(
                    documentModel,
                    'kind'
                ),
                fileName: CircuitJsonCadModelAssetResolver.#ownData(
                    documentModel,
                    'fileName'
                ),
                bom: CircuitJsonCadModelAssetResolver.#ownData(
                    documentModel,
                    'bom'
                )
            })
            return nextElements
        }

        if (
            CircuitJsonCadModelAssetResolver.#isContext(documentModel) &&
            Array.isArray(documentModel.document?.model)
        ) {
            const document = documentModel.document
            return CircuitJsonDocumentContext.prepare(
                {
                    ...PcbScene3dDescriptorSafeRecord.copy(document),
                    model: nextElements
                },
                { indexes: ['elements'] }
            )
        }
        const wrappedDocument = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'document'
        )
        if (
            Array.isArray(
                CircuitJsonCadModelAssetResolver.#ownData(
                    wrappedDocument,
                    'model'
                )
            )
        ) {
            return {
                ...PcbScene3dDescriptorSafeRecord.copy(wrappedDocument),
                model: nextElements
            }
        }
        const model = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'model'
        )
        if (Array.isArray(model)) {
            return {
                ...PcbScene3dDescriptorSafeRecord.copy(documentModel),
                model: nextElements
            }
        }
        const wrappedElements = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'elements'
        )
        if (Array.isArray(wrappedElements)) {
            return {
                ...PcbScene3dDescriptorSafeRecord.copy(documentModel),
                elements: nextElements
            }
        }
        const circuitJson = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'circuitJson'
        )
        if (Array.isArray(circuitJson)) {
            return {
                ...PcbScene3dDescriptorSafeRecord.copy(documentModel),
                circuitJson: nextElements
            }
        }
        return documentModel
    }

    /**
     * Returns whether an input is a prepared CircuitJSON context.
     * @param {unknown} value Candidate input.
     * @returns {boolean}
     */
    static #isContext(value) {
        try {
            return value instanceof CircuitJsonDocumentContext
        } catch {
            return false
        }
    }

    /**
     * Adds a session-asset-aware model URL resolver.
     * @param {object} options Scene preparation options.
     * @param {object[]} [documentAssets] Canonical document assets.
     * @returns {object}
     */
    static withSessionAssetResolver(options = {}, documentAssets = []) {
        const safeOptions = PcbScene3dDescriptorSafeRecord.copy(options)
        const sessionAssets = CircuitJsonCadModelAssetResolver.#denseArray(
            CircuitJsonCadModelAssetResolver.#ownData(
                safeOptions,
                'sessionAssets'
            )
        )
        const canonicalAssets =
            CircuitJsonCadModelAssetResolver.#denseArray(documentAssets)
        const sessionAssetIndex =
            CircuitJsonCadModelAssetResolver.#assetIndex(sessionAssets)
        const documentAssetIndex = CircuitJsonCadModelAssetResolver.#assetIndex(
            canonicalAssets,
            true
        )
        return CircuitJsonCadModelAssetResolver.#withAssetIndexes(
            safeOptions,
            sessionAssets,
            sessionAssetIndex,
            documentAssetIndex
        )
    }

    /**
     * Adds a model URL resolver backed by a context-cached document asset index.
     * @param {object} options Scene preparation options.
     * @param {CircuitJsonDocumentContext} context Prepared document context.
     * @returns {object}
     */
    static withContextAssetResolver(options = {}, context) {
        if (!CircuitJsonCadModelAssetResolver.#isContext(context)) {
            return CircuitJsonCadModelAssetResolver.withSessionAssetResolver(
                options
            )
        }

        const safeOptions = PcbScene3dDescriptorSafeRecord.copy(options)
        const sessionAssets = CircuitJsonCadModelAssetResolver.#denseArray(
            CircuitJsonCadModelAssetResolver.#ownData(
                safeOptions,
                'sessionAssets'
            )
        )
        const canonicalAssets = CircuitJsonCadModelAssetResolver.#denseArray(
            context.assets
        )
        const sessionAssetIndex =
            CircuitJsonCadModelAssetResolver.#assetIndex(sessionAssets)
        const documentAssetIndex = canonicalAssets.length
            ? context.getOrCreateDerived(
                  'pcb-scene3d-viewer',
                  'model-assets-v1',
                  () =>
                      CircuitJsonCadModelAssetResolver.#assetIndex(
                          canonicalAssets,
                          true
                      )
              )
            : CircuitJsonCadModelAssetResolver.#assetIndex([])

        return CircuitJsonCadModelAssetResolver.#withAssetIndexes(
            safeOptions,
            sessionAssets,
            sessionAssetIndex,
            documentAssetIndex
        )
    }

    /**
     * Creates safe resolver options from prepared asset indexes.
     * @param {Record<string, unknown>} safeOptions Descriptor-safe options.
     * @param {unknown[]} sessionAssets Captured session asset rows.
     * @param {Map<string, object>} sessionAssetIndex Session asset index.
     * @param {Map<string, object>} documentAssetIndex Document asset index.
     * @returns {object}
     */
    static #withAssetIndexes(
        safeOptions,
        sessionAssets,
        sessionAssetIndex,
        documentAssetIndex
    ) {
        const resolver = CircuitJsonCadModelAssetResolver.#ownData(
            safeOptions,
            'modelUrlResolver'
        )
        const callerResolver = typeof resolver === 'function' ? resolver : null

        return {
            ...safeOptions,
            ...(Object.hasOwn(safeOptions, 'sessionAssets')
                ? { sessionAssets }
                : {}),
            modelUrlResolver: (url, context) =>
                CircuitJsonCadModelAssetResolver.#resolveModelUrl(
                    url,
                    context,
                    sessionAssetIndex,
                    documentAssetIndex,
                    callerResolver
                )
        }
    }

    /**
     * Adds a model URL field to one CAD component when possible.
     * @param {object} element Element row.
     * @returns {object}
     */
    static #withModelAssetUrl(element) {
        const field =
            CircuitJsonCadModelAssetResolver.#modelAssetUrlField(element)
        if (!field) return element
        const asset =
            CircuitJsonCadModelAssetResolver.#ownData(element, 'model_asset') ||
            {}
        const sourceUrl = String(
            CircuitJsonCadModelAssetResolver.#ownData(
                asset,
                'project_relative_path'
            ) ||
                CircuitJsonCadModelAssetResolver.#ownData(asset, 'url') ||
                ''
        ).trim()
        if (!sourceUrl) return element
        return {
            ...PcbScene3dDescriptorSafeRecord.copy(element),
            [field]: sourceUrl
        }
    }

    /**
     * Resolves a model URL field for one CAD component asset.
     * @param {object} element Element row.
     * @returns {string}
     */
    static #modelAssetUrlField(element) {
        if (
            CircuitJsonCadModelAssetResolver.#ownData(element, 'type') !==
            'cad_component'
        ) {
            return ''
        }
        const asset = CircuitJsonCadModelAssetResolver.#ownData(
            element,
            'model_asset'
        )
        if (!asset || typeof asset !== 'object') return ''
        if (CircuitJsonCadModelAssetResolver.#hasModelUrl(element)) return ''
        const format = PcbScene3dCircuitJsonModelAsset.reference(asset)?.format
        return (
            {
                '3mf': 'model_3mf_url',
                glb: 'model_glb_url',
                gltf: 'model_gltf_url',
                obj: 'model_obj_url',
                step: 'model_step_url',
                stl: 'model_stl_url',
                wrl: 'model_wrl_url'
            }[format] || ''
        )
    }

    /**
     * Resolves a URL to a session asset or caller-provided value.
     * @param {string} url Model URL.
     * @param {object} context Resolver context.
     * @param {Map<string, object>} sessionAssetIndex Session asset index.
     * @param {Map<string, object>} documentAssetIndex Canonical document asset index.
     * @param {((url: string, context: object) => any) | null} callerResolver Caller resolver.
     * @returns {object | string | null}
     */
    static #resolveModelUrl(
        url,
        context,
        sessionAssetIndex,
        documentAssetIndex,
        callerResolver
    ) {
        const matchedEntry =
            CircuitJsonCadModelAssetResolver.#matchingIndexedEntry(
                url,
                context,
                sessionAssetIndex
            ) ||
            CircuitJsonCadModelAssetResolver.#matchingIndexedEntry(
                url,
                context,
                documentAssetIndex
            )
        const matchedAsset = matchedEntry
            ? CircuitJsonCadModelAssetResolver.#resolvedIndexedAsset(
                  matchedEntry
              )
            : null
        if (matchedAsset) {
            return CircuitJsonCadModelAssetResolver.#withCompanionResources(
                matchedAsset,
                matchedEntry,
                url,
                context,
                sessionAssetIndex,
                documentAssetIndex
            )
        }
        return callerResolver ? callerResolver(url, context) : null
    }

    /**
     * Finds the earliest indexed asset matching one CAD model URL.
     * @param {string} url Model URL.
     * @param {object} context Resolver context.
     * @param {Map<string, object>} assetIndex Asset alias index.
     * @returns {object | null}
     */
    static #matchingIndexedEntry(url, context, assetIndex) {
        const candidates = CircuitJsonCadModelAssetResolver.#urlCandidates(
            url,
            context
        )
        let match = null
        for (const candidate of candidates) {
            const indexed = assetIndex.exact.get(candidate)
            if (indexed && (!match || indexed.index < match.index)) {
                match = indexed
            }
        }
        if (match) return match

        for (const candidate of candidates) {
            const indexed = assetIndex.folded.get(candidate.toLowerCase())
            if (
                indexed &&
                indexed !== AMBIGUOUS_ASSET &&
                (!match || indexed.index < match.index)
            ) {
                match = indexed
            }
        }
        return match
    }

    /**
     * Attaches referenced local sidecars without enabling implicit networking.
     * @param {object} matchedAsset Resolved main model asset.
     * @param {object} matchedEntry Indexed main model entry.
     * @param {string} url Requested main model path.
     * @param {object} context Model resolver context.
     * @param {Map<string, object>} sessionAssetIndex Session asset index.
     * @param {Map<string, object>} documentAssetIndex Document asset index.
     * @returns {object}
     */
    static #withCompanionResources(
        matchedAsset,
        matchedEntry,
        url,
        context,
        sessionAssetIndex,
        documentAssetIndex
    ) {
        const format = String(
            CircuitJsonCadModelAssetResolver.#ownData(context, 'format') || ''
        ).toLowerCase()
        const references =
            CircuitJsonCadModelAssetResolver.#companionReferences(
                matchedAsset,
                format
            )
        if (!references.length) return matchedAsset

        const mainPath =
            PcbScene3dModelIdentity.projectPath(matchedAsset) || String(url)
        const baseDirectory =
            mainPath.includes('/') && !/^[a-z][a-z\d+.-]*:/iu.test(mainPath)
                ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1)
                : ''
        const companions = []
        const seen = new Set()
        for (const reference of references) {
            const path = CircuitJsonCadModelAssetResolver.#safeCompanionPath(
                reference,
                baseDirectory
            )
            if (!path || seen.has(path)) continue
            const entry = CircuitJsonCadModelAssetResolver.#indexedCompanion(
                path,
                sessionAssetIndex,
                documentAssetIndex
            )
            if (!entry || entry === matchedEntry) continue
            const asset =
                CircuitJsonCadModelAssetResolver.#resolvedIndexedAsset(entry)
            if (!asset) continue
            companions.push({
                ...PcbScene3dDescriptorSafeRecord.copy(asset),
                uri: reference
            })
            seen.add(path)
        }
        if (!companions.length) return matchedAsset

        const field = format === 'gltf' ? 'externalBuffers' : 'resources'
        const existing = CircuitJsonCadModelAssetResolver.#denseArray(
            CircuitJsonCadModelAssetResolver.#ownData(matchedAsset, field)
        )
        return {
            ...PcbScene3dDescriptorSafeRecord.copy(matchedAsset),
            [field]: [...existing, ...companions]
        }
    }

    /**
     * Extracts referenced local companions from text-capable model formats.
     * @param {object} asset Main model asset.
     * @param {string} format Model format.
     * @returns {string[]}
     */
    static #companionReferences(asset, format) {
        const text = CircuitJsonCadModelAssetResolver.#assetText(asset)
        if (!text) return []
        if (format === 'gltf') {
            try {
                const document = JSON.parse(text)
                return CircuitJsonCadModelAssetResolver.#denseArray(
                    CircuitJsonCadModelAssetResolver.#ownData(
                        document,
                        'buffers'
                    )
                )
                    .map((buffer) =>
                        String(
                            CircuitJsonCadModelAssetResolver.#ownData(
                                buffer,
                                'uri'
                            ) || ''
                        ).trim()
                    )
                    .filter(
                        (reference) =>
                            reference && !reference.startsWith('data:')
                    )
            } catch {
                return []
            }
        }
        if (format === 'obj') {
            return [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gimu)]
                .map((match) =>
                    String(match[1] || '')
                        .trim()
                        .replace(/^(['"])(.*)\1$/u, '$2')
                )
                .filter(Boolean)
        }
        if (format === 'wrl' || format === 'vrml') {
            const references = []
            for (const block of text.matchAll(
                /ImageTexture\s*\{[\s\S]*?\}/giu
            )) {
                for (const match of String(block[0] || '').matchAll(
                    /(['"])([^'"]+)\1/gu
                )) {
                    const reference = String(match[2] || '').trim()
                    if (reference) references.push(reference)
                }
            }
            return references
        }
        return []
    }

    /**
     * Reads resident asset content as UTF-8 text without invoking accessors.
     * @param {object} asset Asset candidate.
     * @returns {string}
     */
    static #assetText(asset) {
        for (const key of ['payloadText', 'data']) {
            const value = CircuitJsonCadModelAssetResolver.#ownData(asset, key)
            if (typeof value === 'string') return value
        }
        for (const key of ['payloadBytes', 'bytes', 'data']) {
            const bytes = CircuitJsonCadModelAssetResolver.#bytes(
                CircuitJsonCadModelAssetResolver.#ownData(asset, key)
            )
            if (bytes) return new TextDecoder().decode(bytes)
        }
        return ''
    }

    /**
     * Resolves one path-exact companion with session priority.
     * @param {string} path Safe project-relative companion path.
     * @param {Map<string, object>} sessionAssetIndex Session asset index.
     * @param {Map<string, object>} documentAssetIndex Document asset index.
     * @returns {object | null}
     */
    static #indexedCompanion(path, sessionAssetIndex, documentAssetIndex) {
        const key = CircuitJsonCadModelAssetResolver.#key(path)
        return (
            CircuitJsonCadModelAssetResolver.#indexedAsset(
                sessionAssetIndex,
                key
            ) ||
            CircuitJsonCadModelAssetResolver.#indexedAsset(
                documentAssetIndex,
                key
            ) ||
            null
        )
    }

    /**
     * Resolves an exact alias or one unambiguous case-insensitive fallback.
     * @param {{ exact: Map<string, object>, folded: Map<string, object | symbol> }} index Asset index.
     * @param {string} key Exact normalized key.
     * @returns {object | null} Indexed asset entry.
     */
    static #indexedAsset(index, key) {
        const exact = index.exact.get(key)
        if (exact) return exact
        const folded = index.folded.get(key.toLowerCase())
        return folded && folded !== AMBIGUOUS_ASSET ? folded : null
    }

    /**
     * Resolves a safe project-relative sidecar path without parent traversal.
     * @param {string} reference Referenced resource path.
     * @param {string} baseDirectory Main model directory.
     * @returns {string}
     */
    static #safeCompanionPath(reference, baseDirectory) {
        const normalized = String(reference || '')
            .trim()
            .replaceAll('\\', '/')
        let decoded = normalized
        try {
            decoded = decodeURIComponent(normalized)
        } catch {
            return ''
        }
        if (decoded.split('/').some((segment) => segment === '..')) {
            return ''
        }
        return PcbScene3dModelContent.safeProjectPath(normalized, baseDirectory)
    }

    /**
     * Returns a byte view for one resident binary payload.
     * @param {unknown} value Binary payload candidate.
     * @returns {Uint8Array | null}
     */
    static #bytes(value) {
        if (value instanceof Uint8Array) return value
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        }
        return null
    }

    /**
     * Builds one descriptor-safe, first-match-preserving asset alias index.
     * @param {object[]} assets Asset rows.
     * @param {boolean} [canonical] Whether rows use the canonical toolkit asset contract.
     * @returns {{ exact: Map<string, object>, folded: Map<string, object | symbol> }}
     */
    static #assetIndex(assets, canonical = false) {
        const exact = new Map()
        const folded = new Map()
        assets.forEach((asset, assetIndex) => {
            const entry = {
                asset,
                canonical,
                index: assetIndex,
                materialized: false,
                resolvedAsset: null
            }
            for (const alias of CircuitJsonCadModelAssetResolver.#assetAliases(
                asset
            )) {
                if (!exact.has(alias)) exact.set(alias, entry)
                const foldedAlias = alias.toLowerCase()
                const previous = folded.get(foldedAlias)
                if (!previous) {
                    folded.set(foldedAlias, entry)
                } else if (previous !== entry) {
                    folded.set(foldedAlias, AMBIGUOUS_ASSET)
                }
            }
        })
        return { exact, folded }
    }

    /**
     * Copies a dense ordinary array without invoking element accessors.
     * @param {unknown} value Array candidate.
     * @returns {unknown[]}
     */
    static #denseArray(value) {
        let descriptors
        let prototype
        try {
            if (!Array.isArray(value)) return []
            descriptors = Object.getOwnPropertyDescriptors(value)
            prototype = Object.getPrototypeOf(value)
        } catch {
            return []
        }
        const length = descriptors.length?.value
        if (
            prototype !== Array.prototype ||
            !Number.isSafeInteger(length) ||
            length < 0
        ) {
            return []
        }

        const result = new Array(length)
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)]
            if (
                !descriptor ||
                descriptor.enumerable !== true ||
                !Object.hasOwn(descriptor, 'value')
            ) {
                return []
            }
            result[index] = descriptor.value
        }
        return result
    }

    /**
     * Materializes a canonical asset only when its first reference is used.
     * @param {{ asset: object, canonical: boolean, materialized: boolean, resolvedAsset: object | null }} entry Indexed asset entry.
     * @returns {object | null}
     */
    static #resolvedIndexedAsset(entry) {
        if (!entry.materialized) {
            entry.resolvedAsset =
                CircuitJsonCadModelAssetResolver.#canonicalAsset(entry.asset) ||
                entry.asset
            entry.materialized = true
        }
        return entry.resolvedAsset
    }

    /**
     * Materializes one validated canonical asset into safe resolver metadata.
     * @param {unknown} asset Canonical asset candidate.
     * @returns {Record<string, unknown> | null}
     */
    static #canonicalAsset(asset) {
        try {
            const prepared = ToolkitAsset.create(asset)
            return {
                ...PcbScene3dDescriptorSafeRecord.copy(prepared),
                data: prepared.data
            }
        } catch {
            return null
        }
    }

    /**
     * Reads exact legacy and canonical path aliases without invoking accessors.
     * @param {object} asset Asset row.
     * @returns {Set<string>}
     */
    static #assetAliases(asset) {
        const source = CircuitJsonCadModelAssetResolver.#ownData(
            asset,
            'source'
        )
        return new Set(
            [
                CircuitJsonCadModelAssetResolver.#ownData(
                    asset,
                    'relativePath'
                ),
                CircuitJsonCadModelAssetResolver.#ownData(asset, 'sourceUrl'),
                CircuitJsonCadModelAssetResolver.#ownData(asset, 'url'),
                CircuitJsonCadModelAssetResolver.#ownData(asset, 'name'),
                CircuitJsonCadModelAssetResolver.#ownData(source, 'entryName'),
                CircuitJsonCadModelAssetResolver.#ownData(
                    source,
                    'projectRelativePath'
                ),
                CircuitJsonCadModelAssetResolver.#ownData(
                    source,
                    'project_relative_path'
                ),
                CircuitJsonCadModelAssetResolver.#ownData(
                    source,
                    'relativePath'
                ),
                CircuitJsonCadModelAssetResolver.#ownData(source, 'url'),
                CircuitJsonCadModelAssetResolver.#ownData(source, 'uri')
            ]
                .map((value) => CircuitJsonCadModelAssetResolver.#key(value))
                .filter(Boolean)
        )
    }

    /**
     * Builds normalized URL/path candidates for matching.
     * @param {string} url Model URL.
     * @param {object} context Resolver context.
     * @returns {Set<string>}
     */
    static #urlCandidates(url, context) {
        const cadComponent = CircuitJsonCadModelAssetResolver.#ownData(
            context,
            'cadComponent'
        )
        const modelAsset = CircuitJsonCadModelAssetResolver.#ownData(
            cadComponent,
            'model_asset'
        )
        return new Set(
            [
                url,
                CircuitJsonCadModelAssetResolver.#ownData(
                    modelAsset,
                    'project_relative_path'
                ),
                CircuitJsonCadModelAssetResolver.#ownData(modelAsset, 'url')
            ]
                .map((value) => CircuitJsonCadModelAssetResolver.#key(value))
                .filter(Boolean)
        )
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
     * Returns true when a CAD component already has a model URL.
     * @param {object} element Element row.
     * @returns {boolean}
     */
    static #hasModelUrl(element) {
        return [
            'model_step_url',
            'model_stp_url',
            'model_3mf_url',
            'model_wrl_url',
            'model_vrml_url',
            'model_glb_url',
            'model_gltf_url',
            'model_stl_url',
            'model_obj_url'
        ].some((field) =>
            String(
                CircuitJsonCadModelAssetResolver.#ownData(element, field) || ''
            ).trim()
        )
    }

    /**
     * Reads element rows from document wrappers.
     * @param {object | object[]} documentModel Document model.
     * @returns {object[]}
     */
    static #elements(documentModel) {
        if (Array.isArray(documentModel)) return documentModel
        if (
            CircuitJsonCadModelAssetResolver.#isContext(documentModel) &&
            Array.isArray(documentModel.document?.model)
        ) {
            return documentModel.document.model
        }
        const wrappedDocument = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'document'
        )
        const wrappedModel = CircuitJsonCadModelAssetResolver.#ownData(
            wrappedDocument,
            'model'
        )
        if (Array.isArray(wrappedModel)) return wrappedModel
        const model = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'model'
        )
        if (Array.isArray(model)) return model
        const elements = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'elements'
        )
        if (Array.isArray(elements)) return elements
        const circuitJson = CircuitJsonCadModelAssetResolver.#ownData(
            documentModel,
            'circuitJson'
        )
        if (Array.isArray(circuitJson)) return circuitJson
        return []
    }

    /**
     * Normalizes a path or URL key.
     * @param {unknown} value Raw path.
     * @returns {string}
     */
    static #key(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return ''
        return String(value || '')
            .trim()
            .split(/[?#]/u)[0]
            .replace(/^https?:\/\/[^/]+\//iu, '')
            .replace(/^\/+/u, '')
    }
}
