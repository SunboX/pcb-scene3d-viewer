/**
 * Splits translucent meshes into independently sortable render chunks.
 */
export class PcbScene3dTransparentMeshSplitter {
    static #PLANE_QUANTIZATION = 10000

    static #TRIANGLE_VERTEX_COUNT = 3

    /**
     * Replaces translucent meshes below one root with sortable chunk groups.
     * @param {any} THREE Three.js namespace.
     * @param {any} rootObject Root object to mutate.
     * @returns {void}
     */
    static split(THREE, rootObject) {
        if (!rootObject) {
            return
        }

        PcbScene3dTransparentMeshSplitter.#collectMeshes(rootObject).forEach(
            (mesh) =>
                PcbScene3dTransparentMeshSplitter.#replaceWithSortableGroup(
                    THREE,
                    mesh
                )
        )
    }

    /**
     * Builds a sortable replacement for one translucent mesh when useful.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @returns {any}
     */
    static build(THREE, mesh) {
        if (!PcbScene3dTransparentMeshSplitter.#canBuild(THREE, mesh)) {
            return mesh
        }

        const chunks = PcbScene3dTransparentMeshSplitter.#buildChunks(
            THREE,
            mesh
        )
        if (!chunks.length) {
            return mesh
        }

        return PcbScene3dTransparentMeshSplitter.#buildGroup(
            THREE,
            mesh,
            chunks
        )
    }

    /**
     * Determines whether the required Three.js constructors are available.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @returns {boolean}
     */
    static #canBuild(THREE, mesh) {
        return Boolean(
            THREE?.Group &&
            THREE?.Mesh &&
            THREE?.BufferGeometry &&
            THREE?.BufferAttribute &&
            mesh?.geometry &&
            mesh?.material &&
            !mesh?.userData?.scene3dTransparentMeshChunk &&
            PcbScene3dTransparentMeshSplitter.#hasTransparentMaterial(
                mesh.material
            )
        )
    }

    /**
     * Collects transparent meshes before mutating the object tree.
     * @param {any} rootObject Root object.
     * @returns {any[]}
     */
    static #collectMeshes(rootObject) {
        const meshes = []
        rootObject?.traverse?.((object) => {
            if (
                object?.geometry &&
                object?.material &&
                !object?.userData?.scene3dTransparentMeshChunk &&
                PcbScene3dTransparentMeshSplitter.#hasTransparentMaterial(
                    object.material
                )
            ) {
                meshes.push(object)
            }
        })

        return meshes
    }

    /**
     * Replaces one mesh in its parent while preserving sibling order.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @returns {void}
     */
    static #replaceWithSortableGroup(THREE, mesh) {
        const parent = mesh?.parent
        if (!parent) {
            return
        }

        const replacement = PcbScene3dTransparentMeshSplitter.build(THREE, mesh)
        if (replacement === mesh) {
            return
        }

        const insertionIndex = Array.isArray(parent.children)
            ? parent.children.indexOf(mesh)
            : -1
        parent.remove?.(mesh)
        parent.add?.(replacement)

        if (insertionIndex < 0 || !Array.isArray(parent.children)) {
            return
        }

        const replacementIndex = parent.children.indexOf(replacement)
        if (replacementIndex < 0 || replacementIndex === insertionIndex) {
            return
        }

        parent.children.splice(replacementIndex, 1)
        parent.children.splice(
            Math.min(insertionIndex, parent.children.length),
            0,
            replacement
        )
    }

    /**
     * Builds one group that carries the original mesh transform.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @param {any[]} chunks Chunk meshes.
     * @returns {any}
     */
    static #buildGroup(THREE, mesh, chunks) {
        const group = new THREE.Group()
        group.name = mesh.name || ''
        group.visible = mesh.visible !== false
        group.renderOrder = Number(mesh.renderOrder || 0)
        group.frustumCulled = mesh.frustumCulled !== false
        group.userData = {
            ...(mesh.userData || {}),
            scene3dTransparentMeshChunks: true
        }
        PcbScene3dTransparentMeshSplitter.#copyTransform(mesh, group)
        chunks.forEach((chunk) => group.add(chunk))
        return group
    }

    /**
     * Copies the source Object3D transform state to a replacement group.
     * @param {any} source Source object.
     * @param {any} target Target object.
     * @returns {void}
     */
    static #copyTransform(source, target) {
        target.position?.copy?.(source.position)
        target.quaternion?.copy?.(source.quaternion)
        target.scale?.copy?.(source.scale)
        if (source.matrix && target.matrix?.copy) {
            target.matrix.copy(source.matrix)
        }
        if (typeof source.matrixAutoUpdate === 'boolean') {
            target.matrixAutoUpdate = source.matrixAutoUpdate
        }
    }

    /**
     * Builds centroid-positioned coplanar face chunks for one mesh.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @returns {any[]}
     */
    static #buildChunks(THREE, mesh) {
        const geometry = mesh.geometry
        const positionAttribute =
            PcbScene3dTransparentMeshSplitter.#getAttribute(
                geometry,
                'position'
            )
        if (!positionAttribute) {
            return []
        }

        const indexArray = geometry.index?.array || null
        const elementCount = indexArray
            ? indexArray.length
            : Number(positionAttribute.count || 0)
        const chunkGroups = new Map()

        PcbScene3dTransparentMeshSplitter.#resolveGroups(
            geometry,
            elementCount
        ).forEach((group) => {
            const material = PcbScene3dTransparentMeshSplitter.#resolveMaterial(
                mesh.material,
                group.materialIndex
            )
            const end = Math.min(group.start + group.count, elementCount)
            for (
                let offset = group.start;
                offset + 2 < end;
                offset +=
                    PcbScene3dTransparentMeshSplitter.#TRIANGLE_VERTEX_COUNT
            ) {
                const sourceIndices =
                    PcbScene3dTransparentMeshSplitter.#readTriangleIndices(
                        indexArray,
                        offset
                    )
                PcbScene3dTransparentMeshSplitter.#appendPlaneChunkGroup(
                    chunkGroups,
                    positionAttribute,
                    group.materialIndex,
                    material,
                    sourceIndices
                )
            }
        })

        return Array.from(chunkGroups.values())
            .map((chunkGroup) =>
                PcbScene3dTransparentMeshSplitter.#buildChunkMesh(
                    THREE,
                    mesh,
                    chunkGroup.material,
                    chunkGroup.sourceIndices
                )
            )
            .filter(Boolean)
    }

    /**
     * Appends one triangle to its coplanar material chunk group.
     * @param {Map<string, { material: any, sourceIndices: number[] }>} chunkGroups Chunk groups.
     * @param {any} positionAttribute Source position attribute.
     * @param {number} materialIndex Material index.
     * @param {any} material Material instance.
     * @param {number[]} sourceIndices Triangle source indices.
     * @returns {void}
     */
    static #appendPlaneChunkGroup(
        chunkGroups,
        positionAttribute,
        materialIndex,
        material,
        sourceIndices
    ) {
        const planeKey = PcbScene3dTransparentMeshSplitter.#buildPlaneKey(
            positionAttribute,
            sourceIndices
        )
        const groupKey = `${materialIndex}:${planeKey}`
        if (!chunkGroups.has(groupKey)) {
            chunkGroups.set(groupKey, {
                material,
                sourceIndices: []
            })
        }

        chunkGroups.get(groupKey).sourceIndices.push(...sourceIndices)
    }

    /**
     * Builds one centered triangle mesh.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Source mesh.
     * @param {any} material Material for this chunk.
     * @param {number[]} sourceIndices Source vertex indices.
     * @returns {any | null}
     */
    static #buildChunkMesh(THREE, mesh, material, sourceIndices) {
        const chunkData = PcbScene3dTransparentMeshSplitter.#buildChunkGeometry(
            THREE,
            mesh.geometry,
            sourceIndices
        )
        if (!chunkData) {
            return null
        }

        const chunk = new THREE.Mesh(chunkData.geometry, material)
        chunk.name = mesh.name || ''
        chunk.position.set(
            chunkData.centroid.x,
            chunkData.centroid.y,
            chunkData.centroid.z
        )
        chunk.visible = mesh.visible !== false
        chunk.renderOrder = Number(mesh.renderOrder || 0)
        chunk.frustumCulled = mesh.frustumCulled !== false
        chunk.castShadow = mesh.castShadow === true
        chunk.receiveShadow = mesh.receiveShadow === true
        chunk.userData = {
            ...(mesh.userData || {}),
            scene3dTransparentMeshChunk: true
        }
        return chunk
    }

    /**
     * Builds centered geometry for one triangle chunk.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Source geometry.
     * @param {number[]} sourceIndices Source vertex indices.
     * @returns {{ geometry: any, centroid: { x: number, y: number, z: number }} | null}
     */
    static #buildChunkGeometry(THREE, geometry, sourceIndices) {
        const attributes = geometry?.attributes || {}
        const positionAttribute =
            PcbScene3dTransparentMeshSplitter.#getAttribute(
                geometry,
                'position'
            )
        if (!positionAttribute) {
            return null
        }

        const centroid = PcbScene3dTransparentMeshSplitter.#calculateCentroid(
            positionAttribute,
            sourceIndices
        )
        const chunkGeometry = new THREE.BufferGeometry()

        Object.entries(attributes).forEach(([name, attribute]) => {
            const values =
                PcbScene3dTransparentMeshSplitter.#copyAttributeValues(
                    attribute,
                    sourceIndices
                )
            if (!values.length) {
                return
            }
            if (name === 'position') {
                PcbScene3dTransparentMeshSplitter.#subtractCentroid(
                    values,
                    attribute.itemSize,
                    centroid
                )
            }
            chunkGeometry.setAttribute(
                name,
                new THREE.BufferAttribute(
                    new attribute.array.constructor(values),
                    attribute.itemSize,
                    attribute.normalized === true
                )
            )
        })

        return { geometry: chunkGeometry, centroid }
    }

    /**
     * Reads an attribute from BufferGeometry.
     * @param {any} geometry Source geometry.
     * @param {string} name Attribute name.
     * @returns {any | null}
     */
    static #getAttribute(geometry, name) {
        return geometry?.getAttribute?.(name) || geometry?.attributes?.[name]
    }

    /**
     * Resolves render groups for indexed or non-indexed geometry.
     * @param {any} geometry Source geometry.
     * @param {number} elementCount Total index or vertex elements.
     * @returns {{ start: number, count: number, materialIndex: number }[]}
     */
    static #resolveGroups(geometry, elementCount) {
        const groups = Array.isArray(geometry?.groups) ? geometry.groups : []
        const normalizedGroups = groups
            .map((group) => ({
                start: Math.max(0, Number(group.start || 0)),
                count: Math.max(0, Number(group.count || 0)),
                materialIndex: Math.max(0, Number(group.materialIndex || 0))
            }))
            .filter((group) => group.count > 0)

        if (normalizedGroups.length) {
            return normalizedGroups
        }

        return [
            {
                start: 0,
                count: Math.max(0, Number(elementCount || 0)),
                materialIndex: 0
            }
        ]
    }

    /**
     * Resolves one material from a mesh material or material array.
     * @param {any | any[]} material Mesh material.
     * @param {number} materialIndex Material index.
     * @returns {any}
     */
    static #resolveMaterial(material, materialIndex) {
        if (!Array.isArray(material)) {
            return material
        }

        return material[materialIndex] || material[0]
    }

    /**
     * Reads one triangle's source vertex indices.
     * @param {ArrayLike<number> | null} indexArray Optional geometry index.
     * @param {number} offset Triangle start offset.
     * @returns {number[]}
     */
    static #readTriangleIndices(indexArray, offset) {
        return [0, 1, 2].map((index) =>
            Number(indexArray ? indexArray[offset + index] : offset + index)
        )
    }

    /**
     * Builds a stable key for one triangle's geometric plane.
     * @param {any} attribute Position attribute.
     * @param {number[]} sourceIndices Triangle source indices.
     * @returns {string}
     */
    static #buildPlaneKey(attribute, sourceIndices) {
        const points = sourceIndices.map((sourceIndex) =>
            PcbScene3dTransparentMeshSplitter.#readPoint(attribute, sourceIndex)
        )
        const normal = PcbScene3dTransparentMeshSplitter.#calculateNormal(
            points[0],
            points[1],
            points[2]
        )
        if (!normal) {
            return `triangle:${sourceIndices.join(',')}`
        }

        const canonicalNormal =
            PcbScene3dTransparentMeshSplitter.#canonicalizeNormal(normal)
        const planeOffset =
            canonicalNormal.x * points[0].x +
            canonicalNormal.y * points[0].y +
            canonicalNormal.z * points[0].z

        return [
            canonicalNormal.x,
            canonicalNormal.y,
            canonicalNormal.z,
            planeOffset
        ]
            .map((value) =>
                PcbScene3dTransparentMeshSplitter.#quantizePlaneValue(value)
            )
            .join(':')
    }

    /**
     * Reads one source point from a position attribute.
     * @param {any} attribute Position attribute.
     * @param {number} sourceIndex Source vertex index.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #readPoint(attribute, sourceIndex) {
        const itemSize = Number(attribute?.itemSize || 0)
        const base = sourceIndex * itemSize
        return {
            x: Number(attribute?.array?.[base] || 0),
            y: Number(attribute?.array?.[base + 1] || 0),
            z: Number(attribute?.array?.[base + 2] || 0)
        }
    }

    /**
     * Calculates a triangle normal from three source points.
     * @param {{ x: number, y: number, z: number }} first First point.
     * @param {{ x: number, y: number, z: number }} second Second point.
     * @param {{ x: number, y: number, z: number }} third Third point.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #calculateNormal(first, second, third) {
        const ux = second.x - first.x
        const uy = second.y - first.y
        const uz = second.z - first.z
        const vx = third.x - first.x
        const vy = third.y - first.y
        const vz = third.z - first.z
        const normal = {
            x: uy * vz - uz * vy,
            y: uz * vx - ux * vz,
            z: ux * vy - uy * vx
        }
        const length = Math.hypot(normal.x, normal.y, normal.z)
        if (!(length > 0)) {
            return null
        }

        return {
            x: normal.x / length,
            y: normal.y / length,
            z: normal.z / length
        }
    }

    /**
     * Makes opposite-wound triangles on the same plane share one normal.
     * @param {{ x: number, y: number, z: number }} normal Unit normal.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #canonicalizeNormal(normal) {
        const dominantAxis = ['x', 'y', 'z'].reduce((bestAxis, axis) =>
            Math.abs(normal[axis]) > Math.abs(normal[bestAxis])
                ? axis
                : bestAxis
        )
        const sign = normal[dominantAxis] < 0 ? -1 : 1
        return {
            x: normal.x * sign,
            y: normal.y * sign,
            z: normal.z * sign
        }
    }

    /**
     * Quantizes plane key values to merge floating-point STEP tessellation noise.
     * @param {number} value Plane value.
     * @returns {string}
     */
    static #quantizePlaneValue(value) {
        const rounded = Math.round(
            Number(value || 0) *
                PcbScene3dTransparentMeshSplitter.#PLANE_QUANTIZATION
        )
        return String(Object.is(rounded, -0) ? 0 : rounded)
    }

    /**
     * Calculates a source triangle centroid.
     * @param {any} attribute Position attribute.
     * @param {number[]} sourceIndices Source vertex indices.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #calculateCentroid(attribute, sourceIndices) {
        const itemSize = Number(attribute.itemSize || 0)
        const centroid = { x: 0, y: 0, z: 0 }
        if (itemSize < 2 || !sourceIndices.length) {
            return centroid
        }

        sourceIndices.forEach((sourceIndex) => {
            const base = sourceIndex * itemSize
            centroid.x += Number(attribute.array[base] || 0)
            centroid.y += Number(attribute.array[base + 1] || 0)
            centroid.z += Number(attribute.array[base + 2] || 0)
        })
        centroid.x /= sourceIndices.length
        centroid.y /= sourceIndices.length
        centroid.z /= sourceIndices.length
        return centroid
    }

    /**
     * Copies one geometry attribute for a set of source vertices.
     * @param {any} attribute Source attribute.
     * @param {number[]} sourceIndices Source vertex indices.
     * @returns {number[]}
     */
    static #copyAttributeValues(attribute, sourceIndices) {
        const itemSize = Number(attribute?.itemSize || 0)
        if (!attribute?.array || itemSize <= 0) {
            return []
        }

        const values = []
        sourceIndices.forEach((sourceIndex) => {
            const base = sourceIndex * itemSize
            for (let offset = 0; offset < itemSize; offset += 1) {
                values.push(Number(attribute.array[base + offset] || 0))
            }
        })
        return values
    }

    /**
     * Recenters copied position values around a chunk centroid.
     * @param {number[]} values Copied position values.
     * @param {number} itemSize Position item size.
     * @param {{ x: number, y: number, z: number }} centroid Chunk centroid.
     * @returns {void}
     */
    static #subtractCentroid(values, itemSize, centroid) {
        for (let offset = 0; offset < values.length; offset += itemSize) {
            values[offset] -= centroid.x
            values[offset + 1] -= centroid.y
            if (itemSize > 2) {
                values[offset + 2] -= centroid.z
            }
        }
    }

    /**
     * Detects whether at least one material should be sorted transparently.
     * @param {any | any[]} material Mesh material.
     * @returns {boolean}
     */
    static #hasTransparentMaterial(material) {
        const materials = Array.isArray(material) ? material : [material]
        return materials.some(
            (entry) =>
                entry?.transparent === true && Number(entry?.opacity ?? 1) < 1
        )
    }
}
