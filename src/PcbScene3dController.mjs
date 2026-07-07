import { PcbModelArchiveExporter } from './PcbModelArchiveExporter.mjs'
import { PcbScene3dAdjustmentControlBinder } from './PcbScene3dAdjustmentControlBinder.mjs'
import { PcbScene3dCircuitJsonAdapter } from './PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dExternalPlacementDefaults } from './PcbScene3dExternalPlacementDefaults.mjs'
import { PcbScene3dInteractionHints } from './PcbScene3dInteractionHints.mjs'
import { PcbScene3dRuntime } from './PcbScene3dRuntime.mjs'
import { PcbScene3dSelectionInspectorRenderer } from './PcbScene3dSelectionInspectorRenderer.mjs'
import { PcbScene3dSelectionIndexBuilder } from './PcbScene3dSelectionIndexBuilder.mjs'
import { PcbScene3dSelectionVisibilityBinder } from './PcbScene3dSelectionVisibilityBinder.mjs'
import { PcbScene3dText } from './PcbScene3dText.mjs'

/**
 * Wires the 3D scene shell to a runtime implementation.
 */
export class PcbScene3dController {
    /** @type {HTMLElement | null} */
    #viewportNode

    /** @type {any} */
    #documentModel

    /** @type {HTMLElement | null} */
    #rootNode

    /** @type {HTMLElement | null} */
    #diagnosticsNode

    /** @type {HTMLElement | null} */
    #selectionNode

    /** @type {HTMLElement | null} */
    #adjustmentHostNode

    /** @type {PcbScene3dAdjustmentControlBinder | null} */
    #adjustmentControls

    /** @type {PcbScene3dSelectionVisibilityBinder | null} */
    #visibilityControls
    /** @type {Array<{ node: EventTarget, type: string, listener: (event: any) => void }>} */
    #listeners

    /** @type {Map<string, { component: any | null, externalPlacement: any | null, staticBodyPlacement: any | null }>} */
    #selectionIndex

    /** @type {Map<string, { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }>} */
    #componentAdjustments

    /** @type {string} */
    #selectedComponentKey

    /** @type {any | null} */
    #runtime

    /** @type {any | null} */
    #sceneDescription

    /** @type {{ prepareScene?: (documentModel: any, sessionAssets?: any[]) => Promise<any>, dispose?: () => void } | null} */
    #scenePrepClient

    /** @type {(options: { archiveBaseName?: string, sceneDescription?: any }) => Promise<{ archiveName: string, archiveBytes: Uint8Array, exportedEntries: any[], skippedEntries: any[] }>} */
    #exportArchive

    /** @type {(archiveName: string, archiveBytes: Uint8Array) => Promise<void> | void} */
    #downloadArchive

    /** @type {(visible: boolean) => void} */
    #setLoadingVisible

    /** @type {(key: string) => string} */
    #translate

    /** @type {boolean} */
    #renderAdjustmentControlsInSelection

    /** @type {boolean} */
    #autoSearchMissingModels

    /** @type {string} */
    #documentId

    /** @type {((change: { documentId: string, componentKey: string, source?: string }) => void) | null} */
    #onComponentSelectionChange

    /** @type {boolean} */
    #isDisposed

