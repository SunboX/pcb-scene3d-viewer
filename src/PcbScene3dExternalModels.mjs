import { PcbScene3dBoardAssemblyPresentation } from './PcbScene3dBoardAssemblyPresentation.mjs'
import { PcbScene3dBoardAssemblyPlacement } from './PcbScene3dBoardAssemblyPlacement.mjs'
import { PcbScene3dBoardAssemblyTransform } from './PcbScene3dBoardAssemblyTransform.mjs'
import { PcbScene3dExternalModelGroupLoader } from './PcbScene3dExternalModelGroupLoader.mjs'
import { PcbScene3dExternalModelOpacity } from './PcbScene3dExternalModelOpacity.mjs'
import { PcbScene3dExternalModelPlacementRepair } from './PcbScene3dExternalModelPlacementRepair.mjs'
import { PcbScene3dExternalModelLoadOrder } from './PcbScene3dExternalModelLoadOrder.mjs'
import { PcbScene3dExternalModelSourceOriginPolicy } from './PcbScene3dExternalModelSourceOriginPolicy.mjs'
import { PcbScene3dExternalPlacementDefaults } from './PcbScene3dExternalPlacementDefaults.mjs'
import { PcbScene3dModelBounds } from './PcbScene3dModelBounds.mjs'
import { PcbScene3dModelIdentity } from './PcbScene3dModelIdentity.mjs'
import { PcbScene3dModelContent } from './PcbScene3dModelContent.mjs'
import { PcbScene3dMountRig } from './PcbScene3dMountRig.mjs'
import { PcbScene3dStepLoader } from './PcbScene3dStepLoader.mjs'
import { PcbScene3dViewCompensation } from './PcbScene3dViewCompensation.mjs'

/**
 * Loads external 3D models into the Three.js PCB scene.
 */
export class PcbScene3dExternalModels {
    /**
     * Loads all available external models into the supplied group.
     * @param {{ three: any, sceneDescription: any, externalModelsGroup: any, modelViewScale?: { x?: number, y?: number, z?: number }, isDisposed?: () => boolean, onPlacementGroup?: (placement: any, placementGroup: any) => void, stepLoader?: PcbScene3dStepLoader, modelLoaderOptions?: object }} options
     * @returns {Promise<string[]>}
     */
    static async loadIntoScene(options) {
        const modelLoaderOptions = PcbScene3dModelContent.createFetchScope(
            options?.modelLoaderOptions
        )
        const placements = PcbScene3dExternalModelLoadOrder.sort(
            PcbScene3dExternalModels.#resolvePlacements(
                options?.sceneDescription
            )
        )
        const externalModelsGroup = options?.externalModelsGroup
        if (!placements.length || !externalModelsGroup || !options?.three) {
            return []
        }

        const diagnostics = []
        const ownsStepLoader = !options?.stepLoader
        const stepLoader = options?.stepLoader || new PcbScene3dStepLoader()
        const cachedModelGroups = new Map()
        let processedPlacements = 0

