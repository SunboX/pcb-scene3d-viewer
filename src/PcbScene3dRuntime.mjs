import { PcbScene3dBoardSolderMaskFactory } from './PcbScene3dBoardSolderMaskFactory.mjs'
import { PcbScene3dCameraRig } from './PcbScene3dCameraRig.mjs'
import { PcbScene3dCircuitJsonAdapter } from './PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dComponentVisibility } from './PcbScene3dComponentVisibility.mjs'
import { PcbScene3dComponentAdjustment } from './PcbScene3dComponentAdjustment.mjs'
import { PcbScene3dComponentAdjustmentRegistry } from './PcbScene3dComponentAdjustmentRegistry.mjs'
import { PcbScene3dCompanionBasePlacementAdjuster } from './PcbScene3dCompanionBasePlacementAdjuster.mjs'
import { PcbScene3dCopperDetailGroupBuilder } from './PcbScene3dCopperDetailGroupBuilder.mjs'
import { PcbScene3dCopperFactory } from './PcbScene3dCopperFactory.mjs'
import { PcbScene3dDetailCoordinateNormalizer } from './PcbScene3dDetailCoordinateNormalizer.mjs'
import { PcbScene3dDrillVoidFactory } from './PcbScene3dDrillVoidFactory.mjs'
import { PcbScene3dExternalCompanionFallback } from './PcbScene3dExternalCompanionFallback.mjs'
import { PcbScene3dExternalModels } from './PcbScene3dExternalModels.mjs'
import { PcbScene3dFallbackBodyFactory } from './PcbScene3dFallbackBodyFactory.mjs'
import { PcbScene3dFallbackVisibility } from './PcbScene3dFallbackVisibility.mjs'
import { PcbScene3dInteractionHints } from './PcbScene3dInteractionHints.mjs'
import { PcbScene3dModelSearchPlacement } from './PcbScene3dModelSearchPlacement.mjs'
import { PcbScene3dPresetState } from './PcbScene3dPresetState.mjs'
import { PcbScene3dRenderGroupVisibility } from './PcbScene3dRenderGroupVisibility.mjs'
import { PcbScene3dRenderScheduler } from './PcbScene3dRenderScheduler.mjs'
import { PcbScene3dRuntimeBoardMeshes } from './PcbScene3dRuntimeBoardMeshes.mjs'
import { PcbScene3dSilkscreenChunkedFactory } from './PcbScene3dSilkscreenChunkedFactory.mjs'
import { PcbScene3dTrueTypeTextFactory } from './PcbScene3dTrueTypeTextFactory.mjs'
import { PcbScene3dSelectionResolver } from './PcbScene3dSelectionResolver.mjs'
import { PcbScene3dSelectionStyler } from './PcbScene3dSelectionStyler.mjs'
import { PcbScene3dStaticBodyFactory } from './PcbScene3dStaticBodyFactory.mjs'
import { PcbScene3dViewportResize } from './PcbScene3dViewportResize.mjs'
import { PcbScene3dViewScale } from './PcbScene3dViewScale.mjs'
const SILKSCREEN_COPPER_CLEARANCE_MIL = 0.12
const Z_MIL = {
    cu: 0.05,
    silk:
        PcbScene3dCopperFactory.visualHalfThicknessMil() +
        SILKSCREEN_COPPER_CLEARANCE_MIL
}
/**
 * Browser-side Three.js runtime for the interactive PCB 3D viewport.
 */
