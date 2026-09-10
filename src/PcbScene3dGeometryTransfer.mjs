/** Transfers generated scene geometry without JSON expansion or retriangulation. */
export class PcbScene3dGeometryTransfer {
    /**
     * Extracts an owned object tree and its transferable vertex buffers.
     * @param {any} root Generated Three.js object.
     * @returns {{ payload: object, transferables: ArrayBuffer[] }}
     */
    static serialize(root) {
        const context = {
            geometries: [],
            materials: [],
            interleaved: [],
            geometryIds: new Map(),
            materialIds: new Map(),
            interleavedIds: new Map(),
            buffers: new Set()
        }
        const object = this.#serializeObject(root, context)
        return {
            payload: {
                object,
                geometries: context.geometries,
                materials: context.materials,
                interleaved: context.interleaved
            },
            transferables: [...context.buffers]
        }
    }

    /**
     * Restores lightweight Three.js wrappers around received buffers.
     * @param {any} THREE Three.js namespace.
     * @param {object} payload Serialized generated tree.
     * @returns {any}
     */
    static deserialize(THREE, payload) {
        const geometries = []
        const materials = []
        try {
            const interleaved = payload.interleaved.map((entry) => {
                const buffer = new THREE.InterleavedBuffer(
                    entry.array,
                    entry.stride
                )
                buffer.setUsage(entry.usage)
                return buffer
            })
            for (const entry of payload.geometries) {
                const geometry = new THREE.BufferGeometry()
                geometries.push(geometry)
                geometry.name = entry.name
                geometry.userData = entry.userData
                for (const [name, attribute] of Object.entries(
                    entry.attributes
                )) {
                    geometry.setAttribute(
                        name,
                        this.#deserializeAttribute(
                            THREE,
                            attribute,
                            interleaved
                        )
                    )
                }
                if (entry.index)
                    geometry.setIndex(
                        this.#deserializeAttribute(
                            THREE,
                            entry.index,
                            interleaved
                        )
                    )
                for (const [name, attributes] of Object.entries(
                    entry.morphAttributes
                )) {
                    geometry.morphAttributes[name] = attributes.map(
                        (attribute) =>
                            this.#deserializeAttribute(
                                THREE,
                                attribute,
                                interleaved
                            )
                    )
                }
                geometry.morphTargetsRelative = entry.morphTargetsRelative
                geometry.groups = entry.groups
                geometry.setDrawRange(
                    entry.drawRange.start,
                    entry.drawRange.count
                )
                if (entry.boundingBox)
                    geometry.boundingBox = new THREE.Box3(
                        new THREE.Vector3().fromArray(entry.boundingBox.min),
                        new THREE.Vector3().fromArray(entry.boundingBox.max)
                    )
                if (entry.boundingSphere)
                    geometry.boundingSphere = new THREE.Sphere(
                        new THREE.Vector3().fromArray(
                            entry.boundingSphere.center
                        ),
                        entry.boundingSphere.radius
                    )
            }
            const loader = new THREE.MaterialLoader()
            for (const entry of payload.materials) {
                const material = loader.parse(entry.json)
                materials.push(material)
                for (const [name, color] of Object.entries(entry.colors)) {
                    material[name].fromArray(color)
                }
            }
            return this.#deserializeObject(
                THREE,
                payload.object,
                geometries,
                materials
            )
        } catch (error) {
            geometries.forEach((geometry) => geometry.dispose())
            materials.forEach((material) => material.dispose())
            throw error
        }
    }

    /**
     * Releases shared generated geometry/material resources once each.
     * @param {any} root Generated object tree, including a detached tree.
     * @returns {void}
     */
    static dispose(root) {
        const resources = new Set()
        const pending = root ? [root] : []
        while (pending.length) {
            const object = pending.pop()
            if (object.geometry) resources.add(object.geometry)
            for (const material of Array.isArray(object.material)
                ? object.material
                : [object.material]) {
                if (material) resources.add(material)
            }
            pending.push(...(object.children || []))
        }
        resources.forEach((resource) => resource.dispose?.())
    }

    /**
     * Serializes scene hierarchy while deduplicating GPU resources.
     * @param {any} object Three.js object.
     * @param {object} context Resource tables.
     * @returns {object}
     */
    static #serializeObject(object, context) {
        const types = [
            'Group',
            'Mesh',
            'Line',
            'LineLoop',
            'LineSegments',
            'Object3D'
        ]
        if (!types.includes(object.type))
            throw new Error('Unsupported generated object: ' + object.type)
        if (object.matrixAutoUpdate) object.updateMatrix()
        return {
            type: object.type,
            name: object.name,
            userData: object.userData,
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            rotationOrder: object.rotation.order,
            scale: object.scale.toArray(),
            matrix: object.matrix.toArray(),
            matrixAutoUpdate: object.matrixAutoUpdate,
            matrixWorldAutoUpdate: object.matrixWorldAutoUpdate,
            visible: object.visible,
            castShadow: object.castShadow,
            receiveShadow: object.receiveShadow,
            frustumCulled: object.frustumCulled,
            renderOrder: object.renderOrder,
            layers: object.layers.mask,
            geometry: object.geometry
                ? this.#resourceId(
                      object.geometry,
                      context.geometryIds,
                      context.geometries,
                      () => this.#serializeGeometry(object.geometry, context)
                  )
                : null,
            material: Array.isArray(object.material)
                ? object.material.map((material) =>
                      this.#materialId(material, context)
                  )
                : object.material
                  ? this.#materialId(object.material, context)
                  : null,
            children: object.children.map((child) =>
                this.#serializeObject(child, context)
            )
        }
    }

    /**
     * Recreates render objects without invoking any geometry factory.
     * @param {any} THREE Three.js namespace.
     * @param {object} entry Object descriptor.
     * @param {any[]} geometries Geometry table.
     * @param {any[]} materials Material table.
     * @returns {any}
     */
    static #deserializeObject(THREE, entry, geometries, materials) {
        const material = Array.isArray(entry.material)
            ? entry.material.map((id) => materials[id])
            : materials[entry.material]
        const object =
            entry.geometry == null
                ? new THREE[entry.type]()
                : new THREE[entry.type](geometries[entry.geometry], material)
        for (const field of [
            'name',
            'userData',
            'visible',
            'castShadow',
            'receiveShadow',
            'frustumCulled',
            'renderOrder',
            'matrixAutoUpdate',
            'matrixWorldAutoUpdate'
        ]) {
            object[field] = entry[field]
        }
        object.rotation.order = entry.rotationOrder
        object.position.fromArray(entry.position)
        object.quaternion.fromArray(entry.quaternion)
        object.scale.fromArray(entry.scale)
        object.matrix.fromArray(entry.matrix)
        object.matrixWorldNeedsUpdate = true
        object.layers.mask = entry.layers
        entry.children.forEach((child) =>
            object.add(
                this.#deserializeObject(THREE, child, geometries, materials)
            )
        )
        return object
    }

    /**
     * Stores one shared resource and returns its stable local index.
     * @param {any} resource Source resource.
     * @param {Map} ids Identity map.
     * @param {any[]} entries Serialized resources.
     * @param {() => object} serialize Serializer.
     * @returns {number}
     */
    static #resourceId(resource, ids, entries, serialize) {
        if (!ids.has(resource)) {
            ids.set(resource, entries.length)
            entries.push(serialize())
        }
        return ids.get(resource)
    }

    /**
     * Stores built-in material properties with unquantized linear colors.
     * @param {any} material Three.js material.
     * @param {object} context Resource tables.
     * @returns {number}
     */
    static #materialId(material, context) {
        return this.#resourceId(
            material,
            context.materialIds,
            context.materials,
            () => {
                const colors = {}
                for (const [name, value] of Object.entries(material)) {
                    if (value?.isTexture)
                        throw new Error(
                            'Generated geometry transfer does not support textures.'
                        )
                    if (value?.isColor) colors[name] = value.toArray()
                }
                return { json: material.toJSON(), colors }
            }
        )
    }

    /**
     * Stores geometry data directly as typed arrays, retaining draw groups.
     * @param {any} geometry Generated geometry.
     * @param {object} context Resource tables.
     * @returns {object}
     */
    static #serializeGeometry(geometry, context) {
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (!geometry.boundingSphere) geometry.computeBoundingSphere()
        return {
            name: geometry.name,
            userData: geometry.userData,
            attributes: Object.fromEntries(
                Object.entries(geometry.attributes).map(([name, attribute]) => [
                    name,
                    this.#serializeAttribute(attribute, context)
                ])
            ),
            index: geometry.index
                ? this.#serializeAttribute(geometry.index, context)
                : null,
            morphAttributes: Object.fromEntries(
                Object.entries(geometry.morphAttributes).map(
                    ([name, attributes]) => [
                        name,
                        attributes.map((attribute) =>
                            this.#serializeAttribute(attribute, context)
                        )
                    ]
                )
            ),
            morphTargetsRelative: geometry.morphTargetsRelative,
            groups: geometry.groups,
            drawRange: geometry.drawRange,
            boundingBox: geometry.boundingBox
                ? {
                      min: geometry.boundingBox.min.toArray(),
                      max: geometry.boundingBox.max.toArray()
                  }
                : null,
            boundingSphere: geometry.boundingSphere
                ? {
                      center: geometry.boundingSphere.center.toArray(),
                      radius: geometry.boundingSphere.radius
                  }
                : null
        }
    }

    /**
     * Stores normal or interleaved attributes without duplicating buffers.
     * @param {any} attribute Buffer attribute.
     * @param {object} context Resource tables.
     * @returns {object}
     */
    static #serializeAttribute(attribute, context) {
        const data = attribute.isInterleavedBufferAttribute
            ? attribute.data
            : attribute
        context.buffers.add(data.array.buffer)
        return {
            name: attribute.name,
            itemSize: attribute.itemSize,
            normalized: attribute.normalized,
            usage: data.usage,
            gpuType: attribute.gpuType,
            array: attribute.isInterleavedBufferAttribute
                ? null
                : attribute.array,
            interleaved: attribute.isInterleavedBufferAttribute
                ? this.#resourceId(
                      data,
                      context.interleavedIds,
                      context.interleaved,
                      () => ({
                          array: data.array,
                          stride: data.stride,
                          usage: data.usage
                      })
                  )
                : null,
            offset: attribute.offset
        }
    }

    /**
     * Wraps a received attribute buffer in the corresponding Three.js type.
     * @param {any} THREE Three.js namespace.
     * @param {object} entry Attribute descriptor.
     * @param {any[]} interleaved Interleaved buffer table.
     * @returns {any}
     */
    static #deserializeAttribute(THREE, entry, interleaved) {
        const attribute =
            entry.interleaved == null
                ? new THREE.BufferAttribute(
                      entry.array,
                      entry.itemSize,
                      entry.normalized
                  )
                : new THREE.InterleavedBufferAttribute(
                      interleaved[entry.interleaved],
                      entry.itemSize,
                      entry.offset,
                      entry.normalized
                  )
        attribute.name = entry.name
        if (entry.gpuType !== undefined) attribute.gpuType = entry.gpuType
        attribute.setUsage?.(entry.usage)
        return attribute
    }
}
