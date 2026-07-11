/**
 * Loads the ESM-shaped OCCT browser package without relying on global scripts.
 */
export class PcbScene3dOcctImporterLoader {
    /** @type {Map<string, Promise<Record<string, any>>>} */
    static #cachedImports = new Map()

    /**
     * Imports and instantiates the OCCT module from its installed package.
     * @param {{ resolveAssetUrl: (fileName: string) => string, loadModule?: (url: string) => Promise<Record<string, any>> }} options Loader options.
     * @returns {Promise<Record<string, any>>} Initialized OCCT importer.
     */
    static async load(options) {
        const resolveAssetUrl = options?.resolveAssetUrl
        if (typeof resolveAssetUrl !== 'function') {
            throw new TypeError('OCCT asset URL resolver is required.')
        }

        const loadModule =
            options?.loadModule ||
            ((url) => PcbScene3dOcctImporterLoader.#importModule(url))
        const module = await loadModule(resolveAssetUrl('occt-import-js.js'))
        const factory = module?.default || module?.occtimportjs
        if (typeof factory !== 'function') {
            throw new Error('occt-import-js did not export a factory.')
        }

        return await factory({
            locateFile: (fileName) => resolveAssetUrl(fileName)
        })
    }

    /**
     * Loads one importer per resolved module URL and evicts rejected attempts.
     * @param {{ resolveAssetUrl: (fileName: string) => string, loadModule?: (url: string) => Promise<Record<string, any>> }} options Loader options.
     * @returns {Promise<Record<string, any>>} Cached initialized OCCT importer.
     */
    static async loadCached(options) {
        const resolveAssetUrl = options?.resolveAssetUrl
        if (typeof resolveAssetUrl !== 'function') {
            throw new TypeError('OCCT asset URL resolver is required.')
        }

        const moduleUrl = resolveAssetUrl('occt-import-js.js')
        let pendingImport =
            PcbScene3dOcctImporterLoader.#cachedImports.get(moduleUrl)
        if (!pendingImport) {
            pendingImport = PcbScene3dOcctImporterLoader.load(options)
            PcbScene3dOcctImporterLoader.#cachedImports.set(
                moduleUrl,
                pendingImport
            )
        }

        try {
            return await pendingImport
        } catch (error) {
            if (
                PcbScene3dOcctImporterLoader.#cachedImports.get(moduleUrl) ===
                pendingImport
            ) {
                PcbScene3dOcctImporterLoader.#cachedImports.delete(moduleUrl)
            }
            throw error
        }
    }

    /**
     * Dynamically imports one browser module URL.
     * @param {string} url Module URL.
     * @returns {Promise<Record<string, any>>} Imported namespace.
     */
    static async #importModule(url) {
        return await import(url)
    }
}

Object.freeze(PcbScene3dOcctImporterLoader.prototype)
Object.freeze(PcbScene3dOcctImporterLoader)
