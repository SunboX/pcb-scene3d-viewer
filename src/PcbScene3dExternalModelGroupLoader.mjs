import { PcbScene3dBufferAttributeFactory } from './PcbScene3dBufferAttributeFactory.mjs'
import { PcbScene3dModelBounds } from './PcbScene3dModelBounds.mjs'

/**
 * Loads raw external model geometry before placement-specific wrapping.
 */
export class PcbScene3dExternalModelGroupLoader {
    /**
     * Loads one raw model group without placement-specific mount transforms.
     * @param {any} THREE Three.js namespace.
     * @param {any} model Resolved external model metadata.
     * @param {import('./PcbScene3dStepLoader.mjs').PcbScene3dStepLoader} stepLoader STEP model loader.
     * @param {string} versionKey Cache-busting version key for dynamic loader imports.
     * @returns {Promise<any>}
     */
    static async load(THREE, model, stepLoader, versionKey = '') {
        if (model.format === 'wrl') {
            if (!model.file) {
                throw new Error('Resolved WRL model file is unavailable.')
            }

            return PcbScene3dExternalModelGroupLoader.#loadVrmlModel(
                model.file,
                versionKey
            )
        }

        if (model.format === 'step') {
            return PcbScene3dExternalModelGroupLoader.#loadStepModel(
                THREE,
                model,
                stepLoader
            )
        }

        throw new Error('Unsupported external model format.')
    }

    /**
     * Loads one VRML model from a browser file.
     * @param {File | Blob} file Model file blob.
     * @param {string} versionKey Cache-busting version key for the loader import.
     * @returns {Promise<any>}
     */
    static async #loadVrmlModel(file, versionKey) {
        const [{ VRMLLoader }] = await Promise.all([
            import(
                '/node_modules/three/examples/jsm/loaders/VRMLLoader.js' +
                    (versionKey ? '?v=' + encodeURIComponent(versionKey) : '')
            )
        ])
        const loader = new VRMLLoader()
        const objectUrl = URL.createObjectURL(file)

        try {
            return await new Promise((resolve, reject) => {
                loader.load(
                    objectUrl,
                    (loadedScene) => resolve(loadedScene),
                    undefined,
                    reject
                )
            })
        } finally {
            URL.revokeObjectURL(objectUrl)
        }
    }

    /**
     * Loads one STEP model and converts its meshes into Three objects.
     * @param {any} THREE Three.js namespace.
     * @param {any} model Resolved STEP model metadata.
     * @param {import('./PcbScene3dStepLoader.mjs').PcbScene3dStepLoader} stepLoader STEP model loader.
     * @returns {Promise<any>}
     */
    static async #loadStepModel(THREE, model, stepLoader) {
        const loadedModel = Array.isArray(model?.preparedMeshPayloads)
            ? { meshPayloads: model.preparedMeshPayloads }
            : await stepLoader.loadModel(model)
        const group = new THREE.Group()
        const sourceBounds = PcbScene3dModelBounds.measureSourceBoundsMil(
            loadedModel.meshPayloads
        )
        group.scale.setScalar(1000)
        if (sourceBounds) {
            group.userData.scene3dSourceBoundsMil = sourceBounds
        }

        loadedModel.meshPayloads.forEach((meshPayload) => {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute(
                'position',
                PcbScene3dBufferAttributeFactory.createFloat32(
                    THREE,
                    meshPayload.positions,
                    3
                )
            )
            geometry.setIndex(
                PcbScene3dBufferAttributeFactory.createUint32(
                    THREE,
                    meshPayload.indices,
                    1
                )
            )

            if (meshPayload.normals.length) {
                geometry.setAttribute(
                    'normal',
                    PcbScene3dBufferAttributeFactory.createFloat32(
                        THREE,
                        meshPayload.normals,
                        3
                    )
                )
            } else {
                geometry.computeVertexNormals()
            }
            geometry.computeBoundingSphere()

            const materials =
                PcbScene3dExternalModelGroupLoader.#buildStepMeshMaterials(
                    THREE,
                    geometry,
                    meshPayload
                )
            const mesh = new THREE.Mesh(
                geometry,
                materials.length > 1 ? materials : materials[0]
            )
            group.add(mesh)
        })

        return group
    }

    /**
     * Builds the material set for one STEP mesh and assigns face-color groups
     * when the importer exposes them.
     * @param {any} THREE Three.js namespace.
     * @param {any} geometry Three.js buffer geometry.
     * @param {{ color?: number[] | null, indices?: ArrayLike<number>, faceColors?: { first: number, last: number, color: number[] | null }[] }} meshPayload STEP mesh payload.
     * @returns {any[]}
     */
    static #buildStepMeshMaterials(THREE, geometry, meshPayload) {
        const defaultColor =
            PcbScene3dExternalModelGroupLoader.#resolveMeshColor(
                THREE,
                meshPayload?.color
            )
        const defaultMaterial =
            PcbScene3dExternalModelGroupLoader.#createStepMaterial(
                THREE,
                defaultColor
            )
        const faceColors = Array.isArray(meshPayload?.faceColors)
            ? meshPayload.faceColors.filter((faceColor) =>
                  PcbScene3dExternalModelGroupLoader.#isValidFaceColorRange(
                      faceColor,
                      meshPayload?.indices
                  )
              )
            : []

        if (!faceColors.length) {
            return [defaultMaterial]
        }

        const materials = [defaultMaterial]
        faceColors.forEach((faceColor) => {
            const resolvedColor =
                Array.isArray(faceColor?.color) && faceColor.color.length >= 3
                    ? PcbScene3dExternalModelGroupLoader.#resolveMeshColor(
                          THREE,
                          faceColor.color
                      )
                    : defaultColor

            materials.push(
                PcbScene3dExternalModelGroupLoader.#createStepMaterial(
                    THREE,
                    resolvedColor
                )
            )
        })

        PcbScene3dExternalModelGroupLoader.#applyFaceColorGroups(
            geometry,
            meshPayload?.indices || [],
            faceColors
        )

        return materials
    }

    /**
     * Creates one standard material for imported STEP geometry.
     * @param {any} THREE Three.js namespace.
     * @param {any} color Three.js color or numeric fallback color.
     * @returns {any}
     */
    static #createStepMaterial(THREE, color) {
        const options = {
            color,
            roughness: 0.56,
            metalness: 0.14
        }

        if (THREE.DoubleSide !== undefined) {
            options.side = THREE.DoubleSide
        }

        return new THREE.MeshStandardMaterial(options)
    }

    /**
     * Applies grouped material ranges for face-colored STEP triangles.
     * @param {any} geometry Three.js buffer geometry.
     * @param {ArrayLike<number>} indices Mesh index buffer.
     * @param {{ first: number, last: number }[]} faceColors Face color ranges.
     * @returns {void}
     */
    static #applyFaceColorGroups(geometry, indices, faceColors) {
        const triangleCount = Math.floor(Number(indices?.length || 0) / 3)
        let triangleIndex = 0
        let faceColorIndex = 0
        while (triangleIndex < triangleCount) {
            const firstIndex = triangleIndex
            let lastIndex = triangleCount
            let materialIndex = 0
            if (faceColorIndex < faceColors.length) {
                const currentFaceColor = faceColors[faceColorIndex]
                if (triangleIndex < currentFaceColor.first) {
                    lastIndex = currentFaceColor.first
                } else {
                    lastIndex = Math.min(
                        currentFaceColor.last + 1,
                        triangleCount
                    )
                    materialIndex = faceColorIndex + 1
                    faceColorIndex += 1
                }
            }
            geometry.addGroup(
                firstIndex * 3,
                Math.max(lastIndex - firstIndex, 0) * 3,
                materialIndex
            )
            triangleIndex = lastIndex
        }
    }

    /**
     * Returns true when one face-color range overlaps valid triangle indices.
     * @param {{ first?: number, last?: number }} faceColor Face color range.
     * @param {ArrayLike<number> | undefined} indices Mesh index buffer.
     * @returns {boolean}
     */
    static #isValidFaceColorRange(faceColor, indices) {
        const first = Number(faceColor?.first)
        const last = Number(faceColor?.last)
        const triangleCount = Math.floor(Number(indices?.length || 0) / 3)
        return (
            Number.isInteger(first) &&
            Number.isInteger(last) &&
            first >= 0 &&
            last >= first &&
            first < triangleCount
        )
    }

    /**
     * Resolves one STEP mesh color into a Three-friendly color value.
     * @param {any} THREE Three.js namespace.
     * @param {number[] | null} color Source RGB color.
     * @returns {any}
     */
    static #resolveMeshColor(THREE, color) {
        if (!Array.isArray(color) || color.length < 3) {
            return 0xc8c8c8
        }
        return new THREE.Color(
            Number(color[0] || 0),
            Number(color[1] || 0),
            Number(color[2] || 0)
        )
    }
}