    /**
     * @param {HTMLElement} viewportNode
     * @param {any} documentModel
     * @param {{ rootNode?: HTMLElement | null, documentId?: string, onComponentSelectionChange?: ((change: { documentId: string, componentKey: string, source?: string }) => void) | null, sessionAssets?: any[], autoSearchMissingModels?: boolean, circuitJson?: object[], sceneDescription?: any, buildScene?: (documentModel: any, options: { modelRegistry: any }) => any, createModelRegistry?: (documentModel: any, sessionAssets: any[]) => any, createRuntime?: (viewportNode: HTMLElement, sceneDescription: any, hooks: { setDiagnostics: (messages: string[]) => void, setSelection: (selection: any | null) => void, translate?: ((key: string) => string) | null }) => { setPreset?: (preset: string) => void, setToggle?: (toggleName: string, enabled: boolean) => void, dispose?: () => void, whenReady?: () => Promise<void> | void }, scenePrepClient?: { prepareScene?: (documentModel: any, sessionAssets?: any[]) => Promise<any>, dispose?: () => void } | null, exportArchive?: (options: { archiveBaseName?: string, sceneDescription?: any }) => Promise<{ archiveName: string, archiveBytes: Uint8Array, exportedEntries: any[], skippedEntries: any[] }>, downloadArchive?: (archiveName: string, archiveBytes: Uint8Array) => Promise<void> | void, renderAdjustmentControlsInSelection?: boolean, setLoadingVisible?: (visible: boolean) => void, translate?: ((key: string) => string) | null }} [options]
     */
    constructor(viewportNode, documentModel, options = {}) {
        this.#viewportNode = viewportNode
        this.#documentModel = documentModel
        this.#rootNode =
            options.rootNode ||
            (typeof viewportNode.closest === 'function'
                ? viewportNode.closest('.scene-3d')
                : null)
        this.#diagnosticsNode = this.#rootNode?.querySelector(
            '.scene-3d__diagnostics'
        )
        this.#selectionNode = this.#rootNode?.querySelector(
            '.scene-3d__selection'
        )
        this.#adjustmentHostNode = null
        this.#listeners = []
        this.#scenePrepClient = options.scenePrepClient || null
        this.#sceneDescription = null
        this.#exportArchive =
            options.exportArchive ||
            ((exportOptions) =>
                PcbModelArchiveExporter.buildArchive(exportOptions))
        this.#downloadArchive =
            options.downloadArchive ||
            ((archiveName, archiveBytes) =>
                PcbScene3dController.#triggerArchiveDownload(
                    archiveName,
                    archiveBytes
                ))
        this.#setLoadingVisible = options.setLoadingVisible || (() => {})
        this.#translate = PcbScene3dText.createTranslator(
            options.translate || null
        )
        this.#renderAdjustmentControlsInSelection =
            options.renderAdjustmentControlsInSelection !== false
        this.#autoSearchMissingModels =
            options.autoSearchMissingModels !== false
        this.#documentId = String(options.documentId || '')
        this.#onComponentSelectionChange =
            typeof options.onComponentSelectionChange === 'function'
                ? options.onComponentSelectionChange
                : null
        this.#isDisposed = false
        this.#runtime = null
        this.#selectionIndex = new Map()
        this.#componentAdjustments = new Map()
        this.#selectedComponentKey = ''
        this.#adjustmentControls = new PcbScene3dAdjustmentControlBinder({
            resolveDesignator: () => this.#selectedComponentKey,
            resolveCurrentAdjustment: (designator) =>
                this.#resolveCurrentAdjustment(designator),
            resolveBaselineAdjustment: (designator) =>
                this.#resolveBaselineAdjustment(designator),
            setAdjustment: (designator, adjustment) => {
                this.#componentAdjustments.set(designator, adjustment)
            },
            deleteAdjustment: (designator) => {
                this.#componentAdjustments.delete(designator)
            },
            applyRuntimeAdjustment: (designator, adjustment) => {
                this.#runtime?.setComponentAdjustment?.(designator, adjustment)
            },
            setSelectionHighlightSuppressed: (suppressed) => {
                this.#runtime?.setSelectedDesignator?.(
                    suppressed ? '' : this.#selectedComponentKey
                )
            },
            refreshSelection: (designator, sourceType) => {
                this.#setSelection({
                    designator,
                    sourceType:
                        sourceType ||
                        this.#resolveSelectionSourceType(designator)
                })
            }
        })
        this.#visibilityControls = new PcbScene3dSelectionVisibilityBinder({
            resolveDesignator: () => this.#selectedComponentKey,
            resolveHidden: (designator) =>
                Boolean(this.#runtime?.isComponentHidden?.(designator)),
            setHidden: (designator, hidden) => {
                this.#runtime?.setComponentHidden?.(designator, hidden)
            },
            refreshSelection: (designator, source) => {
                this.#setSelection({
                    designator,
                    sourceType:
                        source || this.#resolveSelectionSourceType(designator)
                })
            }
        })
        this.#bindPresets()
        this.#setActivePresetButton('isometric')
        this.#bindToggles()
        this.#bindExportAction()
        this.#adjustmentControls.bindSelectionNode(this.#selectionNode)
        this.#visibilityControls.bindSelectionNode(this.#selectionNode)
        this.#setSelection(null)
        this.#setLoadingVisible(true)
        const circuitJsonModel = PcbScene3dController.#resolveCircuitJsonModel(
            options,
            this.#documentModel
        )
        if (circuitJsonModel) {
            this.#initializePreparedScene(circuitJsonModel, options)
            return
        }

        if (options.sceneDescription) {
            this.#initializePreparedScene(options.sceneDescription, options)
            return
        }

        if (this.#scenePrepClient?.prepareScene) {
            this.#initializeScene(options)
            return
        }

        this.#initializeSceneSync(options)
    }

    /**
     * Mounts an already-prepared scene description.
     * @param {any} sceneDescription Prepared scene description.
     * @param {{ createRuntime?: (viewportNode: HTMLElement, sceneDescription: any, hooks: { setDiagnostics: (messages: string[]) => void, setSelection: (selection: any | null) => void }) => { setPreset?: (preset: string) => void, setToggle?: (toggleName: string, enabled: boolean) => void, dispose?: () => void, whenReady?: () => Promise<void> | void } }} options Controller options.
     * @returns {void}
     */
    #initializePreparedScene(sceneDescription, options) {
        try {
            this.#mountScene(sceneDescription, options)
            Promise.resolve(this.#runtime?.whenReady?.()).finally(() => {
                if (this.#isDisposed) {
                    return
                }

                this.#setLoadingVisible(false)
            })
        } catch (error) {
            this.#setDiagnostics([
                this.#translate('scene3d.startFailed') +
                    ' ' +
                    String(error?.message || error || 'Unknown error.')
            ])
            this.#setLoadingVisible(false)
        }
    }

    /**
     * Returns the mounted document model.
     * @returns {any}
     */
    getDocumentModel() {
        return this.#documentModel
    }

    /**
     * Updates the selected component on the mounted runtime.
     * @param {string} componentKey Selected component key.
     * @returns {void}
     */
    setSelectedComponent(componentKey) {
        const designator = String(componentKey || '').trim()
        this.#selectedComponentKey = designator
        this.#applySelectedComponent()
    }

    /**
     * Updates app-discovered model visibility without remounting the scene.
     * @param {boolean} enabled Whether app-discovered models should be shown.
     * @returns {void}
     */
    setAutoSearchMissingModels(enabled) {
        const nextEnabled = enabled === true
        if (this.#autoSearchMissingModels === nextEnabled) {
            return
        }

        this.#autoSearchMissingModels = nextEnabled
        this.#runtime?.setToggle?.(
            'model-search-models',
            this.#autoSearchMissingModels
        )
    }

    /**
     * Sets an external host for selected-component transform controls.
     * @param {HTMLElement | null} hostNode Sidebar or app-owned controls host.
     * @returns {void}
     */
    setAdjustmentHost(hostNode) {
        const nextHost =
            hostNode && typeof hostNode === 'object' ? hostNode : null
        if (this.#adjustmentHostNode === nextHost) {
            this.#renderAdjustmentHost()
            return
        }

        this.#adjustmentHostNode = nextHost
        this.#adjustmentControls?.setHost(this.#adjustmentHostNode)
        this.#setSelection(
            this.#selectedComponentKey
                ? {
                      designator: this.#selectedComponentKey,
                      sourceType: this.#resolveSelectionSourceType(
                          this.#selectedComponentKey
                      )
                  }
                : null
        )
    }

    /**
     * Releases event listeners and runtime resources.
     * @returns {void}
     */
    dispose() {
        this.#isDisposed = true
        this.#listeners.forEach(({ node, type, listener }) => {
            node.removeEventListener?.(type, listener)
        })
        this.#listeners = []
        this.#scenePrepClient?.dispose?.()
        this.#scenePrepClient = null
        this.#adjustmentControls?.dispose()
        this.#adjustmentControls = null
        this.#visibilityControls?.dispose()
        this.#visibilityControls = null
        this.#runtime?.dispose?.()
        this.#runtime = null
        this.#sceneDescription = null
        this.#viewportNode = null
        this.#documentModel = null
        this.#rootNode = null
        this.#diagnosticsNode = null
        this.#selectionNode = null
        this.#adjustmentHostNode = null
        this.#selectedComponentKey = ''
        this.#exportArchive = async () => ({
            archiveName: '',
            archiveBytes: new Uint8Array(),
            exportedEntries: [],
            skippedEntries: []
        })
        this.#downloadArchive = async () => {}
        this.#selectionIndex = new Map()
        this.#componentAdjustments = new Map()
    }

    /**
     * Builds the scene description, mounts the runtime, and settles loading
     * only after the runtime is fully ready.
     * @param {{ sessionAssets?: any[], buildScene?: (documentModel: any, options: { modelRegistry: any }) => any, createRuntime?: (viewportNode: HTMLElement, sceneDescription: any, hooks: { setDiagnostics: (messages: string[]) => void, setSelection: (selection: any | null) => void }) => { setPreset?: (preset: string) => void, setToggle?: (toggleName: string, enabled: boolean) => void, dispose?: () => void, whenReady?: () => Promise<void> | void } }} options
     * @returns {Promise<void>}
     */
    async #initializeScene(options) {
        try {
            const sceneDescription =
                await this.#prepareSceneDescription(options)
            if (this.#isDisposed || !this.#viewportNode) {
                return
            }

            this.#mountScene(sceneDescription, options)
            await this.#runtime?.whenReady?.()
            if (this.#isDisposed) {
                return
            }

            this.#setLoadingVisible(false)
        } catch (error) {
            if (this.#isDisposed) {
                return
            }

            this.#setDiagnostics([
                this.#translate('scene3d.startFailed') +
                    ' ' +
                    String(error?.message || error || 'Unknown error.')
            ])
            this.#setLoadingVisible(false)
        }
    }

    /**
     * Initializes the local fallback scene path synchronously so the existing
     * non-worker controller behavior remains unchanged.
     * @param {{ sessionAssets?: any[], buildScene?: (documentModel: any, options: { modelRegistry: any }) => any, createRuntime?: (viewportNode: HTMLElement, sceneDescription: any, hooks: { setDiagnostics: (messages: string[]) => void, setSelection: (selection: any | null) => void }) => { setPreset?: (preset: string) => void, setToggle?: (toggleName: string, enabled: boolean) => void, dispose?: () => void, whenReady?: () => Promise<void> | void } }} options
     * @returns {void}
     */
    #initializeSceneSync(options) {
        try {
            const sceneDescription = this.#prepareSceneDescriptionSync(options)
            this.#mountScene(sceneDescription, options)
            Promise.resolve(this.#runtime?.whenReady?.()).finally(() => {
                if (this.#isDisposed) {
                    return
                }

                this.#setLoadingVisible(false)
            })
        } catch (error) {
            this.#setDiagnostics([
                this.#translate('scene3d.startFailed') +
                    ' ' +
                    String(error?.message || error || 'Unknown error.')
            ])
            this.#setLoadingVisible(false)
        }
    }

    /**
     * Prepares the scene description either through the dedicated worker
     * client or the local fallback path.
     * @param {{ sessionAssets?: any[], buildScene?: (documentModel: any, options: { modelRegistry: any }) => any }} options
     * @returns {Promise<any>}
     */
    async #prepareSceneDescription(options) {
        if (this.#scenePrepClient?.prepareScene) {
            try {
                return await this.#scenePrepClient.prepareScene(
                    this.#documentModel,
                    options.sessionAssets || []
                )
            } catch (_error) {
                // Fall back to the local path when the dedicated 3D worker is
                // unavailable so the tab still renders.
            }
        }

        return this.#prepareSceneDescriptionSync(options)
    }

    /**
     * Prepares the local fallback scene description synchronously.
     * @param {{ sessionAssets?: any[], buildScene?: (documentModel: any, options: { modelRegistry: any }) => any }} options
     * @returns {any}
     */
    #prepareSceneDescriptionSync(options) {
        const buildScene = options.buildScene
        if (typeof buildScene !== 'function') {
            throw new Error(
                'PcbScene3dController requires buildScene, sceneDescription, or scenePrepClient.'
            )
        }

        const modelRegistry =
            typeof options.createModelRegistry === 'function'
                ? options.createModelRegistry(
                      this.#documentModel,
                      options.sessionAssets || []
                  )
                : null

        return buildScene(this.#documentModel, {
            modelRegistry
        })
    }

    /**
     * Mounts the runtime for one prepared scene description.
     * @param {any} sceneDescription
     * @param {{ createRuntime?: (viewportNode: HTMLElement, sceneDescription: any, hooks: { setDiagnostics: (messages: string[]) => void, setSelection: (selection: any | null) => void, translate?: ((key: string) => string) | null }) => { setPreset?: (preset: string) => void, setToggle?: (toggleName: string, enabled: boolean) => void, dispose?: () => void, whenReady?: () => Promise<void> | void } }} options
     * @returns {void}
     */
    #mountScene(sceneDescription, options) {
        const renderModel =
            PcbScene3dController.#normalizeSceneDescription(sceneDescription)
        this.#sceneDescription = renderModel
        this.#selectionIndex =
            PcbScene3dSelectionIndexBuilder.build(renderModel)
        const createRuntime =
            options.createRuntime ||
            ((nextViewportNode, nextSceneDescription, hooks) =>
                new PcbScene3dRuntime(
                    nextViewportNode,
                    nextSceneDescription,
                    hooks
                ))

        this.#runtime = createRuntime(this.#viewportNode, renderModel, {
            setDiagnostics: (messages) => this.#setDiagnostics(messages),
            setSelection: (selection) =>
                this.#handleRuntimeSelection(selection),
            translate: this.#translate
        })
        this.#applyInitialToggles()
        if (!this.#autoSearchMissingModels) {
            this.#runtime?.setToggle?.('model-search-models', false)
        }
        if (this.#selectedComponentKey) {
            this.#applySelectedComponent()
        }
    }

    /**
     * Binds toolbar camera preset buttons.
     * @returns {void}
     */
    #bindPresets() {
        const buttons =
            this.#rootNode?.querySelectorAll('[data-scene-3d-preset]') || []

        buttons.forEach((button) => {
            const listener = () => {
                const presetName =
                    button?.getAttribute?.('data-scene-3d-preset') || ''
                this.#setActivePresetButton(presetName)
                this.#runtime?.setPreset?.(presetName)
            }

            button.addEventListener?.('click', listener)
            this.#listeners.push({
                node: button,
                type: 'click',
                listener
            })
        })
    }

    /**
     * Marks exactly one preset button as active in the 3D toolbar.
     * @param {string} activePreset
     * @returns {void}
     */
    #setActivePresetButton(activePreset) {
        const normalizedPreset = String(activePreset || '')
            .trim()
            .toLowerCase()
        const buttons =
            this.#rootNode?.querySelectorAll('[data-scene-3d-preset]') || []

        buttons.forEach((button) => {
            const presetName = String(
                button?.getAttribute?.('data-scene-3d-preset') || ''
            )
                .trim()
                .toLowerCase()
            const isActive =
                Boolean(normalizedPreset) && presetName === normalizedPreset

            button?.setAttribute?.('aria-pressed', isActive ? 'true' : 'false')
            if (isActive) {
                button?.classList?.add?.('is-active')
                return
            }

            button?.classList?.remove?.('is-active')
        })
    }

    /**
     * Binds detail toggle controls.
     * @returns {void}
     */
    #bindToggles() {
        const toggles =
            this.#rootNode?.querySelectorAll('[data-scene-3d-toggle]') || []

        toggles.forEach((toggle) => {
            const listener = () => {
                const toggleName =
                    toggle?.getAttribute?.('data-scene-3d-toggle') || ''
                this.#runtime?.setToggle?.(toggleName, Boolean(toggle.checked))
            }

            toggle.addEventListener?.('change', listener)
            this.#listeners.push({
                node: toggle,
                type: 'change',
                listener
            })
        })
    }

    /**
     * Synchronizes runtime visibility with the shell's initial checkbox state.
     * @returns {void}
     */
    #applyInitialToggles() {
        const toggles =
            this.#rootNode?.querySelectorAll('[data-scene-3d-toggle]') || []

        toggles.forEach((toggle) => {
            const toggleName =
                toggle?.getAttribute?.('data-scene-3d-toggle') || ''
            if (!toggleName) {
                return
            }

            this.#runtime?.setToggle?.(toggleName, Boolean(toggle.checked))
        })
    }

    /**
     * Binds the model archive export action.
     * @returns {void}
     */
    #bindExportAction() {
        const exportButton = this.#rootNode?.querySelector(
            '[data-scene-3d-export="models-zip"]'
        )
        if (!exportButton) {
            return
        }

        const listener = async () => {
            await this.#handleExportAction()
        }

        exportButton.addEventListener?.('click', listener)
        this.#listeners.push({
            node: exportButton,
            type: 'click',
            listener
        })
    }

    /**
     * Exports the currently resolved 3D model set as one ZIP archive.
     * @returns {Promise<void>}
     */
    async #handleExportAction() {
        if (!this.#sceneDescription) {
            this.#setDiagnostics([this.#translate('scene3d.stillPreparing')])
            return
        }

        try {
            const archiveResult = await this.#exportArchive({
                archiveBaseName: PcbScene3dController.#resolveArchiveBaseName(
                    this.#documentModel
                ),
                sceneDescription: this.#sceneDescription
            })

            if (this.#isDisposed) {
                return
            }

            const exportedCount = Array.isArray(archiveResult?.exportedEntries)
                ? archiveResult.exportedEntries.length
                : 0
            const skippedCount = Array.isArray(archiveResult?.skippedEntries)
                ? archiveResult.skippedEntries.length
                : 0

            if (!exportedCount) {
                this.#setDiagnostics([
                    this.#translate('scene3d.noModelsForExport')
                ])
                return
            }

            await this.#downloadArchive(
                String(archiveResult?.archiveName || ''),
                archiveResult?.archiveBytes instanceof Uint8Array
                    ? archiveResult.archiveBytes
                    : new Uint8Array()
            )

            if (this.#isDisposed) {
                return
            }

            const noun =
                exportedCount === 1
                    ? this.#translate('scene3d.modelFile')
                    : this.#translate('scene3d.modelFiles')
            const skippedSummary =
                skippedCount > 0
                    ? ' ' +
                      this.#translate('scene3d.skipped') +
                      ' ' +
                      skippedCount +
                      ' ' +
                      this.#translate('scene3d.unresolved') +
                      ' ' +
                      (skippedCount === 1
                          ? this.#translate('scene3d.entry')
                          : this.#translate('scene3d.entries')) +
                      '.'
                    : ''
            this.#setDiagnostics([
                this.#translate('scene3d.downloaded') +
                    ' ' +
                    exportedCount +
                    ' ' +
                    noun +
                    ' ' +
                    this.#translate('scene3d.to') +
                    ' ' +
                    String(archiveResult.archiveName || 'model archive') +
                    '.' +
                    skippedSummary
            ])
        } catch (error) {
            if (this.#isDisposed) {
                return
            }

            this.#setDiagnostics([
                this.#translate('scene3d.exportFailed') +
                    ' ' +
                    String(error?.message || error || 'Unknown error.')
            ])
        }
    }

    /**
     * Renders diagnostic messages into the scene panel.
     * @param {string[]} messages
     * @returns {void}
     */
    #setDiagnostics(messages) {
        if (!this.#diagnosticsNode) {
            return
        }

        const list = Array.isArray(messages) ? messages.filter(Boolean) : []
        this.#diagnosticsNode.textContent = list.length
            ? list.join(' ')
            : PcbScene3dInteractionHints.resolveDefaultMessage(
                  globalThis.window,
                  this.#translate
              )
    }

    /**
     * Updates the inspector and forwards direct 3D picks into shared state.
     * @param {{ designator?: string, sourceType?: string } | null} selection
     * @returns {void}
     */
    #handleRuntimeSelection(selection) {
        this.#setSelection(selection)
        const designator = String(selection?.designator || '').trim()
        this.#selectedComponentKey = designator
        this.#onComponentSelectionChange?.({
            documentId: this.#documentId,
            componentKey: designator,
            source: '3d-scene'
        })
    }

    /**
     * Applies the stored selected component to the mounted runtime and
     * inspector, if any selection is active.
     * @returns {void}
     */
    #applySelectedComponent() {
        this.#runtime?.setSelectedDesignator?.(this.#selectedComponentKey)
        this.#setSelection(
            this.#selectedComponentKey
                ? {
                      designator: this.#selectedComponentKey,
                      sourceType: this.#resolveSelectionSourceType(
                          this.#selectedComponentKey
                      )
                  }
                : null
        )
    }

    /**
     * Renders the selected component details into the inspector panel.
     * @param {{ designator?: string, sourceType?: string } | null} selection
     * @returns {void}
     */
    #setSelection(selection) {
        const designator = String(selection?.designator || '').trim()
        if (!designator) {
            if (this.#selectionNode) {
                this.#selectionNode.innerHTML =
                    PcbScene3dSelectionInspectorRenderer.renderEmpty(
                        this.#translate
                    )
            }
            this.#renderAdjustmentHost(null)
            return
        }

        const selectionEntry = this.#selectionIndex.get(designator)
        if (!selectionEntry) {
            if (this.#selectionNode) {
                this.#selectionNode.innerHTML =
                    PcbScene3dSelectionInspectorRenderer.renderMissing(
                        designator,
                        this.#translate
                    )
            }
            this.#renderAdjustmentHost({
                designator,
                selectionEntry: null
            })
            return
        }

        const adjustment = this.#resolveCurrentAdjustment(designator)
        if (this.#selectionNode) {
            this.#selectionNode.innerHTML =
                PcbScene3dSelectionInspectorRenderer.renderSelected({
                    designator,
                    hidden: Boolean(
                        this.#runtime?.isComponentHidden?.(designator)
                    ),
                    selection,
                    selectionEntry,
                    adjustment,
                    includeControls:
                        this.#renderAdjustmentControlsInSelection &&
                        !this.#adjustmentHostNode,
                    translate: this.#translate
                })
        }
        this.#renderAdjustmentHost({
            designator,
            selection,
            selectionEntry,
            adjustment
        })
    }

    /**
     * Renders selected component transform controls into the external host.
     * @param {{ designator?: string, selection?: { sourceType?: string } | null, selectionEntry?: { component: any | null, externalPlacement: any | null, staticBodyPlacement?: any | null } | null, adjustment?: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } } } | null} state Selection state.
     * @returns {void}
     */
    #renderAdjustmentHost(state = null) {
        if (!this.#adjustmentHostNode) {
            return
        }

        const designator = String(
            state?.designator || this.#selectedComponentKey || ''
        ).trim()
        if (!designator) {
            this.#adjustmentHostNode.innerHTML =
                PcbScene3dSelectionInspectorRenderer.renderControlsEmpty(
                    this.#translate
                )
            return
        }

        const selectionEntry =
            state?.selectionEntry === undefined
                ? this.#selectionIndex.get(designator)
                : state.selectionEntry
        if (!selectionEntry) {
            this.#adjustmentHostNode.innerHTML =
                PcbScene3dSelectionInspectorRenderer.renderControlsMissing(
                    designator,
                    this.#translate
                )
            return
        }

        this.#adjustmentHostNode.innerHTML =
            PcbScene3dSelectionInspectorRenderer.renderControlsPanel({
                designator,
                adjustment:
                    state?.adjustment ||
                    this.#resolveCurrentAdjustment(designator),
                translate: this.#translate
            })
    }

    /**
     * Resolves the current in-memory adjustment for one component.
     * @param {string} designator Component designator.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    #resolveCurrentAdjustment(designator) {
        return (
            this.#componentAdjustments.get(designator) ||
            this.#resolveBaselineAdjustment(designator)
        )
    }

    /**
     * Resolves the original transform shown before any live edits.
     * @param {string} designator Component designator.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    #resolveBaselineAdjustment(designator) {
        return PcbScene3dSelectionInspectorRenderer.resolveBaseline(
            this.#selectionIndex,
            designator
        )
    }

    /**
     * Resolves the current source type label for one selected component.
     * @param {string} designator Component designator.
     * @returns {string}
     */
    #resolveSelectionSourceType(designator) {
        const selectionEntry = this.#selectionIndex.get(designator)
        if (selectionEntry?.externalPlacement) {
            return 'external-model'
        }
        if (selectionEntry?.component) {
            return 'component'
        }
        if (selectionEntry?.staticBodyPlacement) {
            return 'static-body'
        }

        return 'component'
    }

    /**
     * Finds a CircuitJSON model supplied either explicitly or as the document.
     * @param {{ circuitJson?: object[] }} options Controller options.
     * @param {any} documentModel Mounted document model.
     * @returns {object[] | null}
     */
    static #resolveCircuitJsonModel(options, documentModel) {
        if (
            PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(options.circuitJson)
        ) {
            return options.circuitJson
        }
        if (
            PcbScene3dCircuitJsonAdapter.isDirectCircuitJsonModel(documentModel)
        ) {
            return documentModel
        }
        return null
    }

    /**
     * Converts direct CircuitJSON inputs into the renderer scene model.
     * @param {any} sceneDescription Scene description or CircuitJSON model.
     * @returns {any}
     */
    static #normalizeSceneDescription(sceneDescription) {
        const normalizedScene =
            PcbScene3dCircuitJsonAdapter.isDirectCircuitJsonModel(
                sceneDescription
            )
                ? PcbScene3dCircuitJsonAdapter.build(sceneDescription)
                : sceneDescription

        return PcbScene3dExternalPlacementDefaults.apply(normalizedScene)
    }

    /**
     * Resolves one archive base name from the mounted document metadata.
     * @param {{ summary?: { title?: string }, fileName?: string } | null} documentModel
     * @returns {string}
     */
    static #resolveArchiveBaseName(documentModel) {
        const summaryTitle = String(documentModel?.summary?.title || '').trim()
        if (summaryTitle) {
            return summaryTitle
        }

        const fileName = String(documentModel?.fileName || '').trim()
        if (fileName) {
            return fileName.replace(/\.[^.]+$/, '')
        }

        return 'pcb-models'
    }

    /**
     * Triggers one browser download for the generated archive.
     * @param {string} archiveName
     * @param {Uint8Array} archiveBytes
     * @returns {Promise<void>}
     */
    static async #triggerArchiveDownload(archiveName, archiveBytes) {
        if (
            !archiveName ||
            !(archiveBytes instanceof Uint8Array) ||
            !archiveBytes.length ||
            !globalThis?.document ||
            !globalThis?.URL
        ) {
            return
        }

        const anchor = globalThis.document.createElement?.('a')
        if (!anchor) {
            return
        }

        const objectUrl = globalThis.URL.createObjectURL(
            new Blob([archiveBytes], {
                type: 'application/zip'
            })
        )

        try {
            anchor.href = objectUrl
            anchor.download = archiveName
            anchor.click?.()
        } finally {
            globalThis.URL.revokeObjectURL?.(objectUrl)
        }
    }
}
