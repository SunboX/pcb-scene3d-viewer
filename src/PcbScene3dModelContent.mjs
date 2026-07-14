import { PcbScene3dModelIdentity } from './PcbScene3dModelIdentity.mjs'
import { PcbScene3dModelFetchPolicy } from './PcbScene3dModelFetchPolicy.mjs'

const CONTENT_UNAVAILABLE_ERROR = 'ERR_MODEL_CONTENT_UNAVAILABLE'

/**
 * Reads external-model payloads through one explicit local/network policy.
 */
export class PcbScene3dModelContent {
    /**
     * Creates or reuses one bounded model fetch scope.
     * @param {object} [options] Model loading options.
     * @returns {object} Scoped options.
     */
    static createFetchScope(options = {}) {
        return PcbScene3dModelFetchPolicy.scope(options)
    }

    /**
     * Returns whether model URL fetching is explicitly available.
     * @param {object} options Model loading options.
     * @returns {boolean}
     */
    static canFetch(options) {
        return PcbScene3dModelFetchPolicy.canFetch(options)
    }

    /**
     * Creates a typed missing-content error for deferred model references.
     * @param {string} [label] Human-readable format label.
     * @returns {Error}
     */
    static unavailableError(label = 'Model') {
        const error = new Error(label + ' model content is not available.')
        Object.defineProperty(error, 'code', {
            configurable: false,
            enumerable: true,
            value: CONTENT_UNAVAILABLE_ERROR,
            writable: false
        })
        return error
    }

    /**
     * Returns whether a failure is the typed missing-content condition.
     * @param {unknown} error Candidate failure.
     * @returns {boolean}
     */
    static isUnavailableError(error) {
        try {
            return error?.code === CONTENT_UNAVAILABLE_ERROR
        } catch {
            return false
        }
    }

    /**
     * Reads one model as bytes from text, binary data, files, or opted-in URLs.
     * @param {unknown} model External model metadata.
     * @param {object} [options] Model loading policy.
     * @param {string} [label] Human-readable format label.
     * @returns {Promise<Uint8Array>}
     */
    static async bytes(model, options = {}, label = 'Model') {
        for (const key of ['payloadText', 'text']) {
            const value = PcbScene3dModelContent.#data(model, key)
            if (typeof value === 'string') {
                return new TextEncoder().encode(value)
            }
        }
        for (const key of ['payloadBytes', 'bytes', 'data', 'file']) {
            const value = PcbScene3dModelContent.#data(model, key)
            if (typeof value === 'string') {
                return new TextEncoder().encode(value)
            }
            const bytes = await PcbScene3dModelContent.#bytesFromValue(value)
            if (bytes) return bytes
        }
        return PcbScene3dModelContent.#fetchBytes(model, options, label)
    }

    /**
     * Reads one text-capable model without losing canonical string data.
     * @param {unknown} model External model metadata.
     * @param {object} [options] Model loading policy.
     * @param {string} [label] Human-readable format label.
     * @returns {Promise<string>}
     */
    static async text(model, options = {}, label = 'Model') {
        for (const key of ['payloadText', 'text', 'data']) {
            const value = PcbScene3dModelContent.#data(model, key)
            if (typeof value === 'string') return value
        }
        const file = PcbScene3dModelContent.#data(model, 'file')
        if (typeof file?.text === 'function') return file.text()
        return new TextDecoder().decode(
            await PcbScene3dModelContent.bytes(model, options, label)
        )
    }

    /**
     * Returns whether a model already carries local payload content.
     * @param {unknown} model External model metadata.
     * @returns {boolean}
     */
    static hasLocal(model) {
        return [
            'payloadText',
            'text',
            'payloadBytes',
            'bytes',
            'data',
            'file'
        ].some((key) => {
            const value = PcbScene3dModelContent.#data(model, key)
            return value !== null && value !== undefined
        })
    }

    /**
     * Resolves a relative resource URL against absolute or project-relative bases.
     * @param {string} uri Relative resource URI.
     * @param {string} modelUrl Main model URL or path.
     * @returns {string}
     */
    static resolveRelativeUrl(uri, modelUrl) {
        const resource = String(uri || '').trim()
        const base = String(modelUrl || '').trim()
        if (!resource) return ''
        try {
            return new URL(resource, base).toString()
        } catch {
            if (/^(?:[a-z][a-z\d+.-]*:|\/)/iu.test(resource)) {
                return resource
            }
            const basePath = base.split(/[?#]/u)[0]
            const directory = basePath.includes('/')
                ? basePath.slice(0, basePath.lastIndexOf('/') + 1)
                : ''
            return PcbScene3dModelContent.safeProjectPath(resource, directory)
        }
    }

    /**
     * Resolves a safe project-relative resource path without root traversal.
     * @param {string} uri Resource URI.
     * @param {string} [baseDirectory] Project-relative base directory.
     * @returns {string}
     */
    static safeProjectPath(uri, baseDirectory = '') {
        const value = String(uri || '')
            .trim()
            .replaceAll('\\', '/')
        if (
            !value ||
            /^(?:[a-z][a-z\d+.-]*:|\/|#)/iu.test(value) ||
            value.includes('\0')
        ) {
            return ''
        }
        const parts = []
        const combined = String(baseDirectory || '') + value
        for (const part of combined.split('/')) {
            if (!part || part === '.') continue
            if (part === '..') {
                if (!parts.length) return ''
                parts.pop()
                continue
            }
            parts.push(part)
        }
        return parts.join('/')
    }

    /**
     * Fetches and caches one model URL with rejection eviction.
     * @param {unknown} model External model metadata.
     * @param {object} options Model loading policy.
     * @param {string} label Human-readable format label.
     * @returns {Promise<Uint8Array>}
     */
    static async #fetchBytes(model, options, label) {
        const url = String(
            PcbScene3dModelContent.#data(model, 'resolvedUrl') ||
                PcbScene3dModelContent.#data(model, 'sourceUrl') ||
                ''
        ).trim()
        if (!url || !PcbScene3dModelFetchPolicy.canFetch(options)) {
            throw PcbScene3dModelContent.unavailableError(label)
        }

        const cache =
            options?.modelCache instanceof Map ? options.modelCache : null
        const cacheKey = 'model:' + PcbScene3dModelIdentity.resolve(model)
        const cached = cache?.get(cacheKey)
        if (cached) return cached

        const pending = PcbScene3dModelContent.#fetchUncached(
            url,
            options,
            label,
            String(PcbScene3dModelContent.#data(model, 'mainModelUrl') || url)
        )
        cache?.set(cacheKey, pending)
        try {
            return await pending
        } catch (error) {
            if (cache?.get(cacheKey) === pending) cache.delete(cacheKey)
            throw error
        }
    }

    /**
     * Fetches one uncached model payload.
     * @param {string} url Model URL.
     * @param {object} options Fetch policy.
     * @param {string} label Human-readable resource label.
     * @param {string} mainUrl Main model URL for origin policy.
     * @returns {Promise<Uint8Array>}
     */
    static async #fetchUncached(url, options, label, mainUrl) {
        return PcbScene3dModelFetchPolicy.fetchBytes(url, options, {
            label,
            mainUrl
        })
    }

    /**
     * Converts one byte-like or blob value into bytes.
     * @param {unknown} value Payload candidate.
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
     * Reads one own data property without invoking accessors.
     * @param {unknown} value Record candidate.
     * @param {PropertyKey} key Property key.
     * @returns {unknown}
     */
    static #data(value, key) {
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
