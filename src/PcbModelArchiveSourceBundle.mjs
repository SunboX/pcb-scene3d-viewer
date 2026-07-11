import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'
import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'
import { PcbScene3dModelIdentity } from './PcbScene3dModelIdentity.mjs'

/**
 * Builds one self-contained raw model subtree for ZIP export.
 */
export class PcbModelArchiveSourceBundle {
    /**
     * Builds one main source and its safe relative companion resources.
     * @param {{ pattern: string, model: object }} entry Raw model entry.
     * @param {Set<string>} usedDirectories Existing bundle directories.
     * @param {object} modelLoaderOptions Scoped loading policy.
     * @returns {Promise<{ archivePath: string, bundleDirectory: string, companionPaths: string[], files: Record<string, Uint8Array> }>}
     */
    static async build(entry, usedDirectories, modelLoaderOptions) {
        const bundleDirectory = PcbModelArchiveSourceBundle.#directory(
            entry.pattern,
            usedDirectories
        )
        const sourceName = PcbModelArchiveSourceBundle.#sourceName(entry.model)
        const archivePath = bundleDirectory + '/' + sourceName
        const mainBytes = await PcbScene3dModelContent.bytes(
            entry.model,
            modelLoaderOptions,
            'Resolved'
        )
        const files = { [archivePath]: mainBytes }
        const companionPaths = await PcbModelArchiveSourceBundle.#companions(
            entry.model,
            mainBytes,
            bundleDirectory,
            modelLoaderOptions,
            files
        )
        usedDirectories.add(bundleDirectory)
        return { archivePath, bundleDirectory, companionPaths, files }
    }

    /**
     * Reads and writes safe relative companion resources.
     * @param {object} model Main model metadata.
     * @param {Uint8Array} mainBytes Main source bytes.
     * @param {string} bundleDirectory Unique archive directory.
     * @param {object} options Scoped loading policy.
     * @param {Record<string, Uint8Array>} files Bundle output.
     * @returns {Promise<string[]>} Companion archive paths.
     */
    static async #companions(
        model,
        mainBytes,
        bundleDirectory,
        options,
        files
    ) {
        const format = String(
            PcbModelArchiveSourceBundle.#ownData(model, 'format') || ''
        ).toLowerCase()
        if (!['gltf', 'obj', 'wrl', 'vrml'].includes(format)) return []

        const resources = PcbModelArchiveSourceBundle.#resources(model, format)
        const byPath = new Map()
        for (const resource of resources) {
            const path = PcbModelArchiveSourceBundle.#resourcePath(resource)
            if (path && !byPath.has(path)) byPath.set(path, resource)
        }
        const references = PcbModelArchiveSourceBundle.#references(
            format,
            new TextDecoder().decode(mainBytes)
        )
        const paths = new Set([...byPath.keys(), ...references])
        const mainUrl = PcbModelArchiveSourceBundle.#mainUrl(model)
        const companionPaths = []
        for (const path of paths) {
            const archivePath = bundleDirectory + '/' + path
            if (Object.hasOwn(files, archivePath)) continue
            const attached = byPath.get(path)
            const resource = attached
                ? {
                      ...PcbScene3dDescriptorSafeRecord.copy(attached),
                      mainModelUrl: mainUrl
                  }
                : PcbModelArchiveSourceBundle.#remoteResource(path, mainUrl)
            const bytes = await PcbScene3dModelContent.bytes(
                resource,
                options,
                'Model companion'
            )
            files[archivePath] = bytes
            companionPaths.push(archivePath)
        }
        return companionPaths
    }

    /**
     * Returns safe attached resource rows for one multi-file format.
     * @param {object} model Model metadata.
     * @param {string} format Model format.
     * @returns {object[]} Resource rows.
     */
    static #resources(model, format) {
        const field = format === 'gltf' ? 'externalBuffers' : 'resources'
        return PcbModelArchiveSourceBundle.#array(
            PcbModelArchiveSourceBundle.#ownData(model, field)
        )
    }

    /**
     * Extracts safe relative resource references from a main source.
     * @param {string} format Model format.
     * @param {string} text Main source text.
     * @returns {string[]} Safe unique paths.
     */
    static #references(format, text) {
        let references = []
        if (format === 'gltf') {
            try {
                const document = JSON.parse(text)
                references = [
                    ...PcbModelArchiveSourceBundle.#array(document?.buffers),
                    ...PcbModelArchiveSourceBundle.#array(document?.images)
                ].map((row) => row?.uri)
            } catch {
                references = []
            }
        } else if (format === 'obj') {
            references = [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gimu)].map(
                (match) =>
                    String(match[1] || '')
                        .trim()
                        .replace(/^(['"])(.*)\1$/u, '$2')
            )
        } else {
            for (const block of text.matchAll(
                /ImageTexture\s*\{[\s\S]*?\}/giu
            )) {
                references.push(
                    ...[...String(block[0]).matchAll(/(['"])([^'"]+)\1/gu)].map(
                        (match) => match[2]
                    )
                )
            }
        }
        return [
            ...new Set(
                references
                    .map((reference) =>
                        PcbModelArchiveSourceBundle.#safePath(reference)
                    )
                    .filter(Boolean)
            )
        ]
    }

    /**
     * Creates one explicitly fetchable missing companion.
     * @param {string} path Safe relative resource path.
     * @param {string} mainUrl Main model URL or path.
     * @returns {object} Resource metadata.
     */
    static #remoteResource(path, mainUrl) {
        return {
            format: 'model-resource',
            name: path.split('/').pop(),
            resolvedUrl: PcbScene3dModelContent.resolveRelativeUrl(
                path,
                mainUrl
            ),
            mainModelUrl: mainUrl
        }
    }

    /**
     * Resolves a safe relative path from one attached resource.
     * @param {object} resource Resource metadata.
     * @returns {string}
     */
    static #resourcePath(resource) {
        return PcbModelArchiveSourceBundle.#safePath(
            PcbModelArchiveSourceBundle.#ownData(resource, 'uri') ||
                PcbModelArchiveSourceBundle.#ownData(resource, 'name')
        )
    }

    /**
     * Normalizes a project-relative archive path without traversal or schemes.
     * @param {unknown} value Path candidate.
     * @returns {string}
     */
    static #safePath(value) {
        const raw = String(value || '')
            .trim()
            .split(/[?#]/u)[0]
        return PcbScene3dModelContent.safeProjectPath(raw)
    }

    /**
     * Selects one unique human-readable bundle directory.
     * @param {string} pattern Component pattern.
     * @param {Set<string>} used Existing directories.
     * @returns {string}
     */
    static #directory(pattern, used) {
        const base = PcbModelArchiveSourceBundle.#token(pattern || 'model')
        let candidate = base
        let suffix = 2
        while (used.has(candidate)) {
            candidate = base + '--' + suffix
            suffix += 1
        }
        return candidate
    }

    /**
     * Resolves the original source basename with a format fallback.
     * @param {object} model Main model metadata.
     * @returns {string}
     */
    static #sourceName(model) {
        const sourcePath = PcbScene3dModelIdentity.projectPath(model)
        let pathname = sourcePath
        try {
            pathname = new URL(sourcePath).pathname
        } catch {
            pathname = sourcePath
        }
        const candidate =
            String(pathname || '')
                .split(/[?#]/u)[0]
                .replaceAll('\\', '/')
                .split('/')
                .filter(Boolean)
                .pop() ||
            String(PcbModelArchiveSourceBundle.#ownData(model, 'name') || '')
                .replaceAll('\\', '/')
                .split('/')
                .pop()
        const extension = PcbModelArchiveSourceBundle.#extension(
            PcbModelArchiveSourceBundle.#ownData(model, 'format')
        )
        const safe = PcbModelArchiveSourceBundle.#token(candidate || 'model')
        return safe.includes('.') ? safe : safe + '.' + extension
    }

    /**
     * Resolves the main URL used for companion origin policy.
     * @param {object} model Main model metadata.
     * @returns {string}
     */
    static #mainUrl(model) {
        return String(
            PcbModelArchiveSourceBundle.#ownData(model, 'resolvedUrl') ||
                PcbModelArchiveSourceBundle.#ownData(model, 'sourceUrl') ||
                PcbScene3dModelIdentity.projectPath(model) ||
                ''
        ).trim()
    }

    /**
     * Resolves a normalized fallback extension.
     * @param {unknown} format Format candidate.
     * @returns {string}
     */
    static #extension(format) {
        const value = String(format || '').toLowerCase()
        if (value === 'stp') return 'step'
        if (value === 'vrml') return 'wrl'
        return ['step', 'wrl', 'glb', 'gltf', 'stl', 'obj', '3mf'].includes(
            value
        )
            ? value
            : 'step'
    }

    /**
     * Sanitizes one archive path segment.
     * @param {unknown} value Segment candidate.
     * @returns {string}
     */
    static #token(value) {
        return (
            String(value || '')
                .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, '-')
                .replace(/\s+/gu, ' ')
                .trim() || 'model'
        )
    }

    /**
     * Converts descriptor-safe array or object resources to rows.
     * @param {unknown} value Resource collection.
     * @returns {object[]}
     */
    static #array(value) {
        if (Array.isArray(value)) return value
        return value && typeof value === 'object'
            ? Object.entries(PcbScene3dDescriptorSafeRecord.copy(value)).map(
                  ([name, row]) => ({
                      name,
                      ...PcbScene3dDescriptorSafeRecord.copy(row)
                  })
              )
            : []
    }

    /**
     * Reads one own data property without invoking accessors.
     * @param {unknown} value Record candidate.
     * @param {PropertyKey} key Property name.
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
}

Object.freeze(PcbModelArchiveSourceBundle.prototype)
Object.freeze(PcbModelArchiveSourceBundle)
