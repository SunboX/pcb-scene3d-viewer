import {
    CircuitJsonDocumentContext,
    CircuitJsonUnits
} from 'circuitjson-toolkit'
import { CircuitJsonPcbHolePrimitiveModel } from 'circuitjson-toolkit/extensions'
import { PcbScene3dCircuitJsonGeometry } from './PcbScene3dCircuitJsonGeometry.mjs'
import { PcbScene3dCircuitJsonDrillDetail } from './PcbScene3dCircuitJsonDrillDetail.mjs'
import { PcbScene3dCircuitJsonModelTransform } from './PcbScene3dCircuitJsonModelTransform.mjs'
import { PcbScene3dCircuitJsonCopperPourBuilder } from './PcbScene3dCircuitJsonCopperPourBuilder.mjs'
import { PcbScene3dCircuitJsonCopperTextBuilder } from './PcbScene3dCircuitJsonCopperTextBuilder.mjs'
import { PcbScene3dCircuitJsonSilkscreenDetailBuilder } from './PcbScene3dCircuitJsonSilkscreenDetailBuilder.mjs'
import { PcbScene3dFootprintBodyBuilder } from './PcbScene3dFootprintBodyBuilder.mjs'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'
import { PcbScene3dCircuitJsonInput } from './PcbScene3dCircuitJsonInput.mjs'
import { PcbScene3dCircuitJsonTraceRouteBuilder } from './PcbScene3dCircuitJsonTraceRouteBuilder.mjs'
import { PcbScene3dCircuitJsonThermalSpokeBuilder } from './PcbScene3dCircuitJsonThermalSpokeBuilder.mjs'
import { PcbScene3dCircuitJsonModelUrlResolver } from './PcbScene3dCircuitJsonModelUrlResolver.mjs'
import { PcbScene3dCircuitJsonSolderPasteBuilder } from './PcbScene3dCircuitJsonSolderPasteBuilder.mjs'
import { CircuitJsonCadModelAssetResolver } from './CircuitJsonCadModelAssetResolver.mjs'
import { PcbScene3dDescriptorSafeRecord } from './PcbScene3dDescriptorSafeRecord.mjs'
import { PcbScene3dCircuitJsonModelAsset } from './PcbScene3dCircuitJsonModelAsset.mjs'
import { PcbScene3dCircuitJsonPadCorner } from './PcbScene3dCircuitJsonPadCorner.mjs'

const DEFAULT_COMPONENT_HEIGHT_MIL = 60
const RECTANGULAR_PAD_SHAPE = 2
const CIRCULAR_PAD_SHAPE = 1
const MODEL_URL_FIELDS = [
    ['model_3mf_url', '3mf'],
    ['model_step_url', 'step'],
    ['model_stp_url', 'step'],
    ['model_wrl_url', 'wrl'],
    ['model_vrml_url', 'wrl'],
    ['model_glb_url', 'glb'],
    ['model_gltf_url', 'gltf'],
    ['model_stl_url', 'stl'],
    ['model_obj_url', 'obj']
]

/**
 * Converts serialized CircuitJSON element arrays into the viewer render model.
 */
export class PcbScene3dCircuitJsonAdapter {
    /**
     * Returns true when a value is a serialized CircuitJSON model.
     * @param {unknown} value Candidate model.
     * @returns {boolean}
     */
    static isCircuitJsonModel(value) {
        return PcbScene3dCircuitJsonInput.isModel(value)
    }

    /**
     * Returns true when a model should bypass format-specific scene builders.
     * @param {unknown} value Candidate model.
     * @returns {boolean}
     */
    static isDirectCircuitJsonModel(value) {
        if (!PcbScene3dCircuitJsonAdapter.isCircuitJsonModel(value)) {
            return false
        }

        if (!Array.isArray(value)) return true

        if (
            String(
                PcbScene3dCircuitJsonAdapter.#ownData(value, 'sourceFormat') ||
                    ''
            ) === 'circuitjson'
        ) {
            return true
        }

        return !PcbScene3dCircuitJsonAdapter.#hasCompatibilityModel(value)
    }

