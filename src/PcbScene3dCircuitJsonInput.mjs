import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'

/**
 * Performs non-mutating CircuitJSON input detection for viewer routing.
 */
export class PcbScene3dCircuitJsonInput {
    /**
     * Returns true for a raw model, canonical document, or prepared context.
     * @param {unknown} value Candidate input.
     * @returns {boolean}
     */
    static isModel(value) {
        try {
            if (value instanceof CircuitJsonDocumentContext) return true
            const model = PcbScene3dCircuitJsonInput.#validationModel(value)
            return Boolean(
                model && PcbScene3dCircuitJsonInput.#hasElementRows(model)
            )
        } catch {
            return false
        }
    }

    /**
     * Checks the descriptor-safe structural boundary needed before shared
     * normalization and validation prepare the model.
     * @param {object[]} model Dense model candidate.
     * @returns {boolean} Whether every row exposes an own string type.
     */
    static #hasElementRows(model) {
        for (let index = 0; index < model.length; index += 1) {
            const element = model[index]
            const type = PcbScene3dCircuitJsonInput.#ownData(element, 'type')
            if (typeof type !== 'string' || !type.trim()) return false
        }
        return true
    }

    /**
     * Returns a non-mutating model view for predicate validation.
     * @param {unknown} value Model or canonical document candidate.
     * @returns {object[] | null}
     */
    static #validationModel(value) {
        if (Array.isArray(value)) {
            return PcbScene3dCircuitJsonInput.#plainModel(value)
        }
        if (
            PcbScene3dCircuitJsonInput.#ownData(value, 'schema') !==
            'ecad-toolkit.document.v1'
        ) {
            return null
        }
        const model = PcbScene3dCircuitJsonInput.#ownData(value, 'model')
        return Array.isArray(model)
            ? PcbScene3dCircuitJsonInput.#plainModel(model)
            : null
    }

    /**
     * Removes safe legacy array metadata without freezing caller values.
     * @param {object[]} model CircuitJSON model candidate.
     * @returns {object[] | null}
     */
    static #plainModel(model) {
        let prototype
        let descriptors
        try {
            prototype = Object.getPrototypeOf(model)
            descriptors = Object.getOwnPropertyDescriptors(model)
        } catch {
            return null
        }
        const length = descriptors.length?.value
        if (
            prototype !== Array.prototype ||
            !Number.isSafeInteger(length) ||
            length < 0
        ) {
            return null
        }

        const keys = Reflect.ownKeys(descriptors)
        const plain = keys.length === length + 1 ? null : new Array(length)
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)]
            if (
                !descriptor ||
                !Object.hasOwn(descriptor, 'value') ||
                descriptor.enumerable !== true
            ) {
                return null
            }
            if (plain) plain[index] = descriptor.value
        }
        for (const key of keys) {
            if (key === 'length') continue
            const index =
                typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key)
                    ? Number(key)
                    : -1
            if (Number.isSafeInteger(index) && index < length) continue
            const descriptor = descriptors[key]
            if (
                typeof key !== 'string' ||
                !Object.hasOwn(descriptor, 'value') ||
                descriptor.enumerable !== true
            ) {
                return null
            }
        }
        return plain || model
    }

    /**
     * Reads one own data property without invoking caller accessors.
     * @param {unknown} value Record candidate.
     * @param {string} name Property name.
     * @returns {unknown} Own data value or undefined.
     */
    static #ownData(value, name) {
        if (!value || typeof value !== 'object') return undefined
        try {
            const descriptor = Object.getOwnPropertyDescriptor(value, name)
            return descriptor && Object.hasOwn(descriptor, 'value')
                ? descriptor.value
                : undefined
        } catch {
            return undefined
        }
    }
}
