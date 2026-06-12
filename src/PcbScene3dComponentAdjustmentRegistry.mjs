import { PcbScene3dComponentAdjustment } from './PcbScene3dComponentAdjustment.mjs'

/**
 * Tracks live transform adjustments and applies them to registered targets.
 */
export class PcbScene3dComponentAdjustmentRegistry {
    /** @type {() => any} */
    #resolveThree
    /** @type {Map<string, Set<any>>} */
    #targets
    /** @type {Map<string, { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }>} */
    #adjustments

    /**
     * @param {() => any} resolveThree Three.js namespace resolver.
     */
    constructor(resolveThree) {
        this.#resolveThree = resolveThree
        this.#targets = new Map()
        this.#adjustments = new Map()
    }

    /** @returns {void} */
    clear() {
        this.#targets.clear()
        this.#adjustments.clear()
    }

    /**
     * Applies a live model-local adjustment to one component.
     * @param {string} designator Component designator.
     * @param {{ scale?: { x?: number, y?: number, z?: number }, rotationDeg?: { x?: number, y?: number, z?: number }, offsetMil?: { x?: number, y?: number, z?: number } }} adjustment Transform adjustment.
     * @returns {boolean}
     */
    set(designator, adjustment) {
        const normalizedDesignator = String(designator || '').trim()
        if (!normalizedDesignator) {
            return false
        }

        const normalizedAdjustment =
            PcbScene3dComponentAdjustment.normalize(adjustment)
        this.#adjustments.set(normalizedDesignator, normalizedAdjustment)
        this.#apply(normalizedDesignator, normalizedAdjustment)
        return true
    }

    /**
     * Registers one model-local transform adjustment target.
     * @param {string | undefined} designator Component designator.
     * @param {any} target Target object.
     * @returns {void}
     */
    register(designator, target) {
        const normalizedDesignator = String(designator || '').trim()
        if (!normalizedDesignator || !target) {
            return
        }

        if (!this.#targets.has(normalizedDesignator)) {
            this.#targets.set(normalizedDesignator, new Set())
        }

        this.#targets.get(normalizedDesignator)?.add(target)
        const pendingAdjustment = this.#adjustments.get(normalizedDesignator)
        if (pendingAdjustment) {
            PcbScene3dComponentAdjustment.applyToTarget(
                this.#resolveThree(),
                target,
                pendingAdjustment
            )
        }
    }

    /**
     * Applies one adjustment to all known targets for a component.
     * @param {string} designator Component designator.
     * @param {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }} adjustment Adjustment.
     * @returns {void}
     */
    #apply(designator, adjustment) {
        const targets = this.#targets.get(designator)
        if (!targets) {
            return
        }

        targets.forEach((target) => {
            PcbScene3dComponentAdjustment.applyToTarget(
                this.#resolveThree(),
                target,
                adjustment
            )
        })
    }
}
