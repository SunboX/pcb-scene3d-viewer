/**
 * Normalizes canonical CircuitJSON CAD model asset references.
 */
export class PcbScene3dCircuitJsonModelAsset {
    /**
     * Resolves one viewer-supported canonical model asset reference.
     * @param {unknown} asset Model asset candidate.
     * @returns {{ format: string, sourceUrl: string } | null}
     */
    static reference(asset) {
        if (!asset || typeof asset !== 'object') return null
        const sourceUrl = String(
            asset.project_relative_path || asset.url || ''
        ).trim()
        const format = PcbScene3dCircuitJsonModelAsset.#format(asset, sourceUrl)
        return sourceUrl && format ? { format, sourceUrl } : null
    }

    /**
     * Resolves a supported CAD format from canonical and retained metadata.
     * @param {object} asset Model asset metadata.
     * @param {string} sourceUrl Canonical model asset path.
     * @returns {string}
     */
    static #format(asset, sourceUrl) {
        const text = [asset.format, asset.mimetype, sourceUrl, asset.url]
            .map(String)
            .join(' ')
            .toLowerCase()
        if (/\bglb\b|\.glb(?:[?#]|$)/u.test(text)) return 'glb'
        if (/\bgltf\b|\.gltf(?:[?#]|$)/u.test(text)) return 'gltf'
        if (/\b3mf\b|\.3mf(?:[?#]|$)/u.test(text)) return '3mf'
        if (/\bobj\b|\.obj(?:[?#]|$)/u.test(text)) return 'obj'
        if (/\bstl\b|\.stl(?:[?#]|$)/u.test(text)) return 'stl'
        if (/\bwrl\b|vrml|\.wrl(?:[?#]|$)/u.test(text)) return 'wrl'
        return /step|stp|\.step(?:[?#]|$)|\.stp(?:[?#]|$)/u.test(text)
            ? 'step'
            : ''
    }
}
