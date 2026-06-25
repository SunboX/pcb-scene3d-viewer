const MM_TO_MIL = 1000 / 25.4

/**
 * Parses simple text-based triangle model formats into assembly meshes.
 */
export class PcbAssemblyTextModelMeshParser {
    /**
     * Parses one STL model from text or binary model metadata.
     * @param {{ name?: string, payloadText?: string, file?: any }} model Model metadata.
     * @returns {Promise<object[]>}
     */
    static async parseStlModel(model) {
        const bytes = await PcbAssemblyTextModelMeshParser.#readModelBytes(
            model,
            'STL'
        )
        const text = new TextDecoder().decode(bytes)
        const meshes = PcbAssemblyTextModelMeshParser.#isBinaryStl(bytes, text)
            ? PcbAssemblyTextModelMeshParser.#parseBinaryStl(bytes, model)
            : PcbAssemblyTextModelMeshParser.#parseAsciiStl(text, model)

        if (!meshes.length) {
            throw new Error('No triangle geometry was found in STL.')
        }
        return meshes
    }

    /**
     * Parses one OBJ model from text model metadata.
     * @param {{ name?: string, payloadText?: string, file?: any }} model Model metadata.
     * @returns {Promise<object[]>}
     */
    static async parseObjModel(model) {
        const text = await PcbAssemblyTextModelMeshParser.#readModelText(
            model,
            'OBJ'
        )
        const vertices = []
        const vertexColors = []
        const faceGroups = new Map()
        const materialLibraries = []
        let activeMaterial = ''

        String(text || '')
            .split(/\r?\n/u)
            .forEach((line) => {
                const trimmed = line.replace(/#.*/u, '').trim()
                if (trimmed.startsWith('mtllib ')) {
                    materialLibraries.push(
                        ...trimmed.slice(7).trim().split(/\s+/u).filter(Boolean)
                    )
                    return
                }

                if (trimmed.startsWith('usemtl ')) {
                    activeMaterial = trimmed.slice(7).trim()
                    return
                }

                if (trimmed.startsWith('v ')) {
                    const vertex = PcbAssemblyTextModelMeshParser.#objVertex(
                        trimmed.slice(2)
                    )
                    vertices.push(vertex.position)
                    vertexColors.push(vertex.color)
                    return
                }

                if (trimmed.startsWith('f ')) {
                    const face = PcbAssemblyTextModelMeshParser.#parseObjFace(
                        trimmed.slice(2),
                        vertices.length
                    )
                    if (face.length >= 3) {
                        PcbAssemblyTextModelMeshParser.#facesForMaterial(
                            faceGroups,
                            activeMaterial
                        ).push(face)
                    }
                }
            })

        const meshGroups = Array.from(faceGroups.entries()).filter(
            (entry) => entry[1].length
        )
        if (!vertices.length || !meshGroups.length) {
            throw new Error('No polygon geometry was found in OBJ.')
        }

        const materials =
            await PcbAssemblyTextModelMeshParser.#objMaterialColors(
                model,
                materialLibraries
            )
        const baseName = PcbAssemblyTextModelMeshParser.#modelName(
            model,
            'obj-model'
        )

        return meshGroups.map(([materialName, faces], index) => ({
            name: PcbAssemblyTextModelMeshParser.#objMeshName(
                baseName,
                materialName,
                meshGroups.length,
                index
            ),
            vertices,
            faces,
            ...PcbAssemblyTextModelMeshParser.#objMaterialProperties(
                materials.get(materialName),
                vertexColors
            )
        }))
    }

    /**
     * Parses ASCII STL facet vertices.
     * @param {string} text STL source.
     * @param {{ name?: string }} model Model metadata.
     * @returns {object[]}
     */
    static #parseAsciiStl(text, model) {
        const vertices = []
        const faces = []
        const pending = []

        for (const match of String(text || '').matchAll(
            /^\s*vertex\s+(.+)$/gimu
        )) {
            pending.push(
                PcbAssemblyTextModelMeshParser.#toMilTriplet(match[1] || '')
            )
            if (pending.length === 3) {
                const firstIndex = vertices.length
                vertices.push(...pending.splice(0, 3))
                faces.push([firstIndex, firstIndex + 1, firstIndex + 2])
            }
        }

        return vertices.length
            ? [
                  {
                      name: PcbAssemblyTextModelMeshParser.#modelName(
                          model,
                          'stl-model'
                      ),
                      vertices,
                      faces
                  }
              ]
            : []
    }

    /**
     * Parses binary STL facet vertices.
     * @param {Uint8Array} bytes STL bytes.
     * @param {{ name?: string }} model Model metadata.
     * @returns {object[]}
     */
    static #parseBinaryStl(bytes, model) {
        if (bytes.byteLength < 84) {
            return []
        }

        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        )
        const triangleCount = view.getUint32(80, true)
        const vertices = []
        const faces = []

        for (let triangle = 0; triangle < triangleCount; triangle += 1) {
            const offset = 84 + triangle * 50
            if (offset + 50 > bytes.byteLength) {
                break
            }

            const firstIndex = vertices.length
            for (let vertex = 0; vertex < 3; vertex += 1) {
                const vertexOffset = offset + 12 + vertex * 12
                vertices.push([
                    view.getFloat32(vertexOffset, true) * MM_TO_MIL,
                    view.getFloat32(vertexOffset + 4, true) * MM_TO_MIL,
                    view.getFloat32(vertexOffset + 8, true) * MM_TO_MIL
                ])
            }
            faces.push([firstIndex, firstIndex + 1, firstIndex + 2])
        }

        return vertices.length
            ? [
                  {
                      name: PcbAssemblyTextModelMeshParser.#modelName(
                          model,
                          'stl-model'
                      ),
                      vertices,
                      faces
                  }
              ]
            : []
    }

    /**
     * Returns true when bytes look like binary STL instead of ASCII STL.
     * @param {Uint8Array} bytes STL bytes.
     * @param {string} text UTF-8 decoded source.
     * @returns {boolean}
     */
    static #isBinaryStl(bytes, text) {
        if (bytes.byteLength < 84) {
            return false
        }

        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        )
        const triangleCount = view.getUint32(80, true)
        const expectedLength = 84 + triangleCount * 50
        if (expectedLength === bytes.byteLength) {
            return true
        }

        return !/^\s*solid\b/iu.test(String(text || ''))
    }

    /**
     * Parses one OBJ face line into zero-based vertex indexes.
     * @param {string} text OBJ face source.
     * @param {number} vertexCount Number of known vertices.
     * @returns {number[]}
     */
    static #parseObjFace(text, vertexCount) {
        return String(text || '')
            .trim()
            .split(/\s+/u)
            .map((token) => Number(token.split('/')[0]))
            .filter((index) => Number.isInteger(index) && index !== 0)
            .map((index) =>
                index < 0 ? vertexCount + index : Math.max(index - 1, 0)
            )
            .filter((index) => index >= 0 && index < vertexCount)
    }

    /**
     * Returns the mutable face list for an OBJ material name.
     * @param {Map<string, number[][]>} faceGroups Mutable face groups.
     * @param {string} materialName Active material name.
     * @returns {number[][]}
     */
    static #facesForMaterial(faceGroups, materialName) {
        const key = String(materialName || '')
        if (!faceGroups.has(key)) {
            faceGroups.set(key, [])
        }
        return faceGroups.get(key)
    }

    /**
     * Reads and parses declared OBJ material libraries.
     * @param {object} model Model metadata.
     * @param {string[]} materialLibraries Declared MTL file names.
     * @returns {Promise<Map<string, object>>}
     */
    static async #objMaterialColors(model, materialLibraries) {
        const materials = new Map()
        for (const library of materialLibraries) {
            const text = await PcbAssemblyTextModelMeshParser.#readResourceText(
                library,
                model
            )
            PcbAssemblyTextModelMeshParser.#parseObjMaterialLibrary(
                text,
                materials
            )
        }
        return materials
    }

    /**
     * Parses one MTL material library into color entries.
     * @param {string | null} text MTL source text.
     * @param {Map<string, object>} materials Mutable material map.
     * @returns {void}
     */
    static #parseObjMaterialLibrary(text, materials) {
        let activeName = ''
        let active = null

        String(text || '')
            .split(/\r?\n/u)
            .forEach((line) => {
                const trimmed = line.replace(/#.*/u, '').trim()
                if (trimmed.startsWith('newmtl ')) {
                    activeName = trimmed.slice(7).trim()
                    active = {
                        diffuseColor: null,
                        ambientColor: null,
                        specularColor: null,
                        shininess: null,
                        alpha: 1
                    }
                    if (activeName) {
                        materials.set(
                            activeName,
                            PcbAssemblyTextModelMeshParser.#objMaterialEntry(
                                active
                            )
                        )
                    }
                    return
                }

                if (!active || !activeName) {
                    return
                }

                if (trimmed.startsWith('Kd ')) {
                    active.diffuseColor =
                        PcbAssemblyTextModelMeshParser.#unitTriple(
                            trimmed.slice(3)
                        )
                } else if (trimmed.startsWith('Ka ')) {
                    active.ambientColor =
                        PcbAssemblyTextModelMeshParser.#unitTriple(
                            trimmed.slice(3)
                        )
                } else if (trimmed.startsWith('Ks ')) {
                    active.specularColor =
                        PcbAssemblyTextModelMeshParser.#unitTriple(
                            trimmed.slice(3)
                        )
                } else if (trimmed.startsWith('Ns ')) {
                    active.shininess = Math.max(Number(trimmed.slice(3)), 0)
                } else if (trimmed.startsWith('d ')) {
                    active.alpha = PcbAssemblyTextModelMeshParser.#clampUnit(
                        Number(trimmed.slice(2))
                    )
                } else if (trimmed.startsWith('Tr ')) {
                    active.alpha =
                        1 -
                        PcbAssemblyTextModelMeshParser.#clampUnit(
                            Number(trimmed.slice(3))
                        )
                }

                materials.set(
                    activeName,
                    PcbAssemblyTextModelMeshParser.#objMaterialEntry(active)
                )
            })
    }

    /**
     * Resolves material properties for an OBJ face group.
     * @param {object | undefined} material Material metadata.
     * @param {(number[] | null)[]} vertexColors Parsed vertex colors.
     * @returns {{ color?: number[], material?: object, vertexColors?: (number[] | null)[] }}
     */
    static #objMaterialProperties(material, vertexColors) {
        const properties = {}
        const color = Array.isArray(material?.diffuseColor)
            ? [...material.diffuseColor, material.alpha ?? 1]
            : PcbAssemblyTextModelMeshParser.#averageVertexColor(vertexColors)
        if (Array.isArray(color) && color.length >= 3) {
            properties.color = color
        }

        if (material) {
            properties.material =
                PcbAssemblyTextModelMeshParser.#cleanMaterial(material)
        }
        if (vertexColors.some(Boolean)) {
            properties.vertexColors = vertexColors
        }
        return properties
    }

    /**
     * Builds a normalized material entry.
     * @param {object} material Mutable parser state.
     * @returns {object}
     */
    static #objMaterialEntry(material) {
        return {
            diffuseColor: Array.isArray(material?.diffuseColor)
                ? material.diffuseColor
                : [0.55, 0.56, 0.58],
            alpha: PcbAssemblyTextModelMeshParser.#clampUnit(
                material?.alpha,
                1
            ),
            ...(Array.isArray(material?.ambientColor)
                ? { ambientColor: material.ambientColor }
                : {}),
            ...(Array.isArray(material?.specularColor)
                ? { specularColor: material.specularColor }
                : {}),
            ...(Number.isFinite(Number(material?.shininess))
                ? { shininess: Number(material.shininess) }
                : {})
        }
    }

    /**
     * Removes empty material fields.
     * @param {object} material Material metadata.
     * @returns {object}
     */
    static #cleanMaterial(material) {
        return Object.fromEntries(
            Object.entries(material).filter(([_key, value]) => {
                return value !== null && value !== undefined
            })
        )
    }

    /**
     * Computes an average vertex color when a material has no diffuse color.
     * @param {(number[] | null)[]} vertexColors Parsed vertex colors.
     * @returns {number[] | null}
     */
    static #averageVertexColor(vertexColors) {
        const colors = vertexColors.filter(
            (color) => Array.isArray(color) && color.length >= 3
        )
        if (!colors.length) {
            return null
        }

        return [
            colors.reduce((sum, color) => sum + color[0], 0) / colors.length,
            colors.reduce((sum, color) => sum + color[1], 0) / colors.length,
            colors.reduce((sum, color) => sum + color[2], 0) / colors.length,
            1
        ]
    }

    /**
     * Builds a stable OBJ mesh name.
     * @param {string} baseName Base model name.
     * @param {string} materialName Material group name.
     * @param {number} meshCount Number of mesh groups.
     * @param {number} meshIndex Mesh group index.
     * @returns {string}
     */
    static #objMeshName(baseName, materialName, meshCount, meshIndex) {
        if (meshCount <= 1) {
            return baseName
        }

        const suffix =
            PcbAssemblyTextModelMeshParser.#safeName(materialName) ||
            String(meshIndex + 1)
        return baseName + '-' + suffix
    }

    /**
     * Parses a unit RGB triplet.
     * @param {string} text Numeric triplet source.
     * @returns {number[]}
     */
    static #unitTriple(text) {
        const values =
            String(text || '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) || []
        return [0, 1, 2].map((index) =>
            PcbAssemblyTextModelMeshParser.#clampUnit(values[index])
        )
    }

    /**
     * Parses an OBJ vertex with optional RGB channels.
     * @param {string} text OBJ vertex payload.
     * @returns {{ position: number[], color: number[] | null }}
     */
    static #objVertex(text) {
        const values =
            String(text || '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) || []
        const position = [0, 1, 2].map(
            (index) => Number(values[index] || 0) * MM_TO_MIL
        )
        const color =
            values.length >= 6
                ? [3, 4, 5].map((index) =>
                      PcbAssemblyTextModelMeshParser.#clampUnit(values[index])
                  )
                : null
        return { position, color }
    }

    /**
     * Clamps a value into the unit interval.
     * @param {unknown} value Candidate number.
     * @param {number} [fallback] Fallback value.
     * @returns {number}
     */
    static #clampUnit(value, fallback = 0) {
        const number = Number(value)
        return Number.isFinite(number)
            ? Math.min(Math.max(number, 0), 1)
            : fallback
    }

    /**
     * Converts a numeric triplet from millimeters into internal mils.
     * @param {string} text Numeric triplet source.
     * @returns {number[]}
     */
    static #toMilTriplet(text) {
        const values =
            String(text || '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) || []
        return [0, 1, 2].map((index) => Number(values[index] || 0) * MM_TO_MIL)
    }

    /**
     * Reads model metadata as UTF-8 text.
     * @param {{ payloadText?: string, file?: any }} model Model metadata.
     * @param {string} label Format label.
     * @returns {Promise<string>}
     */
    static async #readModelText(model, label) {
        if (typeof model?.payloadText === 'string') {
            return model.payloadText
        }

        if (typeof model?.file?.text === 'function') {
            return await model.file.text()
        }

        return new TextDecoder().decode(
            await PcbAssemblyTextModelMeshParser.#readModelBytes(model, label)
        )
    }

    /**
     * Reads model metadata as bytes.
     * @param {{ payloadText?: string, payloadBytes?: any, bytes?: any, file?: any }} model Model metadata.
     * @param {string} label Format label.
     * @returns {Promise<Uint8Array>}
     */
    static async #readModelBytes(model, label) {
        const bytes = await PcbAssemblyTextModelMeshParser.#readAnyBytes(model)
        if (bytes) {
            return bytes
        }

        throw new Error(label + ' model content is not available.')
    }

    /**
     * Reads a sidecar resource as UTF-8 text.
     * @param {string} uri Resource URI from the OBJ file.
     * @param {object} model Model metadata.
     * @returns {Promise<string | null>}
     */
    static async #readResourceText(uri, model) {
        const normalizedUri = PcbAssemblyTextModelMeshParser.#normalizePath(uri)
        const uriName = normalizedUri.split('/').pop()

        for (const resource of PcbAssemblyTextModelMeshParser.#resources(
            model
        )) {
            const names =
                PcbAssemblyTextModelMeshParser.#resourceNames(resource)
            if (
                names.some(
                    (name) =>
                        name === normalizedUri ||
                        name.endsWith('/' + normalizedUri) ||
                        name.split('/').pop() === uriName
                )
            ) {
                const bytes =
                    await PcbAssemblyTextModelMeshParser.#readAnyBytes(resource)
                if (bytes) {
                    return new TextDecoder().decode(bytes)
                }
            }
        }

        return null
    }

    /**
     * Collects sidecar resource candidates from model metadata.
     * @param {object} model Model metadata.
     * @returns {object[]}
     */
    static #resources(model) {
        const resources = []
        ;[
            model?.resources,
            model?.relatedFiles,
            model?.assets,
            model?.files,
            model?.externalBuffers,
            model?.bufferFiles
        ].forEach((value) => {
            if (Array.isArray(value)) {
                resources.push(...value)
            } else if (value && typeof value === 'object') {
                Object.entries(value).forEach(([name, entry]) => {
                    resources.push(
                        typeof entry === 'string'
                            ? { name, payloadText: entry }
                            : { name, ...(entry || {}) }
                    )
                })
            }
        })
        return resources
    }

    /**
     * Returns normalized resource names used for URI matching.
     * @param {object} resource Resource metadata.
     * @returns {string[]}
     */
    static #resourceNames(resource) {
        return [
            resource?.uri,
            resource?.relativePath,
            resource?.name,
            resource?.file?.name,
            resource?.sourceUrl
        ]
            .map((value) =>
                PcbAssemblyTextModelMeshParser.#normalizePath(value)
            )
            .filter(Boolean)
    }

    /**
     * Reads byte-like values from common model metadata shapes.
     * @param {{ payloadText?: string, payloadBytes?: any, bytes?: any, data?: any, file?: any }} source Source metadata.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #readAnyBytes(source) {
        if (typeof source?.payloadText === 'string') {
            return new TextEncoder().encode(source.payloadText)
        }

        for (const value of [
            source?.payloadBytes,
            source?.bytes,
            source?.data,
            source?.file,
            source
        ]) {
            const bytes =
                await PcbAssemblyTextModelMeshParser.#bytesFromValue(value)
            if (bytes) {
                return bytes
            }
        }

        return null
    }

    /**
     * Converts one byte-like value to a Uint8Array.
     * @param {any} value Candidate value.
     * @returns {Promise<Uint8Array | null>}
     */
    static async #bytesFromValue(value) {
        if (!value) {
            return null
        }
        if (value instanceof Uint8Array) {
            return value
        }
        if (value instanceof ArrayBuffer) {
            return new Uint8Array(value)
        }
        if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        }
        if (typeof value.arrayBuffer === 'function') {
            return new Uint8Array(await value.arrayBuffer())
        }
        return null
    }

    /**
     * Resolves a mesh name.
     * @param {{ name?: string }} model Model metadata.
     * @param {string} fallback Fallback name.
     * @returns {string}
     */
    static #modelName(model, fallback) {
        return String(model?.name || fallback || 'model')
    }

    /**
     * Normalizes a path-like value for matching.
     * @param {unknown} value Path candidate.
     * @returns {string}
     */
    static #normalizePath(value) {
        return String(value || '')
            .split(/[?#]/u)[0]
            .replace(/\\/gu, '/')
            .replace(/^\/+/u, '')
            .toLowerCase()
    }

    /**
     * Builds a safe identifier segment.
     * @param {unknown} value Candidate name.
     * @returns {string}
     */
    static #safeName(value) {
        return String(value || '')
            .replace(/[^A-Za-z0-9_.-]+/gu, '_')
            .replace(/^_+|_+$/gu, '')
    }
}
