/**
 * Gates one handled model-load result until deferred detail can integrate it.
 */
export class PcbScene3dDeferredModelFinalizer {
    #releaseGate
    #completion
    #reportError

    /**
     * @param {Promise<any>} modelPromise
     * @param {{ isDisposed: () => boolean, onSuccess: (value: any) => void, onError: (error: any) => void }} hooks
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
                (value) => ({ status: 'fulfilled', value }),
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
            hooks.onSuccess(result.value)
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
