/**
 * Applies source-frame transforms to full-board assembly STEP geometry.
 */
export class PcbScene3dBoardAssemblyTransform {
    /**
     * Applies the source-frame transform encoded by a board assembly placement.
     * @param {any} modelGroup Loaded board assembly group.
     * @param {{ sourceFrameScale?: { y?: number } }} placement Placement metadata.
     * @returns {void}
     */
    static apply(modelGroup, placement) {
        if (!PcbScene3dBoardAssemblyTransform.#shouldMirrorY(placement)) {
            return
        }

        PcbScene3dBoardAssemblyTransform.#traverseModelObjects(
            modelGroup,
            (object) =>
                PcbScene3dBoardAssemblyTransform.#mirrorGeometryY(
                    object?.geometry
                )
        )
        modelGroup.userData = modelGroup.userData || {}
        modelGroup.userData.scene3dBoardAssemblyMirroredY = true
    }

    /**
     * Checks whether the assembly source frame needs a Y mirror.
     * @param {{ sourceFrameScale?: { y?: number } }} placement Placement metadata.
     * @returns {boolean}
     */
    static #shouldMirrorY(placement) {
        return Number(placement?.sourceFrameScale?.y ?? 1) < 0
    }

    /**
     * Mirrors one geometry around the source Y origin.
     * @param {any} geometry Buffer geometry.
     * @returns {void}
     */
    static #mirrorGeometryY(geometry) {
        const position = PcbScene3dBoardAssemblyTransform.#getAttribute(
            geometry,
            'position'
        )
        if (!position?.array?.length) {
            return
        }

        PcbScene3dBoardAssemblyTransform.#mirrorAttributeY(position)
        const normal = PcbScene3dBoardAssemblyTransform.#getAttribute(
            geometry,
            'normal'
        )
        PcbScene3dBoardAssemblyTransform.#mirrorAttributeY(normal)
        PcbScene3dBoardAssemblyTransform.#reverseTriangleWinding(geometry)
        geometry.computeBoundingBox?.()
        geometry.computeBoundingSphere?.()
    }

    /**
     * Mirrors the Y component of a vertex-like attribute.
     * @param {{ array?: ArrayLike<number>, itemSize?: number, needsUpdate?: boolean } | null} attribute Geometry attribute.
     * @returns {void}
     */
    static #mirrorAttributeY(attribute) {
        const itemSize = Number(attribute?.itemSize || 0)
        if (!attribute?.array?.length || itemSize < 2) {
            return
        }

        for (let index = 1; index < attribute.array.length; index += itemSize) {
            attribute.array[index] = -Number(attribute.array[index] || 0)
        }
        attribute.needsUpdate = true
    }

    /**
     * Reverses triangle winding after a one-axis mirror.
     * @param {any} geometry Buffer geometry.
     * @returns {void}
     */
    static #reverseTriangleWinding(geometry) {
        const index = geometry?.index
        const indexArray = index?.array
        if (!indexArray?.length) {
            PcbScene3dBoardAssemblyTransform.#reverseUnindexedWinding(geometry)
            return
        }

        for (let offset = 0; offset + 2 < indexArray.length; offset += 3) {
            const next = indexArray[offset + 1]
            indexArray[offset + 1] = indexArray[offset + 2]
            indexArray[offset + 2] = next
        }
        index.needsUpdate = true
    }

    /**
     * Reverses unindexed triangle winding across all geometry attributes.
     * @param {any} geometry Buffer geometry.
     * @returns {void}
     */
    static #reverseUnindexedWinding(geometry) {
        Object.values(geometry?.attributes || {}).forEach((attribute) =>
            PcbScene3dBoardAssemblyTransform.#swapTriangleVertices(
                attribute,
                1,
                2
            )
        )
    }

    /**
     * Swaps two vertices inside each unindexed triangle for one attribute.
     * @param {{ array?: ArrayLike<number>, itemSize?: number, needsUpdate?: boolean }} attribute Geometry attribute.
     * @param {number} leftVertex First vertex offset inside the triangle.
     * @param {number} rightVertex Second vertex offset inside the triangle.
     * @returns {void}
     */
    static #swapTriangleVertices(attribute, leftVertex, rightVertex) {
        const itemSize = Number(attribute?.itemSize || 0)
        const array = attribute?.array
        if (!array?.length || itemSize <= 0) {
            return
        }

        for (
            let offset = 0;
            offset + itemSize * 3 <= array.length;
            offset += itemSize * 3
        ) {
            for (let item = 0; item < itemSize; item += 1) {
                const left = offset + leftVertex * itemSize + item
                const right = offset + rightVertex * itemSize + item
                const value = array[left]
                array[left] = array[right]
                array[right] = value
            }
        }
        attribute.needsUpdate = true
    }

    /**
     * Returns a geometry attribute across Three.js-compatible shapes.
     * @param {any} geometry Buffer geometry.
     * @param {string} name Attribute name.
     * @returns {any}
     */
    static #getAttribute(geometry, name) {
        return typeof geometry?.getAttribute === 'function'
            ? geometry.getAttribute(name)
            : geometry?.attributes?.[name]
    }

    /**
     * Traverses model objects.
     * @param {any} root Root object.
     * @param {(object: any) => void} visitor Visitor callback.
     * @returns {void}
     */
    static #traverseModelObjects(root, visitor) {
        if (!root) {
            return
        }

        if (typeof root.traverse === 'function') {
            root.traverse(visitor)
            return
        }

        visitor(root)
        ;(Array.isArray(root.children) ? root.children : []).forEach((child) =>
            PcbScene3dBoardAssemblyTransform.#traverseModelObjects(
                child,
                visitor
            )
        )
    }
}
