import { PcbScene3dGeneratedGeometryBuilder } from './PcbScene3dGeneratedGeometryBuilder.mjs'
import { PcbScene3dGeometryTransfer } from './PcbScene3dGeometryTransfer.mjs'
import { PcbScene3dRuntimeHelpers } from './PcbScene3dRuntimeHelpers.mjs'

/** Owns cancellable worker geometry stages with an exact compatibility fallback. */
export class PcbScene3dGeometryWorkerClient {
    #worker = null
    #options
    #requests = new Map()
    #sequence = 0
    #unavailable = false
    #disposed = false

    /**
     * @param {{ workerFactory?: (() => Worker) | null, threeModuleUrl?: string, requestTimeoutMs?: number }} [options] Worker deployment options; a null factory disables workers.
     */
    constructor(options = {}) {
        this.#options = options
    }

    /**
     * Builds a stage away from the UI thread and restores received buffers.
     * @param {any} THREE Runtime Three.js namespace.
     * @param {'board' | 'copper'} kind Generated stage.
     * @param {object} sceneDescription Normalized scene description.
     * @returns {Promise<any>}
     */
    async build(THREE, kind, sceneDescription) {
        this.#assertActive()
        const worker = this.#ensureWorker()
        if (worker) {
            try {
                const data = await this.#request(worker, kind, sceneDescription)
                this.#assertActive()
                return PcbScene3dGeometryTransfer.deserialize(THREE, data)
            } catch (error) {
                this.#assertActive()
                this.#fail(error)
            }
        }
        // A worker may be forbidden by the host CSP; retain exact geometry there.
        await PcbScene3dRuntimeHelpers.yieldToNextFrame(globalThis)
        this.#assertActive()
        return PcbScene3dGeneratedGeometryBuilder.build(
            THREE,
            kind,
            sceneDescription
        )
    }

    /** Terminates active work instead of leaving detached scene builds running. @returns {void} */
    dispose() {
        this.#disposed = true
        this.#fail(this.#abortError())
        this.#options = {}
    }

    /** Creates one reusable worker, isolating startup failures. @returns {Worker | null} */
    #ensureWorker() {
        if (this.#unavailable || this.#worker) return this.#worker
        try {
            if (this.#options.workerFactory === null) {
                this.#unavailable = true
                return null
            }
            if (this.#options.workerFactory)
                this.#worker = this.#options.workerFactory()
            else if (typeof globalThis.Worker === 'function') {
                const url = new URL(
                    './PcbScene3dGeometryWorker.mjs',
                    import.meta.url
                )
                url.search = new URL(import.meta.url).search
                this.#worker = new globalThis.Worker(url, {
                    type: 'module',
                    name: 'pcb-generated-geometry'
                })
            }
            if (!this.#worker) {
                this.#unavailable = true
                return null
            }
            this.#worker.addEventListener('message', (event) =>
                this.#receive(event.data)
            )
            this.#worker.addEventListener('error', (event) =>
                this.#fail(
                    new Error(event?.message || 'Geometry worker failed.')
                )
            )
            this.#worker.addEventListener('messageerror', () =>
                this.#fail(
                    new Error('Geometry worker response could not be read.')
                )
            )
        } catch (error) {
            this.#fail(error)
        }
        return this.#worker
    }

    /**
     * Sends a cloneable scene subset without transferring caller-owned arrays.
     * @param {Worker} worker Active worker.
     * @param {string} kind Geometry stage.
     * @param {object} sceneDescription Normalized scene.
     * @returns {Promise<object>}
     */
    #request(worker, kind, sceneDescription) {
        return new Promise((resolve, reject) => {
            const requestId = 'geometry-' + ++this.#sequence
            const timeout = setTimeout(
                () => this.#fail(new Error('Geometry worker timed out.')),
                this.#options.requestTimeoutMs ?? 120000
            )
            this.#requests.set(requestId, { resolve, reject, timeout })
            try {
                const version = new URL(import.meta.url).search
                worker.postMessage({
                    type: 'scene3d:geometry-build',
                    requestId,
                    kind,
                    threeModuleUrl:
                        this.#options.threeModuleUrl ||
                        '/node_modules/three/build/three.module.js' + version,
                    sceneDescription:
                        PcbScene3dGeneratedGeometryBuilder.workerInput(
                            sceneDescription
                        )
                })
            } catch (error) {
                this.#fail(error)
            }
        })
    }

    /**
     * Settles a pending request and ignores late replies after cancellation.
     * @param {object} payload Worker reply.
     * @returns {void}
     */
    #receive(payload) {
        const pending = this.#requests.get(payload?.requestId)
        if (!pending) return
        this.#requests.delete(payload.requestId)
        clearTimeout(pending.timeout)
        if (payload.type === 'scene3d:geometry-success')
            pending.resolve(payload.geometry)
        else
            pending.reject(
                new Error(payload.message || 'Geometry worker failed.')
            )
    }

    /**
     * Rejects every outstanding stage and permanently stops the failed worker.
     * @param {Error} error Failure or cancellation.
     * @returns {void}
     */
    #fail(error) {
        this.#unavailable = true
        for (const { reject, timeout } of this.#requests.values()) {
            clearTimeout(timeout)
            reject(error)
        }
        this.#requests.clear()
        this.#worker?.terminate()
        this.#worker = null
    }

    /** Rejects calls on a disposed client. @returns {void} */
    #assertActive() {
        if (this.#disposed) throw this.#abortError()
    }

    /** Creates a portable abort error, including non-DOM hosts. @returns {Error} */
    #abortError() {
        const error = new Error('Generated geometry build was cancelled.')
        error.name = 'AbortError'
        return error
    }
}
