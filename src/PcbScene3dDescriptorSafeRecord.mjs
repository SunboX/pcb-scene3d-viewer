/**
 * Copies records across untrusted viewer boundaries without invoking accessors.
 */
export class PcbScene3dDescriptorSafeRecord {
    /**
     * Copies enumerable own data properties without invoking accessors.
     * @param {unknown} value Record candidate.
     * @returns {Record<string, unknown>}
     */
    static copy(value) {
        if (!value || typeof value !== 'object') return {}
        let descriptors
        try {
            descriptors = Object.getOwnPropertyDescriptors(value)
        } catch {
            return {}
        }

        const result = {}
        for (const key of Reflect.ownKeys(descriptors)) {
            const descriptor = descriptors[key]
            if (
                typeof key !== 'string' ||
                descriptor.enumerable !== true ||
                !Object.hasOwn(descriptor, 'value')
            ) {
                continue
            }
            Object.defineProperty(result, key, {
                configurable: true,
                enumerable: true,
                value: descriptor.value,
                writable: true
            })
        }
        return result
    }
}
