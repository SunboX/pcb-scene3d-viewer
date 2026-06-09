/**
 * Creates Three.js buffer attributes from importer mesh arrays.
 */
export class PcbScene3dBufferAttributeFactory {
    /**
     * Creates a floating-point attribute.
     * @param {any} THREE Three.js namespace.
     * @param {ArrayLike<number>} values Source values.
     * @param {number} itemSize Attribute item size.
     * @returns {any}
     */
    static createFloat32(THREE, values, itemSize) {
        return PcbScene3dBufferAttributeFactory.#create(
            THREE,
            values,
            itemSize,
            Float32Array,
            'Float32BufferAttribute'
        )
    }

    /**
     * Creates an unsigned integer attribute.
     * @param {any} THREE Three.js namespace.
     * @param {ArrayLike<number>} values Source values.
     * @param {number} itemSize Attribute item size.
     * @returns {any}
     */
    static createUint32(THREE, values, itemSize) {
        return PcbScene3dBufferAttributeFactory.#create(
            THREE,
            values,
            itemSize,
            Uint32Array,
            'Uint32BufferAttribute'
        )
    }

    /**
     * Returns true when a value is an array-like numeric sequence.
     * @param {unknown} values Candidate values.
     * @returns {boolean}
     */
    static isNumberSequence(values) {
        return (
            Array.isArray(values) ||
            PcbScene3dBufferAttributeFactory.#isTypedNumberArray(values)
        )
    }

    /**
     * Creates a buffer attribute with the most efficient constructor available.
     * @param {any} THREE Three.js namespace.
     * @param {ArrayLike<number>} values Source values.
     * @param {number} itemSize Attribute item size.
     * @param {Float32ArrayConstructor | Uint32ArrayConstructor} TypedArrayConstructor Fallback typed array constructor.
     * @param {string} fallbackConstructorName Legacy Three attribute constructor name.
     * @returns {any}
     */
    static #create(
        THREE,
        values,
        itemSize,
        TypedArrayConstructor,
        fallbackConstructorName
    ) {
        const array = PcbScene3dBufferAttributeFactory.#normalizeValues(
            values,
            TypedArrayConstructor
        )

        if (typeof THREE?.BufferAttribute === 'function') {
            return new THREE.BufferAttribute(array, itemSize)
        }

        if (typeof THREE?.[fallbackConstructorName] === 'function') {
            return new THREE[fallbackConstructorName](array, itemSize)
        }

        return {
            array,
            itemSize,
            count: Math.floor(Number(array.length || 0) / itemSize),
            isBufferAttribute: true
        }
    }

    /**
     * Normalizes plain arrays while preserving importer-owned typed arrays.
     * @param {ArrayLike<number> | undefined | null} values Source values.
     * @param {Float32ArrayConstructor | Uint32ArrayConstructor} TypedArrayConstructor Fallback typed array constructor.
     * @returns {ArrayLike<number>}
     */
    static #normalizeValues(values, TypedArrayConstructor) {
        if (PcbScene3dBufferAttributeFactory.#isTypedNumberArray(values)) {
            return values
        }

        return new TypedArrayConstructor(Array.from(values || []))
    }

    /**
     * Returns true when a sequence is already backed by a typed numeric array.
     * @param {unknown} values Candidate values.
     * @returns {boolean}
     */
    static #isTypedNumberArray(values) {
        return (
            ArrayBuffer.isView(values) &&
            !(values instanceof DataView) &&
            !PcbScene3dBufferAttributeFactory.#isBigIntTypedArray(values)
        )
    }

    /**
     * Returns true when a typed-array view stores bigint values.
     * @param {unknown} values Candidate values.
     * @returns {boolean}
     */
    static #isBigIntTypedArray(values) {
        const tag = Object.prototype.toString.call(values)

        return (
            tag === '[object BigInt64Array]' ||
            tag === '[object BigUint64Array]'
        )
    }
}