    /**
     * Normalizes and validates one candidate through the shared CircuitJSON
     * context while reusing an existing proof and element index.
     * @param {unknown} circuitJson CircuitJSON model, document, or context.
     * @returns {CircuitJsonDocumentContext} Prepared shared context.
     */
    static prepare(circuitJson) {
        return CircuitJsonDocumentContext.prepare(circuitJson, {
            indexes: ['elements']
        })
    }

    /**
     * Builds the internal render model used by the Three.js runtime.
     * @param {unknown} circuitJson CircuitJSON model, document envelope, or prepared context.
     * @param {{ modelUrlResolver?: (url: string, context: object) => string | object | null | undefined, projectBaseUrl?: string, boardDrillQuality?: string, showPcbNotes?: boolean, showPcbPaste?: boolean }} [options] Adapter options.
     * @returns {object}
     */
    static build(circuitJson, options = {}) {
        const context = PcbScene3dCircuitJsonAdapter.prepare(circuitJson)
        const index = context.getIndex('elements')
        const resolvedOptions =
            PcbScene3dCircuitJsonAdapter.#hasExternalModelReferences(index)
                ? CircuitJsonCadModelAssetResolver.withContextAssetResolver(
                      options,
                      context
                  )
                : options
        const board = PcbScene3dCircuitJsonGeometry.buildBoard(
            index,
            resolvedOptions
        )
        const detail = PcbScene3dCircuitJsonAdapter.#buildDetail(
            index,
            resolvedOptions
        )
        const externalPlacements =
            PcbScene3dCircuitJsonAdapter.#buildExternalPlacements(
                index,
                board,
                resolvedOptions
            )
        const externalPlacementByComponentId =
            PcbScene3dCircuitJsonAdapter.#externalPlacementByComponentId(
                externalPlacements
            )
        const cadComponentByComponentId =
            PcbScene3dCircuitJsonAdapter.#elementById(
                index,
                'cad_component',
                'pcb_component_id'
            )
        const components = PcbScene3dCircuitJsonAdapter.#buildComponents(
            index,
            board,
            externalPlacementByComponentId,
            cadComponentByComponentId
        )

        return {
            sourceFormat: context.source?.format || 'circuitjson',
            coordinateSystem: 'circuitjson-mm',
            board,
            components,
            externalPlacements,
            boardAssemblyModel: null,
            detail
        }
    }

    /**
     * Returns whether CAD rows reference models that may need asset lookup.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {boolean}
     */
    static #hasExternalModelReferences(index) {
        return (index.elementsByType.get('cad_component') || []).some(
            (component) =>
                MODEL_URL_FIELDS.some(([field]) =>
                    String(
                        PcbScene3dCircuitJsonAdapter.#ownData(
                            component,
                            field
                        ) || ''
                    ).trim()
                ) ||
                Boolean(
                    PcbScene3dCircuitJsonModelAsset.reference(
                        PcbScene3dCircuitJsonAdapter.#ownData(
                            component,
                            'model_asset'
                        )
                    )
                )
        )
    }

    /**
     * Returns true for parser-produced arrays that already carry a legacy
     * renderer model and must keep using their format-specific scene builder.
     * @param {unknown} value Candidate model.
     * @returns {boolean}
     */
    static #hasCompatibilityModel(value) {
        return ['pcb', 'schematic', 'bom'].some((name) =>
            Boolean(PcbScene3dCircuitJsonAdapter.#ownData(value, name))
        )
    }

    /**
     * Reads one own data property without invoking caller accessors.
     * @param {unknown} value Record candidate.
     * @param {string} name Property name.
     * @returns {unknown} Own data value or undefined.
     */
    static #ownData(value, name) {
        if (!value || typeof value !== 'object') return undefined
        try {
            const descriptor = Object.getOwnPropertyDescriptor(value, name)
            return descriptor && Object.hasOwn(descriptor, 'value')
                ? descriptor.value
                : undefined
        } catch {
            return undefined
        }
    }

    /**
     * Builds component fallback bodies from `pcb_component` elements.
     * @param {{ elementsByType: Map<string, object[]>, sourceComponentById: Map<string, object> }} index CircuitJSON index.
     * @param {{ centerX: number, centerY: number, thicknessMil: number }} board Render board.
     * @param {Map<string, object>} externalPlacementByComponentId External placement metadata by PCB component ID.
     * @param {Map<string, object>} cadComponentByComponentId CAD metadata by PCB component ID.
     * @returns {object[]}
     */
    static #buildComponents(
        index,
        board,
        externalPlacementByComponentId,
        cadComponentByComponentId
    ) {
        return (index.elementsByType.get('pcb_component') || []).map(
            (component, componentIndex) => {
                const sourceComponent = index.sourceComponentById.get(
                    String(component?.source_component_id || '')
                )
                const componentId = String(component?.pcb_component_id || '')
                const externalPlacement =
                    externalPlacementByComponentId.get(componentId) || null
                const cadComponent =
                    cadComponentByComponentId.get(componentId) || null
                const center = CircuitJsonUnits.pointMmToMil(
                    component?.center || {
                        x: component?.x,
                        y: component?.y
                    }
                )
                const designator =
                    PcbScene3dCircuitJsonAdapter.#componentDesignator(
                        component,
                        sourceComponent,
                        componentIndex
                    )
                const mountSide = PcbScene3dCircuitJsonAdapter.#layerSide(
                    component?.layer
                )
                const bodySize =
                    PcbScene3dCircuitJsonAdapter.#componentBodySize(
                        component,
                        externalPlacement,
                        cadComponent
                    )
                const body =
                    PcbScene3dFootprintBodyBuilder.resolveComponentBody({
                        cadComponent,
                        component,
                        sourceComponent,
                        fallbackSizeMil: bodySize,
                        hasExternalModel: Boolean(
                            externalPlacement?.externalModel
                        )
                    })
                const bodyCenterZ =
                    board.thicknessMil / 2 +
                    Number(body?.sizeMil?.height || bodySize.height) / 2

                return {
                    designator,
                    mountSide,
                    rotationDeg: Number(component?.rotation || 0),
                    positionMil: {
                        x: center.x - board.centerX,
                        y: center.y - board.centerY,
                        z: mountSide === 'bottom' ? -bodyCenterZ : bodyCenterZ
                    },
                    boardPositionMil: {
                        x: center.x,
                        y: center.y,
                        z: 0
                    },
                    pattern: String(
                        sourceComponent?.ftype ||
                            sourceComponent?.name ||
                            component?.pcb_component_id ||
                            'CircuitJSON component'
                    ),
                    source: 'circuitjson',
                    ...PcbScene3dCircuitJsonAdapter.#componentDisplayMetadata(
                        externalPlacement
                    ),
                    body,
                    externalModel: externalPlacement?.externalModel || null
                }
            }
        )
    }

    /**
     * Builds component display metadata from an external placement.
     * @param {object | null} externalPlacement External placement metadata.
     * @returns {{ renderFallbackBody?: boolean }}
     */
    static #componentDisplayMetadata(externalPlacement) {
        return externalPlacement?.renderAsBoundingBox === true
            ? { renderFallbackBody: true }
            : {}
    }

    /**
     * Resolves fallback body dimensions for one component.
     * @param {object} component PCB component element.
     * @param {object | null} externalPlacement External placement metadata.
     * @param {object | null} cadComponent CAD component element.
     * @returns {{ width: number, depth: number, height: number }}
     */
    static #componentBodySize(component, externalPlacement, cadComponent) {
        const boundingSize =
            externalPlacement?.boundingBoxSizeMil ||
            PcbScene3dCircuitJsonAdapter.#sizeMmToMil(
                cadComponent?.model_size || cadComponent?.size
            )
        const width =
            PcbScene3dCircuitJsonAdapter.#positiveNumber(boundingSize?.x) ||
            CircuitJsonUnits.mmToMil(component?.width, 2)
        const depth =
            PcbScene3dCircuitJsonAdapter.#positiveNumber(boundingSize?.y) ||
            CircuitJsonUnits.mmToMil(component?.height, 1.2)
        const height =
            PcbScene3dCircuitJsonAdapter.#positiveNumber(boundingSize?.z) ||
            CircuitJsonUnits.mmToMil(
                component?.component_height,
                DEFAULT_COMPONENT_HEIGHT_MIL / 39.37007874015748
            )

        return {
            width: Math.max(width, 20),
            depth: Math.max(depth, 20),
            height: Math.max(height, 10)
        }
    }

    /**
     * Builds external component model placements from CAD metadata.
     * @param {{ elementsByType: Map<string, object[]>, sourceComponentById: Map<string, object> }} index CircuitJSON index.
     * @param {{ centerX: number, centerY: number, thicknessMil: number }} board Render board.
     * @param {{ modelUrlResolver?: (url: string, context: object) => string | object | null | undefined }} options Adapter options.
     * @returns {object[]}
     */
    static #buildExternalPlacements(index, board, options) {
        const componentById = PcbScene3dCircuitJsonAdapter.#elementById(
            index,
            'pcb_component',
            'pcb_component_id'
        )
        return (index.elementsByType.get('cad_component') || [])
            .map((cadComponent, cadIndex) => {
                const component = componentById.get(
                    String(cadComponent?.pcb_component_id || '')
                )
                return PcbScene3dCircuitJsonAdapter.#buildExternalPlacement(
                    cadComponent,
                    component,
                    index,
                    board,
                    options,
                    cadIndex
                )
            })
            .filter(Boolean)
    }

    /**
     * Builds one external model placement.
     * @param {object} cadComponent CAD component element.
     * @param {object | undefined} component PCB component element.
     * @param {{ sourceComponentById: Map<string, object> }} index CircuitJSON index.
     * @param {{ centerX: number, centerY: number, thicknessMil: number }} board Render board.
     * @param {{ modelUrlResolver?: (url: string, context: object) => string | object | null | undefined }} options Adapter options.
     * @param {number} cadIndex CAD component index.
     * @returns {object | null}
     */
    static #buildExternalPlacement(
        cadComponent,
        component,
        index,
        board,
        options,
        cadIndex
    ) {
        const sourceComponent = index.sourceComponentById.get(
            String(component?.source_component_id || '')
        )
        const externalModel = PcbScene3dCircuitJsonAdapter.#externalModel(
            cadComponent,
            component,
            sourceComponent,
            options,
            cadIndex
        )
        if (!externalModel) {
            return null
        }

        const mountSide = PcbScene3dCircuitJsonAdapter.#layerSide(
            component?.layer || cadComponent?.layer
        )
        return {
            designator: PcbScene3dCircuitJsonAdapter.#componentDesignator(
                component || cadComponent,
                sourceComponent,
                cadIndex
            ),
            pcbComponentId: String(component?.pcb_component_id || ''),
            mountSide,
            rotationDeg: PcbScene3dCircuitJsonAdapter.#placementRotationDeg(
                cadComponent,
                component
            ),
            positionMil: PcbScene3dCircuitJsonAdapter.#placementPositionMil(
                cadComponent,
                component,
                board,
                mountSide
            ),
            modelTransform:
                PcbScene3dCircuitJsonModelTransform.build(cadComponent),
            ...PcbScene3dCircuitJsonModelTransform.displayMetadata(
                cadComponent
            ),
            ...PcbScene3dCircuitJsonAdapter.#boundingBoxDisplayMetadata(
                cadComponent
            ),
            externalModel
        }
    }

    /**
     * Builds explicit bounding-box display metadata from a CAD component.
     * @param {object} cadComponent CAD component element.
     * @returns {{ renderAsBoundingBox?: boolean, boundingBoxSizeMil?: { x: number, y: number, z: number } }}
     */
    static #boundingBoxDisplayMetadata(cadComponent) {
        if (cadComponent?.show_as_bounding_box !== true) {
            return {}
        }

        const size = PcbScene3dCircuitJsonAdapter.#sizeMmToMil(
            cadComponent?.model_size || cadComponent?.size
        )
        return {
            renderAsBoundingBox: true,
            ...(size ? { boundingBoxSizeMil: size } : {})
        }
    }

    /**
     * Converts a model size object from millimeters to mils.
     * @param {object | undefined} size Size metadata.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #sizeMmToMil(size) {
        const x = size?.x ?? size?.width
        const y = size?.y ?? size?.height
        const z = size?.z ?? size?.depth
        if (
            !Number.isFinite(Number(x)) &&
            !Number.isFinite(Number(y)) &&
            !Number.isFinite(Number(z))
        ) {
            return null
        }

        return {
            x: CircuitJsonUnits.mmToMil(x, 0),
            y: CircuitJsonUnits.mmToMil(y, 0),
            z: CircuitJsonUnits.mmToMil(z, 0)
        }
    }

    /**
     * Builds an external model metadata object.
     * @param {object} cadComponent CAD component element.
     * @param {object | undefined} component PCB component element.
     * @param {object | undefined} sourceComponent Source component element.
     * @param {{ modelUrlResolver?: (url: string, context: object) => string | object | null | undefined }} options Adapter options.
     * @param {number} cadIndex CAD component index.
     * @returns {object | null}
     */
    static #externalModel(
        cadComponent,
        component,
        sourceComponent,
        options,
        cadIndex
    ) {
        const match = MODEL_URL_FIELDS.find(([field]) =>
            String(cadComponent?.[field] || '').trim()
        )
        const reference = match
            ? {
                  field: match[0],
                  format: match[1],
                  sourceUrl: String(cadComponent?.[match[0]] || '').trim()
              }
            : PcbScene3dCircuitJsonAdapter.#modelAssetReference(cadComponent)
        if (!reference) return null

        const { field, format, sourceUrl } = reference
        const context = {
            format,
            field,
            cadComponent,
            component,
            sourceComponent,
            index: cadIndex
        }

        return {
            format,
            name: PcbScene3dCircuitJsonAdapter.#fileNameFromUrl(sourceUrl),
            sourceUrl,
            ...PcbScene3dCircuitJsonAdapter.#resolveModelUrl(
                sourceUrl,
                context,
                options
            )
        }
    }

    /**
     * Resolves a canonical `model_asset` fallback reference.
     * @param {object} cadComponent CAD component element.
     * @returns {{ field: string, format: string, sourceUrl: string } | null}
     */
    static #modelAssetReference(cadComponent) {
        const reference = PcbScene3dCircuitJsonModelAsset.reference(
            cadComponent?.model_asset
        )
        return reference ? { field: 'model_asset', ...reference } : null
    }

    /**
     * Applies optional caller-owned model URL resolution.
     * @param {string} sourceUrl Source URL.
     * @param {object} context Resolver context.
     * @param {{ modelUrlResolver?: (url: string, context: object) => string | object | null | undefined }} options Adapter options.
     * @returns {object}
     */
    static #resolveModelUrl(sourceUrl, context, options) {
        const resolver = options?.modelUrlResolver
        if (typeof resolver === 'function') {
            const resolved = resolver(sourceUrl, context)
            if (typeof resolved === 'string') {
                return { resolvedUrl: resolved }
            }
            if (resolved && typeof resolved === 'object') {
                return PcbScene3dDescriptorSafeRecord.copy(resolved)
            }
        }

        const resolvedUrl = PcbScene3dCircuitJsonModelUrlResolver.resolve(
            sourceUrl,
            options?.projectBaseUrl
        )
        if (resolvedUrl && resolvedUrl !== sourceUrl) {
            return { resolvedUrl }
        }

        return {}
    }

    /**
     * Builds a component ID to external placement map.
     * @param {object[]} placements External placements.
     * @returns {Map<string, object>}
     */
    static #externalPlacementByComponentId(placements) {
        const map = new Map()
        placements.forEach((placement) => {
            const componentId = String(placement?.pcbComponentId || '')
            if (componentId) {
                map.set(componentId, placement)
            }
        })
        return map
    }

    /**
     * Builds a map keyed by one element ID field.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {string} type Element type.
     * @param {string} idField ID field.
     * @returns {Map<string, object>}
     */
    static #elementById(index, type, idField) {
        const map = new Map()
        ;(index.elementsByType.get(type) || []).forEach((element) => {
            const id = String(element?.[idField] || '')
            if (id) {
                map.set(id, element)
            }
        })
        return map
    }

    /**
     * Resolves placement position in board-local mils.
     * @param {object} cadComponent CAD component element.
     * @param {object | undefined} component PCB component element.
     * @param {{ centerX: number, centerY: number, thicknessMil: number }} board Render board.
     * @param {'top' | 'bottom'} mountSide Mount side.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #placementPositionMil(cadComponent, component, board, mountSide) {
        const point = CircuitJsonUnits.pointMmToMil(
            cadComponent?.position ||
                component?.center || {
                    x: component?.x,
                    y: component?.y
                }
        )
        const fallbackZ =
            mountSide === 'bottom'
                ? -Number(board?.thicknessMil || 0) / 2
                : Number(board?.thicknessMil || 0) / 2
        const z = Number.isFinite(Number(cadComponent?.position?.z))
            ? CircuitJsonUnits.mmToMil(cadComponent.position.z, 0)
            : fallbackZ

        return {
            x: point.x - Number(board?.centerX || 0),
            y: point.y - Number(board?.centerY || 0),
            z
        }
    }

    /**
     * Resolves placement rotation in board space.
     * @param {object} cadComponent CAD component element.
     * @param {object | undefined} component PCB component element.
     * @returns {number}
     */
    static #placementRotationDeg(cadComponent, component) {
        return Number(
            cadComponent?.rotation?.z ??
                cadComponent?.rotationDeg ??
                cadComponent?.rotation ??
                component?.rotation ??
                component?.ccw_rotation ??
                0
        )
    }

    /**
     * Extracts a file name from a URL-like model reference.
     * @param {string} sourceUrl Source URL.
     * @returns {string}
     */
    static #fileNameFromUrl(sourceUrl) {
        const cleanUrl = String(sourceUrl || '').split(/[?#]/u)[0]
        return cleanUrl.split('/').filter(Boolean).pop() || 'model'
    }

    /**
     * Resolves a display designator for one CircuitJSON component.
     * @param {object} component PCB component element.
     * @param {object | undefined} sourceComponent Source component element.
     * @param {number} componentIndex Component index.
     * @returns {string}
     */
    static #componentDesignator(component, sourceComponent, componentIndex) {
        return String(
            sourceComponent?.name ||
                component?.name ||
                component?.source_component_id ||
                component?.pcb_component_id ||
                `C${componentIndex + 1}`
        )
    }

    /**
     * Builds all core board detail primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ boardDrillQuality?: string, showPcbNotes?: boolean, showPcbPaste?: boolean }} options Adapter options.
     * @returns {object}
     */
    static #buildDetail(index, options) {
        const paste = PcbScene3dCircuitJsonSolderPasteBuilder.build(
            index,
            options
        )
        const pads = [
            ...PcbScene3dCircuitJsonAdapter.#buildSmtPads(index),
            ...PcbScene3dCircuitJsonAdapter.#buildPlatedHoles(index),
            ...PcbScene3dCircuitJsonAdapter.#buildNonPlatedHoles(index)
        ]
        const vias = PcbScene3dCircuitJsonTraceRouteBuilder.buildVias(index)
        const tracks = [
            ...PcbScene3dCircuitJsonTraceRouteBuilder.buildTracks(index),
            ...PcbScene3dCircuitJsonThermalSpokeBuilder.build(index)
        ]
        const polygons = PcbScene3dCircuitJsonCopperPourBuilder.build(index)
        const copperTexts = PcbScene3dCircuitJsonCopperTextBuilder.build(index)
        const silkscreen = PcbScene3dCircuitJsonSilkscreenDetailBuilder.build(
            index,
            { pads, vias, tracks, polygons, copperTexts },
            options
        )

        return {
            pads,
            tracks,
            arcs: [],
            fills: [],
            vias,
            polygons,
            copperTexts,
            embeddedFonts: [],
            silkscreen,
            ...(paste ? { paste } : {}),
            drillQuality: PcbScene3dCircuitJsonGeometry.normalizeDrillQuality(
                options?.boardDrillQuality
            )
        }
    }

    /**
     * Builds SMT pad detail primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #buildSmtPads(index) {
        return (index.elementsByType.get('pcb_smtpad') || []).map((pad) => {
            const side = PcbScene3dCircuitJsonAdapter.#layerSide(pad?.layer)
            const size = PcbScene3dCircuitJsonAdapter.#padSize(pad)
            const isBottom = side === 'bottom'
            const exposesCopper =
                PcbScene3dCircuitJsonAdapter.#exposesCopperThroughMask(
                    pad,
                    true
                )
            const padDetail = {
                x: CircuitJsonUnits.mmToMil(pad?.x, 0),
                y: CircuitJsonUnits.mmToMil(pad?.y, 0),
                rotation: Number(pad?.ccw_rotation || 0),
                shapeTop: isBottom
                    ? 0
                    : PcbScene3dCircuitJsonAdapter.#padShape(pad),
                shapeMid: 0,
                shapeBottom: isBottom
                    ? PcbScene3dCircuitJsonAdapter.#padShape(pad)
                    : 0,
                sizeTopX: isBottom ? 0 : size.width,
                sizeTopY: isBottom ? 0 : size.height,
                sizeMidX: 0,
                sizeMidY: 0,
                sizeBottomX: isBottom ? size.width : 0,
                sizeBottomY: isBottom ? size.height : 0,
                holeDiameter: 0,
                hasTopSolderMaskOpening: !isBottom && exposesCopper,
                hasBottomSolderMaskOpening: isBottom && exposesCopper,
                ...PcbScene3dCircuitJsonPadCorner.metadata(pad, size, isBottom)
            }
            return padDetail
        })
    }

    /**
     * Builds plated-through-hole pad detail primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #buildPlatedHoles(index) {
        return (index.elementsByType.get('pcb_plated_hole') || []).map(
            (hole) => {
                const geometry = CircuitJsonPcbHolePrimitiveModel.build(hole, {
                    x: Number(hole?.x || 0),
                    y: Number(hole?.y || 0)
                })
                const size =
                    PcbScene3dCircuitJsonGeometry.platedHoleOuterSize(geometry)
                const center = CircuitJsonUnits.pointMmToMil({
                    x: hole?.x,
                    y: hole?.y
                })
                const drill = PcbScene3dCircuitJsonGeometry.holeDrillSpec(
                    hole,
                    geometry
                )
                const exposesCopper =
                    PcbScene3dCircuitJsonAdapter.#exposesCopperThroughMask(
                        hole,
                        true
                    )
                return {
                    x: center.x,
                    y: center.y,
                    rotation: Number(geometry.rotation || 0),
                    shapeTop: PcbScene3dCircuitJsonAdapter.#padShape(geometry),
                    shapeMid: PcbScene3dCircuitJsonAdapter.#padShape(geometry),
                    shapeBottom:
                        PcbScene3dCircuitJsonAdapter.#padShape(geometry),
                    sizeTopX: size.width,
                    sizeTopY: size.height,
                    sizeMidX: size.width,
                    sizeMidY: size.height,
                    sizeBottomX: size.width,
                    sizeBottomY: size.height,
                    ...PcbScene3dCircuitJsonPadCorner.metadata(
                        geometry,
                        size,
                        null
                    ),
                    ...PcbScene3dCircuitJsonDrillDetail.fields(drill),
                    holeOffsetX: drill.center.x - center.x,
                    holeOffsetY: drill.center.y - center.y,
                    hasTopSolderMaskOpening: exposesCopper,
                    hasBottomSolderMaskOpening: exposesCopper
                }
            }
        )
    }

    /**
     * Builds drill-only hole detail primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #buildNonPlatedHoles(index) {
        return (index.elementsByType.get('pcb_hole') || []).map((hole) => {
            const drill = PcbScene3dCircuitJsonGeometry.holeDrillSpec(hole)
            return {
                x: drill.center.x,
                y: drill.center.y,
                rotation: drill.rotationDeg,
                shapeTop: 0,
                shapeMid: 0,
                shapeBottom: 0,
                sizeTopX: 0,
                sizeTopY: 0,
                sizeMidX: 0,
                sizeMidY: 0,
                sizeBottomX: 0,
                sizeBottomY: 0,
                ...PcbScene3dCircuitJsonDrillDetail.fields(drill),
                hasTopSolderMaskOpening: false,
                hasBottomSolderMaskOpening: false
            }
        })
    }

    /**
     * Resolves pad copper size from CircuitJSON pad fields.
     * @param {object} pad Pad element.
     * @returns {{ width: number, height: number }}
     */
    static #padSize(pad) {
        if (String(pad?.shape || '') === 'circle') {
            const diameter = CircuitJsonUnits.mmToMil(
                Number(pad?.radius || 0) * 2 || pad?.diameter,
                1
            )
            return { width: diameter, height: diameter }
        }
        return {
            width: CircuitJsonUnits.mmToMil(pad?.width, 1),
            height: CircuitJsonUnits.mmToMil(pad?.height, 1)
        }
    }
    /**
     * Resolves the viewer pad shape code.
     * @param {object} pad CircuitJSON pad element.
     * @returns {number}
     */
    static #padShape(pad) {
        const shape = String(pad?.shape || '')
        return shape.includes('rect') ||
            shape.includes('polygon') ||
            shape.endsWith('pill')
            ? RECTANGULAR_PAD_SHAPE
            : CIRCULAR_PAD_SHAPE
    }

    /**
     * Resolves whether a copper feature is visible through solder mask.
     * @param {object} element CircuitJSON copper element.
     * @param {boolean} fallback Fallback visibility when no flag is present.
     * @returns {boolean}
     */
    static #exposesCopperThroughMask(element, fallback) {
        const covered =
            PcbScene3dCircuitJsonAdapter.#solderMaskCoveredValue(element)
        return covered === null ? fallback : !covered
    }

    /**
     * Reads the optional solder-mask coverage flag.
     * @param {object} element CircuitJSON element.
     * @returns {boolean | null}
     */
    static #solderMaskCoveredValue(element) {
        const value =
            element?.is_covered_with_solder_mask ??
            element?.covered_with_solder_mask
        if (typeof value === 'boolean') {
            return value
        }
        if (value === undefined || value === null || value === '') {
            return null
        }

        const text = String(value).trim().toLowerCase()
        if (text === 'true') {
            return true
        }
        if (text === 'false') {
            return false
        }
        return null
    }

    /**
     * Resolves a board side from a CircuitJSON layer name.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom'}
     */
    static #layerSide(layer) {
        return PcbScene3dCircuitJsonLayer.side(layer)
    }

    /**
     * Returns a positive finite number or zero.
     * @param {unknown} value Candidate value.
     * @returns {number}
     */
    static #positiveNumber(value) {
        const number = Number(value)
        return Number.isFinite(number) && number > 0 ? number : 0
    }
}