        try {
            for (const placement of placements) {
                if (options?.isDisposed?.()) {
                    break
                }

                try {
                    const loadedGroup =
                        await PcbScene3dExternalModels.#loadPlacementGroup(
                            options.three,
                            placement,
                            stepLoader,
                            cachedModelGroups,
                            options?.modelViewScale,
                            options?.sceneDescription,
                            modelLoaderOptions
                        )
                    if (!loadedGroup || options?.isDisposed?.()) {
                        continue
                    }
                    externalModelsGroup.add(loadedGroup)
                    PcbScene3dExternalModelPlacementRepair.apply(
                        options.three,
                        options?.sceneDescription,
                        placement,
                        loadedGroup
                    )
                    PcbScene3dExternalModelPlacementRepair.isolatePlacementMaterials(
                        loadedGroup
                    )
                    PcbScene3dExternalModelOpacity.apply(
                        options.three,
                        placement,
                        loadedGroup
                    )
                    options?.onPlacementGroup?.(placement, loadedGroup)
                    processedPlacements += 1
                    if (processedPlacements % 12 === 0) {
                        await PcbScene3dExternalModels.#yieldToMainThread()
                    }
                } catch (error) {
                    if (
                        PcbScene3dExternalModels.#isDeferredContentError(
                            placement,
                            error,
                            modelLoaderOptions
                        )
                    ) {
                        continue
                    }
                    diagnostics.push(
                        'Could not load external model for ' +
                            String(placement?.designator || 'component') +
                            ': ' +
                            String(error?.message || error || 'Unknown error.')
                    )
                }
            }
        } finally {
            if (ownsStepLoader) {
                stepLoader.dispose?.()
            }
        }

        return diagnostics
    }

    /**
     * Returns whether a failure represents an intentionally deferred model.
     * @param {object} placement External-model placement.
     * @param {unknown} error Model loading failure.
     * @param {object} modelLoaderOptions Scoped model loading options.
     * @returns {boolean}
     */
    static #isDeferredContentError(placement, error, modelLoaderOptions) {
        const model = placement?.externalModel
        return Boolean(
            model &&
            PcbScene3dModelContent.isUnavailableError(error) &&
            !PcbScene3dModelContent.hasLocal(model) &&
            !PcbScene3dModelContent.canFetch(modelLoaderOptions)
        )
    }

    /**
     * Applies the active view mirror compensation to loaded model geometry.
     * @param {any} externalModelsGroup Root group containing placed models.
     * @param {{ x?: number, y?: number, z?: number } | null | undefined} viewScale Active scene view scale.
     * @returns {void}
     */
    static applyViewCompensation(externalModelsGroup, viewScale) {
        PcbScene3dViewCompensation.apply(externalModelsGroup, viewScale)
    }

    /**
     * Resolves the external-model placements the runtime should render.
     * @param {{ board?: { widthMil?: number, heightMil?: number, thicknessMil?: number }, boardAssemblyModel?: any, components?: any[], externalPlacements?: any[] }} sceneDescription
     * @returns {any[]}
     */
    static #resolvePlacements(sceneDescription) {
        const renderSceneDescription =
            PcbScene3dExternalPlacementDefaults.apply(sceneDescription)
        const boardAssemblyPlacement = PcbScene3dBoardAssemblyPlacement.build(
            renderSceneDescription
        )
        if (boardAssemblyPlacement) {
            return [boardAssemblyPlacement]
        }

        const explicitPlacements = Array.isArray(
            renderSceneDescription?.externalPlacements
        )
            ? renderSceneDescription.externalPlacements
            : []
        const explicitDesignators = new Set(
            explicitPlacements
                .map((placement) => String(placement?.designator || '').trim())
                .filter(Boolean)
        )
        const fallbackPlacements = Array.isArray(
            renderSceneDescription?.components
        )
            ? renderSceneDescription.components
                  .filter(
                      (component) =>
                          component?.externalModel &&
                          !explicitDesignators.has(
                              String(component?.designator || '').trim()
                          )
                  )
                  .map((component) =>
                      PcbScene3dExternalModels.#buildFallbackPlacement(
                          component
                      )
                  )
            : []

        return [...explicitPlacements, ...fallbackPlacements]
    }

    /**
     * Builds one legacy component placement into the explicit placement shape.
     * @param {{ designator?: string, mountSide?: string, rotationDeg?: number, positionMil?: { x?: number, y?: number, z?: number }, modelTransform?: object, externalModel?: any }} component
     * @returns {any}
     */
    static #buildFallbackPlacement(component) {
        return {
            designator: String(component?.designator || 'component'),
            mountSide: String(component?.mountSide || 'top'),
            rotationDeg: Number(component?.rotationDeg || 0),
            positionMil: {
                x: Number(component?.positionMil?.x || 0),
                y: Number(component?.positionMil?.y || 0),
                z: Number(component?.positionMil?.z || 0)
            },
            bodyPositionMil: { x: 0, y: 0 },
            bodyRotationDeg: 0,
            modelTransform: PcbScene3dExternalModels.#normalizeModelTransform(
                component?.modelTransform
            ),
            externalModel: component?.externalModel || null
        }
    }

    /**
     * Loads one model group for one resolved placement.
     * @param {any} THREE
     * @param {{ mountSide?: string, rotationDeg?: number, positionMil?: { x?: number, y?: number, z?: number }, modelTransform?: object, externalModel?: any }} placement
     * @param {PcbScene3dStepLoader} stepLoader
     * @param {Map<string, any>} cachedModelGroups
     * @param {{ x?: number, y?: number, z?: number } | null | undefined} modelViewScale Active scene view scale.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} modelLoaderOptions Model loader options.
     * @returns {Promise<any>}
     */
    static async #loadPlacementGroup(
        THREE,
        placement,
        stepLoader,
        cachedModelGroups,
        modelViewScale,
        sceneDescription,
        modelLoaderOptions
    ) {
        const model = placement?.externalModel
        if (!model) {
            throw new Error('Placement has no resolved model.')
        }

        const templateGroup =
            await PcbScene3dExternalModels.#loadCachedModelGroup(
                THREE,
                model,
                stepLoader,
                cachedModelGroups,
                modelLoaderOptions
            )

        return PcbScene3dExternalModels.#buildPlacementWrapper(
            THREE,
            placement,
            PcbScene3dExternalModels.#cloneModelGroup(templateGroup),
            modelViewScale,
            sceneDescription
        )
    }

    /**
     * Loads or reuses one model template group for repeated placements that
     * resolve to the same source identity.
     * @param {any} THREE
     * @param {any} model
     * @param {PcbScene3dStepLoader} stepLoader
     * @param {Map<string, any>} cachedModelGroups
     * @param {object | null | undefined} modelLoaderOptions Model loader options.
     * @returns {Promise<any>}
     */
    static async #loadCachedModelGroup(
        THREE,
        model,
        stepLoader,
        cachedModelGroups,
        modelLoaderOptions
    ) {
        const identity = PcbScene3dExternalModels.#resolveModelIdentity(model)
        if (cachedModelGroups.has(identity)) {
            return cachedModelGroups.get(identity)
        }

        const modelGroup = await PcbScene3dExternalModels.#loadModelGroup(
            THREE,
            model,
            stepLoader,
            modelLoaderOptions
        )
        cachedModelGroups.set(identity, modelGroup)

        return modelGroup
    }

    /**
     * Loads one raw model group without placement-specific mount transforms.
     * @param {any} THREE
     * @param {any} model
     * @param {PcbScene3dStepLoader} stepLoader
     * @param {object | null | undefined} modelLoaderOptions Model loader options.
     * @returns {Promise<any>}
     */
    static async #loadModelGroup(THREE, model, stepLoader, modelLoaderOptions) {
        return PcbScene3dExternalModelGroupLoader.load(
            THREE,
            model,
            stepLoader,
            new URL(import.meta.url).searchParams.get('v') || '',
            modelLoaderOptions || {}
        )
    }

    /**
     * Wraps one loaded model group in its placement-specific mount rig.
     * @param {any} THREE
     * @param {{ mountSide?: string, modelTransform?: object, designator?: string }} placement
     * @param {any} modelGroup
     * @param {{ x?: number, y?: number, z?: number } | null | undefined} modelViewScale Active scene view scale.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {any}
     */
    static #buildPlacementWrapper(
        THREE,
        placement,
        modelGroup,
        modelViewScale,
        sceneDescription
    ) {
        if (PcbScene3dExternalModels.#isBoardAssemblyPlacement(placement)) {
            return PcbScene3dExternalModels.#buildBoardAssemblyWrapper(
                THREE,
                placement,
                modelGroup,
                sceneDescription
            )
        }

        const mountRig = PcbScene3dMountRig.create(THREE, placement)
        const wrapperGroup = mountRig.rootGroup
        const viewCompensationGroup = new THREE.Group()
        const adjustmentGroup = new THREE.Group()
        const designator = String(placement?.designator || 'component')
        wrapperGroup.userData.scene3dSelection = {
            designator,
            sourceType: 'external-model'
        }
        const variantGroupKey = String(
            placement?.coLocatedVariantGroupKey || ''
        ).trim()
        if (variantGroupKey) {
            wrapperGroup.userData.scene3dVariantGroupKey = variantGroupKey
        }
        adjustmentGroup.userData.scene3dAdjustmentTarget = true
        adjustmentGroup.userData.scene3dAdjustmentDesignator = designator
        adjustmentGroup.userData.scene3dAdjustmentBaseline =
            PcbScene3dExternalModels.#normalizeModelTransform(
                placement?.modelTransform || {}
            )
        viewCompensationGroup.userData.scene3dViewCompensation = true
        viewCompensationGroup.userData.scene3dSourceFrameScale =
            PcbScene3dExternalModels.#resolveSourceFrameScale(placement)
        viewCompensationGroup.userData.scene3dViewCompensationAxes =
            PcbScene3dExternalModels.#resolveViewCompensationAxes(placement)
        PcbScene3dViewCompensation.applyToGroup(
            viewCompensationGroup,
            modelViewScale
        )
        PcbScene3dExternalModels.#wrapPlacementOrientation(
            wrapperGroup,
            mountRig.orientationGroup,
            viewCompensationGroup
        )
        const modelTransform = placement?.modelTransform || {}
        const modelRotation = modelTransform.rotationDeg || {}
        const modelOffset =
            PcbScene3dExternalModels.#resolveModelOffset(modelTransform)
        const sourceOriginAdjustment =
            PcbScene3dExternalModels.#resolveEmbeddedSourceOriginAdjustment(
                placement,
                modelGroup,
                modelRotation
            )
        const adjustedModelRotation = {
            x:
                Number(modelRotation.x || 0) +
                sourceOriginAdjustment.rotationDeg.x,
            y:
                Number(modelRotation.y || 0) +
                sourceOriginAdjustment.rotationDeg.y,
            z:
                Number(modelRotation.z || 0) +
                sourceOriginAdjustment.rotationDeg.z
        }
        modelGroup.position.set(
            modelOffset.x + sourceOriginAdjustment.offset.x,
            modelOffset.y + sourceOriginAdjustment.offset.y,
            sourceOriginAdjustment.offset.z
        )
        PcbScene3dExternalModels.#applyModelRotation(
            THREE,
            modelGroup,
            adjustedModelRotation
        )
        PcbScene3dExternalModels.#applyModelScale(
            modelGroup,
            PcbScene3dExternalModels.#resolveModelScale(modelTransform)
        )
        PcbScene3dModelBounds.seatOnMountPlane(THREE, modelGroup, {
            sceneDescription,
            placement
        })
        modelGroup.position.z += modelOffset.z
        adjustmentGroup.add(modelGroup)
        mountRig.faceGroup.add(adjustmentGroup)

        return wrapperGroup
    }

    /**
     * Wraps a full board assembly model in board-local scene coordinates.
     * @param {any} THREE
     * @param {{ positionMil?: { x?: number, y?: number, z?: number }, board?: { widthMil?: number, heightMil?: number, thicknessMil?: number }, sourceFrameScale?: { y?: number } }} placement
     * @param {any} modelGroup
     * @param {{ sourceFormat?: string } | null | undefined} sceneDescription Scene description.
     * @returns {any}
     */
    static #buildBoardAssemblyWrapper(
        THREE,
        placement,
        modelGroup,
        sceneDescription
    ) {
        const wrapperGroup = new THREE.Group()
        const positionMil = placement?.positionMil || {}

        PcbScene3dBoardAssemblyPresentation.apply(
            modelGroup,
            placement?.board,
            {
                sourceFormat: sceneDescription?.sourceFormat
            }
        )
        PcbScene3dBoardAssemblyTransform.apply(modelGroup, placement)
        wrapperGroup.position.set(
            Number(positionMil.x || 0),
            Number(positionMil.y || 0),
            Number(positionMil.z || 0)
        )
        wrapperGroup.userData.scene3dPlacementType = 'board-assembly'
        wrapperGroup.add(modelGroup)

        return wrapperGroup
    }

    /**
     * Checks whether one placement represents a full board assembly model.
     * @param {{ sourceType?: string, externalModel?: { origin?: string } }} placement
     * @returns {boolean}
     */
    static #isBoardAssemblyPlacement(placement) {
        return (
            String(placement?.sourceType || '').toLowerCase() ===
                'board-assembly' ||
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'board-assembly'
        )
    }

    /**
     * Places view compensation before footprint orientation so scene mirrors
     * cancel globally instead of reflecting each rotated model locally.
     * @param {any} wrapperGroup Placement root group.
     * @param {any} orientationGroup Placement orientation group.
     * @param {any} viewCompensationGroup View compensation group.
     * @returns {void}
     */
    static #wrapPlacementOrientation(
        wrapperGroup,
        orientationGroup,
        viewCompensationGroup
    ) {
        if (
            typeof wrapperGroup?.remove === 'function' &&
            typeof wrapperGroup?.add === 'function'
        ) {
            wrapperGroup.remove(orientationGroup)
            wrapperGroup.add(viewCompensationGroup)
        } else if (Array.isArray(wrapperGroup?.children)) {
            const orientationIndex =
                wrapperGroup.children.indexOf(orientationGroup)
            if (orientationIndex !== -1) {
                wrapperGroup.children.splice(
                    orientationIndex,
                    1,
                    viewCompensationGroup
                )
            }
        }

        viewCompensationGroup.add(orientationGroup)
    }

    /**
     * Resolves the model source-frame scale applied before footprint rotation.
     * @param {{ externalModel?: { origin?: string } }} placement Placement metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveSourceFrameScale(placement) {
        if (!PcbScene3dExternalModels.#isEmbeddedExternalModel(placement)) {
            return { x: 1, y: 1, z: 1 }
        }

        return { x: 1, y: -1, z: 1 }
    }

    /**
     * Resolves view compensation axes for one placement wrapper.
     * @param {{ externalModel?: { origin?: string } }} placement Placement metadata.
     * @returns {{ x?: boolean, y?: boolean, z?: boolean }}
     */
    static #resolveViewCompensationAxes(placement) {
        if (!PcbScene3dExternalModels.#isEmbeddedExternalModel(placement)) {
            return {}
        }

        return { x: false, y: false, z: false }
    }

    /**
     * Checks whether a placement uses an embedded Altium model source frame.
     * @param {{ externalModel?: { origin?: string } }} placement Placement metadata.
     * @returns {boolean}
     */
    static #isEmbeddedExternalModel(placement) {
        return (
            String(placement?.externalModel?.origin || '').toLowerCase() ===
            'embedded'
        )
    }

    /**
     * Adjusts embedded Altium models whose source geometry is authored with a
     * strong Z-origin bias. A signed X tilt lays those models flat correctly,
     * but source Z becomes lateral board Y. Strongly asymmetric source centers
     * also need an in-plane flip while preserving the body-origin offset
     * already encoded by the source geometry.
     * @param {{ externalModel?: { origin?: string } }} placement Placement metadata.
     * @param {{ userData?: { scene3dSourceBoundsMil?: { centerX?: number, centerZ?: number, sizeX?: number, sizeY?: number, sizeZ?: number } } }} modelGroup Loaded model group.
     * @param {{ x?: number }} modelRotation Model-local rotation.
     * @returns {{ offset: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number } }}
     */
    static #resolveEmbeddedSourceOriginAdjustment(
        placement,
        modelGroup,
        modelRotation
    ) {
        const bounds = modelGroup?.userData?.scene3dSourceBoundsMil || null
        const centerX = Number(bounds?.centerX || 0)
        const centerZ = Number(bounds?.centerZ || 0)
        const maxDimension = Math.max(
            Math.abs(Number(bounds?.sizeX || 0)),
            Math.abs(Number(bounds?.sizeY || 0)),
            Math.abs(Number(bounds?.sizeZ || 0))
        )

        if (
            String(placement?.externalModel?.origin || '').toLowerCase() !==
                'embedded' ||
            PcbScene3dExternalModelSourceOriginPolicy.shouldSkipOwnerAnchoredAdjustment(
                placement
            ) ||
            PcbScene3dExternalModels.#normalizeAngle(modelRotation?.x) !==
                270 ||
            !Number.isFinite(centerX) ||
            !Number.isFinite(centerZ) ||
            !Number.isFinite(maxDimension) ||
            maxDimension <= 0 ||
            Math.abs(centerZ) <= maxDimension * 0.2
        ) {
            return PcbScene3dExternalModels.#emptySourceOriginAdjustment()
        }

        if (Math.abs(centerX) > maxDimension * 0.2) {
            if (centerX * centerZ <= 0) {
                return {
                    offset: { x: centerX * 2, y: -centerZ * 2, z: 0 },
                    rotationDeg: { x: 0, y: 0, z: 180 }
                }
            }

            return {
                offset: { x: 0, y: 0, z: 0 },
                rotationDeg: { x: 0, y: 0, z: 180 }
            }
        }

        if (PcbScene3dExternalModels.#isDominantSourceZExtension(bounds)) {
            return PcbScene3dExternalModels.#emptySourceOriginAdjustment()
        }

        return {
            offset: { x: 0, y: centerZ * 2, z: 0 },
            rotationDeg: { x: 0, y: 0, z: 0 }
        }
    }

    /**
     * Checks whether source Z is the model's intentional edge-extension axis
     * instead of a square-package source-origin bias.
     * @param {{ sizeX?: number, sizeY?: number, sizeZ?: number } | null} bounds Source bounds.
     * @returns {boolean}
     */
    static #isDominantSourceZExtension(bounds) {
        const sourceZ = Math.abs(Number(bounds?.sizeZ || 0))
        const lateralSize = Math.max(
            Math.abs(Number(bounds?.sizeX || 0)),
            Math.abs(Number(bounds?.sizeY || 0))
        )

        return (
            Number.isFinite(sourceZ) &&
            Number.isFinite(lateralSize) &&
            lateralSize > 0 &&
            sourceZ > lateralSize * 2
        )
    }

    /**
     * Returns the neutral embedded-source adjustment shape.
     * @returns {{ offset: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number } }}
     */
    static #emptySourceOriginAdjustment() {
        return {
            offset: { x: 0, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 0, z: 0 }
        }
    }

    /**
     * Normalizes one angle into [0, 360).
     * @param {number | string | undefined} angle Source angle.
     * @returns {number}
     */
    static #normalizeAngle(angle) {
        const normalized = Number(angle || 0) % 360

        return normalized < 0 ? normalized + 360 : normalized
    }

    /**
     * Applies KiCad's 3D model rotation order to one loaded model group.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ x?: number, y?: number, z?: number }} modelRotation Model rotation.
     * @returns {void}
     */
    static #applyModelRotation(THREE, modelGroup, modelRotation) {
        const x = (-Number(modelRotation.x || 0) * Math.PI) / 180
        const y = (-Number(modelRotation.y || 0) * Math.PI) / 180
        const z = (-Number(modelRotation.z || 0) * Math.PI) / 180

        if (THREE?.Matrix4 && modelGroup?.quaternion?.setFromRotationMatrix) {
            const rotationMatrix = new THREE.Matrix4()
                .makeRotationZ(z)
                .multiply(new THREE.Matrix4().makeRotationY(y))
                .multiply(new THREE.Matrix4().makeRotationX(x))

            modelGroup.quaternion.setFromRotationMatrix(rotationMatrix)
            return
        }

        if (!modelGroup?.rotation) {
            return
        }

        modelGroup.rotation.x = x
        modelGroup.rotation.y = y
        modelGroup.rotation.z = z
    }

    /**
     * Normalizes optional model transform metadata.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {{ rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number }, dxMil: number, dyMil: number, dzMil: number, scale: { x: number, y: number, z: number } }}
     */
    static #normalizeModelTransform(modelTransform) {
        const offsetMil =
            PcbScene3dExternalModels.#resolveModelOffset(modelTransform)

        return {
            rotationDeg: {
                x: Number(modelTransform?.rotationDeg?.x || 0),
                y: Number(modelTransform?.rotationDeg?.y || 0),
                z: Number(modelTransform?.rotationDeg?.z || 0)
            },
            offsetMil,
            dxMil: offsetMil.x,
            dyMil: offsetMil.y,
            dzMil: offsetMil.z,
            scale: PcbScene3dExternalModels.#resolveModelScale(modelTransform)
        }
    }

    /**
     * Resolves model offset from current and legacy transform shapes.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveModelOffset(modelTransform) {
        const offsetMil = modelTransform?.offsetMil || {}

        return {
            x: Number(offsetMil.x ?? modelTransform?.dxMil ?? 0),
            y: Number(offsetMil.y ?? modelTransform?.dyMil ?? 0),
            z: Number(offsetMil.z ?? modelTransform?.dzMil ?? 0)
        }
    }

    /**
     * Resolves model scale from current and legacy transform shapes.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveModelScale(modelTransform) {
        const scale = modelTransform?.scale || {}

        return {
            x: Number(scale.x ?? 1) || 1,
            y: Number(scale.y ?? 1) || 1,
            z: Number(scale.z ?? 1) || 1
        }
    }

    /**
     * Applies model scale while preserving importer unit conversion already on
     * the loaded group.
     * @param {any} modelGroup Loaded model group.
     * @param {{ x: number, y: number, z: number }} scale Placement scale.
     * @returns {void}
     */
    static #applyModelScale(modelGroup, scale) {
        if (!modelGroup?.scale) {
            return
        }

        modelGroup.scale.x *= scale.x
        modelGroup.scale.y *= scale.y
        modelGroup.scale.z *= scale.z
    }

    /**
     * Clones one cached model template so per-placement transforms do not
     * mutate the shared base geometry.
     * @param {any} modelGroup
     * @returns {any}
     */
    static #cloneModelGroup(modelGroup) {
        if (typeof modelGroup?.clone === 'function') {
            return modelGroup.clone(true)
        }

        return modelGroup
    }

    /**
     * Resolves one stable cache key for repeated placements of the same model.
     * @param {{ origin?: string, sourceStream?: string, relativePath?: string, name?: string, checksum?: number | null, format?: string }} model
     * @returns {string}
     */
    static #resolveModelIdentity(model) {
        return PcbScene3dModelIdentity.resolve(model)
    }

    /**
     * Yields control back to the browser during long model-placement runs so
     * large boards do not monopolize the main thread.
     * @returns {Promise<void>}
     */
    static async #yieldToMainThread() {
        if (typeof requestAnimationFrame === 'function') {
            await new Promise((resolve) => {
                requestAnimationFrame(() => resolve())
            })
            return
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 0)
        })
    }
}
