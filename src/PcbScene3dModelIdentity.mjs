/**
 * Resolves collision-safe identities for external model assets.
 */
export class PcbScene3dModelIdentity {
    /**
     * Resolves a stable identity while preferring exact source paths.
     * @param {unknown} model External model metadata.
     * @returns {string}
     */
    static resolve(model) {
        const format = PcbScene3dModelIdentity.#text(
            PcbScene3dModelIdentity.#ownData(model, 'format')
        ).toLowerCase()
        const path = PcbScene3dModelIdentity.projectPath(model)
        if (path) return ['path', format, path].join('::')

        const source = PcbScene3dModelIdentity.#ownData(model, 'source')
        const sourceStream = PcbScene3dModelIdentity.#firstText([
            PcbScene3dModelIdentity.#ownData(model, 'sourceStream'),
            PcbScene3dModelIdentity.#ownData(source, 'stream'),
            PcbScene3dModelIdentity.#ownData(source, 'sourceStream')
        ])
        if (sourceStream) {
            return ['stream', format, sourceStream].join('::')
        }

        const id = PcbScene3dModelIdentity.#firstText([
            PcbScene3dModelIdentity.#ownData(model, 'id'),
            PcbScene3dModelIdentity.#ownData(source, 'id')
        ])
        if (id) return ['id', format, id].join('::')

        const checksum = PcbScene3dModelIdentity.#text(
            PcbScene3dModelIdentity.#ownData(model, 'checksum')
        )
        const name = PcbScene3dModelIdentity.#text(
            PcbScene3dModelIdentity.#ownData(model, 'name')
        )
        return ['fallback', format, checksum, name].join('::')
    }

    /**
     * Resolves the exact canonical or retained project-relative model path.
     * @param {unknown} model External model metadata.
     * @returns {string}
     */
    static projectPath(model) {
        const source = PcbScene3dModelIdentity.#ownData(model, 'source')
        return PcbScene3dModelIdentity.#firstText([
            PcbScene3dModelIdentity.#ownData(model, 'projectRelativePath'),
            PcbScene3dModelIdentity.#ownData(model, 'project_relative_path'),
            PcbScene3dModelIdentity.#ownData(model, 'relativePath'),
            PcbScene3dModelIdentity.#ownData(source, 'projectRelativePath'),
            PcbScene3dModelIdentity.#ownData(source, 'project_relative_path'),
            PcbScene3dModelIdentity.#ownData(source, 'relativePath'),
            PcbScene3dModelIdentity.#ownData(source, 'entryName'),
            PcbScene3dModelIdentity.#ownData(model, 'resolvedUrl'),
            PcbScene3dModelIdentity.#ownData(model, 'sourceUrl'),
            PcbScene3dModelIdentity.#ownData(model, 'url'),
            PcbScene3dModelIdentity.#ownData(source, 'url'),
            PcbScene3dModelIdentity.#ownData(source, 'uri')
        ])
    }

    /**
     * Resolves the first non-empty primitive text value.
     * @param {unknown[]} values Candidate values.
     * @returns {string}
     */
    static #firstText(values) {
        for (const value of values) {
            const text = PcbScene3dModelIdentity.#text(value)
            if (text) return text
        }
        return ''
    }

    /**
     * Converts a primitive identity value to trimmed text.
     * @param {unknown} value Candidate value.
     * @returns {string}
     */
    static #text(value) {
        return ['string', 'number', 'boolean', 'bigint'].includes(typeof value)
            ? String(value).trim()
            : ''
    }

    /**
     * Reads one own data property without invoking accessors.
     * @param {unknown} value Record candidate.
     * @param {PropertyKey} key Property key.
     * @returns {unknown}
     */
    static #ownData(value, key) {
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
