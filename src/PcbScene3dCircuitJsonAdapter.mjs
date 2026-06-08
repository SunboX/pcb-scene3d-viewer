import {
    CircuitJsonDocument,
    CircuitJsonIndexer,
    CircuitJsonUnits
} from 'circuitjson-toolkit'

const TOP_LAYER_ID = 1
const BOTTOM_LAYER_ID = 32
const DEFAULT_BOARD_WIDTH_MM = 25.4
const DEFAULT_BOARD_HEIGHT_MM = 25.4
const DEFAULT_BOARD_THICKNESS_MM = 1.6
const DEFAULT_COMPONENT_HEIGHT_MIL = 60
const RECTANGULAR_PAD_SHAPE = 2
const CIRCULAR_PAD_SHAPE = 1

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
        return CircuitJsonDocument.isModel(value)
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

        if (String(value?.sourceFormat || '') === 'circuitjson') {
            return true
        }

        return !PcbScene3dCircuitJsonAdapter.#hasCompatibilityModel(value)
    }

    /**
     * Builds the internal render model used by the Three.js runtime.
     * @param {object[]} circuitJson Serialized CircuitJSON model.
     * @returns {object}
     */
    static build(circuitJson) {
        CircuitJsonDocument.assertModel(circuitJson)
        const index = CircuitJsonIndexer.index(circuitJson)
        const board = PcbScene3dCircuitJsonAdapter.#buildBoard(index)
        const detail = PcbScene3dCircuitJsonAdapter.#buildDetail(index)
        const components = PcbScene3dCircuitJsonAdapter.#buildComponents(
            index,
            board
        )

        return {
            sourceFormat: 'circuitjson',
            coordinateSystem: 'circuitjson-mm',
            board,
            components,
            externalPlacements: [],
            boardAssemblyModel: null,
            detail
        }
    }

    /**
     * Builds the render-model board from a `pcb_board` element.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object}
     */
    static #buildBoard(index) {
        const boardElement = index.elementsByType.get('pcb_board')?.[0] || {}
        const widthMil = CircuitJsonUnits.mmToMil(
            boardElement.width,
            DEFAULT_BOARD_WIDTH_MM
        )
        const heightMil = CircuitJsonUnits.mmToMil(
            boardElement.height,
            DEFAULT_BOARD_HEIGHT_MM
        )
        const thicknessMil = CircuitJsonUnits.mmToMil(
            boardElement.thickness,
            DEFAULT_BOARD_THICKNESS_MM
        )
        const center = CircuitJsonUnits.pointMmToMil(boardElement.center || {})
        const minX = center.x - widthMil / 2
        const minY = center.y - heightMil / 2
        const segments = PcbScene3dCircuitJsonAdapter.#buildBoardSegments(
            boardElement,
            {
                minX,
                minY,
                widthMil,
                heightMil
            }
        )

        return {
            widthMil,
            heightMil,
            thicknessMil,
            minX,
            minY,
            centerX: center.x,
            centerY: center.y,
            segments,
            surfaceColor: null,
            edgeColor: null
        }
    }

    /**
     * Returns true for parser-produced arrays that already carry a legacy
     * renderer model and must keep using their format-specific scene builder.
     * @param {unknown} value Candidate model.
     * @returns {boolean}
     */
    static #hasCompatibilityModel(value) {
        return Boolean(value?.pcb || value?.schematic || value?.bom)
    }

    /**
     * Builds closed board line segments from outline points or rectangle size.
     * @param {object} boardElement CircuitJSON board element.
     * @param {{ minX: number, minY: number, widthMil: number, heightMil: number }} fallback Fallback rectangle.
     * @returns {object[]}
     */
    static #buildBoardSegments(boardElement, fallback) {
        const outlinePoints = Array.isArray(boardElement?.outline)
            ? boardElement.outline
                  .map((point) => CircuitJsonUnits.pointMmToMil(point))
                  .filter((point) => Number.isFinite(point.x + point.y))
            : []
        const points =
            outlinePoints.length >= 3
                ? outlinePoints
                : [
                      { x: fallback.minX, y: fallback.minY },
                      {
                          x: fallback.minX + fallback.widthMil,
                          y: fallback.minY
                      },
                      {
                          x: fallback.minX + fallback.widthMil,
                          y: fallback.minY + fallback.heightMil
                      },
                      {
                          x: fallback.minX,
                          y: fallback.minY + fallback.heightMil
                      }
                  ]

        return points.map((point, index) => {
            const next = points[(index + 1) % points.length]
            return {
                type: 'line',
                x1: point.x,
                y1: point.y,
                x2: next.x,
                y2: next.y
            }
        })
    }

    /**
     * Builds component fallback bodies from `pcb_component` elements.
     * @param {{ elementsByType: Map<string, object[]>, sourceComponentById: Map<string, object> }} index CircuitJSON index.
     * @param {{ centerX: number, centerY: number, thicknessMil: number }} board Render board.
     * @returns {object[]}
     */
    static #buildComponents(index, board) {
        return (index.elementsByType.get('pcb_component') || []).map(
            (component, componentIndex) => {
                const sourceComponent = index.sourceComponentById.get(
                    String(component?.source_component_id || '')
                )
                const center = CircuitJsonUnits.pointMmToMil(
                    component?.center || {
                        x: component?.x,
                        y: component?.y
                    }
                )
                const width = CircuitJsonUnits.mmToMil(component?.width, 2)
                const depth = CircuitJsonUnits.mmToMil(component?.height, 1.2)
                const height = CircuitJsonUnits.mmToMil(
                    component?.component_height,
                    DEFAULT_COMPONENT_HEIGHT_MIL / 39.37007874015748
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

                return {
                    designator,
                    mountSide,
                    rotationDeg: Number(component?.rotation || 0),
                    positionMil: {
                        x: center.x - board.centerX,
                        y: center.y - board.centerY,
                        z: board.thicknessMil / 2 + height / 2
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
                    body: {
                        family: 'chip',
                        sizeMil: {
                            width: Math.max(width, 20),
                            depth: Math.max(depth, 20),
                            height: Math.max(height, 10)
                        }
                    },
                    externalModel: null
                }
            }
        )
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
     * @returns {object}
     */
    static #buildDetail(index) {
        return {
            pads: [
                ...PcbScene3dCircuitJsonAdapter.#buildSmtPads(index),
                ...PcbScene3dCircuitJsonAdapter.#buildPlatedHoles(index),
                ...PcbScene3dCircuitJsonAdapter.#buildNonPlatedHoles(index)
            ],
            tracks: PcbScene3dCircuitJsonAdapter.#buildTracks(index),
            arcs: [],
            fills: [],
            vias: PcbScene3dCircuitJsonAdapter.#buildVias(index),
            polygons: [],
            copperTexts: [],
            embeddedFonts: [],
            silkscreen: PcbScene3dCircuitJsonAdapter.#buildSilkscreen(index)
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
                hasTopSolderMaskOpening: !isBottom,
                hasBottomSolderMaskOpening: isBottom
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
                const size =
                    PcbScene3dCircuitJsonAdapter.#platedHoleOuterSize(hole)
                const holeDiameter = CircuitJsonUnits.mmToMil(
                    hole?.hole_diameter || hole?.hole_width,
                    0
                )
                return {
                    x: CircuitJsonUnits.mmToMil(hole?.x, 0),
                    y: CircuitJsonUnits.mmToMil(hole?.y, 0),
                    rotation: Number(hole?.ccw_rotation || 0),
                    shapeTop: PcbScene3dCircuitJsonAdapter.#padShape(hole),
                    shapeMid: PcbScene3dCircuitJsonAdapter.#padShape(hole),
                    shapeBottom: PcbScene3dCircuitJsonAdapter.#padShape(hole),
                    sizeTopX: size.width,
                    sizeTopY: size.height,
                    sizeMidX: size.width,
                    sizeMidY: size.height,
                    sizeBottomX: size.width,
                    sizeBottomY: size.height,
                    holeDiameter,
                    hasTopSolderMaskOpening: true,
                    hasBottomSolderMaskOpening: true
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
            const diameter = CircuitJsonUnits.mmToMil(
                hole?.hole_diameter || hole?.hole_width,
                0
            )
            return {
                x: CircuitJsonUnits.mmToMil(hole?.x, 0),
                y: CircuitJsonUnits.mmToMil(hole?.y, 0),
                rotation: Number(hole?.ccw_rotation || 0),
                shapeTop: 0,
                shapeMid: 0,
                shapeBottom: 0,
                sizeTopX: 0,
                sizeTopY: 0,
                sizeMidX: 0,
                sizeMidY: 0,
                sizeBottomX: 0,
                sizeBottomY: 0,
                holeDiameter: diameter,
                hasTopSolderMaskOpening: false,
                hasBottomSolderMaskOpening: false
            }
        })
    }

    /**
     * Builds via detail primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #buildVias(index) {
        return (index.elementsByType.get('pcb_via') || []).map((via) => ({
            x: CircuitJsonUnits.mmToMil(via?.x, 0),
            y: CircuitJsonUnits.mmToMil(via?.y, 0),
            diameter: CircuitJsonUnits.mmToMil(via?.outer_diameter, 0),
            holeDiameter: CircuitJsonUnits.mmToMil(via?.hole_diameter, 0),
            isTentingTop: false,
            isTentingBottom: false
        }))
    }

    /**
     * Builds copper track detail primitives from `pcb_trace` wire routes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #buildTracks(index) {
        const tracks = []
        ;(index.elementsByType.get('pcb_trace') || []).forEach((trace) => {
            const route = Array.isArray(trace?.route) ? trace.route : []
            for (let index = 0; index < route.length - 1; index += 1) {
                const start = route[index]
                const end = route[index + 1]
                if (
                    String(start?.route_type || 'wire') !== 'wire' ||
                    String(end?.route_type || 'wire') !== 'wire'
                ) {
                    continue
                }
                const layer = start?.layer || end?.layer
                tracks.push({
                    x1: CircuitJsonUnits.mmToMil(start?.x, 0),
                    y1: CircuitJsonUnits.mmToMil(start?.y, 0),
                    x2: CircuitJsonUnits.mmToMil(end?.x, 0),
                    y2: CircuitJsonUnits.mmToMil(end?.y, 0),
                    width: CircuitJsonUnits.mmToMil(
                        start?.width || end?.width,
                        0.1524
                    ),
                    layerId:
                        PcbScene3dCircuitJsonAdapter.#layerSide(layer) ===
                        'bottom'
                            ? BOTTOM_LAYER_ID
                            : TOP_LAYER_ID,
                    solderMaskOpening: true
                })
            }
        })
        return tracks
    }

    /**
     * Builds basic silkscreen detail from known CircuitJSON drawing elements.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {{ top: object, bottom: object }}
     */
    static #buildSilkscreen(index) {
        const top = { tracks: [], arcs: [], fills: [], texts: [] }
        const bottom = { tracks: [], arcs: [], fills: [], texts: [] }
        ;(index.elementsByType.get('pcb_silkscreen_line') || []).forEach(
            (line) => {
                const target =
                    PcbScene3dCircuitJsonAdapter.#layerSide(line?.layer) ===
                    'bottom'
                        ? bottom
                        : top
                target.tracks.push({
                    x1: CircuitJsonUnits.mmToMil(line?.x1, 0),
                    y1: CircuitJsonUnits.mmToMil(line?.y1, 0),
                    x2: CircuitJsonUnits.mmToMil(line?.x2, 0),
                    y2: CircuitJsonUnits.mmToMil(line?.y2, 0),
                    width: CircuitJsonUnits.mmToMil(line?.stroke_width, 0.12)
                })
            }
        )
        ;(index.elementsByType.get('pcb_silkscreen_text') || []).forEach(
            (text) => {
                const target =
                    PcbScene3dCircuitJsonAdapter.#layerSide(text?.layer) ===
                    'bottom'
                        ? bottom
                        : top
                target.texts.push({
                    value: String(text?.text || text?.value || ''),
                    x: CircuitJsonUnits.mmToMil(text?.x, 0),
                    y: CircuitJsonUnits.mmToMil(text?.y, 0),
                    rotation: Number(text?.ccw_rotation || 0),
                    sizeX: CircuitJsonUnits.mmToMil(text?.font_size, 1),
                    sizeY: CircuitJsonUnits.mmToMil(text?.font_size, 1),
                    width: CircuitJsonUnits.mmToMil(text?.stroke_width, 0.12)
                })
            }
        )
        return { top, bottom }
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
     * Resolves plated-hole copper size from CircuitJSON fields.
     * @param {object} hole Plated-hole element.
     * @returns {{ width: number, height: number }}
     */
    static #platedHoleOuterSize(hole) {
        if (Number(hole?.outer_diameter || 0) > 0) {
            const diameter = CircuitJsonUnits.mmToMil(hole.outer_diameter, 1)
            return { width: diameter, height: diameter }
        }
        return {
            width: CircuitJsonUnits.mmToMil(
                hole?.outer_width || hole?.rect_pad_width,
                1
            ),
            height: CircuitJsonUnits.mmToMil(
                hole?.outer_height || hole?.rect_pad_height,
                1
            )
        }
    }

    /**
     * Resolves the viewer pad shape code.
     * @param {object} pad CircuitJSON pad element.
     * @returns {number}
     */
    static #padShape(pad) {
        return String(pad?.shape || '').includes('rect')
            ? RECTANGULAR_PAD_SHAPE
            : CIRCULAR_PAD_SHAPE
    }

    /**
     * Resolves a board side from a CircuitJSON layer name.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom'}
     */
    static #layerSide(layer) {
        const value = String(layer || 'top').toLowerCase()
        return value.includes('bottom') || value === 'b.cu' || value === 'back'
            ? 'bottom'
            : 'top'
    }
}
