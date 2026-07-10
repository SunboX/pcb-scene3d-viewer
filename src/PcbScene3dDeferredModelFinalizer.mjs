/**
 * Gates one handled model-load result until deferred detail can integrate it.
 */
export class PcbScene3dDeferredModelFinalizer {
    #releaseGate
    #completion
    #reportError

    /**
     * @param {Promise<void>} modelPromise
     * @param {{ isDisposed: () => boolean, onSuccess: () => void, onError: (error: any) => void }} hooks
     */
    constructor(modelPromise, hooks) {
        let releaseGate = () => {}
        const integrationGate = new Promise((resolve) => {
            releaseGate = resolve
        })
        this.#releaseGate = releaseGate
        this.#reportError = true
        this.#completion = Promise.all([
            modelPromise.then(
                () => ({ status: 'fulfilled' }),
                (error) => ({ status: 'rejected', error })
            ),
            integrationGate
        ]).then(([result]) => {
            if (hooks.isDisposed()) {
                return
            }
            if (result.status === 'rejected') {
                if (this.#reportError) {
                    hooks.onError(result.error)
                }
                return
            }
            hooks.onSuccess()
        })
    }

    /**
     * Opens the integration gate and resolves after model finalization.
     * @param {{ reportError?: boolean }} [options]
     * @returns {Promise<void>}
     */
    release(options = {}) {
        if (options.reportError === false) {
            this.#reportError = false
        }
        this.#releaseGate()
        return this.#completion
    }
}
