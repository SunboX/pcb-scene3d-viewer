import { PcbAssemblyMeshUtils } from './PcbAssemblyMeshUtils.mjs'
import { PcbScene3dExternalPlacementDefaults } from './PcbScene3dExternalPlacementDefaults.mjs'
import { PcbScene3dFootprintBodyBuilder } from './PcbScene3dFootprintBodyBuilder.mjs'

const COMPONENT_COLOR = [0.55, 0.56, 0.58]

/**
 * Builds component body and external model meshes for assembly exports.
 */
export class PcbAssemblyComponentMeshBuilder {
    /**
     * Builds component meshes and component-model diagnostics.
     * @param {{ components?: object[], externalPlacements?: object[] }} sceneDescription Prepared scene description.
     * @param {{ modelMeshLoader?: (placement: object) => Promise<object | object[]>, includeModels?: boolean, renderFallbackBodies?: boolean }} [options] Build options.
     * @param {{ advance?: (units: number, message: string) => Promise<void> } | null} [progress] Progress tracker.
     * @returns {Promise<{ meshes: object[], diagnostics: object[] }>}
     */
    static async build(sceneDescription, options = {}, progress = null) {
        const renderSceneDescription =
            PcbScene3dExternalPlacementDefaults.apply(sceneDescription)
        const diagnostics = []
        const meshes =
            PcbAssemblyComponentMeshBuilder.#buildFallbackComponentMeshes(
                renderSceneDescription,
                options
            )
        const loader =
            typeof options.modelMeshLoader === 'function'
                ? options.modelMeshLoader
                : null

