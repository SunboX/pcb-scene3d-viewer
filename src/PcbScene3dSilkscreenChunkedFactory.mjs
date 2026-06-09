import { PcbScene3dSilkscreenFactory } from './PcbScene3dSilkscreenFactory.mjs'

/**
 * Builds silkscreen groups in batches so expensive stroke clipping can yield
 * between chunks during deferred runtime loading.
 */
export class PcbScene3dSilkscreenChunkedFactory {
    static #ARC_BATCH_SIZE = 40
    static #FILL_BATCH_SIZE = 8
    static #TEXT_BATCH_SIZE = 30
    static #TRACK_BATCH_SIZE = 50
    static #RECORD_KEYS = ['tracks', 'arcs', 'fills', 'texts']

    /**
     * Builds the combined top and bottom silkscreen group with optional
     * yielding between large record batches.
     * @param {any} THREE
     * @param {{ top?: object, bottom?: object }} silkscreen
     * @param {number} topZ
     * @param {number} bottomZ
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ yieldToMain?: () => Promise<void> | void, shouldContinue?: () => boolean }} [options]
     * @returns {Promise<any>}
     */
    static async buildGroup(
        THREE,
        silkscreen,
        topZ,
        bottomZ,
        normalizeBoardPoint,
        options = {}
    ) {
        if (!PcbScene3dSilkscreenChunkedFactory.#needsChunking(silkscreen)) {
            return PcbScene3dSilkscreenFactory.buildGroup(
                THREE,
                silkscreen,
                topZ,
                bottomZ,
                normalizeBoardPoint
            )
        }

        const group = new THREE.Group()
        for (const side of ['top', 'bottom']) {
            for (const recordKey of PcbScene3dSilkscreenChunkedFactory
                .#RECORD_KEYS) {
                await PcbScene3dSilkscreenChunkedFactory.#appendRecordChunks(
                    group,
                    THREE,
                    silkscreen,
                    side,
                    recordKey,
                    topZ,
                    bottomZ,
                    normalizeBoardPoint,
                    options
                )
            }
        }

        return group
    }

    /**
     * Appends chunked record-only groups for one board side.
     * @param {any} group
     * @param {any} THREE
     * @param {{ top?: object, bottom?: object }} silkscreen
     * @param {'top' | 'bottom'} side
     * @param {'tracks' | 'arcs' | 'fills' | 'texts'} recordKey
     * @param {number} topZ
     * @param {number} bottomZ
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ yieldToMain?: () => Promise<void> | void, shouldContinue?: () => boolean }} options
     * @returns {Promise<void>}
     */
    static async #appendRecordChunks(
        group,
        THREE,
        silkscreen,
        side,
        recordKey,
        topZ,
        bottomZ,
        normalizeBoardPoint,
        options
    ) {
        const sideSilkscreen = silkscreen?.[side] || {}
        const records = Array.isArray(sideSilkscreen[recordKey])
            ? sideSilkscreen[recordKey]
            : []
        const batchSize =
            PcbScene3dSilkscreenChunkedFactory.#resolveBatchSize(recordKey)

        for (
            let index = 0;
            index < records.length &&
            PcbScene3dSilkscreenChunkedFactory.#shouldContinue(options);
            index += batchSize
        ) {
            const chunkGroup = PcbScene3dSilkscreenFactory.buildGroup(
                THREE,
                PcbScene3dSilkscreenChunkedFactory.#buildChunkSilkscreen(
                    side,
                    sideSilkscreen,
                    recordKey,
                    records.slice(index, index + batchSize)
                ),
                topZ,
                bottomZ,
                normalizeBoardPoint
            )
            if (chunkGroup.children.length) {
                group.add(chunkGroup)
            }
            await PcbScene3dSilkscreenChunkedFactory.#yieldToMain(options)
        }
    }

    /**
     * Builds a silkscreen descriptor containing one record chunk.
     * @param {'top' | 'bottom'} side
     * @param {object} sideSilkscreen
     * @param {'tracks' | 'arcs' | 'fills' | 'texts'} recordKey
     * @param {any[]} records
     * @returns {{ top?: object, bottom?: object }}
     */
    static #buildChunkSilkscreen(side, sideSilkscreen, recordKey, records) {
        return {
            [side]: {
                ...sideSilkscreen,
                arcs: [],
                fills: [],
                texts: [],
                tracks: [],
                [recordKey]: records
            }
        }
    }

    /**
     * Returns true when any side contains enough records to chunk.
     * @param {{ top?: object, bottom?: object }} silkscreen
     * @returns {boolean}
     */
    static #needsChunking(silkscreen) {
        for (const side of [silkscreen?.top, silkscreen?.bottom]) {
            for (const recordKey of PcbScene3dSilkscreenChunkedFactory
                .#RECORD_KEYS) {
                if (
                    PcbScene3dSilkscreenChunkedFactory.#resolveRecordCount(
                        side,
                        recordKey
                    ) >
                    PcbScene3dSilkscreenChunkedFactory.#resolveBatchSize(
                        recordKey
                    )
                ) {
                    return true
                }
            }
        }

        return false
    }

    /**
     * Counts one record type on one side.
     * @param {object | undefined} side
     * @param {'tracks' | 'arcs' | 'fills' | 'texts'} recordKey
     * @returns {number}
     */
    static #resolveRecordCount(side, recordKey) {
        return Array.isArray(side?.[recordKey]) ? side[recordKey].length : 0
    }

    /**
     * Resolves the chunk size for one record type.
     * @param {'tracks' | 'arcs' | 'fills' | 'texts'} recordKey
     * @returns {number}
     */
    static #resolveBatchSize(recordKey) {
        if (recordKey === 'arcs') {
            return PcbScene3dSilkscreenChunkedFactory.#ARC_BATCH_SIZE
        }
        if (recordKey === 'fills') {
            return PcbScene3dSilkscreenChunkedFactory.#FILL_BATCH_SIZE
        }
        if (recordKey === 'texts') {
            return PcbScene3dSilkscreenChunkedFactory.#TEXT_BATCH_SIZE
        }

        return PcbScene3dSilkscreenChunkedFactory.#TRACK_BATCH_SIZE
    }

    /**
     * Returns false after runtime disposal when an abort predicate is supplied.
     * @param {{ shouldContinue?: () => boolean }} options
     * @returns {boolean}
     */
    static #shouldContinue(options) {
        return typeof options?.shouldContinue === 'function'
            ? options.shouldContinue()
            : true
    }

    /**
     * Yields through the caller-provided scheduler.
     * @param {{ yieldToMain?: () => Promise<void> | void }} options
     * @returns {Promise<void>}
     */
    static async #yieldToMain(options) {
        if (typeof options?.yieldToMain === 'function') {
            await options.yieldToMain()
        }
    }
}
