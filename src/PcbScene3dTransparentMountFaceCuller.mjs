/**
 * Hides translucent solid faces that point back into the PCB mount plane.
 */
export class PcbScene3dTransparentMountFaceCuller {
    static #NORMAL_Z_THRESHOLD = 0.92
    static #VECTOR_EPSILON = 1e-9

    /**
     * Applies mount-plane culling below one transparent placement root.
     * @param {any} THREE Three.js namespace.
     * @param {{ mountSide?: string } | null | undefined} placement Placement metadata.
     * @param {any} rootObject Placement root object.
     * @returns {void}
     */
    static apply(THREE, placement, rootObject) {
        const mountFacingSign =
            PcbScene3dTransparentMountFaceCuller.#mountFacingSign(placement)
        if (!THREE || !rootObject || !mountFacingSign) {
            return
        }

        rootObject.updateMatrixWorld?.(true)
        PcbScene3dTransparentMountFaceCuller.#traverse(rootObject, (object) => {
            if (
                !PcbScene3dTransparentMountFaceCuller.#isTransparentMesh(object)
            ) {
                return
            }

            const normal =
                PcbScene3dTransparentMountFaceCuller.#worldNormalForObject(
                    THREE,
                    object
                )
            if (
                !normal ||
                normal.z * mountFacingSign <
                    PcbScene3dTransparentMountFaceCuller.#NORMAL_Z_THRESHOLD
            ) {
                return
            }

            object.visible = false
            object.userData = {
                ...(object.userData || {}),
                scene3dMountFacingTransparentFace: true
            }
        })
    }

    /**
     * Resolves which normal direction points toward the board face.
     * @param {{ mountSide?: string } | null | undefined} placement Placement metadata.
     * @returns {1 | -1}
     */
    static #mountFacingSign(placement) {
        return String(placement?.mountSide || 'top').toLowerCase() === 'bottom'
            ? 1
            : -1
    }

    /**
     * Returns true when one object carries translucent render material.
     * @param {any} object Candidate object.
     * @returns {boolean}
     */
    static #isTransparentMesh(object) {
        if (!object?.geometry || object.visible === false) {
            return false
        }

        return PcbScene3dTransparentMountFaceCuller.#materials(object).some(
            (material) =>
                material?.transparent === true &&
                Number(material?.opacity ?? 1) < 1
        )
    }

    /**
     * Resolves materials from one mesh.
     * @param {any} object Mesh-like object.
     * @returns {any[]}
     */
    static #materials(object) {
        if (Array.isArray(object?.material)) {
            return object.material.filter(Boolean)
        }

        return object?.material ? [object.material] : []
    }

    /**
     * Resolves the dominant world-space normal for one coplanar chunk.
     * @param {any} THREE Three.js namespace.
     * @param {any} object Mesh-like object.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #worldNormalForObject(THREE, object) {
        const attributeNormal =
            PcbScene3dTransparentMountFaceCuller.#attributeNormal(THREE, object)
        if (attributeNormal) {
            return attributeNormal
        }

        return PcbScene3dTransparentMountFaceCuller.#triangleNormal(
            THREE,
            object
        )
    }

    /**
     * Resolves an average transformed normal from a geometry normal attribute.
     * @param {any} THREE Three.js namespace.
     * @param {any} object Mesh-like object.
     * @returns {any | null}
     */
    static #attributeNormal(THREE, object) {
        const normalAttribute =
            object.geometry?.getAttribute?.('normal') ||
            object.geometry?.attributes?.normal
        if (
            !normalAttribute ||
            typeof THREE?.Vector3 !== 'function' ||
            Number(normalAttribute.count || 0) <= 0
        ) {
            return null
        }

        const normal = new THREE.Vector3()
        const sum = new THREE.Vector3()
        for (
            let index = 0;
            index < Number(normalAttribute.count || 0);
            index += 1
        ) {
            normal.fromBufferAttribute(normalAttribute, index)
            sum.add(normal)
        }

        return PcbScene3dTransparentMountFaceCuller.#toWorldNormal(
            THREE,
            object,
            sum
        )
    }

    /**
     * Resolves a transformed normal from the first non-degenerate triangle.
     * @param {any} THREE Three.js namespace.
     * @param {any} object Mesh-like object.
     * @returns {any | null}
     */
    static #triangleNormal(THREE, object) {
        const positionAttribute =
            object.geometry?.getAttribute?.('position') ||
            object.geometry?.attributes?.position
        if (
            !positionAttribute ||
            typeof THREE?.Vector3 !== 'function' ||
            Number(positionAttribute.count || 0) < 3
        ) {
            return null
        }

        const first = new THREE.Vector3()
        const second = new THREE.Vector3()
        const third = new THREE.Vector3()
        const edgeA = new THREE.Vector3()
        const edgeB = new THREE.Vector3()
        const normal = new THREE.Vector3()
        for (
            let index = 0;
            index + 2 < Number(positionAttribute.count || 0);
            index += 3
        ) {
            first.fromBufferAttribute(positionAttribute, index)
            second.fromBufferAttribute(positionAttribute, index + 1)
            third.fromBufferAttribute(positionAttribute, index + 2)
            edgeA.subVectors(second, first)
            edgeB.subVectors(third, first)
            normal.crossVectors(edgeA, edgeB)
            if (
                normal.lengthSq() >
                PcbScene3dTransparentMountFaceCuller.#VECTOR_EPSILON
            ) {
                return PcbScene3dTransparentMountFaceCuller.#toWorldNormal(
                    THREE,
                    object,
                    normal
                )
            }
        }

        return null
    }

    /**
     * Converts a local normal vector into world space.
     * @param {any} THREE Three.js namespace.
     * @param {any} object Mesh-like object.
     * @param {any} normal Local normal vector.
     * @returns {any | null}
     */
    static #toWorldNormal(THREE, object, normal) {
        if (
            !normal ||
            normal.lengthSq?.() <=
                PcbScene3dTransparentMountFaceCuller.#VECTOR_EPSILON
        ) {
            return null
        }

        normal.normalize()
        if (
            typeof THREE?.Matrix3 === 'function' &&
            object?.matrixWorld &&
            typeof normal.applyMatrix3 === 'function'
        ) {
            normal.applyMatrix3(
                new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
            )
            if (
                normal.lengthSq?.() <=
                PcbScene3dTransparentMountFaceCuller.#VECTOR_EPSILON
            ) {
                return null
            }
            normal.normalize()
        }

        return normal
    }

    /**
     * Traverses one object tree, supporting Three.js objects and test doubles.
     * @param {any} root Root object.
     * @param {(object: any) => void} visitor Visitor callback.
     * @returns {void}
     */
    static #traverse(root, visitor) {
        if (!root) {
            return
        }

        if (typeof root.traverse === 'function') {
            root.traverse(visitor)
            return
        }

        visitor(root)
        ;(Array.isArray(root.children) ? root.children : []).forEach((child) =>
            PcbScene3dTransparentMountFaceCuller.#traverse(child, visitor)
        )
    }
}
