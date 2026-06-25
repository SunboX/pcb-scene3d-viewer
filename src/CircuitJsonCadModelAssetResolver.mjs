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
                sourceFormat: documentModel.sourceFormat,
                kind: documentModel.kind,
                fileName: documentModel.fileName,
                bom: documentModel.bom
            })
            return nextElements
        }

        if (Array.isArray(documentModel?.elements)) {
            return { ...documentModel, elements: nextElements }
        }
        if (Array.isArray(documentModel?.circuitJson)) {
            return { ...documentModel, circuitJson: nextElements }
        }
        return documentModel
    }

    /**
     * Adds a session-asset-aware model URL resolver.
     * @param {object} options Scene preparation options.
     * @returns {object}
     */
    static withSessionAssetResolver(options = {}) {
        const sessionAssets = Array.isArray(options.sessionAssets)
            ? options.sessionAssets
            : []
        const callerResolver =
            typeof options.modelUrlResolver === 'function'
                ? options.modelUrlResolver
                : null

        return {
            ...options,
            modelUrlResolver: (url, context) =>
                CircuitJsonCadModelAssetResolver.#resolveModelUrl(
                    url,
                    context,
                    sessionAssets,
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
        const asset = element.model_asset || {}
        const sourceUrl = String(
            asset.project_relative_path || asset.url || ''
        ).trim()
        if (!sourceUrl) return element
        return { ...element, [field]: sourceUrl }
    }

    /**
     * Resolves a model URL field for one CAD component asset.
     * @param {object} element Element row.
     * @returns {string}
     */
    static #modelAssetUrlField(element) {
        if (element?.type !== 'cad_component') return ''
        const asset = element.model_asset
        if (!asset || typeof asset !== 'object') return ''
        if (CircuitJsonCadModelAssetResolver.#hasModelUrl(element)) return ''
        const format = CircuitJsonCadModelAssetResolver.#format(asset)
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
     * @param {object[]} sessionAssets Session asset rows.
     * @param {((url: string, context: object) => any) | null} callerResolver Caller resolver.
     * @returns {object | string | null}
     */
    static #resolveModelUrl(url, context, sessionAssets, callerResolver) {
        const matchedAsset =
            CircuitJsonCadModelAssetResolver.#matchingSessionAsset(
                url,
                context,
                sessionAssets
            )
        if (matchedAsset) {
            return matchedAsset
        }
        return callerResolver ? callerResolver(url, context) : null
    }

    /**
     * Finds a session asset matching one CAD model URL.
     * @param {string} url Model URL.
     * @param {object} context Resolver context.
     * @param {object[]} sessionAssets Session assets.
     * @returns {object | null}
     */
    static #matchingSessionAsset(url, context, sessionAssets) {
        const candidates = CircuitJsonCadModelAssetResolver.#urlCandidates(
            url,
            context
        )
        return (
            sessionAssets.find((asset) =>
                CircuitJsonCadModelAssetResolver.#assetMatches(
                    asset,
                    candidates
                )
            ) || null
        )
    }

    /**
     * Builds normalized URL/path candidates for matching.
     * @param {string} url Model URL.
     * @param {object} context Resolver context.
     * @returns {Set<string>}
     */
    static #urlCandidates(url, context) {
        return new Set(
            [
                url,
                context?.cadComponent?.model_asset?.project_relative_path,
                context?.cadComponent?.model_asset?.url
            ]
                .map((value) => CircuitJsonCadModelAssetResolver.#key(value))
                .filter(Boolean)
        )
    }

    /**
     * Returns true when a session asset matches a model URL.
     * @param {object} asset Session asset.
     * @param {Set<string>} candidates URL candidates.
     * @returns {boolean}
     */
    static #assetMatches(asset, candidates) {
        return [
            asset?.relativePath,
            asset?.sourceUrl,
            asset?.url,
            asset?.name
        ].some((value) =>
            candidates.has(CircuitJsonCadModelAssetResolver.#key(value))
        )
    }

    /**
     * Resolves a supported model format from asset metadata.
     * @param {object} asset Model asset metadata.
     * @returns {string}
     */
    static #format(asset) {
        const text = String(
            asset.format ||
                asset.mimetype ||
                asset.project_relative_path ||
                asset.url ||
                ''
        ).toLowerCase()
        if (/\bglb\b|\.glb(?:[?#]|$)/u.test(text)) return 'glb'
        if (/\bgltf\b|\.gltf(?:[?#]|$)/u.test(text)) return 'gltf'
        if (/\b3mf\b|\.3mf(?:[?#]|$)/u.test(text)) return '3mf'
        if (/\bobj\b|\.obj(?:[?#]|$)/u.test(text)) return 'obj'
        if (/\bstl\b|\.stl(?:[?#]|$)/u.test(text)) return 'stl'
        if (/\bwrl\b|vrml|\.wrl(?:[?#]|$)/u.test(text)) return 'wrl'
        if (/step|stp|\.step(?:[?#]|$)|\.stp(?:[?#]|$)/u.test(text)) {
            return 'step'
        }
        return ''
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
        ].some((field) => String(element?.[field] || '').trim())
    }

    /**
     * Reads element rows from document wrappers.
     * @param {object | object[]} documentModel Document model.
     * @returns {object[]}
     */
    static #elements(documentModel) {
        if (Array.isArray(documentModel)) return documentModel
        if (Array.isArray(documentModel?.elements))
            return documentModel.elements
        if (Array.isArray(documentModel?.circuitJson)) {
            return documentModel.circuitJson
        }
        return []
    }

    /**
     * Normalizes a path or URL key.
     * @param {unknown} value Raw path.
     * @returns {string}
     */
    static #key(value) {
        return String(value || '')
            .trim()
            .split(/[?#]/u)[0]
            .replace(/^https?:\/\/[^/]+\//iu, '')
            .replace(/^\/+/u, '')
            .toLowerCase()
    }
}
