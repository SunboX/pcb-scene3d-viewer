/**
 * Parses and packs GLTF image data URIs.
 */
export class PcbAssemblyGltfImageDataUri {
    /**
     * Packs embeddable image data URI payloads into buffer views.
     * @param {object[]} images Source GLTF image records.
     * @param {(bytes: Uint8Array) => number} appendBufferView Appends bytes and returns a buffer view index.
     * @returns {object[]} Packed image records.
     */
    static pack(images, appendBufferView) {
        return images.map((image) => {
            const parsed = PcbAssemblyGltfImageDataUri.parse(image?.uri)
            if (!parsed) {
                return image
            }

            return {
                mimeType: parsed.mimeType,
                bufferView: appendBufferView(parsed.bytes)
            }
        })
    }

    /**
     * Parses one image data URI into MIME type and bytes.
     * @param {string} uri Candidate data URI.
     * @returns {{ mimeType: string, bytes: Uint8Array } | null}
     */
    static parse(uri) {
        const text = String(uri || '')
        const commaIndex = text.indexOf(',')
        if (!text.startsWith('data:') || commaIndex < 0) {
            return null
        }

        const metadata = text.slice(5, commaIndex).split(';')
        const mimeType = String(metadata[0] || '').toLowerCase()
        if (!mimeType.startsWith('image/')) {
            return null
        }

        const payload = text.slice(commaIndex + 1)
        const bytes = metadata.includes('base64')
            ? PcbAssemblyGltfImageDataUri.#base64Bytes(payload)
            : new TextEncoder().encode(decodeURIComponent(payload))
        return { mimeType, bytes }
    }

    /**
     * Decodes a base64 payload into bytes in browser and Node runtimes.
     * @param {string} value Base64 payload.
     * @returns {Uint8Array}
     */
    static #base64Bytes(value) {
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(value, 'base64'))
        }

        const binary = atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
        }
        return bytes
    }
}