export class PcbScene3dRuntime {
    #viewportNode
    #sceneDescription
    #placementSceneDescription
    #hooks
    #toggles
    #groups
    #listeners
    #three
    #renderer
    #scene
    #camera
    #orbitControlsClass
    #controls
    #resizeObserver
    #rootGroup
    #viewOrientationGroup
    #raycaster
    #pointer
    #pointerDownPosition
    #selectionRoots
    #hiddenComponentDesignators
    #componentAdjustmentRegistry
    #fallbackBodyRoots
    #loadedExternalModelDesignators
    #modelSearchExternalModelRoots
    #hasLoadedBoardAssemblyModel
    #selectedDesignator
    #initialRadius
    #presetState
    #isDisposed
    #readyPromise
    #resolveReadyPromise
    #hasSettledReady
    #renderScheduler
    /**
     * @param {HTMLElement} viewportNode
     * @param {any} sceneDescription Scene description or CircuitJSON model.
     * @param {{ setDiagnostics?: (messages: string[]) => void, setSelection?: (selection: any | null) => void, loadRuntimeModules?: () => Promise<{ THREE: any, OrbitControls: any }>, translate?: ((key: string) => string) | null }} [hooks]
     */
    constructor(viewportNode, sceneDescription, hooks = {}) {
        const renderModel =
            PcbScene3dRuntime.#normalizeSceneDescription(sceneDescription)
        this.#viewportNode = viewportNode
        this.#sceneDescription = renderModel
        this.#placementSceneDescription =
            PcbScene3dCompanionBasePlacementAdjuster.adjust(renderModel)
        this.#hooks = hooks
        this.#toggles = {
            'external-models': true,
            'fallback-bodies': false,
            'model-search-models': true,
            copper: true
        }
        this.#groups = new Map()
        this.#listeners = []
        this.#three = null
        this.#renderer = null
        this.#scene = null
        this.#camera = null
        this.#orbitControlsClass = null
        this.#controls = null
        this.#resizeObserver = null
        this.#rootGroup = null
        this.#viewOrientationGroup = null
        this.#raycaster = null
        this.#pointer = null
        this.#pointerDownPosition = null
        this.#selectionRoots = new Map()
        this.#hiddenComponentDesignators = new Set()
        this.#componentAdjustmentRegistry =
            new PcbScene3dComponentAdjustmentRegistry(() => this.#three)
        this.#fallbackBodyRoots = new Map()
        this.#loadedExternalModelDesignators = new Set()
        this.#modelSearchExternalModelRoots = new Set()
        this.#hasLoadedBoardAssemblyModel = false
        this.#selectedDesignator = ''
        this.#initialRadius =
            PcbScene3dCameraRig.resolveInitialRadius(renderModel)
        this.#presetState = new PcbScene3dPresetState()
        this.#isDisposed = false
        this.#hasSettledReady = false
        this.#renderScheduler = new PcbScene3dRenderScheduler(() => {
            if (!this.#isDisposed) {
                this.#render()
            }
        })
        this.#resolveReadyPromise = null
        this.#readyPromise = new Promise((resolve) => {
            this.#resolveReadyPromise = resolve
        })
        this.#hooks.setDiagnostics?.([
            PcbScene3dInteractionHints.resolveDefaultMessage(
                globalThis.window,
                this.#hooks.translate || null
            )
        ])
        this.#initialize()
    }
    /** @param {string} preset */
    setPreset(preset) {
        const normalizedPreset = this.#presetState.set(preset)
        this.#applyViewScale(normalizedPreset)
        PcbScene3dInteractionHints.configureControls(
            this.#controls,
            this.#three,
            normalizedPreset
        )
        if (!this.#camera) {
            return
        }
        PcbScene3dCameraRig.applyPreset(
            this.#camera,
            this.#controls,
            normalizedPreset,
            this.#sceneDescription
        )
        this.#render()
    }
    /** @param {string} toggleName @param {boolean} enabled */
    setToggle(toggleName, enabled) {
        if (!(toggleName in this.#toggles)) {
            return
        }
        this.#toggles[toggleName] = enabled
        this.#applyToggleVisibility()
        this.#render()
    }
    /** @param {string} designator */
    setSelectedDesignator(designator) {
        this.#setSelectedDesignator(designator)
    }
    /** @param {string} designator @param {boolean} hidden */
    setComponentHidden(designator, hidden) {
        if (
            !PcbScene3dComponentVisibility.setHidden(
                this.#hiddenComponentDesignators,
                designator,
                hidden
            )
        ) {
            return
        }
        this.#applyToggleVisibility()
        this.#render()
    }
    /** @param {string} designator @returns {boolean} */
    isComponentHidden(designator) {
        return PcbScene3dComponentVisibility.isHidden(
            this.#hiddenComponentDesignators,
            designator
        )
    }
    /**
     * Applies a live model-local adjustment to one component.
     * @param {string} designator Component designator.
     * @param {{ scale?: { x?: number, y?: number, z?: number }, rotationDeg?: { x?: number, y?: number, z?: number }, offsetMil?: { x?: number, y?: number, z?: number } }} adjustment Transform adjustment.
     * @returns {void}
     */
    setComponentAdjustment(designator, adjustment) {
        if (this.#componentAdjustmentRegistry.set(designator, adjustment)) {
            this.#render()
        }
    }
    /**
     * Resolves when the runtime has completed its initial async
     * initialization and deferred scene settlement.
     * @returns {Promise<void>}
     */
    whenReady() {
        return this.#readyPromise
    }
    /** @returns {void} */
    dispose() {
        this.#isDisposed = true
        this.#renderScheduler.cancel()
        this.#listeners.forEach(({ node, type, listener }) => {
            node.removeEventListener?.(type, listener)
        })
        this.#listeners = []
        this.#controls?.dispose?.()
        this.#resizeObserver?.disconnect?.()
        this.#renderer?.dispose?.()
        if (this.#renderer?.domElement?.remove) {
            this.#renderer.domElement.remove()
        }
        this.#viewportNode = null
        this.#sceneDescription = null
        this.#renderer = null
        this.#scene = null
        this.#camera = null
        this.#orbitControlsClass = null
        this.#controls = null
        this.#resizeObserver = null
        this.#rootGroup = null
        this.#viewOrientationGroup = null
        this.#raycaster = null
        this.#pointer = null
        this.#pointerDownPosition = null
        this.#selectionRoots.clear()
        this.#hiddenComponentDesignators.clear()
        this.#componentAdjustmentRegistry.clear()
        this.#fallbackBodyRoots.clear()
        this.#loadedExternalModelDesignators.clear()
        this.#modelSearchExternalModelRoots.clear()
        this.#hasLoadedBoardAssemblyModel = false
        this.#selectedDesignator = ''
        this.#groups.clear()
        this.#settleReady()
    }

    /**
     * Initializes the async Three.js scene.
     * @returns {Promise<void>}
     */
    async #initialize() {
        if (
            typeof window === 'undefined' ||
            typeof document === 'undefined' ||
            !this.#viewportNode
        ) {
            this.#settleReady()
            return
        }

        try {
            const { THREE, OrbitControls } =
                (await this.#hooks.loadRuntimeModules?.()) ||
                (await PcbScene3dRuntime.#loadThreeRuntimeModules())
            this.#three = THREE
            this.#orbitControlsClass = OrbitControls
            if (this.#isDisposed || !this.#viewportNode) {
                return
            }

            this.#createRenderer()
            this.#createSceneGraph()
            this.#createControls()
            this.#bindSelectionInteraction()
            this.#applyToggleVisibility()
            this.#render()
            await this.#loadDeferredDetail()
            this.#settleReady()
        } catch (error) {
            this.#hooks.setDiagnostics?.([
                '3D preview could not start: ' +
                    String(error?.message || error || 'Unknown error.')
            ])
            this.#settleReady()
        }
    }

    /**
     * Creates the Three.js renderer, camera, and scene.
     * @returns {void}
     */
    #createRenderer() {
        const THREE = this.#three
        const size = PcbScene3dViewportResize.resolveSize(this.#viewportNode)

        this.#renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        })
        this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this.#renderer.setSize(size.width, size.height, false)
        this.#renderer.domElement.className = 'scene-3d__canvas'
        this.#renderer.domElement.style.width = '100%'
        this.#renderer.domElement.style.height = '100%'

        this.#scene = new THREE.Scene()
        this.#camera = new THREE.PerspectiveCamera(
            38,
            size.width / size.height,
            10,
            Math.max(this.#initialRadius * 30, 25000)
        )
        this.#camera.up.set(0, 0, 1)
        this.#viewportNode?.replaceChildren(this.#renderer.domElement)
    }

    /**
     * Creates the initial board shell, fallback bodies, and placeholder detail
     * groups used by the deferred loading stages.
     * @returns {void}
     */
    #createSceneGraph() {
        const THREE = this.#three
        const board = this.#sceneDescription.board

        this.#viewOrientationGroup = new THREE.Group()
        this.#scene.add(this.#viewOrientationGroup)
        this.#rootGroup = new THREE.Group()
        this.#viewOrientationGroup.add(this.#rootGroup)
        this.#applyViewScale(this.#presetState.get())
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.8)
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
        keyLight.position.set(0.8, 0.7, 1.3).multiplyScalar(this.#initialRadius)
        const fillLight = new THREE.DirectionalLight(0xe8f3ff, 0.9)
        fillLight.position
            .set(-0.9, -0.4, 0.8)
            .multiplyScalar(this.#initialRadius * 0.8)
        this.#scene.add(ambientLight, keyLight, fillLight)
        const boardGroup = new THREE.Group()
        boardGroup.add(
            PcbScene3dRuntimeBoardMeshes.buildBoardMesh(
                THREE,
                this.#sceneDescription,
                (x, y) => this.#normalizeDetailPoint(x, y)
            )
        )
        boardGroup.add(
            PcbScene3dBoardSolderMaskFactory.buildGroup(
                THREE,
                this.#sceneDescription,
                (x, y) => this.#normalizeDetailPoint(x, y)
            )
        )
        boardGroup.add(
            PcbScene3dDrillVoidFactory.buildGroup(
                THREE,
                this.#sceneDescription.detail,
                board.thicknessMil / 2,
                -board.thicknessMil / 2,
                (x, y) => this.#normalizeDetailPoint(x, y),
                {
                    enabled: Boolean(this.#sceneDescription.boardAssemblyModel),
                    board
                }
            )
        )
        boardGroup.add(
            PcbScene3dRuntimeBoardMeshes.buildBoardOutline(
                THREE,
                this.#sceneDescription,
                (x, y) => this.#normalizeDetailPoint(x, y)
            )
        )
        this.#groups.set('board', boardGroup)
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide(
            this.#three,
            boardGroup,
            this.#presetState.get(),
            this.#sceneDescription
        )
        this.#rootGroup.add(boardGroup)
        const silkscreenGroup = new THREE.Group()
        this.#groups.set('silkscreen', silkscreenGroup)
        this.#rootGroup.add(silkscreenGroup)
        const copperGroup = new THREE.Group()
        this.#groups.set('copper', copperGroup)
        this.#rootGroup.add(copperGroup)
        const fallbackBodiesGroup = new THREE.Group()
        const staticBodiesGroup = new THREE.Group()
        const externalModelsGroup = new THREE.Group()
        this.#sceneDescription.components.forEach((component) => {
            if (component?.renderFallbackBody === false) {
                return
            }

            const isCompanionBase =
                PcbScene3dExternalCompanionFallback.shouldKeepFallback(
                    this.#sceneDescription,
                    component
                )
            const fallbackBody = PcbScene3dFallbackBodyFactory.build(
                THREE,
                component,
                { companionBase: isCompanionBase }
            )
            if (isCompanionBase) {
                fallbackBody.rootGroup.userData.scene3dFallbackExternalCompanion = true
            }
            fallbackBodiesGroup.add(fallbackBody.rootGroup)
            PcbScene3dFallbackVisibility.registerFallbackRoot(
                this.#fallbackBodyRoots,
                component?.designator,
                fallbackBody.rootGroup
            )
            this.#registerSelectionRoot(
                component?.designator,
                fallbackBody.rootGroup
            )
            this.#componentAdjustmentRegistry.register(
                component?.designator,
                fallbackBody.adjustmentGroup
            )
        })
        PcbScene3dStaticBodyFactory.buildMany(
            THREE,
            this.#placementSceneDescription.staticBodyPlacements
        ).forEach((staticBody) => {
            staticBodiesGroup.add(staticBody.rootGroup)
            this.#registerSelectionRoot(
                staticBody.placement?.designator,
                staticBody.rootGroup
            )
            this.#componentAdjustmentRegistry.register(
                staticBody.placement?.designator,
                staticBody.adjustmentGroup
            )
        })
        this.#groups.set('fallback-bodies', fallbackBodiesGroup)
        this.#groups.set('static-bodies', staticBodiesGroup)
        this.#groups.set('external-models', externalModelsGroup)
        this.#rootGroup.add(fallbackBodiesGroup)
        this.#rootGroup.add(staticBodiesGroup)
        this.#rootGroup.add(externalModelsGroup)
        const boardSpan = Math.max(board.widthMil, board.heightMil, 1)
        this.#scene.fog = new THREE.Fog(
            0xf4f0ea,
            boardSpan * 2.2,
            boardSpan * 7
        )
    }

    /**
     * Applies the active preset's scene-scale transform.
     * @param {string} preset
     * @returns {void}
     */
    #applyViewScale(preset) {
        if (!this.#viewOrientationGroup) return
        const scale = PcbScene3dRuntime.resolveViewScale(
            preset,
            this.#sceneDescription
        )
        this.#viewOrientationGroup.scale.set(scale.x, scale.y, scale.z)
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide(
            this.#three,
            this.#groups.get('board'),
            preset,
            this.#sceneDescription
        )
        PcbScene3dExternalModels.applyViewCompensation(
            this.#groups.get('silkscreen'),
            scale
        )
        PcbScene3dExternalModels.applyViewCompensation(
            this.#groups.get('external-models'),
            scale
        )
    }

    /**
     * Loads silkscreen, copper, and external model detail after the initial
     * shell render and keeps readiness pending until settlement completes.
     * @returns {Promise<void>}
     */
    async #loadDeferredDetail() {
        try {
            await PcbScene3dRuntime.#yieldToNextFrame()
            if (this.#isDisposed) {
                return
            }

            await this.#loadDeferredSilkscreen()
            this.#render()

            await PcbScene3dRuntime.#yieldToNextFrame()
            if (this.#isDisposed) {
                return
            }

            this.#loadDeferredCopper()
            this.#applyToggleVisibility()
            this.#render()
            this.#settleReady()
            await PcbScene3dRuntime.#yieldToNextFrame()
            if (this.#isDisposed) {
                return
            }

            await this.#loadExternalModels()
            if (this.#isDisposed) {
                return
            }

            this.#render()
        } catch (error) {
            if (this.#isDisposed) {
                return
            }

            this.#hooks.setDiagnostics?.([
                'Deferred 3D detail could not finish loading: ' +
                    String(error?.message || error || 'Unknown error.')
            ])
            this.#render()
        }
    }

    /**
     * Builds and attaches silkscreen detail once after the first frame.
     * @returns {Promise<void>}
     */
    async #loadDeferredSilkscreen() {
        const silkscreenGroup = this.#groups.get('silkscreen')
        if (!silkscreenGroup || silkscreenGroup.children.length) return

        await PcbScene3dTrueTypeTextFactory.prepareEmbeddedFonts(
            this.#sceneDescription.detail.embeddedFonts || []
        )
        const topZ = this.#sceneDescription.board.thicknessMil / 2 + Z_MIL.silk
        const detailGroup = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
            this.#three,
            this.#sceneDescription.detail.silkscreen || {},
            topZ,
            -topZ,
            (x, y) => this.#normalizeDetailPoint(x, y),
            {
                shouldContinue: () => !this.#isDisposed,
                yieldToMain: () => PcbScene3dRuntime.#yieldToNextFrame()
            }
        )
        if (this.#isDisposed) return
        if (detailGroup.children.length) {
            silkscreenGroup.add(detailGroup)
            this.#applyViewScale(this.#presetState.get())
        }
    }

    /**
     * Builds and attaches copper and via detail once after the first frame.
     * @returns {void}
     */
    #loadDeferredCopper() {
        const copperGroup = this.#groups.get('copper')
        if (!copperGroup || copperGroup.children.length) {
            return
        }
        const topZ = this.#sceneDescription.board.thicknessMil / 2 + Z_MIL.cu
        const detailGroup = PcbScene3dCopperDetailGroupBuilder.build(
            this.#three,
            this.#sceneDescription,
            topZ,
            (x, y) => this.#normalizeDetailPoint(x, y)
        )

        if (detailGroup.children.length) {
            copperGroup.add(detailGroup)
            this.#applyViewScale(this.#presetState.get())
        }
    }

    /**
     * Attempts to load any resolved external 3D models.
     * @returns {Promise<void>}
     */
    async #loadExternalModels() {
        const externalModelsGroup = this.#groups.get('external-models')
        if (!externalModelsGroup) {
            return
        }

        const diagnostics = await PcbScene3dExternalModels.loadIntoScene({
            three: this.#three,
            sceneDescription: this.#placementSceneDescription,
            externalModelsGroup,
            modelViewScale: PcbScene3dRuntime.resolveViewScale(
                this.#presetState.get(),
                this.#sceneDescription
            ),
            isDisposed: () => this.#isDisposed,
            onPlacementGroup: (placement, placementGroup) => {
                this.#registerSelectionRoot(
                    placement?.designator,
                    placementGroup
                )
                PcbScene3dComponentAdjustment.findTargets(
                    placementGroup
                ).forEach((target) => {
                    this.#componentAdjustmentRegistry.register(
                        placement?.designator,
                        target
                    )
                })
                PcbScene3dModelSearchPlacement.registerRoot(
                    placement,
                    placementGroup,
                    this.#modelSearchExternalModelRoots
                )
                if (
                    String(placement?.sourceType || '').toLowerCase() ===
                    'board-assembly'
                ) {
                    this.#hasLoadedBoardAssemblyModel = true
                } else {
                    PcbScene3dFallbackVisibility.markExternalModelLoaded(
                        this.#loadedExternalModelDesignators,
                        placement?.designator
                    )
                }
                this.#applyToggleVisibility()
            }
        })

        if (diagnostics.length) {
            this.#hooks.setDiagnostics?.(diagnostics)
        }
    }

    /**
     * Creates and configures orbit/pan/zoom controls using Three's standard
     * OrbitControls implementation in the same z-up world as the PCB scene.
     * @returns {void}
     */
    #createControls() {
        if (!this.#camera || !this.#renderer || !this.#orbitControlsClass) {
            return
        }

        const THREE = this.#three
        const domElement = this.#renderer?.domElement
        if (!domElement) {
            return
        }

        this.#controls = new this.#orbitControlsClass(this.#camera, domElement)
        this.#controls.enableDamping = false
        this.#controls.screenSpacePanning = true
        this.#controls.minDistance = 140
        this.#controls.maxDistance = this.#initialRadius * 8
        this.#controls.target.set(0, 0, 0)
        PcbScene3dInteractionHints.configureControls(
            this.#controls,
            THREE,
            this.#presetState.get()
        )

        PcbScene3dCameraRig.applyPreset(
            this.#camera,
            this.#controls,
            this.#presetState.get(),
            this.#sceneDescription
        )

        this.#bindListener(this.#controls, 'change', () => {
            this.#renderScheduler.schedule()
        })
        this.#bindListener(domElement, 'contextmenu', (event) => {
            event.preventDefault?.()
        })
        this.#bindListener(window, 'resize', () => this.#handleResize())
        this.#resizeObserver = PcbScene3dViewportResize.observe(
            globalThis,
            this.#viewportNode,
            () => this.#handleResize()
        )
    }

    /** @returns {void} */
    #bindSelectionInteraction() {
        if (!this.#renderer || !this.#camera || !this.#three) {
            return
        }

        this.#raycaster = new this.#three.Raycaster()
        this.#pointer = new this.#three.Vector2()
        const domElement = this.#renderer.domElement

        this.#bindListener(domElement, 'pointerdown', (event) => {
            if (Number(event?.button) !== 0) {
                return
            }

            this.#pointerDownPosition = {
                x: Number(event?.clientX || 0),
                y: Number(event?.clientY || 0)
            }
        })
        this.#bindListener(domElement, 'pointerup', (event) => {
            if (Number(event?.button) !== 0) {
                return
            }

            if (
                !this.#pointerDownPosition ||
                PcbScene3dRuntime.#resolvePointerTravel(
                    this.#pointerDownPosition,
                    {
                        x: Number(event?.clientX || 0),
                        y: Number(event?.clientY || 0)
                    }
                ) > 4
            ) {
                this.#pointerDownPosition = null
                return
            }

            this.#pointerDownPosition = null
            this.#handleSelectionPointer(event)
        })
    }

    /** @returns {void} */
    #handleResize() {
        if (!this.#renderer || !this.#camera) {
            return
        }

        const size = PcbScene3dViewportResize.resolveSize(this.#viewportNode)
        this.#renderer.setSize(size.width, size.height, false)
        this.#camera.aspect = size.width / size.height
        this.#camera.updateProjectionMatrix()
        this.#controls?.update?.()
        this.#render()
    }

    /** @returns {void} */
    #applyToggleVisibility() {
        PcbScene3dRenderGroupVisibility.apply({
            groups: this.#groups,
            toggles: this.#toggles,
            fallbackBodyRoots: this.#fallbackBodyRoots,
            loadedExternalModelDesignators:
                this.#loadedExternalModelDesignators,
            modelSearchExternalModelRoots: this.#modelSearchExternalModelRoots,
            hasLoadedBoardAssemblyModel: this.#hasLoadedBoardAssemblyModel
        })
        PcbScene3dComponentVisibility.apply({
            selectionRoots: this.#selectionRoots,
            selectedDesignator: this.#selectedDesignator,
            hiddenDesignators: this.#hiddenComponentDesignators,
            fallbackBodyRoots: this.#fallbackBodyRoots,
            loadedExternalModelDesignators:
                this.#loadedExternalModelDesignators,
            modelSearchExternalModelRoots: this.#modelSearchExternalModelRoots,
            toggles: this.#toggles,
            hasLoadedBoardAssemblyModel: this.#hasLoadedBoardAssemblyModel
        })
    }

    /** @returns {void} */
    #render() {
        if (!this.#renderer || !this.#scene || !this.#camera) {
            return
        }

        this.#renderer.render(this.#scene, this.#camera)
    }

    /**
     * Settles the runtime-ready promise exactly once.
     * @returns {void}
     */
    #settleReady() {
        if (this.#hasSettledReady) {
            return
        }
        this.#hasSettledReady = true
        this.#resolveReadyPromise?.()
        this.#resolveReadyPromise = null
    }

    /**
     * Yields one turn so the browser can present the initial rendered frame
     * before deferred detail work continues.
     * @returns {Promise<void>}
     */
    static async #yieldToNextFrame() {
        if (
            typeof window !== 'undefined' &&
            typeof window.requestAnimationFrame === 'function'
        ) {
            await new Promise((resolve) => {
                window.requestAnimationFrame(() => resolve())
            })
            return
        }
        await new Promise((resolve) => {
            globalThis.setTimeout(resolve, 0)
        })
    }

    /**
     * Normalizes one board coordinate into the scene's centered board plane.
     * @param {number} x
     * @param {number} y
     * @returns {{ x: number, y: number }}
     */
    #normalizeBoardPoint(x, y) {
        return {
            x: Number(x || 0) - this.#sceneDescription.board.centerX,
            y: Number(y || 0) - this.#sceneDescription.board.centerY
        }
    }

    /**
     * Normalizes one detail coordinate into the scene's centered board plane.
     * @param {number} x
     * @param {number} y
     * @returns {{ x: number, y: number }}
     */
    #normalizeDetailPoint(x, y) {
        return PcbScene3dDetailCoordinateNormalizer.normalize(
            this.#sceneDescription,
            x,
            y
        )
    }

    /**
     * Binds one runtime event listener for cleanup.
     * @param {EventTarget} node
     * @param {string} type
     * @param {(event: any) => void} listener
     * @returns {void}
     */
    #bindListener(node, type, listener) {
        node.addEventListener?.(type, listener, { passive: false })
        this.#listeners.push({ node, type, listener })
    }

    /**
     * Resolves one click selection from the current pointer event.
     * @param {{ clientX?: number, clientY?: number }} event
     * @returns {void}
     */
    #handleSelectionPointer(event) {
        if (
            !this.#raycaster ||
            !this.#pointer ||
            !this.#camera ||
            !this.#renderer
        ) {
            return
        }

        const rect = this.#renderer.domElement?.getBoundingClientRect?.()
        const width = Math.max(Number(rect?.width || 0), 1)
        const height = Math.max(Number(rect?.height || 0), 1)
        const left = Number(rect?.left || 0)
        const top = Number(rect?.top || 0)

        this.#pointer.x = ((Number(event?.clientX || 0) - left) / width) * 2 - 1
        this.#pointer.y = -(
            ((Number(event?.clientY || 0) - top) / height) * 2 -
            1
        )
        this.#raycaster.setFromCamera(this.#pointer, this.#camera)

        const selectableRoots = [
            this.#groups.get('external-models'),
            this.#groups.get('static-bodies'),
            this.#groups.get('fallback-bodies')
        ].filter((group) => group && group.visible !== false)
        const intersections = this.#raycaster.intersectObjects(
            selectableRoots,
            true
        )
        const selection =
            PcbScene3dSelectionResolver.fromIntersections(intersections)
        this.#setSelectedDesignator(selection?.designator)
        this.#hooks.setSelection?.(selection)
    }

    /** @param {string} designator @param {any} rootObject */
    #registerSelectionRoot(designator, rootObject) {
        PcbScene3dSelectionStyler.registerSelectionRoot(
            this.#selectionRoots,
            designator,
            rootObject
        )

        if (String(designator || '').trim() === this.#selectedDesignator) {
            PcbScene3dSelectionStyler.applySelection(
                this.#selectionRoots,
                '',
                this.#selectedDesignator,
                PcbScene3dRuntime.#resolveSelectionHighlightColor()
            )
        }
    }

    /** @param {string | undefined} designator */
    #setSelectedDesignator(designator) {
        const normalizedDesignator = String(designator || '').trim()
        if (normalizedDesignator === this.#selectedDesignator) {
            return
        }

        PcbScene3dSelectionStyler.applySelection(
            this.#selectionRoots,
            this.#selectedDesignator,
            normalizedDesignator,
            PcbScene3dRuntime.#resolveSelectionHighlightColor()
        )
        this.#selectedDesignator = normalizedDesignator
        this.#render()
    }

    /**
     * Converts direct CircuitJSON inputs into the renderer scene model.
     * @param {any} sceneDescription Scene description or CircuitJSON model.
     * @returns {any}
     */
    static #normalizeSceneDescription(sceneDescription) {
        return PcbScene3dCircuitJsonAdapter.isDirectCircuitJsonModel(
            sceneDescription
        )
            ? PcbScene3dCircuitJsonAdapter.build(sceneDescription)
            : sceneDescription
    }

    /**
     * Loads the browser Three.js runtime modules used by the scene.
     * @returns {Promise<{ THREE: any, OrbitControls: any }>}
     */
    static async #loadThreeRuntimeModules() {
        const versionKey = new URL(import.meta.url).searchParams.get('v') || ''
        const suffix = versionKey ? '?v=' + encodeURIComponent(versionKey) : ''
        const [THREE, { OrbitControls }] = await Promise.all([
            import('/node_modules/three/build/three.module.js' + suffix),
            import(
                '/node_modules/three/examples/jsm/controls/OrbitControls.js' +
                    suffix
            )
        ])
        return { THREE, OrbitControls }
    }

    /**
     * Resolves the scene-scale transform for one named preset.
     * @param {string} preset Preset name.
     * @param {{ coordinateSystem?: string } | null} [sceneDescription] Scene coordinate metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static resolveViewScale(preset, sceneDescription = null) {
        return PcbScene3dViewScale.resolve(preset, sceneDescription)
    }

    /** @returns {number} */
    static #resolveSelectionHighlightColor() {
        return 0x14c5e6
    }

    /**
     * Resolves the drag travel between two pointer positions.
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @returns {number}
     */
    static #resolvePointerTravel(start, end) {
        const dx = Number(end?.x || 0) - Number(start?.x || 0)
        const dy = Number(end?.y || 0) - Number(start?.y || 0)
        return Math.hypot(dx, dy)
    }
}
