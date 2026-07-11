import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'

const FETCH_SCOPE = Symbol('PcbScene3dModelFetchPolicy.scope')
const DEFAULT_MAX_RESOURCE_BYTES = 128 * 1024 * 1024
const DEFAULT_MAX_RESOURCE_COUNT = 256
const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024

/**
 * Owns one explicit, origin-aware, bounded model network policy.
 */
export class PcbScene3dModelFetchPolicy {
    /**
     * Creates or reuses one request-scoped policy and aggregate budget.
     * @param {object} [options] Caller model loading options.
     * @returns {object} Descriptor-safe scoped options.
     */
    static scope(options = {}) {
        if (PcbScene3dModelFetchPolicy.#budget(options)) return options
        const scoped = PcbScene3dDescriptorSafeRecord.copy(options)
        Object.defineProperty(scoped, FETCH_SCOPE, {
            configurable: false,
            enumerable: false,
            value: {
                count: 0,
                totalBytes: 0,
                maxBytes: PcbScene3dModelFetchPolicy.#limit(
                    scoped.maxModelBytes,
                    DEFAULT_MAX_RESOURCE_BYTES
                ),
                maxCount: PcbScene3dModelFetchPolicy.#limit(
                    scoped.maxModelResources,
                    DEFAULT_MAX_RESOURCE_COUNT
                ),
                maxTotalBytes: PcbScene3dModelFetchPolicy.#limit(
                    scoped.maxModelTotalBytes,
                    DEFAULT_MAX_TOTAL_BYTES
                )
            },
            writable: false
        })
        return scoped
    }

    /**
     * Returns whether an explicit or opted-in fetch implementation exists.
     * @param {object} options Model loading options.
     * @returns {boolean}
     */
    static canFetch(options) {
        return Boolean(PcbScene3dModelFetchPolicy.#fetcher(options))
    }

    /**
     * Fetches one model resource through origin and resource limits.
     * @param {string} url Resource URL.
     * @param {object} options Scoped model loading options.
     * @param {{ mainUrl?: string, label?: string }} [context] Request context.
     * @returns {Promise<Uint8Array>} Bounded fetched bytes.
     */
    static async fetchBytes(url, options, context = {}) {
        const scoped = PcbScene3dModelFetchPolicy.scope(options)
        const fetcher = PcbScene3dModelFetchPolicy.#fetcher(scoped)
        if (!fetcher) throw new Error('Model network loading is disabled.')
        const budget = PcbScene3dModelFetchPolicy.#budget(scoped)
        PcbScene3dModelFetchPolicy.#begin(budget)

        const mainUrl = String(context.mainUrl || url || '').trim()
        const sameOrigin = PcbScene3dModelFetchPolicy.#sameOrigin(url, mainUrl)
        const headers = PcbScene3dModelFetchPolicy.#headers(
            url,
            scoped,
            mainUrl,
            sameOrigin,
            context.label
        )
        const controller =
            typeof AbortController === 'function' ? new AbortController() : null
        const timeoutMs = Math.max(Number(scoped.fetchTimeoutMs || 30_000), 1)
        const timeout = controller
            ? setTimeout(() => controller.abort(), timeoutMs)
            : null
        try {
            const response = await fetcher(url, {
                headers,
                signal: controller?.signal
            })
            if (response?.ok === false) {
                throw new Error(
                    'Model fetch failed with HTTP status ' +
                        String(response.status || 'unknown') +
                        '.'
                )
            }
            PcbScene3dModelFetchPolicy.#assertDeclaredLength(response, budget)
            const bytes =
                await PcbScene3dModelFetchPolicy.#responseBytes(response)
            PcbScene3dModelFetchPolicy.#accept(budget, bytes.byteLength)
            return bytes
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(
                    'Model fetch timed out after ' + timeoutMs + 'ms: ' + url
                )
            }
            throw error
        } finally {
            if (timeout) clearTimeout(timeout)
        }
    }

    /**
     * Reserves one resource slot before issuing a request.
     * @param {object} budget Shared request budget.
     * @returns {void}
     */
    static #begin(budget) {
        if (budget.count >= budget.maxCount) {
            throw new Error(
                'Model fetch exceeds maximum model resource count of ' +
                    budget.maxCount +
                    '.'
            )
        }
        budget.count += 1
    }

    /**
     * Accounts one completed response against byte limits.
     * @param {object} budget Shared request budget.
     * @param {number} byteLength Response byte length.
     * @returns {void}
     */
    static #accept(budget, byteLength) {
        if (byteLength > budget.maxBytes) {
            throw new Error(
                'Model fetch exceeds maximum model resource size of ' +
                    budget.maxBytes +
                    ' bytes.'
            )
        }
        if (budget.totalBytes + byteLength > budget.maxTotalBytes) {
            throw new Error(
                'Model fetch exceeds maximum aggregate model size of ' +
                    budget.maxTotalBytes +
                    ' bytes.'
            )
        }
        budget.totalBytes += byteLength
    }

    /**
     * Rejects a declared response length before materializing its body.
     * @param {unknown} response Fetch response.
     * @param {object} budget Shared request budget.
     * @returns {void}
     */
    static #assertDeclaredLength(response, budget) {
        let header = null
        try {
            header = response?.headers?.get?.('content-length')
        } catch {
            header = null
        }
        const length = Number(header)
        if (!Number.isFinite(length) || length < 0) return
        PcbScene3dModelFetchPolicy.#accept(
            { ...budget, totalBytes: budget.totalBytes },
            length
        )
    }

    /**
     * Resolves static same-origin and explicit per-URL headers.
     * @param {string} url Request URL.
     * @param {object} options Scoped loading options.
     * @param {string} mainUrl Main model URL.
     * @param {boolean} sameOrigin Whether request and main URL share an origin.
     * @param {string | undefined} label Request label.
     * @returns {Record<string, string>} Request headers.
     */
    static #headers(url, options, mainUrl, sameOrigin, label) {
        const headers = sameOrigin
            ? PcbScene3dModelFetchPolicy.#headerRecord(options.authHeaders)
            : {}
        if (typeof options.authHeadersForUrl !== 'function') return headers
        const selected = options.authHeadersForUrl(url, {
            label: String(label || 'Model'),
            mainUrl,
            sameOrigin
        })
        return {
            ...headers,
            ...PcbScene3dModelFetchPolicy.#headerRecord(selected)
        }
    }

    /**
     * Converts a fetch response or direct byte-like value into bytes.
     * @param {unknown} response Fetch result.
     * @returns {Promise<Uint8Array>} Response bytes.
     */
    static async #responseBytes(response) {
        if (response instanceof Uint8Array) return response
        if (response instanceof ArrayBuffer) return new Uint8Array(response)
        if (ArrayBuffer.isView(response)) {
            return new Uint8Array(
                response.buffer,
                response.byteOffset,
                response.byteLength
            )
        }
        if (typeof response?.arrayBuffer === 'function') {
            return new Uint8Array(await response.arrayBuffer())
        }
        if (typeof response?.text === 'function') {
            return new TextEncoder().encode(await response.text())
        }
        throw new Error('Fetched model content is not readable.')
    }

    /**
     * Returns the configured fetch implementation.
     * @param {object} options Loading options.
     * @returns {((url: string, options: object) => Promise<any>) | null}
     */
    static #fetcher(options) {
        if (typeof options?.fetch === 'function') return options.fetch
        return options?.allowNetworkModelFetch === true &&
            typeof globalThis.fetch === 'function'
            ? globalThis.fetch.bind(globalThis)
            : null
    }

    /**
     * Returns whether two request paths may share static credentials.
     * @param {string} url Resource URL.
     * @param {string} mainUrl Main model URL.
     * @returns {boolean}
     */
    static #sameOrigin(url, mainUrl) {
        const request = PcbScene3dModelFetchPolicy.#absoluteUrl(url)
        const main = PcbScene3dModelFetchPolicy.#absoluteUrl(mainUrl)
        if (request && main) return request.origin === main.origin
        if (request || main) return String(url) === String(mainUrl)
        return true
    }

    /**
     * Parses one absolute URL without inventing a base.
     * @param {unknown} value URL candidate.
     * @returns {URL | null}
     */
    static #absoluteUrl(value) {
        try {
            return new URL(String(value || ''))
        } catch {
            return null
        }
    }

    /**
     * Copies primitive header values without invoking accessors.
     * @param {unknown} value Header candidate.
     * @returns {Record<string, string>}
     */
    static #headerRecord(value) {
        return Object.fromEntries(
            Object.entries(PcbScene3dDescriptorSafeRecord.copy(value))
                .map(([key, field]) => [String(key), String(field)])
                .filter(([key, field]) => key && field)
        )
    }

    /**
     * Reads the private budget attached to scoped options.
     * @param {unknown} options Options candidate.
     * @returns {object | null}
     */
    static #budget(options) {
        if (!options || typeof options !== 'object') return null
        try {
            return options[FETCH_SCOPE] || null
        } catch {
            return null
        }
    }

    /**
     * Normalizes a nonnegative safe limit or uses its default.
     * @param {unknown} value Limit candidate.
     * @param {number} fallback Safe default.
     * @returns {number}
     */
    static #limit(value, fallback) {
        if (value === undefined || value === null || value === '') {
            return fallback
        }
        const number = Number(value)
        return Number.isSafeInteger(number) && number >= 0 ? number : fallback
    }
}

Object.freeze(PcbScene3dModelFetchPolicy.prototype)
Object.freeze(PcbScene3dModelFetchPolicy)