        if (loader && options.includeModels !== false) {
            meshes.push(
                ...(await PcbAssemblyComponentMeshBuilder.#buildModelMeshes(
                    renderSceneDescription,
                    loader,
                    diagnostics,
                    progress
                ))
            )
        }

        if (options.includeModels !== false) {
            PcbAssemblyComponentMeshBuilder.#appendMissingModelDiagnostics(
                renderSceneDescription,
                diagnostics
            )
        }

        return { meshes, diagnostics }
    }

    /**
     * Builds external component model meshes.
     * @param {{ externalPlacements?: object[] }} sceneDescription Prepared scene description.
     * @param {(placement: object) => Promise<object | object[]>} loader Model mesh loader.
     * @param {object[]} diagnostics Mutable diagnostics list.
     * @param {{ advance?: (units: number, message: string) => Promise<void> } | null} progress Progress tracker.
     * @returns {Promise<object[]>}
     */
    static async #buildModelMeshes(
        sceneDescription,
        loader,
        diagnostics,
        progress
    ) {
        const meshes = []
        const placements = PcbAssemblyComponentMeshBuilder.#array(
            sceneDescription?.externalPlacements
        ).filter(
            (placement) =>
                placement?.externalModel &&
                placement?.renderAsBoundingBox !== true
        )

        for (
            let placementIndex = 0;
            placementIndex < placements.length;
            placementIndex += 1
        ) {
            const placement = placements[placementIndex]

            try {
                const loaded = await loader(placement)
                const loadedMeshes = Array.isArray(loaded) ? loaded : [loaded]
                loadedMeshes.filter(Boolean).forEach((mesh, index) => {
                    meshes.push(
                        PcbAssemblyComponentMeshBuilder.#componentModelMesh(
                            mesh,
                            placement,
                            loadedMeshes.length,
                            index
                        )
                    )
                })
                PcbAssemblyComponentMeshBuilder.#appendModelDiagnostic(
                    placement,
                    diagnostics
                )
            } catch (error) {
                diagnostics.push(
                    PcbAssemblyComponentMeshBuilder.#diagnostic(
                        'warning',
                        'component_model_conversion_failed',
                        'Could not convert 3D model for ' +
                            String(placement?.designator || 'component') +
                            ': ' +
                            String(error?.message || error)
                    )
                )
            }
            await progress?.advance?.(
                1,
                'Loading component models ' +
                    (placementIndex + 1) +
                    '/' +
                    placements.length
            )
        }

        return meshes
    }

    /**
     * Prepares and places one loaded component model mesh.
     * @param {object} mesh Loaded mesh.
     * @param {object} placement Component placement.
     * @param {number} meshCount Number of loaded meshes for this placement.
     * @param {number} meshIndex Loaded mesh index.
     * @returns {object}
     */
    static #componentModelMesh(mesh, placement, meshCount, meshIndex) {
        const designator = PcbAssemblyMeshUtils.safeName(
            placement?.designator || 'component'
        )
        const prepared =
            PcbAssemblyComponentMeshBuilder.#prepareLoadedComponentMesh(
                mesh,
                placement
            )

        return PcbAssemblyMeshUtils.transformMesh(
            {
                ...prepared,
                name:
                    'component-' +
                    designator +
                    (meshCount > 1 ? '-' + (meshIndex + 1) : ''),
                color: prepared.color || COMPONENT_COLOR,
                ...PcbAssemblyComponentMeshBuilder.#placementOpacity(
                    placement,
                    prepared
                )
            },
            {
                ...placement,
                modelTransform: null
            }
        )
    }

    /**
     * Builds procedural component bodies for components without loaded models.
     * @param {{ components?: object[], externalPlacements?: object[] }} sceneDescription Prepared scene description.
     * @param {{ includeModels?: boolean, renderFallbackBodies?: boolean }} options Build options.
     * @returns {object[]}
     */
    static #buildFallbackComponentMeshes(sceneDescription, options) {
        if (options.renderFallbackBodies === false) {
            return []
        }

        const externalDesignators = new Set(
            PcbAssemblyComponentMeshBuilder.#array(
                sceneDescription?.externalPlacements
            )
                .filter((placement) => placement?.externalModel)
                .map((placement) => String(placement?.designator || '').trim())
                .filter(Boolean)
        )
        const includeModels = options.includeModels !== false

        return PcbAssemblyComponentMeshBuilder.#array(
            sceneDescription?.components
        )
            .filter((component) =>
                PcbAssemblyComponentMeshBuilder.#shouldBuildFallbackBody(
                    component,
                    externalDesignators,
                    includeModels
                )
            )
            .flatMap((component, index) =>
                PcbAssemblyComponentMeshBuilder.#fallbackComponentMeshes(
                    component,
                    index
                )
            )
    }

    /**
     * Builds all fallback meshes for one component.
     * @param {object} component Component scene entry.
     * @param {number} index Component index.
     * @returns {object[]}
     */
    static #fallbackComponentMeshes(component, index) {
        const designator = PcbAssemblyMeshUtils.safeName(
            component?.designator || 'fallback-' + (index + 1)
        )
        const opacity = PcbAssemblyComponentMeshBuilder.#placementOpacity(
            component,
            {}
        )
        const bodySize = component?.body?.sizeMil || {}
        const localMeshes = [
            PcbAssemblyComponentMeshBuilder.#fallbackBodyMesh(
                'component-' + designator + '-body',
                component?.body,
                bodySize
            ),
            ...PcbAssemblyComponentMeshBuilder.#fallbackAccessoryMeshes(
                designator,
                component
            )
        ]

        return localMeshes.map((mesh) =>
            PcbAssemblyMeshUtils.transformMesh(
                {
                    ...mesh,
                    ...opacity
                },
                component
            )
        )
    }

    /**
     * Builds package accessory meshes in placement-local orientation.
     * @param {string} designator Sanitized component designator.
     * @param {object} component Component scene entry.
     * @returns {object[]}
     */
    static #fallbackAccessoryMeshes(designator, component) {
        const mirrorZ =
            String(component?.mountSide || 'top').toLowerCase() === 'bottom'

        return PcbScene3dFootprintBodyBuilder.accessoryBoxes(
            component?.body
        ).map((box) =>
            PcbAssemblyMeshUtils.box(
                'component-' + designator + '-' + box.role + '-' + box.index,
                {
                    x: box.x,
                    y: box.y,
                    z: mirrorZ ? -Number(box.z || 0) : box.z,
                    width: box.width,
                    depth: box.depth,
                    height: box.height,
                    color: box.color
                }
            )
        )
    }

    /**
     * Builds one procedural fallback body mesh.
     * @param {string} name Mesh name.
     * @param {object | undefined} body Component body descriptor.
     * @param {object} bodySize Body size in mils.
     * @returns {object}
     */
    static #fallbackBodyMesh(name, body, bodySize) {
        const width = Number(bodySize?.width) || 20
        const depth = Number(bodySize?.depth) || 20
        const height = Number(bodySize?.height) || 10
        if (
            body?.family === 'test-point' ||
            body?.family === 'radial-capacitor'
        ) {
            return PcbAssemblyMeshUtils.cylinder(name, {
                radius: Math.max(width, depth) / 2,
                height,
                color: COMPONENT_COLOR
            })
        }

        return PcbAssemblyMeshUtils.box(name, {
            width,
            depth,
            height,
            color: COMPONENT_COLOR
        })
    }

    /**
     * Returns whether a procedural body should be emitted for one component.
     * @param {object} component Component scene entry.
     * @param {Set<string>} externalDesignators Designators with external placements.
     * @param {boolean} includeModels Whether model export is enabled.
     * @returns {boolean}
     */
    static #shouldBuildFallbackBody(
        component,
        externalDesignators,
        includeModels
    ) {
        if (!component || component.renderFallbackBody === false) {
            return false
        }

        if (component.renderFallbackBody === true) {
            return Boolean(component?.body?.sizeMil)
        }

        const designator = String(component?.designator || '').trim()
        if (
            includeModels &&
            (component?.externalModel ||
                (designator && externalDesignators.has(designator)))
        ) {
            return false
        }

        return Boolean(component?.body?.sizeMil)
    }

    /**
     * Applies model-local transforms that need whole-mesh context.
     * @param {object} mesh Loaded component mesh.
     * @param {object} placement Component placement.
     * @returns {object}
     */
    static #prepareLoadedComponentMesh(mesh, placement) {
        const modelTransform = placement?.modelTransform || {}
        let prepared = PcbAssemblyComponentMeshBuilder.#cloneMesh(mesh)

        prepared = PcbAssemblyComponentMeshBuilder.#scaleMesh(
            prepared,
            PcbAssemblyComponentMeshBuilder.#modelScale(modelTransform)
        )
        prepared = PcbAssemblyComponentMeshBuilder.#rotateMesh(
            prepared,
            modelTransform?.rotationDeg || {}
        )
        prepared = PcbAssemblyComponentMeshBuilder.#applyBoardNormalDirection(
            prepared,
            modelTransform?.boardNormalDirection
        )
        prepared = PcbAssemblyComponentMeshBuilder.#applyModelOrigin(
            prepared,
            modelTransform
        )
        prepared = PcbAssemblyComponentMeshBuilder.#fitMeshToTarget(
            prepared,
            modelTransform
        )

        return PcbAssemblyComponentMeshBuilder.#translateMesh3d(
            prepared,
            PcbAssemblyComponentMeshBuilder.#modelOffset(modelTransform)
        )
    }

    /**
     * Clones mesh vertices so model-local transforms do not mutate loader output.
     * @param {object} mesh Source mesh.
     * @returns {object}
     */
    static #cloneMesh(mesh) {
        return {
            ...mesh,
            vertices: PcbAssemblyComponentMeshBuilder.#array(
                mesh?.vertices
            ).map((vertex) => [
                Number(vertex?.[0] || 0),
                Number(vertex?.[1] || 0),
                Number(vertex?.[2] || 0)
            ])
        }
    }

    /**
     * Applies model origin metadata.
     * @param {object} mesh Mesh to transform.
     * @param {object} modelTransform Model transform metadata.
     * @returns {object}
     */
    static #applyModelOrigin(mesh, modelTransform) {
        const origin =
            PcbAssemblyComponentMeshBuilder.#explicitModelOrigin(
                modelTransform
            ) ||
            PcbAssemblyComponentMeshBuilder.#alignedModelOrigin(
                mesh,
                modelTransform?.originAlignment
            )

        return origin
            ? PcbAssemblyComponentMeshBuilder.#translateMesh3d(mesh, {
                  x: -origin.x,
                  y: -origin.y,
                  z: -origin.z
              })
            : mesh
    }

    /**
     * Resolves an explicit model origin.
     * @param {object} modelTransform Model transform metadata.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #explicitModelOrigin(modelTransform) {
        const origin = modelTransform?.originPositionMil
        if (!origin) {
            return null
        }

        return {
            x: Number(origin.x || 0),
            y: Number(origin.y || 0),
            z: Number(origin.z || 0)
        }
    }

    /**
     * Resolves an inferred model origin from alignment metadata.
     * @param {object} mesh Mesh data.
     * @param {string | undefined} alignment Origin alignment.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #alignedModelOrigin(mesh, alignment) {
        const value = String(alignment || '').toLowerCase()
        if (!value) {
            return null
        }

        const bounds = PcbAssemblyComponentMeshBuilder.#meshBounds3d(mesh)
        if (!Number.isFinite(bounds.minX + bounds.maxX)) {
            return null
        }

        const center = {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
            z: (bounds.minZ + bounds.maxZ) / 2
        }
        if (value === 'center') {
            return center
        }
        if (value === 'center_of_component_on_board_surface') {
            return {
                x: center.x,
                y: center.y,
                z: bounds.minZ
            }
        }
        return null
    }

    /**
     * Fits a mesh to an optional target size.
     * @param {object} mesh Mesh data.
     * @param {object} modelTransform Model transform metadata.
     * @returns {object}
     */
    static #fitMeshToTarget(mesh, modelTransform) {
        const target = modelTransform?.targetSizeMil
        if (!target) {
            return mesh
        }

        const bounds = PcbAssemblyComponentMeshBuilder.#meshBounds3d(mesh)
        const size = {
            x: bounds.maxX - bounds.minX,
            y: bounds.maxY - bounds.minY,
            z: bounds.maxZ - bounds.minZ
        }
        const scale = {
            x: size.x > 0 ? Number(target.x || 0) / size.x : 1,
            y: size.y > 0 ? Number(target.y || 0) / size.y : 1,
            z: size.z > 0 ? Number(target.z || 0) / size.z : 1
        }

        if (
            !Number.isFinite(scale.x) ||
            !Number.isFinite(scale.y) ||
            !Number.isFinite(scale.z) ||
            scale.x <= 0 ||
            scale.y <= 0 ||
            scale.z <= 0
        ) {
            return mesh
        }

        if (String(modelTransform?.objectFit || '') === 'fill_bounds') {
            return PcbAssemblyComponentMeshBuilder.#scaleMesh(mesh, scale)
        }

        const uniformScale = Math.min(scale.x, scale.y, scale.z)
        return PcbAssemblyComponentMeshBuilder.#scaleMesh(mesh, {
            x: uniformScale,
            y: uniformScale,
            z: uniformScale
        })
    }

    /**
     * Applies a model board-normal direction.
     * @param {object} mesh Mesh data.
     * @param {string | undefined} direction Board normal direction.
     * @returns {object}
     */
    static #applyBoardNormalDirection(mesh, direction) {
        const rotation =
            PcbAssemblyComponentMeshBuilder.#boardNormalRotation(direction)
        return rotation
            ? PcbAssemblyComponentMeshBuilder.#rotateMesh(mesh, rotation, false)
            : mesh
    }

    /**
     * Resolves a rotation that maps the model's board-normal axis to export Z.
     * @param {string | undefined} direction Board normal direction.
     * @returns {{ x?: number, y?: number, z?: number } | null}
     */
    static #boardNormalRotation(direction) {
        switch (String(direction || '').toLowerCase()) {
            case 'x+':
                return { y: -90 }
            case 'x-':
                return { y: 90 }
            case 'y+':
                return { x: 90 }
            case 'y-':
                return { x: -90 }
            case 'z-':
                return { x: 180 }
            default:
                return null
        }
    }

    /**
     * Applies per-axis mesh scale.
     * @param {object} mesh Mesh data.
     * @param {{ x?: number, y?: number, z?: number }} scale Scale factors.
     * @returns {object}
     */
    static #scaleMesh(mesh, scale) {
        return {
            ...mesh,
            vertices: PcbAssemblyComponentMeshBuilder.#array(
                mesh?.vertices
            ).map((vertex) => [
                Number(vertex?.[0] || 0) * (Number(scale?.x) || 1),
                Number(vertex?.[1] || 0) * (Number(scale?.y) || 1),
                Number(vertex?.[2] || 0) * (Number(scale?.z) || 1)
            ])
        }
    }

    /**
     * Applies model-local rotation.
     * @param {object} mesh Mesh data.
     * @param {{ x?: number, y?: number, z?: number }} rotationDeg Rotation angles.
     * @param {boolean} [invert] Whether to use legacy inverted rotation signs.
     * @returns {object}
     */
    static #rotateMesh(mesh, rotationDeg, invert = true) {
        const sign = invert ? -1 : 1
        return {
            ...mesh,
            vertices: PcbAssemblyComponentMeshBuilder.#array(
                mesh?.vertices
            ).map((vertex) =>
                PcbAssemblyComponentMeshBuilder.#rotatePoint(
                    {
                        x: Number(vertex?.[0] || 0),
                        y: Number(vertex?.[1] || 0),
                        z: Number(vertex?.[2] || 0)
                    },
                    {
                        x: sign * Number(rotationDeg?.x || 0),
                        y: sign * Number(rotationDeg?.y || 0),
                        z: sign * Number(rotationDeg?.z || 0)
                    }
                )
            )
        }
    }

    /**
     * Rotates one point around X, Y, then Z.
     * @param {{ x: number, y: number, z: number }} point Source point.
     * @param {{ x?: number, y?: number, z?: number }} rotationDeg Rotation angles.
     * @returns {number[]}
     */
    static #rotatePoint(point, rotationDeg) {
        const afterX = PcbAssemblyComponentMeshBuilder.#rotatePointX(
            point,
            Number(rotationDeg.x || 0)
        )
        const afterY = PcbAssemblyComponentMeshBuilder.#rotatePointY(
            afterX,
            Number(rotationDeg.y || 0)
        )
        const afterZ = PcbAssemblyComponentMeshBuilder.#rotatePointZ(
            afterY,
            Number(rotationDeg.z || 0)
        )
        return [afterZ.x, afterZ.y, afterZ.z]
    }

    /**
     * Rotates a point around X.
     * @param {{ x: number, y: number, z: number }} point Source point.
     * @param {number} angleDeg Angle in degrees.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #rotatePointX(point, angleDeg) {
        const angle = (angleDeg * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return {
            x: point.x,
            y: point.y * cos - point.z * sin,
            z: point.y * sin + point.z * cos
        }
    }

    /**
     * Rotates a point around Y.
     * @param {{ x: number, y: number, z: number }} point Source point.
     * @param {number} angleDeg Angle in degrees.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #rotatePointY(point, angleDeg) {
        const angle = (angleDeg * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return {
            x: point.x * cos + point.z * sin,
            y: point.y,
            z: -point.x * sin + point.z * cos
        }
    }

    /**
     * Rotates a point around Z.
     * @param {{ x: number, y: number, z: number }} point Source point.
     * @param {number} angleDeg Angle in degrees.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #rotatePointZ(point, angleDeg) {
        const angle = (angleDeg * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos,
            z: point.z
        }
    }

    /**
     * Translates mesh vertices in 3D.
     * @param {object} mesh Mesh data.
     * @param {{ x?: number, y?: number, z?: number }} offset Translation.
     * @returns {object}
     */
    static #translateMesh3d(mesh, offset) {
        return {
            ...mesh,
            vertices: PcbAssemblyComponentMeshBuilder.#array(
                mesh?.vertices
            ).map((vertex) => [
                Number(vertex?.[0] || 0) + Number(offset?.x || 0),
                Number(vertex?.[1] || 0) + Number(offset?.y || 0),
                Number(vertex?.[2] || 0) + Number(offset?.z || 0)
            ])
        }
    }

    /**
     * Computes 3D mesh bounds.
     * @param {object} mesh Mesh data.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }}
     */
    static #meshBounds3d(mesh) {
        return PcbAssemblyComponentMeshBuilder.#array(mesh?.vertices).reduce(
            (bounds, vertex) => ({
                minX: Math.min(bounds.minX, Number(vertex?.[0] || 0)),
                maxX: Math.max(bounds.maxX, Number(vertex?.[0] || 0)),
                minY: Math.min(bounds.minY, Number(vertex?.[1] || 0)),
                maxY: Math.max(bounds.maxY, Number(vertex?.[1] || 0)),
                minZ: Math.min(bounds.minZ, Number(vertex?.[2] || 0)),
                maxZ: Math.max(bounds.maxZ, Number(vertex?.[2] || 0))
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity,
                minZ: Infinity,
                maxZ: -Infinity
            }
        )
    }

    /**
     * Resolves model-local scale.
     * @param {object} modelTransform Model transform metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelScale(modelTransform) {
        const scale = modelTransform?.scale || {}
        return {
            x: Number(scale.x ?? 1) || 1,
            y: Number(scale.y ?? 1) || 1,
            z: Number(scale.z ?? 1) || 1
        }
    }

    /**
     * Resolves model-local offset.
     * @param {object} modelTransform Model transform metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelOffset(modelTransform) {
        const offset = modelTransform?.offsetMil || {}
        return {
            x: Number(offset.x ?? modelTransform?.dxMil ?? 0),
            y: Number(offset.y ?? modelTransform?.dyMil ?? 0),
            z: Number(offset.z ?? modelTransform?.dzMil ?? 0)
        }
    }

    /**
     * Resolves opacity metadata to preserve in exported materials.
     * @param {object} placement Component placement or fallback component.
     * @param {object} mesh Mesh metadata.
     * @returns {{ opacity?: number }}
     */
    static #placementOpacity(placement, mesh) {
        const opacity = Number(mesh?.opacity ?? placement?.bodyOpacity)
        return Number.isFinite(opacity) && opacity > 0 && opacity < 1
            ? { opacity }
            : {}
    }

    /**
     * Adds a format-specific component model diagnostic.
     * @param {object} placement Component placement.
     * @param {object[]} diagnostics Mutable diagnostics list.
     * @returns {void}
     */
    static #appendModelDiagnostic(placement, diagnostics) {
        const format = String(
            placement?.externalModel?.format || ''
        ).toLowerCase()
        if (format === 'wrl' || format === 'vrml') {
            diagnostics.push(
                PcbAssemblyComponentMeshBuilder.#diagnostic(
                    'info',
                    'component_wrl_faceted_step',
                    'Converted WRL model for ' +
                        String(placement?.designator || 'component') +
                        ' as faceted geometry.'
                )
            )
            return
        }

        if (format === 'step' || format === 'stp') {
            diagnostics.push(
                PcbAssemblyComponentMeshBuilder.#diagnostic(
                    'info',
                    'component_step_faceted_export',
                    'Included STEP model for ' +
                        String(placement?.designator || 'component') +
                        ' through export mesh geometry.'
                )
            )
        }
    }

    /**
     * Adds diagnostics for components without resolved external models.
     * @param {{ components?: object[], externalPlacements?: object[] }} sceneDescription Scene description.
     * @param {object[]} diagnostics Mutable diagnostics list.
     * @returns {void}
     */
    static #appendMissingModelDiagnostics(sceneDescription, diagnostics) {
        const placementDesignators = new Set(
            PcbAssemblyComponentMeshBuilder.#array(
                sceneDescription?.externalPlacements
            )
                .map((placement) => String(placement?.designator || '').trim())
                .filter(Boolean)
        )

        PcbAssemblyComponentMeshBuilder.#array(
            sceneDescription?.components
        ).forEach((component) => {
            const designator = String(component?.designator || '').trim()
            if (
                !designator ||
                component?.externalModel ||
                placementDesignators.has(designator)
            ) {
                return
            }

            diagnostics.push(
                PcbAssemblyComponentMeshBuilder.#diagnostic(
                    'warning',
                    'component_model_missing',
                    'No resolved 3D model was available for ' + designator + '.'
                )
            )
        })
    }

    /**
     * Creates a normalized diagnostic object.
     * @param {string} severity Diagnostic severity.
     * @param {string} code Diagnostic code.
     * @param {string} message User-facing message.
     * @returns {object}
     */
    static #diagnostic(severity, code, message) {
        return { severity, code, message }
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate value.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }
}
